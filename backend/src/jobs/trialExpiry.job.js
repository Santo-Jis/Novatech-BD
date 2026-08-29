const cron   = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Trial Expiry Job
// প্রতি ঘণ্টায় একবার চলবে (Dhaka timezone)
//
// কেন দরকার:
//   trial_ends_at কলামটা আগে শুধু তথ্য হিসেবে সেভ হতো (onboarding.controller.js
//   এ সেট হয়), কিন্তু কোথাও enforce হতো না — ৩ মাসের ট্রায়াল পার হয়ে
//   গেলেও tenant status='trial'-এই থেকে যেত, পূর্ণ অ্যাক্সেস চালু থাকতো,
//   আর jobs/tenantInvoice.job.js-ও কখনো বিল করতো না (status='trial' বাদ)।
//   ইচ্ছা করলে কেউ অনির্দিষ্টকাল বিনামূল্যে ব্যবহার করে যেতে পারতো।
//
// এই জব status='trial' AND trial_ends_at < NOW() এমন tenant-দের
// status='trial_expired'-এ নিয়ে আসে। এরপর:
//   - middlewares/auth.js + controllers/auth.controller.js: শুধু admin
//     role লগইন/অ্যাক্সেস করতে পারবে, বাকি সব role ব্লক
//   - frontend/src/layouts/AdminLayout.jsx: admin-কে পুরো UI-এর বদলে
//     শুধু "প্ল্যান আপগ্রেড করুন" স্ক্রিন দেখাবে
//
// ⚠️ প্রতি ঘণ্টায় (দিনে একবার না) — কারণ auth.js/auth.controller.js-এ
//   trial_ends_at-এর সরাসরি লাইভ তুলনাও আছে (এই জবের উপর একা নির্ভর করে
//   না), কিন্তু status persist থাকা অন্যান্য জায়গার জন্যও গুরুত্বপূর্ণ
//   (যেমন ভবিষ্যতে কোনো রিপোর্ট/ড্যাশবোর্ড যদি সরাসরি status ফিল্টার করে)।
//   ঘণ্টায় একবার চালিয়ে সেই gap-টাও ছোট রাখা হলো।
//
// status='trial' নির্দিষ্টভাবে — 'active'/'suspended'/'cancelled'/
// 'trial_expired' (আগে থেকেই expired) কখনো ছোঁয়া হয় না।
// ============================================================

const JOB_NAME = 'trial_expiry';

const runTrialExpiry = async ({ reason = 'scheduled' } = {}) => {
    logger.info(`\n⏳ Trial Expiry Job শুরু [${reason}]...`);

    try {
        const result = await query(
            `UPDATE tenants
             SET status = 'trial_expired'
             WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW()
             RETURNING id, company_name`
        );
        const rowCount = result.rowCount ?? 0;

        if (rowCount > 0) {
            logger.info(`⚠️ ${rowCount}টা tenant-এর ট্রায়াল শেষ হয়ে গেছে: ${result.rows.map(r => r.company_name).join(', ')}`);
        }
        logger.info(`✅ Trial Expiry Job সম্পন্ন — ${rowCount}টা tenant status='trial_expired' করা হলো।`);

        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, rowCount]
        ).catch(err => {
            logger.warn('⚠️ job_runs লগ ব্যর্থ:', err.message);
        });

    } catch (error) {
        logger.error('❌ Trial Expiry Job ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক (গত ১ ঘণ্টায় চলেছে কিনা) ────────────
const runIfMissedRecently = async () => {
    try {
        const result = await query(
            `SELECT ran_at FROM job_runs
             WHERE job_name = $1 AND ran_at >= NOW() - INTERVAL '1 hour'
             ORDER BY ran_at DESC LIMIT 1`,
            [JOB_NAME]
        );

        if (result.rows.length === 0) {
            logger.info('⚠️ Trial Expiry Job গত ১ ঘণ্টায় চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runTrialExpiry({ reason: 'startup-catchup' });
        } else {
            logger.info(`✅ Trial Expiry Job সম্প্রতি চলেছে (${result.rows[0].ran_at.toISOString()}) — skip।`);
        }
    } catch (err) {
        if (err.message?.includes('job_runs')) {
            logger.warn('⚠️ job_runs টেবিল নেই — missed-run চেক বাদ দেওয়া হলো।');
        } else {
            logger.error('❌ Missed-run চেকে সমস্যা:', err.message);
        }
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────────
const startTrialExpiryJob = () => {
    cron.schedule('0 * * * *', async () => {   // প্রতি ঘণ্টার শুরুতে
        logger.info('🔔 Trial Expiry Job ট্রিগার হয়েছে');
        await runTrialExpiry({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    logger.info('⏰ Trial Expiry Job নিবন্ধিত: প্রতি ঘণ্টায়');

    setImmediate(() => {
        runIfMissedRecently().catch(err =>
            logger.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startTrialExpiryJob, runTrialExpiry };
