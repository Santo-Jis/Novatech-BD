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
    // Connection pool settings
    max:             20,    // সর্বোচ্চ ২০টি connection
    idleTimeoutMillis: 30000,  // ৩০ সেকেন্ড idle থাকলে বন্ধ
    connectionTimeoutMillis: 5000, // ৫ সেকেন্ডের মধ্যে connect না হলে error
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

        // Development mode এ slow query লগ করো
        if (process.env.NODE_ENV === 'development' && duration > 1000) {
            console.warn(`⚠️ Slow Query (${duration}ms):`, text);
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
