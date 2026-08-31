const cron    = require('node-cron');
const logger  = require('../config/logger');
const { query } = require('../config/db');
const { invalidatePortalAuthCache } = require('../services/portalCache.service');

// ============================================================
// Account Deletion Finalization Job
// প্রতিদিন রাত ৩:৩০-এ চলবে (Dhaka timezone) — sessionCleanup (৩:০০)-র
// ঠিক পরে, একই প্যাটার্ন অনুসরণ করে (missed-run catch-up সহ)।
//
// কী করে:
//   persons.deletion_requested_at যাদের ৩০ দিনের বেশি পুরনো, তাদের
//   সব connected customers row is_active=false করে (grace period
//   শেষ — এখন স্থায়ীভাবে finalize)।
//
// grace period-এর মূল লজিক (login করলে বাতিল) customerPortal.
// controller.js-এর cancelPendingDeletion()-এ — এই job শুধু "৩০ দিন
// কেউ ফিরে না এলে" অংশটা enforce করে। passwordLogin-এ safety-net
// (deletion_requested_at ৩০ দিনের বেশি পুরনো হলে ব্লক) থাকায় এই job
// miss হলেও/দেরি হলেও লগইন-নিরাপত্তা ভাঙে না, শুধু is_active flag
// আপডেট হতে দেরি হয়।
// ============================================================

const JOB_NAME     = 'account_deletion_finalize';
const GRACE_DAYS    = 30;

const runAccountDeletionFinalize = async ({ reason = 'scheduled' } = {}) => {
    logger.info(`\n🗑️ Account Deletion Finalize শুরু [${reason}]...`);

    try {
        const expired = await query(
            `SELECT id FROM persons
             WHERE deletion_requested_at IS NOT NULL
               AND deletion_requested_at <= NOW() - INTERVAL '${GRACE_DAYS} days'`
        );

        let totalConnections = 0;

        for (const { id: personId } of expired.rows) {
            const custRows = await query(
                `SELECT id FROM customers WHERE person_id = $1 AND is_active = true`,
                [personId]
            );

            if (custRows.rows.length > 0) {
                await query(
                    `UPDATE customers SET is_active = false WHERE person_id = $1 AND is_active = true`,
                    [personId]
                );
                for (const row of custRows.rows) {
                    await invalidatePortalAuthCache(row.id);
                }
                totalConnections += custRows.rows.length;
            }

            logger.info(`   → person ${personId}: ${custRows.rows.length}টা connection finalize করা হলো`);
        }

        logger.info(`✅ Account Deletion Finalize সম্পন্ন — ${expired.rows.length}টা অ্যাকাউন্ট, ${totalConnections}টা connection নিষ্ক্রিয় করা হয়েছে।`);

        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, expired.rows.length]
        ).catch(err => logger.warn('⚠️ job_runs লগ ব্যর্থ:', err.message));

    } catch (error) {
        logger.error('❌ Account Deletion Finalize ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক (sessionCleanup.job.js-এর হুবহু প্যাটার্ন) ──

const runIfMissedToday = async () => {
    try {
        const result = await query(
            `SELECT ran_at FROM job_runs
             WHERE job_name = $1
               AND ran_at >= (NOW() AT TIME ZONE 'Asia/Dhaka')::date
             ORDER BY ran_at DESC
             LIMIT 1`,
            [JOB_NAME]
        );

        if (result.rows.length === 0) {
            logger.info('⚠️ Account Deletion Finalize আজ চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runAccountDeletionFinalize({ reason: 'startup-catchup' });
        } else {
            logger.info(`✅ Account Deletion Finalize আজ ইতোমধ্যে চলেছে (${result.rows[0].ran_at.toISOString()}) — skip।`);
        }
    } catch (err) {
        logger.error('❌ Missed-run চেকে সমস্যা:', err.message);
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────

const startAccountDeletionJob = () => {
    // প্রতিদিন রাত ৩:৩০ — sessionCleanup (৩:০০)-র পরে
    cron.schedule('30 3 * * *', async () => {
        logger.info('🔔 Account Deletion Finalize Job ট্রিগার হয়েছে');
        await runAccountDeletionFinalize({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    logger.info('⏰ Account Deletion Finalize Job নিবন্ধিত: প্রতিদিন রাত ৩:৩০');

    setImmediate(() => {
        runIfMissedToday().catch(err =>
            logger.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startAccountDeletionJob, runAccountDeletionFinalize };
