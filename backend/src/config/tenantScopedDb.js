const logger = require('./logger');
const { Pool } = require('pg');

// ============================================================
// Commission subsystem — RLS-protected connection
//
// মূল config/db.js পুরো অ্যাপ্লিকেশনের জন্য `postgres` role দিয়ে কানেক্ট
// করে, যেটা RLS বাইপাস করে (owner/superuser)। মানে সেই connection দিয়ে
// commission_settings-এ RLS policy থাকলেও application কোডে tenant_id
// ফিল্টার ভুলে গেলে কোনো সুরক্ষা নেই — এটাই ছিল Bug #1-এর root cause।
//
// এই মডিউল একটা আলাদা, সীমিত-ক্ষমতার `app_backend` role দিয়ে কানেক্ট করে
// (NOBYPASSRLS) — শুধু commission.service.js আর commissionLedger.service.js
// এটা ব্যবহার করবে। বাকি পুরো অ্যাপ্লিকেশন (sales, chat, GPS, settlement...)
// আগের মতোই config/db.js-এর মূল pool ব্যবহার করবে, কিছুই বদলায়নি —
// তাই এই পরিবর্তনের ঝুঁকি শুধু commission subsystem-এই সীমাবদ্ধ।
//
// app_backend role আর তার RLS policy-গুলো migration_commission_rls.sql-এ।
// শুধু এই টেবিলগুলোতে অ্যাক্সেস আছে: commission_settings (read),
// commission (read/write), commission_ledger (read/write), users (শুধু
// read, commission টেবিলের tenant-check subquery-র জন্য দরকার)।
//
// কনফিগ: মূল DB_HOST/DB_PORT/DB_NAME/DB_SSL_CA-ই পুনর্ব্যবহার করা হয়েছে
// (একই ডেটাবেস, শুধু আলাদা role) — নতুন env var লাগবে শুধু ২টা:
//   COMMISSION_DB_USER=app_backend
//   COMMISSION_DB_PASSWORD=<Supabase SQL editor-এ ALTER ROLE দিয়ে নিজে সেট করা পাসওয়ার্ড>
// ============================================================

const sslCaBase64 = process.env.DB_SSL_CA;

if (!sslCaBase64 || sslCaBase64.trim() === '') {
    logger.error('❌ tenantScopedDb: DB_SSL_CA সেট নেই — commission subsystem চালু হবে না।');
    throw new Error('DB_SSL_CA missing — required for tenantScopedDb connection');
}

if (!process.env.COMMISSION_DB_USER || !process.env.COMMISSION_DB_PASSWORD) {
    logger.error('❌ tenantScopedDb: COMMISSION_DB_USER/COMMISSION_DB_PASSWORD সেট নেই।');
    logger.error('   Supabase SQL editor-এ app_backend role-এর পাসওয়ার্ড সেট করে');
    logger.error('   Render env-এ COMMISSION_DB_USER=app_backend আর COMMISSION_DB_PASSWORD যোগ করুন।');
    throw new Error('COMMISSION_DB_USER/COMMISSION_DB_PASSWORD missing');
}

const caCert = Buffer.from(sslCaBase64.trim(), 'base64').toString('utf8');

// ছোট, dedicated pool — মূল pool-কে (max:15, min:5) প্রভাবিত করে না।
// Supabase free tier-এর 60-connection সীমার মধ্যে আরামসে থাকে (15+5=20 max)।
const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.COMMISSION_DB_USER,
    password: process.env.COMMISSION_DB_PASSWORD,
    ssl: {
        rejectUnauthorized: true,
        ca: caCert,
    },
    max: 5,
    min: 1,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    logger.error('❌ tenantScopedDb pool error:', err.message);
});

/**
 * tenantId context সেট করে একটা transaction-এর ভেতরে callback চালায়।
 * RLS policy-গুলো current_setting('app.tenant_id') চেক করে — এটা ঠিকভাবে
 * সেট না থাকলে (বা ভুল tenantId দিলে) policy 0 row রিটার্ন করবে, ভুল
 * tenant-এর ডেটা কখনো দেখাবে/লিখবে না না — এটাই আসল, DB-level সুরক্ষা।
 *
 * callback একটা pg client পায় (`client.query(sql, params)`) — ঐ client
 * দিয়েই সব query চালাতে হবে, যাতে SET LOCAL একই transaction-এ থাকা সব
 * query-তে প্রযোজ্য হয়।
 */
const withTenantScope = async (tenantId, callback) => {
    if (!tenantId) {
        throw new Error('withTenantScope: tenantId বাধ্যতামূলক (RLS-এর জন্য)');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {}); // rollback নিজেও fail করতে পারে যদি connection আগেই ভেঙে যায়
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { pool, withTenantScope };
