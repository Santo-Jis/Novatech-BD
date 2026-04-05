const cron          = require('node-cron');
const { query }     = require('../config/db');
const { calculateCommission } = require('../controllers/commission.controller');

// ============================================================
// Commission Background Job
// প্রতিদিন রাত ১২টায় চলবে
// সব active SR এর দৈনিক কমিশন হিসাব করবে
// ============================================================

const runDailyCommissionJob = async (targetDate = null) => {
    const date = targetDate || new Date().toISOString().split('T')[0];
    console.log(`\n💰 Commission Job শুরু: ${date}`);

    try {
        // সব active worker নাও
        const workers = await query(
            `SELECT id, name_bn, basic_salary
             FROM users
             WHERE role = 'worker' AND status = 'active'`
        );

        console.log(`📊 মোট SR: ${workers.rows.length}`);

        let processed = 0;
        let skipped   = 0;

        for (const worker of workers.rows) {
            try {
                // সেদিনের মোট বিক্রয়
                const salesResult = await query(
                    `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
                     FROM sales_transactions
                     WHERE worker_id = $1 AND date = $2`,
                    [worker.id, date]
                );

                const totalSales = parseFloat(salesResult.rows[0].total_sales);

                // বিক্রয় না থাকলে skip
                if (totalSales <= 0) {
                    skipped++;
                    continue;
                }

                // কমিশন হিসাব
                const { rate, amount } = await calculateCommission(totalSales);

                // আগে থেকে আছে কিনা (duplicate এড়াতে)
                const existing = await query(
                    `SELECT id FROM commission
                     WHERE user_id = $1 AND date = $2 AND type = 'daily'`,
                    [worker.id, date]
                );

                if (existing.rows.length > 0) {
                    // আপডেট করো
                    await query(
                        `UPDATE commission
                         SET sales_amount     = $1,
                             commission_rate  = $2,
                             commission_amount = $3
                         WHERE user_id = $4 AND date = $5 AND type = 'daily'`,
                        [totalSales, rate, amount, worker.id, date]
                    );
                } else {
                    // নতুন রেকর্ড
                    await query(
                        `INSERT INTO commission
                         (user_id, date, sales_amount, commission_rate, commission_amount, type)
                         VALUES ($1, $2, $3, $4, $5, 'daily')`,
                        [worker.id, date, totalSales, rate, amount]
                    );
                }

                console.log(`✅ ${worker.name_bn}: বিক্রয় ৳${totalSales} → কমিশন ৳${amount} (${rate}%)`);
                processed++;

            } catch (workerError) {
                console.error(`❌ ${worker.name_bn} এর কমিশন হিসাবে সমস্যা:`, workerError.message);
            }
        }

        console.log(`\n📈 Commission Job সম্পন্ন:`);
        console.log(`   ✅ হিসাব হয়েছে: ${processed}`);
        console.log(`   ⏭️ বিক্রয় নেই: ${skipped}`);

    } catch (error) {
        console.error('❌ Commission Job Error:', error.message);
    }
};

// ============================================================
// Job শুরু করো
// প্রতিদিন রাত ১২:০০ তে
// ============================================================

const startCommissionJob = () => {
    console.log('⏰ Commission Job নিবন্ধিত: প্রতিদিন রাত ১২:০০');

    // প্রতিদিন রাত ১২:০০ (Bangladesh Time)
    cron.schedule('0 0 * * *', async () => {
        console.log('🔔 Commission Job ট্রিগার হয়েছে');
        await runDailyCommissionJob();
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startCommissionJob, runDailyCommissionJob };
