// ============================================================
// companyPost.controller.js
// ✅ NEW (ফেজ ১ — হোম ফিড "কোম্পানির পোস্ট")
// ============================================================
// কোম্পানি (tenant) নিজে থেকে সাধারণ আপডেট/ঘোষণা পোস্ট করতে পারবে
// নিজের admin প্যানেল থেকে — promotion.controller.js-এর ঠিক একই
// প্যাটার্নে (auth + allowRoles, tenant-scoped CRUD + marketplace-wide
// portal read)। ছাড়/অফার-ভিত্তিক কনটেন্টের জন্য এটা না — সেটার জন্য
// promotions টেবিল আগে থেকেই আছে।
// ============================================================

const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db'); // ✅ withTransaction NEW (Redesign Phase ১.৫) — post + audience একসাথে আটমিক
const { getPersonId } = require('../services/portalPerson.service'); // ✅ NEW (Redesign Phase ১) — my_reaction দেখাতে
const { uploadToCloudinary } = require('../services/employee.service'); // ✅ NEW (Redesign Phase ১.৫) — বিদ্যমান Cloudinary ফাংশন পুনঃব্যবহার (promotion.controller.js-এর মতোই)
const { uploadVideoToCloudinary } = require('../services/videoMedia.service'); // ✅ NEW (Redesign Phase ১.৬ — ভিডিও)

// ============================================================
// GET /api/company-posts
// এই কোম্পানির (tenant) সব পোস্ট — Admin
// ============================================================

const getCompanyPosts = async (req, res) => {
    try {
        const result = await query(
            `SELECT cp.*, u.name_bn AS created_by_name,
                    COALESCE(
                        (SELECT array_agg(cpa.customer_id) FROM company_post_audience cpa WHERE cpa.post_id = cp.id),
                        '{}'
                    ) AS audience_customer_ids
             FROM company_posts cp
             LEFT JOIN users u ON u.id = cp.created_by
             WHERE cp.tenant_id = $1
             ORDER BY cp.created_at DESC`,
            [req.tenantId]
        );
        return res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('[CompanyPost] getCompanyPosts error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/company-posts — নতুন পোস্ট তৈরি — Admin
//
// ✅ NEW (Redesign Phase ১.৫ — অডিয়েন্স/ভিজিবিলিটি): Facebook/LinkedIn-এর
// মতো visibility — public (সবাই দেখবে, আগের ডিফল্ট আচরণ) / connections
// (শুধু এই তেনান্টের সাথে connected customer) / select (নির্দিষ্ট বেছে
// নেওয়া customer) / private (কেউ দেখবে না, draft-এর মতো, admin নিজে
// শুধু getCompanyPosts-এ দেখবে)।
// ============================================================

const VALID_VISIBILITY = ['public', 'connections', 'select', 'private'];

const createCompanyPost = async (req, res) => {
    try {
        const { title, body, image_url, link_url, channel, visibility, audience_customer_ids } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'শিরোনাম দিন।' });
        }

        const vis = VALID_VISIBILITY.includes(visibility) ? visibility : 'public';
        const audienceIds = vis === 'select' && Array.isArray(audience_customer_ids)
            ? [...new Set(audience_customer_ids)].filter(Boolean)
            : [];
        if (vis === 'select' && audienceIds.length === 0) {
            return res.status(400).json({ success: false, message: '"নির্বাচিত" ভিজিবিলিটির জন্য অন্তত একজন কাস্টমার বেছে নিন।' });
        }

        const post = await withTransaction(async (client) => {
            const cq = client.query.bind(client);
            const result = await cq(
                `INSERT INTO company_posts (tenant_id, title, body, image_url, link_url, channel, visibility, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
                [
                    req.tenantId, title, body || null, image_url || null, link_url || null,
                    channel || 'all', vis, req.user.id,
                ]
            );
            const row = result.rows[0];

            if (audienceIds.length > 0) {
                // ✅ সব audience customer সত্যিই এই tenant-এরই, অন্য tenant-এর
                // customer_id কেউ পাঠালেও leak হবে না
                await cq(
                    `INSERT INTO company_post_audience (post_id, customer_id)
                     SELECT $1, c.id FROM customers c WHERE c.id = ANY($2::uuid[]) AND c.tenant_id = $3`,
                    [row.id, audienceIds, req.tenantId]
                );
            }
            return row;
        });

        return res.status(201).json({ success: true, data: post, message: 'পোস্ট তৈরি হয়েছে।' });
    } catch (err) {
        logger.error('[CompanyPost] createCompanyPost error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/company-posts/:id — Admin
// ============================================================

const updateCompanyPost = async (req, res) => {
    try {
        const { id } = req.params;
        const fields  = req.body;
        const allowed = ['title', 'body', 'image_url', 'link_url', 'channel', 'visibility', 'is_active'];

        if (fields.visibility !== undefined && !VALID_VISIBILITY.includes(fields.visibility)) {
            return res.status(400).json({ success: false, message: 'ভুল visibility মান।' });
        }

        const sets   = [];
        const params = [];
        let   idx    = 1;

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = $${idx++}`);
                params.push(fields[key]);
            }
        }

        if (!sets.length && fields.audience_customer_ids === undefined) {
            return res.status(400).json({ success: false, message: 'কিছু পরিবর্তন করুন।' });
        }

        // ✅ NEW (Redesign Phase ১.৫): পোস্ট আপডেট + audience রিপ্লেস একটা
        // transaction-এ — visibility='select' রাখলাম কিন্তু audience insert
        // ব্যর্থ হলো, এমন আধা-অবস্থা এড়াতে
        const updated = await withTransaction(async (client) => {
            const cq = client.query.bind(client);
            let row;

            if (sets.length) {
                params.push(id, req.tenantId);
                const result = await cq(
                    `UPDATE company_posts SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
                    params
                );
                row = result.rows[0];
            } else {
                const existing = await cq(`SELECT * FROM company_posts WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
                row = existing.rows[0];
            }
            if (!row) return null;

            if (Array.isArray(fields.audience_customer_ids)) {
                await cq(`DELETE FROM company_post_audience WHERE post_id = $1`, [id]);
                const audienceIds = [...new Set(fields.audience_customer_ids)].filter(Boolean);
                if (audienceIds.length > 0) {
                    await cq(
                        `INSERT INTO company_post_audience (post_id, customer_id)
                         SELECT $1, c.id FROM customers c WHERE c.id = ANY($2::uuid[]) AND c.tenant_id = $3`,
                        [id, audienceIds, req.tenantId]
                    );
                }
            }
            return row;
        });

        if (!updated) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }
        return res.json({ success: true, data: updated, message: 'আপডেট হয়েছে।' });
    } catch (err) {
        logger.error('[CompanyPost] updateCompanyPost error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/company-posts/:id — soft delete (is_active=false) — Admin
// ============================================================

const deleteCompanyPost = async (req, res) => {
    try {
        await query(
            `UPDATE company_posts SET is_active = false WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        return res.json({ success: true, message: 'পোস্ট সরানো হয়েছে।' });
    } catch (err) {
        logger.error('[CompanyPost] deleteCompanyPost error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/company-posts
// ✅ Customer portal — marketplace-wide (getPortalActivePromotions/
// getPortalCategories-এর প্যাটার্নে) — customer একাধিক কোম্পানির সাথে
// কানেক্টেড থাকতে পারে, তাই req.tenantId দিয়ে ফিল্টার না করে সব
// কোম্পানির সক্রিয় পোস্ট কোম্পানি-নাম সহ ফেরত, সাম্প্রতিকতম আগে।
// ============================================================

const getPortalCompanyPosts = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit) || 15, 50);
        const before = req.query.before || null; // ✅ NEW (Redesign Phase ১): cursor pagination

        // ✅ NEW (Redesign Phase ১): my_reaction দেখাতে personId লাগবে, কিন্তু
        // এই এন্ডপয়েন্ট আগে person-linking ছাড়াই কাজ করত (marketplace-wide,
        // personId-নির্ভর ছিল না) — সেই আচরণ ভাঙতে চাই না, তাই hard-fail না
        // করে soft-fail: লিংক না থাকলে my_reaction সবসময় false থাকবে, ফিড
        // তবুও লোড হবে।
        let personId = null;
        try { personId = await getPersonId(req.portalUser); } catch { /* my_reaction false থাকবে */ }

        const result = await query(
            `SELECT cp.id, cp.title, cp.body, cp.image_url, cp.video_url, cp.media, cp.link_url, cp.created_at,
                    cp.visibility,
                    cp.tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    COALESCE(r.count, 0)::int AS reaction_count,
                    (mine_r.id IS NOT NULL) AS my_reaction,
                    COALESCE(cm.count, 0)::int AS comment_count,
                    (fvs.last_seen_at IS NOT NULL AND cp.created_at > fvs.last_seen_at) AS is_new
             FROM company_posts cp
             JOIN tenants t ON t.id = cp.tenant_id
             LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS count FROM feed_reactions
                    WHERE post_type = 'company_post' AND post_id = cp.id
             ) r ON true
             LEFT JOIN LATERAL (
                    -- ✅ NEW (Redesign Phase ১.৯)
                    SELECT COUNT(*) AS count FROM feed_comments
                    WHERE post_type = 'company_post' AND post_id = cp.id AND is_active = true
             ) cm ON true
             LEFT JOIN feed_reactions mine_r
                    ON mine_r.post_type = 'company_post' AND mine_r.post_id = cp.id
                   AND mine_r.person_id = $2
             LEFT JOIN feed_view_state fvs ON fvs.person_id = $2 -- ✅ NEW (Redesign Phase ১.৯)
             WHERE cp.is_active = true
               AND ($3::timestamptz IS NULL OR cp.created_at < $3::timestamptz)
               AND (
                     -- ✅ NEW (Redesign Phase ১.৫): audience/visibility —
                     -- আগে এই WHERE-এ কোনো visibility চেক ছিল না (অডিট-এ
                     -- পাওয়া gap), এখন FB/LinkedIn-স্টাইল ৪ লেভেল
                     cp.visibility = 'public'
                     OR (cp.visibility = 'connections' AND $2::uuid IS NOT NULL AND EXISTS (
                            SELECT 1 FROM customer_company_connections cc
                            WHERE cc.tenant_id = cp.tenant_id AND cc.person_id = $2 AND cc.status = 'connected'
                          ))
                     OR (cp.visibility = 'select' AND $2::uuid IS NOT NULL AND EXISTS (
                            SELECT 1 FROM company_post_audience cpa
                            JOIN customers c ON c.id = cpa.customer_id
                            WHERE cpa.post_id = cp.id AND c.person_id = $2
                          ))
                     -- 'private' ইচ্ছাকৃতভাবে কোনো branch-এ নেই — customer portal-এ কখনো দেখাবে না
                   )
             -- ✅ NEW (Redesign Phase ১.৯): "unread-first bump" — আগে pure
             -- reverse-chronological ছিল। নতুন (is_new) পোস্ট আগে, তারপর
             -- প্রতিটা গ্রুপের ভেতরে যথারীতি সময় অনুযায়ী।
             ORDER BY (fvs.last_seen_at IS NOT NULL AND cp.created_at > fvs.last_seen_at) DESC, cp.created_at DESC
             LIMIT $1`,
            [limit, personId, before]
        );

        const hasMore = result.rows.length === limit;
        return res.json({
            success: true,
            data: result.rows,
            next_cursor: hasMore ? result.rows[result.rows.length - 1].created_at : null,
        });
    } catch (err) {
        logger.error('[CompanyPost] getPortalCompanyPosts error:', err.message);
        return res.status(500).json({ success: false, message: 'পোস্ট তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/company-posts/:id/image — Admin
// ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
//
// promotion.controller.js-এর uploadPromotionBanner-এর ঠিক একই প্যাটার্ন:
// আগে পোস্ট তৈরি (id লাগে), তারপর আলাদা multipart কলে ছবি — base64
// কে DB-তে সরাসরি ঢোকানোর বদলে employee.service.js-এর ইতিমধ্যে-থাকা
// uploadToCloudinary() পুনঃব্যবহার করা হলো (Cloudinary এই প্রজেক্টে
// আগে থেকেই আছে — attendance/sales/employee/customer/recruitment/
// promotions সব জায়গায় এই একই ফাংশন ব্যবহৃত)।
// ============================================================

const uploadCompanyPostImage = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ছবি দিন।' });
        }

        const exists = await query(`SELECT id FROM company_posts WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const imageUrl = await uploadToCloudinary(req.file.buffer, 'company_posts', `comppost_${id}`, req.file.mimetype);
        if (!imageUrl) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        // ✅ NEW (Redesign Phase ১.৬): image আর video mutually exclusive —
        // ছবি আপলোড হলে আগের ভিডিও (থাকলে) সরিয়ে দেওয়া হলো
        const result = await query(
            `UPDATE company_posts SET image_url = $1, video_url = NULL, media = NULL WHERE id = $2 AND tenant_id = $3 RETURNING *`,
            [imageUrl, id, req.tenantId]
        );
        return res.json({ success: true, data: result.rows[0], message: 'ছবি আপলোড হয়েছে।' });
    } catch (err) {
        logger.error('[CompanyPost] uploadCompanyPostImage error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/company-posts/:id/video — Admin
// ✅ NEW (Redesign Phase ১.৬ — ভিডিও সাপোর্ট)
// uploadCompanyPostImage-এর ঠিক একই প্যাটার্ন, শুধু videoMedia.service.js
// দিয়ে (২০MB লিমিট — দেখুন ওই ফাইলের কমেন্ট)।
// ============================================================

const uploadCompanyPostVideo = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ভিডিও দিন।' });
        }

        const exists = await query(`SELECT id FROM company_posts WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const videoUrl = await uploadVideoToCloudinary(req.file.buffer, 'company_posts', `comppost_${id}`, req.file.mimetype);
        if (!videoUrl) {
            return res.status(500).json({ success: false, message: 'ভিডিও আপলোড হয়নি। সাইজ ২০MB-এর বেশি অথবা Cloudinary config চেক করুন।' });
        }

        const result = await query(
            `UPDATE company_posts SET video_url = $1, image_url = NULL, media = NULL WHERE id = $2 AND tenant_id = $3 RETURNING *`,
            [videoUrl, id, req.tenantId]
        );
        return res.json({ success: true, data: result.rows[0], message: 'ভিডিও আপলোড হয়েছে।' });
    } catch (err) {
        logger.error('[CompanyPost] uploadCompanyPostVideo error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/company-posts/:id/gallery — Admin
// ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি)
//
// একসাথে একাধিক (সর্বোচ্চ ৪টা) ছবি — media JSONB কলামে। image_url/
// video_url (single slot) থেকে আলাদা, সাথে mutually exclusive —
// গ্যালারি সেট হলে single image/video ক্লিয়ার হয়ে যায়, ও উল্টো
// (uploadCompanyPostImage/uploadCompanyPostVideo-তেও media ক্লিয়ার করা আছে)।
//
// ⚠️ ফাইলগুলো ইচ্ছাকৃতভাবে sequentially আপলোড হচ্ছে (Promise.all না) —
// Cloudinary/সার্ভার মেমরিতে একসাথে ৪টা বড় ফাইল না চাপাতে।
// ============================================================

const MAX_GALLERY_IMAGES = 4;

const uploadCompanyPostGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটা ছবি দিন।' });
        }
        if (files.length > MAX_GALLERY_IMAGES) {
            return res.status(400).json({ success: false, message: `সর্বোচ্চ ${MAX_GALLERY_IMAGES}টা ছবি দেওয়া যাবে।` });
        }

        const exists = await query(`SELECT id FROM company_posts WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const items = [];
        for (let i = 0; i < files.length; i++) {
            const url = await uploadToCloudinary(files[i].buffer, 'company_posts', `comppost_${id}_${i}`, files[i].mimetype);
            if (url) items.push({ type: 'image', url });
        }
        if (items.length === 0) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        const result = await query(
            `UPDATE company_posts SET media = $1::jsonb, image_url = NULL, video_url = NULL
             WHERE id = $2 AND tenant_id = $3 RETURNING *`,
            [JSON.stringify(items), id, req.tenantId]
        );
        return res.json({ success: true, data: result.rows[0], message: `${items.length}টা ছবি আপলোড হয়েছে।` });
    } catch (err) {
        logger.error('[CompanyPost] uploadCompanyPostGallery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getCompanyPosts,
    createCompanyPost,
    updateCompanyPost,
    deleteCompanyPost,
    getPortalCompanyPosts,
    uploadCompanyPostImage,
    uploadCompanyPostVideo,
    uploadCompanyPostGallery,
};
