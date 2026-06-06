const logger = require('../config/logger');
const { Pool } = require('pg');

// ============================================================
// PostgreSQL Connection Pool
// Supabase এর সাথে SSL সংযোগ
//
// SSL Fix:
//   আগে: rejectUnauthorized: false — MITM attack সম্ভব ছিল।
//   এখন: DB_SSL_CA env variable থেকে Supabase CA certificate
//         verify করা হয়। cert না থাকলে server উঠবে না।
//
// CA Certificate সেটআপ (একবারই করতে হবে):
//   ১. Supabase Dashboard → Settings → Database → SSL Certificate
//      → "Download Certificate" → ca.pem ডাউনলোড
//   ২. base64 encode করো:
//        Linux/Mac:  base64 -w 0 ca.pem
//        Windows:    certutil -encode ca.pem tmp.b64 && findstr /v CERTIFICATE tmp.b64
//   ৩. Render Dashboard → Environment → DB_SSL_CA → encode করা string paste করো
// ============================================================

// ── SSL Certificate লোড ──────────────────────────────────────
// DB_SSL_CA: Supabase ca.pem → base64 encode → env variable-এ রাখো
// Render-এ file system ephemeral, তাই file-এর বদলে env variable ব্যবহার।

const sslCaBase64 = process.env.DB_SSL_CA;

if (!sslCaBase64 || sslCaBase64.trim() === '') {
    logger.error('');
    logger.error('❌ DB_SSL_CA environment variable সেট নেই।');
    logger.error('   Supabase CA certificate ছাড়া নিরাপদ DB সংযোগ সম্ভব নয়।');
    logger.error('');
    logger.error('   সমাধান:');
    logger.error('   ১. Supabase Dashboard → Settings → Database → SSL Certificate → Download');
    logger.error('   ২. Linux/Mac: base64 -w 0 ca.pem');
    logger.error('      Windows:   certutil -encode ca.pem tmp.b64 && findstr /v CERTIFICATE tmp.b64');
    logger.error('   ৩. Render Dashboard → Environment → DB_SSL_CA = [base64 string]');
    logger.error('');
    process.exit(1);
}

// base64 → PEM string (Buffer decode করে utf8 string বের করা হচ্ছে)
const caCert = Buffer.from(sslCaBase64.trim(), 'base64').toString('utf8');

// ============================================================
// Connection Pool
// ============================================================

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: true,  // ✅ Certificate verify করা হবে — MITM সম্ভব নয়
        ca: caCert,                // Supabase CA cert (env থেকে লোড করা)
    },
    // Connection pool settings — Render free tier + Supabase free tier অপ্টিমাইজড
    // Supabase free: max 60 connection। Render free: single instance।
    // 10 রাখলে একসাথে ৫০+ request এলেও queue হবে, crash করবে না।
    max:                    15,    // ১৫টি connection — ৫০+ concurrent request সামলাতে পারবে
    min:                    2,     // সবসময় ২টি connection ready রাখো (cold start দ্রুত হবে)
    idleTimeoutMillis:      60000, // ৬০ সেকেন্ড idle থাকলে বন্ধ
    connectionTimeoutMillis: 10000, // ১০ সেকেন্ডের মধ্যে connect না হলে error
});

// ============================================================
// CONNECTION TEST — Retry সহ
// Render free tier cold-start এ DB সাথে সাথে ready নাও থাকতে পারে।
// ৫ বার চেষ্টা করবে, প্রতিবার একটু বেশি অপেক্ষা করবে।
// ============================================================

const MAX_RETRIES    = 5;
const RETRY_DELAY_MS = 3000; // শুরু: ৩ সেকেন্ড (প্রতিবার ×১.৫ বাড়বে)

async function testConnection(attempt = 1) {
    try {
        const client = await pool.connect();
        client.release();
        logger.info('✅ Database সংযোগ সফল — Supabase PostgreSQL (SSL verified)');
    } catch (err) {
        logger.error(`❌ Database সংযোগ ব্যর্থ (চেষ্টা ${attempt}/${MAX_RETRIES}): ${err.message}`);

        if (attempt < MAX_RETRIES) {
            const delay = Math.round(RETRY_DELAY_MS * Math.pow(1.5, attempt - 1));
            logger.info(`⏳ ${delay / 1000} সেকেন্ড পরে আবার চেষ্টা করা হবে...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return testConnection(attempt + 1);
        }

        logger.error('🔴 Database সংযোগ সম্পূর্ণ ব্যর্থ। Server চলছে — query-তে error হবে।');
    }
}

// ============================================================
// AUTO MIGRATION — Server start এ FCM columns নিশ্চিত করো
// ============================================================

async function runMigrations() {
    try {
        await pool.query(`
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS fcm_token TEXT,
                ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;
        `);
        logger.info('✅ FCM migration সফল');
    } catch (err) {
        logger.warn('⚠️ FCM migration:', err.message);
    }
}

testConnection().then(() => runMigrations());

// ============================================================
// QUERY HELPER
// সহজে query চালানোর জন্য
// ============================================================

const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;

        // Slow query সব environment-এ লগ করো।
        // Development: 500ms threshold (কড়া)
        // Production:  1000ms threshold (performance debug-এর জন্য)
        const slowThreshold = process.env.NODE_ENV === 'production' ? 1000 : 500;
        if (duration > slowThreshold) {
            logger.warn(`⚠️ Slow Query [${process.env.NODE_ENV}] (${duration}ms):`, text);
        }

        return result;
    } catch (error) {
        // ✅ FIX: logger দ্বিতীয় argument-এ object চায়, string/array নয়।
        // আগের কোড: logger.error('❌ Query Error:', error.message)
        //   → error.message string হওয়ায় character-by-character log হত (800+ লাইন!)
        // এখন: একটি structured object-এ সব তথ্য একসাথে লগ হবে।
        logger.error('❌ Query Error', {
            err:    error,
            query:  text.substring(0, 300),   // দীর্ঘ SQL truncate করো
            params: Array.isArray(params)
                    ? params.slice(0, 10)       // প্রথম ১০টি param দেখাও
                    : params,
        });
        throw error;
    }
};

// ============================================================
// TRANSACTION HELPER
// একাধিক query একসাথে চালানোর জন্য
// যেকোনো একটা ব্যর্থ হলে সব rollback হবে
// ============================================================

const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// ============================================================
// POOL ERROR HANDLER
// ============================================================

pool.on('error', (err) => {
    logger.error('❌ Database Pool Error:', err.message);
});

module.exports = { query, withTransaction, pool };
