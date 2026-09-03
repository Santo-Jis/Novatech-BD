// ============================================================
// customerPost.controller.js
// ✅ NEW (Phase 5 — কোড অডিট) — "কাস্টমার পোস্ট"
// HomeFeed.jsx-এর একমাত্র বাকি থাকা placeholder সেকশন সম্পূর্ণ করা।
//
// companyPost.controller.js-এর ঠিক একই সরল প্যাটার্ন (soft-delete,
// moderation/like/comment নেই — v1 ইচ্ছাকৃতভাবে সরল)। তফাত একটাই:
// visibility company_posts-এর মতো marketplace-wide না — শুধু "network"
// (অন্তত একটা connected কোম্পানি শেয়ার করা person-দের পোস্ট দেখা যায়),
// যেটা ConnectionsTab.jsx-এর আদি কমেন্টে উল্লেখ করা "শপ↔শপ নেটওয়ার্ক"
// ভিশনের বাস্তবায়ন।
//
// প্রাইভেসি নোট: getNetworkFeed শুধু full_name ফেরত দেয় — phone/whatsapp/
// email না (connection.controller.js-এর discoverable-fix-এর একই
// discipline — feed-এর মাধ্যমে কারো contact info leak হওয়া উচিত না)।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');

// getPersonId — customerPortalConnection.controller.js-এর সাথে সামঞ্জস্যপূর্ণ
// (পুরনো token: portalUser.customer_id দিয়ে lookup, নতুন token: person_id সরাসরি)
async function getPersonId(portalUser) {
    if (portalUser?.person_id) return portalUser.person_id;
    if (portalUser?.customer_id) {
        const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [portalUser.customer_id]);
        if (r.rows.length > 0 && r.rows[0].person_id) return r.rows[0].person_id;
    }
    throw new Error('PERSON_NOT_LINKED');
}

const MAX_BODY_LENGTH = 1000; // ছোট/সহজে-স্ক্যান-করা পোস্ট রাখতে — company_posts-এও কোনো hard limit নেই কিন্তু সেটা admin-composed, এটা open user input বলে limit দরকার

// ============================================================
// GET /api/portal/customer-posts?limit=15
// নেটওয়ার্ক ফিড — নিজের পোস্ট + যাদের সাথে অন্তত একটা connected
// কোম্পানি শেয়ার করা আছে তাদের পোস্ট।
// ============================================================
const getNetworkFeed = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const limit = Math.min(parseInt(req.query.limit) || 15, 50);

        const result = await query(
            `SELECT cp.id, cp.body, cp.image_url, cp.created_at,
                    cp.person_id, p.full_name AS author_name,
                    (cp.person_id = $1) AS is_mine
             FROM customer_posts cp
             JOIN persons p ON p.id = cp.person_id
             WHERE cp.is_active = true
               AND (
                     cp.person_id = $1
                     OR EXISTS (
                          SELECT 1
                          FROM customer_company_connections mine
                          JOIN customer_company_connections theirs
                                 ON theirs.tenant_id = mine.tenant_id
                                AND theirs.status = 'connected'
                          WHERE mine.person_id = $1
                            AND mine.status = 'connected'
                            AND theirs.person_id = cp.person_id
                        )
                   )
             ORDER BY cp.created_at DESC
             LIMIT $2`,
            [personId, limit]
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getNetworkFeed error:', err.message);
        res.status(500).json({ success: false, message: 'ফিড আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/customer-posts   { body, image_url? }
// ============================================================
const createPost = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const body = (req.body.body || '').trim();
        const image_url = req.body.image_url || null;

        if (!body) {
            return res.status(400).json({ success: false, message: 'কিছু লিখুন।' });
        }
        if (body.length > MAX_BODY_LENGTH) {
            return res.status(400).json({ success: false, message: `সর্বোচ্চ ${MAX_BODY_LENGTH} অক্ষর লেখা যাবে।` });
        }

        const created = await query(
            `INSERT INTO customer_posts (person_id, body, image_url)
             VALUES ($1, $2, $3)
             RETURNING id, body, image_url, created_at`,
            [personId, body, image_url]
        );

        res.status(201).json({ success: true, data: created.rows[0], message: 'পোস্ট করা হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ createPost error:', err.message);
        res.status(500).json({ success: false, message: 'পোস্ট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/portal/customer-posts/:id — soft delete, শুধু নিজেরটা
// ============================================================
const deleteMyPost = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const updated = await query(
            `UPDATE customer_posts SET is_active = false
             WHERE id = $1 AND person_id = $2
             RETURNING id`,
            [req.params.id, personId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }
        res.json({ success: true, message: 'পোস্ট সরানো হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ deleteMyPost error:', err.message);
        res.status(500).json({ success: false, message: 'সরাতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getNetworkFeed, createPost, deleteMyPost };
