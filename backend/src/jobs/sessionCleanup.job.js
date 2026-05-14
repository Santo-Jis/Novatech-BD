const cron      = require('node-cron');
const { query } = require('../config/db');
const { cleanExpiredSessions } = require('../services/auth.service');

// ============================================================
// Session Cleanup Background Job
// প্রতিদিন রাত ৩:০০ তে চলবে (Dhaka timezone)
//
// সমস্যা ১ — cleanExpiredSessions() কখনো call হতো না:
//   auth.service.js-এ function লেখা ছিল, কিন্তু কোথাও schedule
//   করা হয়নি। user_sessions table-এ expired row জমতে থাকত।
//
// সমস্যা ২ — Render restart-এ missed job:
//   node-cron in-memory — server বন্ধ থাকলে job চলে না।
//   তাই startup-এ "আজ কি job ইতোমধ্যে চলেছে?" চেক করা হয়।
//   না চললে সাথে সাথে একবার run করা হয় (catch-up run)।
//   এর জন্য job_runs টেবিল ব্যবহার করা হয়।
//
// job_runs টেবিল না থাকলে:
//   CREATE TABLE IF NOT EXISTS job_runs (
//       job_name    TEXT        NOT NULL,
//       ran_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//       rows_affected INT,
//       PRIMARY KEY (job_name, ran_at)
//   );
// ============================================================

const JOB_NAME = 'session_cleanup';

// ── মূল কাজ ─────────────────────────────────────────────────

const runSessionCleanup = async ({ reason = 'scheduled' } = {}) => {
    console.log(`\n🧹 Session Cleanup শুরু [${reason}]...`);

    try {
        const result = await query(
            'DELETE FROM user_sessions WHERE expires_at < NOW()'
        );
        const rowCount = result.rowCount ?? 0;

        console.log(`✅ Session Cleanup সম্পন্ন — ${rowCount}টি মেয়াদোত্তীর্ণ session মুছা হয়েছে।`);

        // job_runs টেবিলে লগ রাখো (missed-run detection-এর জন্য)
        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected)
             VALUES ($1, NOW(), $2)`,
            [JOB_NAME, rowCount]
        ).catch(err => {
            // job_runs টেবিল না থাকলে warn করো — মূল কাজ ব্যর্থ নয়
            console.warn('⚠️ job_runs লগ ব্যর্থ (টেবিল নেই?):', err.message);
        });

    } catch (error) {
        console.error('❌ Session Cleanup ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক ────────────────────────────────
// Render restart হলে বা server বন্ধ থাকলে আজকের job miss হতে পারে।
// startup-এ দেখা হয় — আজ (Dhaka timezone) job চলেছিল কিনা।
// না চললে সঙ্গে সঙ্গে একবার চালানো হয়।

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
            console.log('⚠️ Session Cleanup আজ চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runSessionCleanup({ reason: 'startup-catchup' });
        } else {
            const lastRun = result.rows[0].ran_at;
            console.log(`✅ Session Cleanup আজ ইতোমধ্যে চলেছে (${lastRun.toISOString()}) — skip।`);
        }
    } catch (err) {
        // job_runs টেবিল না থাকলে warn করে safe fallback
        if (err.message?.includes('job_runs')) {
            console.warn('⚠️ job_runs টেবিল নেই — missed-run চেক বাদ দেওয়া হলো।');
            console.warn('   নিচের SQL চালিয়ে টেবিল তৈরি করুন:');
            console.warn('   CREATE TABLE IF NOT EXISTS job_runs (');
            console.warn('       job_name      TEXT        NOT NULL,');
            console.warn('       ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),');
            console.warn('       rows_affected INT,');
            console.warn('       PRIMARY KEY (job_name, ran_at)');
            console.warn('   );');
        } else {
            console.error('❌ Missed-run চেকে সমস্যা:', err.message);
        }
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────

const startSessionCleanupJob = () => {
    // প্রতিদিন রাত ৩:০০ — AI job (১টা) ও GPS cleanup (২টা)-র পরে
    cron.schedule('0 3 * * *', async () => {
        console.log('🔔 Session Cleanup Job ট্রিগার হয়েছে');
        await runSessionCleanup({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    console.log('⏰ Session Cleanup Job নিবন্ধিত: প্রতিদিন রাত ৩:০০');

    // Startup-এ missed run check — event loop ছাড়তে দিয়ে চালাও
    // যাতে DB connection pool পুরো প্রস্তুত থাকে
    setImmediate(() => {
        runIfMissedToday().catch(err =>
            console.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startSessionCleanupJob, runSessionCleanup };
