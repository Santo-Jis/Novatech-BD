const cron   = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { generateScheduledExpenses } = require('../services/recurringExpense.service');

// ============================================================
// প্রতিদিন ভোর ৪:০০ (ঢাকা) — নির্দিষ্ট মাসিক খরচ ও অগ্রিম খরচের কিস্তি জমা করে।
// postCleanup.job.js-এর প্যাটার্ন: job_runs লগ + startup-এ missed-run catch-up।
// ============================================================

const JOB_NAME = 'recurring_expenses';

const runRecurringExpenses = async ({ reason = 'scheduled' } = {}) => {
    try {
        const created = await generateScheduledExpenses();
        logger.info(`✅ Recurring Expenses [${reason}] — ${created}টা নতুন খরচ জমা হয়েছে।`);
        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, created]
        ).catch(err => logger.warn('⚠️ job_runs লগ ব্যর্থ:', err.message));
    } catch (error) {
        logger.error('❌ Recurring Expenses Job ব্যর্থ:', error.message);
    }
};

const runIfMissedToday = async () => {
    try {
        const result = await query(
            `SELECT ran_at FROM job_runs
              WHERE job_name = $1 AND ran_at >= (NOW() AT TIME ZONE 'Asia/Dhaka')::date
              ORDER BY ran_at DESC LIMIT 1`,
            [JOB_NAME]
        );
        if (result.rows.length === 0) await runRecurringExpenses({ reason: 'startup-catchup' });
    } catch (err) {
        logger.error('❌ Recurring Expenses missed-run চেক:', err.message);
    }
};

const startRecurringExpenseJob = () => {
    cron.schedule('0 4 * * *', () => runRecurringExpenses({ reason: 'scheduled' }), { timezone: 'Asia/Dhaka' });
    logger.info('⏰ Recurring Expenses Job নিবন্ধিত: প্রতিদিন ভোর ৪:০০');
    setImmediate(() => { runIfMissedToday(); });
};

module.exports = { startRecurringExpenseJob, runRecurringExpenses };
