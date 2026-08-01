const cron   = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Daily KPI Snapshot Job
// প্রতিদিন রাত ১১:৫৫ (Asia/Dhaka) — commission job (রাত ১২:০০)-এর ঠিক আগে
//
// কেন দরকার:
//   Admin Dashboard-এর "মোট বকেয়া" (customers.current_credit-এর SUM)
//   আর "সক্রিয় SR" (users.status='active'-এর COUNT) — এই দুইটা কখনোই
//   তারিখ দিয়ে ফিল্টার হয় না, সবসময় "এই মুহূর্তে" স্ন্যাপশট। তাই
//   trend % (গতকাল/গত সপ্তাহ/গত মাসের তুলনায়) বের করার কোনো উপায়
//   ছিল না — historical ভ্যালু কোথাও রাখা হতো না।
//
//   এই job প্রতিদিন শেষে প্রতিটা tenant-এর জন্য একটা "photo" তুলে
//   daily_kpi_snapshots টেবিলে রাখে, যাতে getSystemStats() পরে
//   পুরনো তারিখের সাথে তুলনা করতে পারে।
//
//   ⚠️ এখানে ব্যবহৃত কলাম/শর্ত admin.controller.js-এর getSystemStats()
//   -এর সাথে হুবহু মিলিয়ে রাখা হয়েছে (current_credit, role='worker',
//   status='active') — নাহলে আজকের "live" সংখ্যার সাথে snapshot-এর
//   সংখ্যা মিলবে না আর trend% ভুল দেখাবে।
//
// টেবিল না থাকলে (নতুন ডেপ্লয়মেন্টে):
//   CREATE TABLE IF NOT EXISTS daily_kpi_snapshots (
//       tenant_id         UUID NOT NULL,
//       snapshot_date     DATE NOT NULL,
//       total_outstanding NUMERIC NOT NULL DEFAULT 0,
//       active_workers    INTEGER NOT NULL DEFAULT 0,
//       taken_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//       PRIMARY KEY (tenant_id, snapshot_date)
//   );
//
// নোট: এই টেবিলে কোনো backfill/history নেই — যেদিন থেকে এই job প্রথম
// চলবে সেদিন থেকেই ট্র্যাকিং শুরু। তাই deploy-এর প্রথম দিন trend
// দেখাবে না (prev snapshot নেই), ১-২ দিন পর থেকে "গতকালের তুলনায়"
// আসা শুরু করবে, ৭+ দিন পর "গত সপ্তাহের তুলনায়", ৩০+ দিন পর মাসেরটা।
// ============================================================

const JOB_NAME = 'daily_kpi_snapshot';

// ── মূল কাজ — সব tenant একসাথে, এক INSERT-এ ──────────────────
const runKpiSnapshot = async ({ reason = 'scheduled' } = {}) => {
    logger.info(`\n📸 Daily KPI Snapshot শুরু [${reason}]...`);

    try {
        const result = await query(`
            INSERT INTO daily_kpi_snapshots
                (tenant_id, snapshot_date, total_outstanding, active_workers, taken_at)
            SELECT
                t.id,
                (NOW() AT TIME ZONE 'Asia/Dhaka')::date,
                COALESCE((
                    SELECT SUM(current_credit) FROM customers
                    WHERE tenant_id = t.id
                ), 0) AS total_outstanding,
                COALESCE((
                    SELECT COUNT(*) FROM users
                    WHERE tenant_id = t.id AND role = 'worker' AND status = 'active'
                ), 0) AS active_workers,
                NOW()
            FROM tenants t
            ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
                total_outstanding = EXCLUDED.total_outstanding,
                active_workers    = EXCLUDED.active_workers,
                taken_at          = EXCLUDED.taken_at
        `);
        const rowCount = result.rowCount ?? 0;

        logger.info(`✅ KPI Snapshot সম্পন্ন — ${rowCount}টি tenant-এর রেকর্ড নেওয়া হয়েছে।`);

        // job_runs টেবিলে লগ (missed-run detection-এর জন্য — sessionCleanup.job.js-এর প্যাটার্ন)
        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, rowCount]
        ).catch(err => {
            logger.warn('⚠️ job_runs লগ ব্যর্থ (টেবিল নেই?):', err.message);
        });

    } catch (error) {
        logger.error('❌ KPI Snapshot ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক ────────────────────────────────
// Render restart-এ রাত ১১:৫৫-এর job miss হতে পারে (node-cron in-memory)।
// startup-এ দেখা হয় আজ (Dhaka) snapshot নেওয়া হয়েছে কিনা, না হলে
// সাথে সাথে একবার catch-up run করা হয়।
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
            logger.info('⚠️ KPI Snapshot আজ চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runKpiSnapshot({ reason: 'startup-catchup' });
        } else {
            const lastRun = result.rows[0].ran_at;
            logger.info(`✅ KPI Snapshot আজ ইতোমধ্যে চলেছে (${lastRun.toISOString()}) — skip।`);
        }
    } catch (err) {
        if (err.message?.includes('job_runs') || err.message?.includes('daily_kpi_snapshots')) {
            logger.warn('⚠️ প্রয়োজনীয় টেবিল নেই — missed-run চেক বাদ দেওয়া হলো।');
        } else {
            logger.error('❌ Missed-run চেকে সমস্যা:', err.message);
        }
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────
const startKpiSnapshotJob = () => {
    // রাত ১১:৫৫ Dhaka — commission job (রাত ১২:০০) এর ঠিক আগে,
    // যাতে "আজকের শেষ অবস্থা"-ই snapshot হয়ে যায়
    cron.schedule('55 23 * * *', async () => {
        logger.info('🔔 KPI Snapshot Job ট্রিগার হয়েছে');
        await runKpiSnapshot({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    logger.info('⏰ KPI Snapshot Job নিবন্ধিত: প্রতিদিন রাত ১১:৫৫');

    setImmediate(() => {
        runIfMissedToday().catch(err =>
            logger.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startKpiSnapshotJob, runKpiSnapshot };
