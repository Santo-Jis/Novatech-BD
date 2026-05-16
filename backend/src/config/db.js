const { Pool } = require('pg');

// ============================================================
// PostgreSQL Connection Pool
// Supabase এর সাথে SSL সংযোগ
// ============================================================

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false  // Supabase এর জন্য
    },
    // Connection pool settings — Render free tier + Supabase free tier অপ্টিমাইজড
    // Supabase free: max 60 connection। Render free: single instance।
    // 10 রাখলে একসাথে ৫০+ request এলেও queue হবে, crash করবে না।
    max:             15,    // ১৫টি connection — ৫০+ concurrent request সামলাতে পারবে (আগে ১০ ছিল, queue জমত)
    min:             2,     // সবসময় ২টি connection ready রাখো (cold start দ্রুত হবে)
    idleTimeoutMillis: 60000,   // ৬০ সেকেন্ড idle থাকলে বন্ধ (আগে ৩০s, বেশি reconnect হত)
    connectionTimeoutMillis: 10000, // ১০ সেকেন্ডের মধ্যে connect না হলে error (আগে ৩০s, বেশি অপেক্ষা হত)
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
    console.log('✅ Database সংযোগ সফল — Supabase PostgreSQL');
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
