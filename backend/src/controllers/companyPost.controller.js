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
const { query } = require('../config/db');

// ============================================================
// GET /api/company-posts
// এই কোম্পানির (tenant) সব পোস্ট — Admin
// ============================================================

const getCompanyPosts = async (req, res) => {
    try {
        const result = await query(
            `SELECT cp.*, u.name_bn AS created_by_name
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
// ============================================================

const createCompanyPost = async (req, res) => {
    try {
        const { title, body, image_url, link_url, channel } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'শিরোনাম দিন।' });
        }

        const result = await query(
            `INSERT INTO company_posts (tenant_id, title, body, image_url, link_url, channel, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
                req.tenantId, title, body || null, image_url || null, link_url || null,
                channel || 'all', req.user.id,
            ]
        );
        return res.status(201).json({ success: true, data: result.rows[0], message: 'পোস্ট তৈরি হয়েছে।' });
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
        const allowed = ['title', 'body', 'image_url', 'link_url', 'channel', 'is_active'];

        const sets   = [];
        const params = [];
        let   idx    = 1;

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = $${idx++}`);
                params.push(fields[key]);
            }
        }

        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'কিছু পরিবর্তন করুন।' });
        }

        params.push(id);
        params.push(req.tenantId);
        const result = await query(
            `UPDATE company_posts SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
            params
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }
        return res.json({ success: true, data: result.rows[0], message: 'আপডেট হয়েছে।' });
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
        const limit = Math.min(parseInt(req.query.limit) || 15, 50);
        const result = await query(
            `SELECT cp.id, cp.title, cp.body, cp.image_url, cp.link_url, cp.created_at,
                    cp.tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM company_posts cp
             JOIN tenants t ON t.id = cp.tenant_id
             WHERE cp.is_active = true
             ORDER BY cp.created_at DESC
             LIMIT $1`,
            [limit]
        );
        return res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('[CompanyPost] getPortalCompanyPosts error:', err.message);
        return res.status(500).json({ success: false, message: 'পোস্ট তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getCompanyPosts,
    createCompanyPost,
    updateCompanyPost,
    deleteCompanyPost,
    getPortalCompanyPosts,
};
