// ============================================================
// portalPerson.service.js
// ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট)
//
// getPersonId আগে customerPost.controller.js-এর ভেতরে একবার ডিফাইন
// করা ছিল। feedEngagement.controller.js-এরও ঠিক একই লজিক লাগে —
// দুই জায়গায় আলাদা কপি রাখলে ঠিক portalAuthShared.js-এর কমেন্টে
// উল্লেখ করা সমস্যাটাই হতে পারে (দুইটা কপি সময়ের সাথে আলাদা হয়ে
// যাওয়া/drift) — তাই এখানে single canonical জায়গায় সরানো হলো।
// ============================================================

const { query } = require('../config/db');

// portalUser থেকে person_id বের করা — পুরনো token: portalUser.customer_id
// দিয়ে lookup, নতুন token: person_id সরাসরি থাকে।
async function getPersonId(portalUser) {
    if (portalUser?.person_id) return portalUser.person_id;
    if (portalUser?.customer_id) {
        const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [portalUser.customer_id]);
        if (r.rows.length > 0 && r.rows[0].person_id) return r.rows[0].person_id;
    }
    throw new Error('PERSON_NOT_LINKED');
}

module.exports = { getPersonId };
