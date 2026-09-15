const cron          = require('node-cron');
const logger = require('../config/logger');
const { query }     = require('../config/db');
const { withTenantScope } = require('../config/tenantScopedDb');
const { calculateCommission, getDailyCommissionableSales } = require('../services/commission.service');
const { recordDailyEarnDelta } = require('../services/commissionLedger.service');

// ============================================================
// Commission Background Job
// প্রতিদিন রাত ১২টায় চলবে
// সব active SR এর দৈনিক কমিশন হিসাব করবে
// ✅ FIX: বাকি (credit) বিক্রয়ের অংশ বাদ দিয়ে, আর সেদিন verified হওয়া
//         collection যোগ করে commissionable sales বের করা হয় — দেখো
//         commission.service.js::getDailyCommissionableSales
// ============================================================

const runDailyCommissionJob = async (targetDate = null) => {
    // ✅ FIX Bug-2: Cron 'Asia/Dhaka' timezone-এ চলে কিন্তু
    // new Date().toISOString() দেয় UTC date — রাত ১২:০০ BD = UTC ১৮:০০,
    // তাই UTC date হয় আগের দিনের। getBDToday() দিয়ে সঠিক BD local date নাও।
    const getBDToday = () => {
        const bdOffset = 6 * 60 * 60 * 1000;
        return new Date(Date.now() + bdOffset).toISOString().split('T')[0];
    };
    const date = targetDate || getBDToday();
    logger.info(`\n💰 Commission Job শুরু: ${date}`);

    // ✅ P0 FIX (Bug #2): আগে সব tenant-এর active worker একসাথে, কোনো
    // tenant_id filter ছাড়াই প্রসেস হতো — ঠিক যেমন bonus.job.js-এ আগে হতো
    // (দেখো ওখানকার একই কমেন্ট)। এই tenant-blind loop, tenant-blind rate
    // lookup-এর (commission.service.js::calculateCommissionRate) সাথে মিলে
    // এক tenant-এর SR অন্য tenant-এর rate পেয়ে যাওয়ার সুযোগ তৈরি করত। এখন
    // bonus.job.js-এর মতোই প্রতিটা tenant আলাদাভাবে প্রসেস হয়।
    try {
        const tenants = await query(
            `SELECT id, company_name FROM tenants WHERE status IN ('trial', 'active')`
        );

        logger.info(`🏢 মোট tenant: ${tenants.rows.length}`);

        let totalProcessed = 0;
        let totalSkipped   = 0;

        for (const tenant of tenants.rows) {
            const { processed, skipped } = await runDailyCommissionJobForTenant(tenant, date);
            totalProcessed += processed;
            totalSkipped   += skipped;
        }

        logger.info(`\n📈 Commission Job সম্পন্ন (সব tenant মিলিয়ে):`);
        logger.info(`   ✅ হিসাব হয়েছে: ${totalProcessed}`);
        logger.info(`   ⏭️ বিক্রয় নেই: ${totalSkipped}`);

    } catch (error) {
        logger.error('❌ Commission Job Error:', error.message);
    }
};

// ============================================================
// একটা tenant-এর জন্য দৈনিক commission হিসাব
// রিটার্ন করে { processed, skipped }
// ============================================================

const runDailyCommissionJobForTenant = async (tenant, date) => {
    let processed = 0;
    let skipped   = 0;

    try {
        // এই tenant-এর সব active worker
        // ✅ RLS FIX: withTenantScope দিয়ে — ঠিক এই query-টাই ছিল Bug #2-এর
        // জায়গা (tenant_id ফিল্টার ভুলে যাওয়া)। এখন app-level WHERE ফিল্টার
        // (আগেই ফিক্স হয়েছে) এর পাশাপাশি DB নিজেও users-এ app_backend
        // role-এর জন্য tenant_id policy দিয়ে এনফোর্স করে।
        const workers = await withTenantScope(tenant.id, (client) => client.query(
            `SELECT id, name_bn, basic_salary
             FROM users
             WHERE role = 'worker' AND status = 'active' AND tenant_id = $1`,
            [tenant.id]
        ));

        logger.info(`📊 ${tenant.company_name} — মোট SR: ${workers.rows.length}`);

        for (const worker of workers.rows) {
            try {
                // সেদিনের commissionable বিক্রয় (বাকি বাদে + আজ আদায়-verified যোগে)
                const totalSales = await getDailyCommissionableSales(worker.id, date);

                // বিক্রয়/আদায় কিছুই না থাকলে skip
                if (totalSales <= 0) {
                    skipped++;
                    continue;
                }

                // কমিশন হিসাব — এই tenant-এর নিজস্ব slab দিয়ে
                const { rate, amount } = await calculateCommission(totalSales, tenant.id);

                // আগে থেকে আছে কিনা (duplicate এড়াতে), তারপর update/insert —
                // একই RLS-protected transaction-এ, যাতে commission টেবিলে
                // app_backend role-এর tenant-scope policy এনফোর্স হয়
                // (commission-এ সরাসরি tenant_id নেই, user_id → users.tenant_id
                // দিয়ে চেক হয়)।
                await withTenantScope(tenant.id, async (client) => {
                    const existing = await client.query(
                        `SELECT id FROM commission
                         WHERE user_id = $1 AND date = $2 AND type = 'daily'`,
                        [worker.id, date]
                    );

                    if (existing.rows.length > 0) {
                        // ✅ P0 FIX (Bug #4): "AND paid = false" — এই দিনের commission
                        // ইতিমধ্যে পরিশোধ হয়ে গেলে (মাঝ-মাসে payCommission দিয়ে),
                        // backfill/reconciliation run এসে সেই paid রেকর্ডের amount
                        // চুপচাপ বদলে দেবে না। paid হয়ে যাওয়া দিনের জন্য mismatch
                        // থাকলে সেটা admin-এর reconciliation-এ ধরা পড়া উচিত,
                        // silent overwrite দিয়ে না।
                        await client.query(
                            `UPDATE commission
                             SET sales_amount     = $1,
                                 commission_rate  = $2,
                                 commission_amount = $3
                             WHERE user_id = $4 AND date = $5 AND type = 'daily'
                               AND paid = false`,
                            [totalSales, rate, amount, worker.id, date]
                        );
                    } else {
                        // নতুন রেকর্ড
                        await client.query(
                            `INSERT INTO commission
                             (user_id, date, sales_amount, commission_rate, commission_amount, type)
                             VALUES ($1, $2, $3, $4, $5, 'daily')`,
                            [worker.id, date, totalSales, rate, amount]
                        );
                    }
                });

                // ✅ Phase ১ — shadow-mode ledger dual-write। insert/update
                // যা-ই হোক, ledger নিজের আগের entry থেকে delta বের করে,
                // তাই এখানে একবারই কল করলেই যথেষ্ট (দেখো
                // commissionLedger.service.js::recordDailyEarnDelta)।
                await recordDailyEarnDelta({
                    tenantId: tenant.id, userId: worker.id, date,
                    newTotalSales: totalSales, newRate: rate, newAmount: amount,
                    sourceType: 'sale',
                });

                logger.info(`✅ ${worker.name_bn}: বিক্রয় ৳${totalSales} → কমিশন ৳${amount} (${rate}%)`);
                processed++;

            } catch (workerError) {
                logger.error(`❌ ${worker.name_bn} এর কমিশন হিসাবে সমস্যা:`, workerError.message);
            }
        }

    } catch (error) {
        logger.error(`❌ ${tenant.company_name} — Commission Job Error:`, error.message);
    }

    return { processed, skipped };
};

// ============================================================
// Job শুরু করো
// প্রতিদিন রাত ১২:০০ তে
// ============================================================

const startCommissionJob = () => {
    logger.info('⏰ Commission Job নিবন্ধিত: প্রতিদিন রাত ১২:০০');

    // প্রতিদিন রাত ১২:০০ (Bangladesh Time)
    cron.schedule('0 0 * * *', async () => {
        logger.info('🔔 Commission Job ট্রিগার হয়েছে');
        await runDailyCommissionJob();
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startCommissionJob, runDailyCommissionJob };
