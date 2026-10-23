// ============================================================
// portalPerson.service.js
// ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট)
//
// getPersonId আগে customerPost.controller.js-এর ভেতরে একবার ডিফাইন
// করা ছিল। feedEngagement.controller.js-এরও ঠিক একই লজিক লাগে —
// দুই জায়গায় আলাদা কপি রাখলে ঠিক portalAuthShared.js-এর কমেন্টে
// উল্লেখ করা সমস্যাটাই হতে পারে (দুইটা কপি সময়ের সাথে আলাদা হয়ে
// যাওয়া/drift) — তাই এখানে single canonical জায়গায় সরানো হলো।
//
// ✅ FIX (person_id NULL সমস্যা): SR/অ্যাডমিনের বানানো কাস্টমারের সাথে
// persons row তৈরি হতো না (শুধু self-register-এ হতো), ফলে
// customers.person_id NULL থেকে যেত এবং অর্ডার/প্রোফাইল/কানেকশন সব
// "প্রোফাইল লিংক পাওয়া যায়নি" দিত। এখন person_id না থাকলে এখানেই
// স্বয়ংক্রিয়ভাবে person খুঁজে/বানিয়ে লিংক করা হয় (self-heal)।
// চারটা কন্ট্রোলারের আলাদা কপি বাদ দিয়ে সবাই এই একটাই ফাংশন ব্যবহার করে।
// ============================================================

const { query, withTransaction } = require('../config/db');
const logger = require('../config/logger');

const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

// customer row-এর সাথে person লিংক করো — আগে একই WhatsApp নম্বরের
// বিদ্যমান person খোঁজে (multi-company: একই মানুষ, একাধিক কোম্পানি),
// না পেলে নতুন person বানায়। customer row FOR UPDATE লক করা হয়, তাই
// একসাথে দুটো রিকোয়েস্ট এলেও দুটো আলাদা person তৈরি হবে না।
async function ensurePersonForCustomer(customerId) {
    return withTransaction(async (client) => {
        const cr = await client.query(
            `SELECT id, person_id, owner_name, shop_name, whatsapp, email, business_type,
                    date_of_birth, profile_photo, shop_photo, password_hash
             FROM customers WHERE id = $1 FOR UPDATE`,
            [customerId]
        );
        if (cr.rows.length === 0) throw new Error('PERSON_NOT_LINKED');
        const c = cr.rows[0];
        if (c.person_id) return c.person_id; // অন্য রিকোয়েস্ট আগেই লিংক করে ফেলেছে

        let personId = null;
        const wa = digitsOnly(c.whatsapp);
        if (wa) {
            const existing = await client.query(
                `SELECT id FROM persons
                 WHERE regexp_replace(coalesce(whatsapp,''), '\\D', '', 'g') = $1
                 ORDER BY created_at LIMIT 1`,
                [wa]
            );
            if (existing.rows.length > 0) personId = existing.rows[0].id;
        }

        if (!personId) {
            const ins = await client.query(
                `INSERT INTO persons (full_name, whatsapp, email, shop_name, business_type,
                                      date_of_birth, profile_photo, shop_photo, password_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [c.owner_name, c.whatsapp, c.email, c.shop_name, c.business_type,
                 c.date_of_birth, c.profile_photo, c.shop_photo, c.password_hash]
            );
            personId = ins.rows[0].id;
        }

        await client.query(`UPDATE customers SET person_id = $1 WHERE id = $2`, [personId, customerId]);
        logger.info(`🔗 Auto-linked person ${personId} to customer ${customerId}`);
        return personId;
    });
}

// portalUser থেকে person_id বের করা — পুরনো token: portalUser.customer_id
// দিয়ে lookup, নতুন token: person_id সরাসরি থাকে।
// customer আছে কিন্তু person_id NULL হলে স্বয়ংক্রিয়ভাবে লিংক করে।
async function getPersonId(portalUser) {
    if (portalUser?.person_id) return portalUser.person_id;
    if (portalUser?.customer_id) {
        const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [portalUser.customer_id]);
        if (r.rows.length > 0) {
            if (r.rows[0].person_id) return r.rows[0].person_id;
            return ensurePersonForCustomer(portalUser.customer_id); // self-heal
        }
    }
    throw new Error('PERSON_NOT_LINKED');
}

module.exports = { getPersonId, ensurePersonForCustomer };
