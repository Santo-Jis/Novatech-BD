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
    console.error('');
    console.error('❌ DB_SSL_CA environment variable সেট নেই।');
    console.error('   Supabase CA certificate ছাড়া নিরাপদ DB সংযোগ সম্ভব নয়।');
    console.error('');
    console.error('   সমাধান:');
    console.error('   ১. Supabase Dashboard → Settings → Database → SSL Certificate → Download');
    console.error('   ২. Linux/Mac: base64 -w 0 ca.pem');
    console.error('      Windows:   certutil -encode ca.pem tmp.b64 && findstr /v CERTIFICATE tmp.b64');
    console.error('   ৩. Render Dashboard → Environment → DB_SSL_CA = [base64 string]');
    console.error('');
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
// CONNECTION TEST
// ============================================================

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database সংযোগ ব্যর্থ:', err.message);
        return;
    }
    release();
    console.log('✅ Database সংযোগ সফল — Supabase PostgreSQL (SSL verified)');
});

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
            console.warn(`⚠️ Slow Query [${process.env.NODE_ENV}] (${duration}ms):`, text);
        }

        return result;
    } catch (error) {
        console.error('❌ Query Error:', error.message);
        console.error('Query:', text);
        console.error('Params:', params);
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
    console.error('❌ Database Pool Error:', err.message);
});

module.exports = { query, withTransaction, pool };
