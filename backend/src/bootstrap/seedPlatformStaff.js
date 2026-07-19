const bcrypt = require('bcryptjs');
const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Startup-time Support-staff seeding.
//
// কেন এভাবে: Render-এর নিজের environment-এই DATABASE_URL/DB credentials
// থাকে, তাই এই স্ক্রিপ্ট সার্ভার বুট হওয়ার সময় নিজেই সেগুলো ব্যবহার করে —
// কোনো phone/Termux-এ .env-এ DB secret কপি করার দরকার নেই।
//
// ব্যবহার (Render → Environment ট্যাব):
//   SEED_NAME=Support GM
//   SEED_EMAIL=support@zovorix.com
//   SEED_PASSWORD=<strong-password>
//
// ⚠️ Idempotent — email আগে থেকেই থাকলে কিছুই করবে না, প্রতিবার deploy/restart-এ
//    নিরাপদে চলতে পারে, duplicate account বা error তৈরি করবে না।
// ⚠️ কাজ শেষে (account তৈরি নিশ্চিত হলে) Render থেকে SEED_PASSWORD মুছে ফেলার
//    সুপারিশ করা হচ্ছে — ভ্যালু plain-text env-এ পড়ে থাকার দরকার নেই।
// ============================================================

const seedPlatformStaffFromEnv = async () => {
    const name     = process.env.SEED_NAME;
    const email    = process.env.SEED_EMAIL;
    const password = process.env.SEED_PASSWORD;

    // তিনটাই না থাকলে চুপচাপ স্কিপ (এটাই normal অবস্থা — একবার account বানানোর পর
    // এই env var আর সেট থাকবে না ধরে নেওয়া হচ্ছে)
    if (!name || !email || !password) {
        return;
    }

    try {
        const existing = await query('SELECT id FROM platform_staff WHERE email = $1', [email]);

        if (existing.rows.length > 0) {
            logger.info(`ℹ️  platform_staff seed skip — '${email}' আগে থেকেই আছে।`);
            return;
        }

        if (password.length < 8) {
            logger.warn('⚠️  SEED_PASSWORD খুব ছোট (৮ ক্যারেক্টারের কম) — seed স্কিপ করা হলো।');
            return;
        }

        const hash = await bcrypt.hash(password, 10);

        const result = await query(
            `INSERT INTO platform_staff (name, email, password_hash, scope, status)
             VALUES ($1, $2, $3, 'support', 'active')
             RETURNING id, name, email, scope`,
            [name, email, hash]
        );

        logger.info(`✅ platform_staff (support scope) তৈরি হয়েছে startup-seed দিয়ে: ${result.rows[0].email}`);
        logger.warn('⚠️  এখন Render Environment থেকে SEED_PASSWORD মুছে ফেলার সুপারিশ করা হচ্ছে।');
    } catch (err) {
        // সার্ভার বুট ব্লক করা যাবে না — শুধু error লগ করো
        logger.error('❌ seedPlatformStaffFromEnv ব্যর্থ:', err.message);
    }
};

module.exports = { seedPlatformStaffFromEnv };
