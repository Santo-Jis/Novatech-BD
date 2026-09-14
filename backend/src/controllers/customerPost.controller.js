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
// ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট): getPersonId এখানেই ছিল, কিন্তু
// feedEngagement.controller.js-এরও ঠিক একই লজিক লাগে — দুই কপি রাখলে
// portalAuthShared.js-এর কমেন্টে উল্লেখ করা drift-ঝুঁকিই হতে পারে, তাই
// single canonical জায়গায় সরানো হলো।
const { getPersonId } = require('../services/portalPerson.service');
const { uploadToCloudinary } = require('../services/employee.service'); // ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
const { uploadVideoToCloudinary } = require('../services/videoMedia.service'); // ✅ NEW (Redesign Phase ১.৬ — ভিডিও)

const MAX_BODY_LENGTH = 1000; // ছোট/সহজে-স্ক্যান-করা পোস্ট রাখতে — company_posts-এও কোনো hard limit নেই কিন্তু সেটা admin-composed, এটা open user input বলে limit দরকার

// ============================================================
// GET /api/portal/customer-posts?limit=15&before=<ISO timestamp>
// নেটওয়ার্ক ফিড — নিজের পোস্ট + যাদের সাথে অন্তত একটা connected
// কোম্পানি শেয়ার করা আছে তাদের পোস্ট।
//
// ✅ NEW (Redesign Phase ১):
//  • cursor pagination — "before" আগের পেজের শেষ পোস্টের created_at
//    (composite id-tiebreak দরকার নেই — মানুষ একই মিলিসেকেন্ডে দুটো
//    পোস্ট করবে না, ঝুঁকি নগণ্য; ভবিষ্যতে দরকার হলে id যোগ করা যাবে)
//  • reaction_count + my_reaction — feed_reactions পলিমরফিক টেবিল থেকে
// ============================================================
const getNetworkFeed = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const limit  = Math.min(parseInt(req.query.limit) || 15, 50);
        const before = req.query.before || null;

        const result = await query(
            `SELECT cp.id, cp.body, cp.image_url, cp.video_url, cp.media, cp.created_at,
                    cp.person_id, p.full_name AS author_name,
                    (cp.person_id = $1) AS is_mine,
                    COALESCE(r.count, 0)::int AS reaction_count,
                    (mine_r.id IS NOT NULL) AS my_reaction,
                    COALESCE(cm.count, 0)::int AS comment_count,
                    (fvs.last_seen_at IS NOT NULL AND cp.created_at > fvs.last_seen_at) AS is_new
             FROM customer_posts cp
             JOIN persons p ON p.id = cp.person_id
             LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS count FROM feed_reactions
                    WHERE post_type = 'customer_post' AND post_id = cp.id
             ) r ON true
             LEFT JOIN LATERAL (
                    -- ✅ NEW (Redesign Phase ১.৯)
                    SELECT COUNT(*) AS count FROM feed_comments
                    WHERE post_type = 'customer_post' AND post_id = cp.id AND is_active = true
             ) cm ON true
             LEFT JOIN feed_reactions mine_r
                    ON mine_r.post_type = 'customer_post' AND mine_r.post_id = cp.id
                   AND mine_r.person_id = $1
             LEFT JOIN feed_view_state fvs ON fvs.person_id = $1 -- ✅ NEW (Redesign Phase ১.৯)
             WHERE cp.is_active = true
               AND ($3::timestamptz IS NULL OR cp.created_at < $3::timestamptz)
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
             -- ✅ NEW (Redesign Phase ১.৯): unread-first bump (companyPost.
             -- controller.js-এর getPortalCompanyPosts-এর ঠিক একই যুক্তি)
             ORDER BY (fvs.last_seen_at IS NOT NULL AND cp.created_at > fvs.last_seen_at) DESC, cp.created_at DESC
             LIMIT $2`,
            [personId, limit, before]
        );

        const hasMore = result.rows.length === limit;
        res.json({
            success: true,
            data: result.rows,
            next_cursor: hasMore ? result.rows[result.rows.length - 1].created_at : null,
        });
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
        // ✅ FIX (Redesign Phase ১.৯ — প্রাইভেসি): আগে শুধু is_active=false
        // হতো, কবে ডিলিট হয়েছে তার কোনো রেকর্ড ছিল না — hard-delete cron
        // (postCleanup.job.js) চালাতে এই টাইমস্ট্যাম্প লাগবে।
        const updated = await query(
            `UPDATE customer_posts SET is_active = false, deleted_at = NOW()
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

// ============================================================
// POST /api/portal/customer-posts/:id/image — শুধু নিজের পোস্টে
// ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
//
// companyPost.controller.js-এর uploadCompanyPostImage-এর ঠিক একই প্যাটার্ন
// (আগে পোস্ট তৈরি, তারপর আলাদা multipart কলে ছবি) — Cloudinary-র
// বিদ্যমান uploadToCloudinary() পুনঃব্যবহার।
// ============================================================
const uploadMyPostImage = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ছবি দিন।' });
        }

        const exists = await query(`SELECT id FROM customer_posts WHERE id = $1 AND person_id = $2`, [id, personId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const imageUrl = await uploadToCloudinary(req.file.buffer, 'customer_posts', `custpost_${id}`, req.file.mimetype);
        if (!imageUrl) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        // ✅ NEW (Redesign Phase ১.৬): image/video mutually exclusive
        const result = await query(
            `UPDATE customer_posts SET image_url = $1, video_url = NULL, media = NULL WHERE id = $2 AND person_id = $3 RETURNING id, body, image_url, video_url, media, created_at`,
            [imageUrl, id, personId]
        );
        res.json({ success: true, data: result.rows[0], message: 'ছবি আপলোড হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ uploadMyPostImage error:', err.message);
        res.status(500).json({ success: false, message: 'ছবি আপলোড করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/customer-posts/:id/video — শুধু নিজের পোস্টে
// ✅ NEW (Redesign Phase ১.৬ — ভিডিও সাপোর্ট)
// uploadMyPostImage-এর ঠিক একই প্যাটার্ন, videoMedia.service.js দিয়ে (২০MB লিমিট)
// ============================================================
const uploadMyPostVideo = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ভিডিও দিন।' });
        }

        const exists = await query(`SELECT id FROM customer_posts WHERE id = $1 AND person_id = $2`, [id, personId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const videoUrl = await uploadVideoToCloudinary(req.file.buffer, 'customer_posts', `custpost_${id}`, req.file.mimetype);
        if (!videoUrl) {
            return res.status(500).json({ success: false, message: 'ভিডিও আপলোড হয়নি। সাইজ ২০MB-এর বেশি অথবা Cloudinary config চেক করুন।' });
        }

        const result = await query(
            `UPDATE customer_posts SET video_url = $1, image_url = NULL, media = NULL WHERE id = $2 AND person_id = $3 RETURNING id, body, image_url, video_url, media, created_at`,
            [videoUrl, id, personId]
        );
        res.json({ success: true, data: result.rows[0], message: 'ভিডিও আপলোড হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ uploadMyPostVideo error:', err.message);
        res.status(500).json({ success: false, message: 'ভিডিও আপলোড করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/customer-posts/:id/gallery — শুধু নিজের পোস্টে
// ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি)
// companyPost.controller.js-এর uploadCompanyPostGallery-এর ঠিক একই প্যাটার্ন
// ============================================================
const MAX_GALLERY_IMAGES = 4;

const uploadMyPostGallery = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { id } = req.params;
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটা ছবি দিন।' });
        }
        if (files.length > MAX_GALLERY_IMAGES) {
            return res.status(400).json({ success: false, message: `সর্বোচ্চ ${MAX_GALLERY_IMAGES}টা ছবি দেওয়া যাবে।` });
        }

        const exists = await query(`SELECT id FROM customer_posts WHERE id = $1 AND person_id = $2`, [id, personId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        // ⚠️ sequentially আপলোড — একসাথে ৪টা বড় ফাইল মেমরিতে/Cloudinary-তে না চাপাতে
        const items = [];
        for (let i = 0; i < files.length; i++) {
            const url = await uploadToCloudinary(files[i].buffer, 'customer_posts', `custpost_${id}_${i}`, files[i].mimetype);
            if (url) items.push({ type: 'image', url });
        }
        if (items.length === 0) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        const result = await query(
            `UPDATE customer_posts SET media = $1::jsonb, image_url = NULL, video_url = NULL
             WHERE id = $2 AND person_id = $3 RETURNING id, body, image_url, video_url, media, created_at`,
            [JSON.stringify(items), id, personId]
        );
        res.json({ success: true, data: result.rows[0], message: `${items.length}টা ছবি আপলোড হয়েছে।` });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ uploadMyPostGallery error:', err.message);
        res.status(500).json({ success: false, message: 'ছবি আপলোড করতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getNetworkFeed, createPost, deleteMyPost, uploadMyPostImage, uploadMyPostVideo, uploadMyPostGallery };
