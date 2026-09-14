const cron    = require('node-cron');
const logger  = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// ============================================================
// Customer Post Hard-Delete Cleanup Job
// ✅ NEW (Redesign Phase ১.৯ — প্রাইভেসি ফিক্স)
//
// accountDeletion.job.js-এর ঠিক একই প্যাটার্ন (grace period + job_runs
// লগ + startup missed-run catch-up)। প্রতিদিন রাত ৩:৪৫-এ চলবে —
// sessionCleanup (৩:০০) আর accountDeletion (৩:৩০)-র পরে।
//
// কী করে:
//   customer_posts.deleted_at যেগুলো ৩০ দিনের বেশি পুরনো (নিজে delete
//   করা, moderation-hide না — সেটার deleted_at সেট হয় না, ইচ্ছাকৃতভাবে),
//   সেগুলো সত্যিই DELETE করে দেয় (soft না, hard)। পলিমরফিক
//   feed_reactions/feed_reports/feed_comments-এ কোনো FK/CASCADE নেই
//   (company_post-ও একই টেবিল শেয়ার করে বলে), তাই সেগুলোও ম্যানুয়ালি
//   cleanup — comment-এর body ইউজার-টেক্সট, প্রাইভেসির জন্য সেটাও মোছা দরকার।
// ============================================================

const JOB_NAME    = 'customer_post_cleanup';
const GRACE_DAYS  = 30;

const runPostCleanup = async ({ reason = 'scheduled' } = {}) => {
    logger.info(`\n🗑️ Customer Post Cleanup শুরু [${reason}]...`);

    try {
        const deletedCount = await withTransaction(async (client) => {
            const cq = client.query.bind(client);

            const toDelete = await cq(
                `SELECT id FROM customer_posts
                 WHERE deleted_at IS NOT NULL
                   AND deleted_at <= NOW() - INTERVAL '${GRACE_DAYS} days'`
            );
            const ids = toDelete.rows.map(r => r.id);
            if (ids.length === 0) return 0;

            await cq(`DELETE FROM feed_reactions WHERE post_type = 'customer_post' AND post_id = ANY($1::uuid[])`, [ids]);
            await cq(`DELETE FROM feed_reports   WHERE post_type = 'customer_post' AND post_id = ANY($1::uuid[])`, [ids]);
            await cq(`DELETE FROM feed_comments  WHERE post_type = 'customer_post' AND post_id = ANY($1::uuid[])`, [ids]);
            await cq(`DELETE FROM customer_posts WHERE id = ANY($1::uuid[])`, [ids]);

            return ids.length;
        });

        logger.info(`✅ Customer Post Cleanup সম্পন্ন — ${deletedCount}টা পোস্ট স্থায়ীভাবে মোছা হয়েছে।`);

        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, deletedCount]
        ).catch(err => logger.warn('⚠️ job_runs লগ ব্যর্থ:', err.message));

    } catch (error) {
        logger.error('❌ Customer Post Cleanup ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক (accountDeletion.job.js-এর হুবহু প্যাটার্ন) ──

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
            logger.info('⚠️ Customer Post Cleanup আজ চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runPostCleanup({ reason: 'startup-catchup' });
        } else {
            logger.info(`✅ Customer Post Cleanup আজ ইতোমধ্যে চলেছে (${result.rows[0].ran_at.toISOString()}) — skip।`);
        }
    } catch (err) {
        logger.error('❌ Missed-run চেকে সমস্যা:', err.message);
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────

const startPostCleanupJob = () => {
    // প্রতিদিন রাত ৩:৪৫ — sessionCleanup (৩:০০), accountDeletion (৩:৩০)-র পরে
    cron.schedule('45 3 * * *', async () => {
        logger.info('🔔 Customer Post Cleanup Job ট্রিগার হয়েছে');
        await runPostCleanup({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    logger.info('⏰ Customer Post Cleanup Job নিবন্ধিত: প্রতিদিন রাত ৩:৪৫');

    setImmediate(() => {
        runIfMissedToday().catch(err =>
            logger.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startPostCleanupJob, runPostCleanup };
