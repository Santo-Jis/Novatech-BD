const cron   = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Commission Ledger Reconciliation — Phase ১
//
// পুরনো `commission` টেবিল আর নতুন `commission_ledger` (shadow dual-write)
// সমান্তরালভাবে ঠিকভাবে মিলছে কিনা যাচাই করে। কোনো ডেটা বদলায় না —
// শুধু mismatch পেলে log করে (admin dashboard/alert Phase ৪-এ)।
//
// ইনভেরিয়েন্ট (দেখো migration_commission_ledger.sql-এর design নোট):
//  - paid = false দিনের জন্য: SUM(ledger 'daily' earn entries) ===
//    commission.commission_amount হুবহু মেলা উচিত — দুটোই একই তাজা
//    calculateCommission() থেকে আসে, শুধু আলাদা কোডপাথ দিয়ে লেখা।
//  - paid = true দিনের জন্য: ledger sum >= commission.commission_amount
//    হতে পারে, এটা error না — দেরিতে আসা sale-এর কমিশন ledger-এ "এখনো owed"
//    হিসেবে ধরা পড়ে যেটা পুরনো টেবিলে সম্ভব ছিল না (Bug #4-এর উন্নত সমাধান,
//    দেখো commission.service.js-এর কমেন্ট)। কিন্তু ledger sum কখনো
//    commission.commission_amount-এর চেয়ে *কম* হওয়া উচিত না — সেটা হলে
//    আসল mismatch।
// ============================================================

const getBDTodayLocal = () => {
    const bdOffset = 6 * 60 * 60 * 1000;
    return new Date(Date.now() + bdOffset).toISOString().split('T')[0];
};

/**
 * একটা নির্দিষ্ট তারিখের জন্য reconciliation চালায়।
 * @returns {Promise<{ checked: number, mismatches: Array, extras: Array }>}
 */
const runCommissionReconciliation = async (targetDate = null) => {
    const date = targetDate || getBDTodayLocal();
    logger.info(`\n🔍 Commission Ledger Reconciliation শুরু: ${date}`);

    const mismatches = [];
    const extras     = []; // error না, কিন্তু নজরে রাখার মতো (দেরিতে আসা sale)
    let checked = 0;

    try {
        const rows = await query(
            `SELECT c.id, c.user_id, c.date, c.commission_amount, c.paid, u.name_bn, u.tenant_id
             FROM commission c
             JOIN users u ON u.id = c.user_id
             WHERE c.date = $1 AND c.type = 'daily'`,
            [date]
        );

        for (const row of rows.rows) {
            checked++;

            const ledgerRes = await query(
                `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM commission_ledger
                 WHERE user_id = $1 AND date = $2
                   AND commission_type = 'daily' AND entry_type = 'earn'`,
                [row.user_id, row.date]
            );

            const ledgerTotal = parseFloat(ledgerRes.rows[0]?.total) || 0;
            const oldAmount   = parseFloat(row.commission_amount) || 0;
            const diff        = Math.round((ledgerTotal - oldAmount) * 100) / 100;

            if (!row.paid) {
                // unpaid দিনে হুবহু মেলা উচিত
                if (Math.abs(diff) > 0.5) {
                    mismatches.push({
                        userId: row.user_id, name: row.name_bn, tenantId: row.tenant_id,
                        date: row.date, oldAmount, ledgerTotal, diff, paid: false,
                        issue: 'unpaid দিনের amount ledger-এর সাথে মেলেনি',
                    });
                }
            } else {
                // paid দিনে ledger < old হলে সেটাই আসল সমস্যা
                if (diff < -0.5) {
                    mismatches.push({
                        userId: row.user_id, name: row.name_bn, tenantId: row.tenant_id,
                        date: row.date, oldAmount, ledgerTotal, diff, paid: true,
                        issue: 'paid দিনের ledger sum পুরনো amount-এর চেয়ে কম — সন্দেহজনক',
                    });
                } else if (diff > 0.5) {
                    // error না — দেরিতে আসা sale, ইচ্ছাকৃত improvement
                    extras.push({
                        userId: row.user_id, name: row.name_bn, tenantId: row.tenant_id,
                        date: row.date, oldAmount, ledgerTotal, diff,
                        note: 'paid হওয়ার পর অতিরিক্ত বিক্রয় এসেছে — এই টাকা এখনো owed, পরের payout-এ ধরা উচিত',
                    });
                }
            }
        }

        if (mismatches.length > 0) {
            logger.error(`⚠️ Reconciliation — ${mismatches.length}/${checked} সত্যিকারের mismatch:`);
            logger.error(JSON.stringify(mismatches, null, 2));
        } else {
            logger.info(`✅ Reconciliation — ${checked}টা রেকর্ড চেক হয়েছে, mismatch নেই`);
        }

        if (extras.length > 0) {
            logger.info(`ℹ️ Reconciliation — ${extras.length}টা দিনে paid হওয়ার পর অতিরিক্ত owed ধরা পড়েছে (এটা প্রত্যাশিত, error না):`);
            logger.info(JSON.stringify(extras, null, 2));
        }

    } catch (error) {
        logger.error('❌ Commission Reconciliation Job Error:', error.message);
    }

    return { checked, mismatches, extras };
};

// ============================================================
// Job শুরু করো — প্রতিদিন রাত ১২:৩০-এ, মূল commission job-এর ঠিক পরে
// (যাতে সেদিনের সব commission হিসাব শেষ হওয়ার পর যাচাই হয়)
// ============================================================

const startCommissionReconciliationJob = () => {
    logger.info('⏰ Commission Reconciliation Job নিবন্ধিত: প্রতিদিন রাত ১২:৩০');

    cron.schedule('30 0 * * *', async () => {
        logger.info('🔔 Commission Reconciliation Job ট্রিগার হয়েছে');
        // গতকালকের commission যাচাই করি (মূল commission job গতকালের জন্যই চলেছিল)
        const bdOffset = 6 * 60 * 60 * 1000;
        const yesterday = new Date(Date.now() + bdOffset - 24 * 60 * 60 * 1000)
            .toISOString().split('T')[0];
        await runCommissionReconciliation(yesterday);
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startCommissionReconciliationJob, runCommissionReconciliation };
