/**
 * seed-platform-staff.js
 * প্রথম platform_staff (Support scope) account তৈরির জন্য one-time script।
 *
 * ব্যবহার (repo root / backend ফোল্ডার থেকে):
 *   SEED_NAME="আপনার নাম" SEED_EMAIL="support@example.com" SEED_PASSWORD="strong-password" node scripts/seed-platform-staff.js
 *
 * ⚠️ চালানোর পর এই কমান্ড history/terminal থেকে password মুছে ফেলুন (bash history clear করুন প্রয়োজনে)।
 * ⚠️ scope এখানে hardcode করা 'support' — Full/Super-Admin scope staff তৈরি এই script দিয়ে হয় না (ইচ্ছাকৃত, অন্য এজেন্টের কাজের সাথে সাংঘর্ষিক না হওয়ার জন্য)।
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../src/config/db');

const run = async () => {
    const name     = process.env.SEED_NAME;
    const email    = process.env.SEED_EMAIL;
    const password = process.env.SEED_PASSWORD;

    if (!name || !email || !password) {
        console.error('❌ SEED_NAME, SEED_EMAIL, SEED_PASSWORD env var দিন।');
        process.exit(1);
    }

    if (password.length < 10) {
        console.error('❌ Password অন্তত ১০ ক্যারেক্টার হতে হবে।');
        process.exit(1);
    }

    const existing = await query('SELECT id FROM platform_staff WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
        console.error('❌ এই email দিয়ে আগে থেকেই একটা platform_staff account আছে।');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await query(
        `INSERT INTO platform_staff (name, email, password_hash, scope, status)
         VALUES ($1, $2, $3, 'support', 'active')
         RETURNING id, name, email, scope`,
        [name, email, hash]
    );

    console.log('✅ Support staff account তৈরি হয়েছে:', result.rows[0]);
    process.exit(0);
};

run().catch((err) => {
    console.error('❌ Seed ব্যর্থ:', err.message);
    process.exit(1);
});
