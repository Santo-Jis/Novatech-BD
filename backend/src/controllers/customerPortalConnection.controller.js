// ============================================================
// CUSTOMER PORTAL CONNECTION CONTROLLER
// Base: /api/portal/connections   (req.portalUser.customer_id)
//
// Phase 1: রহিম একটা লগইনে একাধিক কোম্পানি ম্যানেজ করবে —
// এই ফাইলটা কাস্টমার-সাইড অংশ। নতুন ফাইল, বিদ্যমান কিছু স্পর্শ করেনি।
// ============================================================

const { query } = require('../config/db');
const logger    = require('../config/logger');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const { ensureCustomerForPerson, REJECT_COOLDOWN_HOURS } = require('../services/customerConnection.service');

// ✅ REFACTOR (Phase 2): REJECT_COOLDOWN_HOURS ও customer-creation লজিক
// (আগে acceptCompanyRequest-এর ভেতরে ইনলাইন ছিল) এখন services/
// customerConnection.service.js থেকে শেয়ার্ডভাবে import হয় —
// connection.controller.js-ও একই সোর্স ব্যবহার করে।

// ── Helper: portal customer_id থেকে person_id বের করো ──
// ⚠️ FIX: আগে শুধু customerId নিয়ে DB থেকে person_id বের করতো — কিন্তু
// company-বিহীন person-only session-এ customer_id-ই থাকে না (chicken-egg
// সমস্যা)। এখন portalUser অবজেক্ট নেয়: person_id সরাসরি JWT-তে থাকলে
// (নতুন token) সেটাই ব্যবহার করে, না থাকলে (পুরনো token) আগের মতো
// customer_id দিয়ে DB lookup fallback করে — backward-compatible।
async function getPersonId(portalUser) {
    if (portalUser?.person_id) {
        return portalUser.person_id;
    }
    if (!portalUser?.customer_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [portalUser.customer_id]);
    if (r.rows.length === 0 || !r.rows[0].person_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    return r.rows[0].person_id;
}

// ============================================================
// GET /api/portal/connections/my-qr
// রহিমের নিজের QR কোড — SR স্ক্যান করার জন্য দেখাবে
// ============================================================
const getMyQrCode = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const p = await query(`SELECT qr_code, full_name, discoverable FROM persons WHERE id = $1`, [personId]);
        res.json({ success: true, data: p.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMyQrCode error:', err.message);
        res.status(500).json({ success: false, message: 'QR কোড আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/my-qr/regenerate
// নিজের QR কোড রিজেনারেট করো — পুরনো কোড সাথে সাথে অকেজো হয়ে যাবে।
//
// ✅ NEW (Phase 2 — কোড অডিট): QR কোড আগে স্ট্যাটিক ছিল, রিজেনারেট করার
// কোনো উপায় ছিল না — স্ক্রিনশট লিক হলে বা কেউ দেখে ফেললে কোনো প্রতিকার
// ছিল না, কারণ scan করলেই approval ছাড়া instant connect হয়ে যায়
// (connection.controller.js: connectViaQrScan)। এই bundle-এ persons.
// qr_code-এর মূল generation লজিক/migration দেখা যায়নি (সম্ভবত DB-level
// default), তাই এখানে নিরাপদভাবে crypto.randomUUID() দিয়ে অ্যাপ-লেয়ারে
// নতুন কোড বানানো হচ্ছে। বিদ্যমান connection-গুলো (customer_company_
// connections) অক্ষুণ্ণ থাকে — সেগুলো person_id-ভিত্তিক, qr_code-এর
// সাথে সরাসরি সম্পর্কিত না। শুধু পুরনো QR ছবি দিয়ে ভবিষ্যতে আর স্ক্যান
// করা যাবে না।
// ============================================================
const regenerateMyQrCode = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        // qr_code সম্ভবত unique-constrained (সব জায়গায় WHERE qr_code = $1
        // এক্সাক্ট লুকআপে ব্যবহৃত হয়) — UUID কলিশনের সম্ভাবনা ব্যবহারিকভাবে
        // শূন্যের কাছাকাছি হলেও ছোট একটা retry loop রাখা হলো নিরাপত্তার জন্য।
        const MAX_ATTEMPTS = 3;
        let lastErr;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const newCode = crypto.randomUUID();
            try {
                const updated = await query(
                    `UPDATE persons SET qr_code = $1 WHERE id = $2 RETURNING qr_code, full_name, discoverable`,
                    [newCode, personId]
                );
                return res.json({
                    success: true,
                    message: 'নতুন QR কোড তৈরি হয়েছে। আগের QR কোড আর কাজ করবে না।',
                    data: updated.rows[0],
                });
            } catch (dbErr) {
                lastErr = dbErr;
                // unique_violation (Postgres code 23505) হলে আবার চেষ্টা করো,
                // অন্য যেকোনো এরর হলে সাথে সাথে থামো
                if (dbErr.code !== '23505') throw dbErr;
            }
        }
        throw lastErr;
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ regenerateMyQrCode error:', err.message);
        res.status(500).json({ success: false, message: 'QR কোড রিজেনারেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/my-companies
// সব কানেক্টেড কোম্পানি (dashboard-এর company switcher/tags-এর জন্য)
// ============================================================
const getMyCompanies = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT ccc.id AS connection_id, ccc.customer_id, ccc.created_at AS connected_since,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    c.customer_code, c.credit_limit, c.current_credit
             FROM customer_company_connections ccc
             JOIN tenants t ON t.id = ccc.tenant_id
             LEFT JOIN customers c ON c.id = ccc.customer_id
             WHERE ccc.person_id = $1 AND ccc.status = 'connected'
             ORDER BY ccc.created_at ASC`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMyCompanies error:', err.message);
        res.status(500).json({ success: false, message: 'কোম্পানি লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/pending
// কোম্পানি-পাঠানো পেন্ডিং রিকোয়েস্ট (রহিমকে Accept/Reject করতে হবে)
// ============================================================
const getPendingForMe = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT ccc.id AS connection_id, ccc.created_at, ccc.initiated_by,
                    t.company_name, t.company_name_bn, t.logo_url
             FROM customer_company_connections ccc
             JOIN tenants t ON t.id = ccc.tenant_id
             WHERE ccc.person_id = $1 AND ccc.status = 'pending'
               AND ccc.initiated_by = 'company_search'
             ORDER BY ccc.created_at DESC`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getPendingForMe error:', err.message);
        res.status(500).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/search-companies?q=...
// রহিম কোম্পানি খুঁজবে (গ্লোবাল tenant ডিরেক্টরি)
// ============================================================
// ============================================================
// GET /api/portal/connections/search-companies?q=...
// ✅ UPDATED: এলাকা (জেলা) ও বিজনেস ফিল্ড ম্যাচ করা কোম্পানি লিস্টের
// উপরে দেখাবে (match_score DESC) — কিন্তু এটা কোনো হার্ড ফিল্টার না,
// বাকি সব কোম্পানিও লিস্টে থাকবে, চাইলে যেকোনো কাস্টমার যেকোনো
// কোম্পানির সাথে কানেক্ট রিকোয়েস্ট পাঠাতে পারবে (unrestricted)।
// ============================================================
const searchCompanies = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে ২ অক্ষর লিখুন।' });
        }

        // ⚠️ ম্যাচ-স্কোরিং person profile-নির্ভর — profile লিংক না থাকলে
        // (PERSON_NOT_LINKED) নীরবে স্কোরিং বাদ দিয়ে সাধারণ নাম-সার্চেই
        // ফিরে যায়, যাতে সার্চ ফিচারটা কখনো ভেঙে না যায়।
        let personId = null;
        try {
            personId = await getPersonId(req.portalUser);
        } catch { /* profile লিংক নেই — স্কোরিং ছাড়াই এগোবে */ }

        const result = await query(
            `SELECT t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url, t.company_address,
                    (
                      CASE WHEN $2::int IS NOT NULL AND EXISTS (
                        SELECT 1 FROM tenant_service_areas tsa
                        JOIN persons p ON p.district_id = tsa.district_id
                        WHERE tsa.tenant_id = t.id AND p.id = $2
                      ) THEN 2 ELSE 0 END
                      +
                      COALESCE((
                        SELECT COUNT(*) FROM entity_business_fields ebf
                        WHERE ebf.entity_type = 'tenant' AND ebf.entity_id = t.id
                          AND $2::int IS NOT NULL
                          AND ebf.business_field_id IN (
                            SELECT business_field_id FROM entity_business_fields
                            WHERE entity_type = 'person' AND entity_id = $2
                          )
                      ), 0)
                    ) AS match_score
             FROM tenants t
             WHERE (t.company_name ILIKE $1 OR t.company_name_bn ILIKE $1)
               AND t.status != 'suspended'
             ORDER BY match_score DESC, t.company_name ASC
             LIMIT 20`,
            [`%${q}%`, personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ searchCompanies error:', err.message);
        res.status(500).json({ success: false, message: 'সার্চ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/request   { tenant_id }
// রহিম → কোম্পানি রিকোয়েস্ট (কোম্পানির Accept লাগবে)
//
// ✅ FIX (Phase 1 — cooldown): connection.controller.js-এর
// sendConnectionRequest-এর মতোই — reject-এর পর REJECT_COOLDOWN_HOURS
// সময় নতুন রিকোয়েস্ট ব্লক।
// ============================================================
const requestConnectionToCompany = async (req, res) => {
    try {
        const { tenant_id } = req.body;
        if (!tenant_id) {
            return res.status(400).json({ success: false, message: 'tenant_id দিন।' });
        }
        const personId = await getPersonId(req.portalUser);

        const dup = await query(
            `SELECT id, status, responded_at, created_at FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2
               AND (
                     status IN ('pending','connected','blocked')
                     OR (status = 'rejected' AND COALESCE(responded_at, created_at) > NOW() - make_interval(hours => $3))
                   )
             ORDER BY created_at DESC
             LIMIT 1`,
            [personId, tenant_id, REJECT_COOLDOWN_HOURS]
        );
        if (dup.rows.length > 0) {
            const existing = dup.rows[0];
            if (existing.status === 'blocked') {
                // ইচ্ছাকৃতভাবে নিরপেক্ষ ভাষা — "আপনাকে ব্লক করা হয়েছে" না বলে
                // যাতে blocked_by='customer' (নিজেই ব্লক করা) কেসেও একই
                // মেসেজ কাজ করে, আর কোম্পানির ব্লক নিশ্চিত করে escalation
                // এড়ানো যায়।
                return res.status(403).json({
                    success: false,
                    message: 'এই কোম্পানি বর্তমানে নতুন কানেকশন রিকোয়েস্ট গ্রহণ করছে না।',
                });
            }
            if (existing.status === 'rejected') {
                return res.status(429).json({
                    success: false,
                    message: `এই কোম্পানি সম্প্রতি আপনার রিকোয়েস্ট প্রত্যাখ্যান করেছে। ${REJECT_COOLDOWN_HOURS} ঘণ্টা পর আবার চেষ্টা করুন।`,
                });
            }
            return res.status(409).json({
                success: false,
                message: existing.status === 'connected' ? 'ইতিমধ্যে সংযুক্ত।' : 'রিকোয়েস্ট আগে থেকেই পাঠানো আছে।',
            });
        }

        const created = await query(
            `INSERT INTO customer_company_connections (person_id, tenant_id, status, initiated_by)
             VALUES ($1, $2, 'pending', 'customer_search')
             RETURNING *`,
            [personId, tenant_id]
        );
        res.status(201).json({ success: true, data: created.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ requestConnectionToCompany error:', err.message);
        res.status(500).json({ success: false, message: 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/:id/accept  (কোম্পানির পাঠানো রিকোয়েস্ট)
// ============================================================
const acceptCompanyRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const personId = await getPersonId(req.portalUser);

        const conn = await query(
            `SELECT * FROM customer_company_connections
             WHERE id = $1 AND person_id = $2 AND status = 'pending'`,
            [id, personId]
        );
        if (conn.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        // ✅ REFACTOR (Phase 2): find-or-create customer row logic আগে এখানে
        // ইনলাইন ছিল (mid-function require সহ) — এখন services/
        // customerConnection.service.js-এর শেয়ার্ড helper ব্যবহার করে,
        // connection.controller.js-এর staff-side accept/QR-scan যেটা
        // ব্যবহার করে ঠিক সেটাই। createdByUserId = null, কারণ এখানে কোনো
        // staff member জড়িত না (কাস্টমার নিজেই portal থেকে accept করছে)।
        const customerId = await ensureCustomerForPerson(personId, conn.rows[0].tenant_id, null);

        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'connected', customer_id = $2, responded_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id, customerId]
        );
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        if (err.code === 'CUSTOMER_LIMIT_REACHED') {
            return res.status(403).json({
                success: false,
                code: 'CUSTOMER_LIMIT_REACHED',
                message: `কাস্টমার সীমা (${err.used}/${err.limit}) শেষ হয়ে গেছে। কোম্পানির সাথে যোগাযোগ করুন।`,
                data: { used: err.used, limit: err.limit }
            });
        }
        logger.error('❌ acceptCompanyRequest error:', err.message);
        res.status(500).json({ success: false, message: 'Accept করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/:id/reject
// ============================================================
const rejectCompanyRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const personId = await getPersonId(req.portalUser);
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'rejected', responded_at = NOW()
             WHERE id = $1 AND person_id = $2 AND status = 'pending'
             RETURNING *`,
            [id, personId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ rejectCompanyRequest error:', err.message);
        res.status(500).json({ success: false, message: 'Reject করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/:id/disconnect
// ============================================================
const disconnectCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const personId = await getPersonId(req.portalUser);
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'disconnected', disconnected_at = NOW()
             WHERE id = $1 AND person_id = $2 AND status = 'connected'
             RETURNING *`,
            [id, personId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সংযোগ পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ disconnectCompany error:', err.message);
        res.status(500).json({ success: false, message: 'বিচ্ছিন্ন করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/:id/block
// ✅ NEW (Phase 3): connection.controller.js-এর blockConnection-এর
// customer-side mirror। যেকোনো non-blocked status থেকেই ব্লক করা যায়
// (pending রিকোয়েস্ট এলেও reject না করে সরাসরি ব্লক করা যায়)।
// blocked_by='customer' — শুধু কাস্টমার নিজেই এটা unblock করতে পারবে,
// কোম্পানি staff-side থেকে পারবে না (দেখুন connection.controller.js-এর
// unblockConnection-এর কমেন্ট)।
// ============================================================
const blockCompanyConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const personId = await getPersonId(req.portalUser);
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'blocked', blocked_at = NOW(), blocked_by = 'customer'
             WHERE id = $1 AND person_id = $2 AND status != 'blocked'
             RETURNING *`,
            [id, personId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সংযোগ পাওয়া যায়নি (অথবা আগে থেকেই ব্লক করা)।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ blockCompanyConnection error:', err.message);
        res.status(500).json({ success: false, message: 'ব্লক করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/:id/unblock
// শুধু কাস্টমার নিজে যা ব্লক করেছে (blocked_by='customer') তা-ই unblock
// করতে পারে। unblock করলে status 'disconnected'-এ ফিরে যায়।
// ============================================================
const unblockCompanyConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const personId = await getPersonId(req.portalUser);
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'disconnected', blocked_at = NULL, blocked_by = NULL, disconnected_at = NOW()
             WHERE id = $1 AND person_id = $2 AND status = 'blocked' AND blocked_by = 'customer'
             RETURNING *`,
            [id, personId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'আপনার ব্লক করা সংযোগ পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ unblockCompanyConnection error:', err.message);
        res.status(500).json({ success: false, message: 'আনব্লক করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/blocked
// ✅ NEW (Phase 3): কাস্টমার নিজে যেসব কোম্পানি ব্লক করেছে তার লিস্ট —
// unblock করার UI-এর জন্য দরকার (নইলে block একটা one-way door হয়ে
// যেত, ফিরে আসার কোনো উপায় ছাড়াই)। শুধু blocked_by='customer' দেখায় —
// কোম্পানি যা ব্লক করেছে তা এখানে দেখানো হয় না (সেটা এমনিতেই invisible
// থাকা উচিত, দেখুন requestConnectionToCompany-এর নিরপেক্ষ ভাষার নোট)।
// ============================================================
const getMyBlockedCompanies = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT ccc.id AS connection_id, ccc.blocked_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM customer_company_connections ccc
             JOIN tenants t ON t.id = ccc.tenant_id
             WHERE ccc.person_id = $1 AND ccc.status = 'blocked' AND ccc.blocked_by = 'customer'
             ORDER BY ccc.blocked_at DESC`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMyBlockedCompanies error:', err.message);
        res.status(500).json({ success: false, message: 'ব্লক তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-orders
// সব কোম্পানির অর্ডার/সেল হিস্ট্রি — এক লিস্টে, কোম্পানি ট্যাগসহ (aggregated dashboard)
//
// ✅ POLICY (Phase 3 — কোড অডিট, disconnect/block-পরবর্তী হিস্ট্রি
// ভিজিবিলিটি): এই কুয়েরি ইচ্ছাকৃতভাবে customer_company_connections-এর
// বর্তমান status ফিল্টার করে না — disconnect বা এমনকি block করার পরও
// পুরনো অর্ডার হিস্ট্রি দেখা যায়। এটা bug না: past invoice/order data
// কাস্টমারের নিজের ব্যবসায়িক রেকর্ড (হিসাব/ট্যাক্সের জন্য দরকার হতে
// পারে), সম্পর্ক শেষ হয়ে গেলেও সেই অধিকার হারানো উচিত না। যেটা আসলে
// বন্ধ হওয়া উচিত (আর হয়ও — block/cooldown দিয়ে) সেটা হলো *নতুন*
// interaction, পুরনো রেকর্ড দেখা না। তাই hide করার বদলে connection_status
// যোগ করা হলো, যাতে frontend চাইলে "বিচ্ছিন্ন"/"ব্লকড" ব্যাজ দেখাতে
// পারে ডেটা লুকানো ছাড়াই। correlated subquery ব্যবহার করা হয়েছে (এই
// endpoint-এর মূল JOIN customer_company_connections দিয়ে না হয়ে সরাসরি
// customers দিয়ে, তাই status আলাদাভাবে আনতে হচ্ছে)।
// ============================================================
const getAllCompanyOrders = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT st.id, st.invoice_number, st.total_amount, st.net_amount,
                    st.payment_method, st.created_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    (SELECT ccc.status FROM customer_company_connections ccc
                       WHERE ccc.person_id = c.person_id AND ccc.tenant_id = t.id
                       ORDER BY ccc.created_at DESC LIMIT 1) AS connection_status
             FROM sales_transactions st
             JOIN customers c ON c.id = st.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             WHERE c.person_id = $1
             ORDER BY st.created_at DESC
             LIMIT 100`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyOrders error:', err.message);
        res.status(500).json({ success: false, message: 'অর্ডার হিস্ট্রি আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-invoices
// ✅ NEW (Session 13 — spec correction)
// ✅ UPDATED (Session 14): date-range + company (tenant_id) ফিল্টার,
// পেজিনেশন, এবং InvoiceCard-এর পূর্ণ ডিটেইল (items/discount/cash_received/
// credit_used/replacement_value/sr_name) যোগ করা হলো — যাতে নতুন
// aggregate Invoices ট্যাব পুরনো single-company ভিউয়ের সমান বিস্তারিত
// তথ্য দেখাতে পারে, শুধু company-ট্যাগ অতিরিক্ত।
// 01-Requirements-Spec.md ধারা ৩.১ অনুযায়ী সঠিক প্যাটার্ন: ডাটা merge হয় না,
// শুধু UI-তে aggregate + company-ট্যাগ দেখানো হয়।
// query params: page, limit, date_from, date_to, tenant_id
//
// ✅ POLICY (Phase 3): getAllCompanyOrders-এর মতোই — disconnect/block
// করার পরও ইনভয়েস হিস্ট্রি hide হয় না (নিজের রেকর্ডের অধিকার), শুধু
// connection_status যোগ করা হলো frontend badge-এর জন্য। বিস্তারিত
// রিজনিং getAllCompanyOrders-এর কমেন্টে।
// ============================================================
const getAllCompanyInvoices = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const page  = Math.max(parseInt(req.query.page)  || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const offset = (page - 1) * limit;

        const date_from = req.query.date_from || null;
        const date_to   = req.query.date_to   || null;
        const tenantId  = req.query.tenant_id  || null;

        const params  = [personId];
        const filters = ['c.person_id = $1', '(st.otp_verified = true OR st.otp_skipped = true)'];

        if (date_from) {
            params.push(date_from);
            filters.push(`st.created_at >= $${params.length}::date`);
        }
        if (date_to) {
            params.push(date_to);
            filters.push(`st.created_at < ($${params.length}::date + INTERVAL '1 day')`);
        }
        if (tenantId) {
            params.push(tenantId);
            filters.push(`t.id = $${params.length}`);
        }

        const whereClause = filters.join(' AND ');
        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

        const result = await query(
            `SELECT st.id, st.invoice_number, st.items, st.total_amount,
                    st.discount_amount, st.net_amount, st.payment_method,
                    st.cash_received, st.credit_used, st.replacement_value,
                    st.created_at,
                    u.name_bn AS sr_name,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    (SELECT ccc.status FROM customer_company_connections ccc
                       WHERE ccc.person_id = c.person_id AND ccc.tenant_id = t.id
                       ORDER BY ccc.created_at DESC LIMIT 1) AS connection_status,
                    COUNT(*) OVER() AS total_count
             FROM sales_transactions st
             JOIN customers c ON c.id = st.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             LEFT JOIN users u ON u.id = st.worker_id
             WHERE ${whereClause}
             ORDER BY st.created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );

        const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const rows       = result.rows.map(({ total_count, ...rest }) => rest);

        res.json({
            success: true,
            data: rows,
            pagination: { page, limit, total, total_pages: totalPages },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyInvoices error:', err.message);
        res.status(500).json({ success: false, message: 'ইনভয়েস তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-credit-summary
// ✅ NEW (Session 13 — spec correction)
// প্রতিটা connected কোম্পানির ক্রেডিট লিমিট/বর্তমান বকেয়া — এক লিস্টে,
// company ট্যাগসহ। Summary ট্যাব ভবিষ্যতে এটা দিয়ে "সব কোম্পানি মিলিয়ে
// মোট বকেয়া" + "কোম্পানি-ভিত্তিক ব্রেকডাউন" দুটোই দেখাতে পারবে।
// ============================================================
const getAllCompanyCreditSummary = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT c.id AS customer_id, c.customer_code, c.credit_limit, c.current_credit,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             JOIN tenants t   ON t.id = ccc.tenant_id
             WHERE ccc.person_id = $1 AND ccc.status = 'connected'
             ORDER BY ccc.created_at ASC`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyCreditSummary error:', err.message);
        res.status(500).json({ success: false, message: 'ক্রেডিট সারাংশ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-summary
// ✅ NEW (আর্কিটেকচার ফিক্স, পার্ট ১) — Summary ট্যাব রিডিজাইন
// getAllCompanyCreditSummary-এর উপরের কমেন্টে (Session 13) যে প্ল্যান
// লেখা ছিল ("Summary ট্যাব ভবিষ্যতে এটা দিয়ে...") সেটারই বাস্তবায়ন।
// প্রতিটা connected কোম্পানির এই-মাস + সর্বমোট পরিসংখ্যান, ক্রেডিট তথ্য
// ও assigned SR — এক লিস্টে, company ট্যাগসহ। "সব মিলিয়ে" গ্র্যান্ড-টোটাল
// ফ্রন্টএন্ডেই যোগ করে নেওয়া হয় (আলাদা কুয়েরির দরকার নেই)।
// ============================================================
const getAllCompanySummary = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const result = await query(
            `SELECT
                 c.id AS customer_id, c.customer_code, c.credit_limit, c.current_credit,
                 c.is_verified,
                 t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                 u.name_bn AS assigned_sr_name, u.phone AS assigned_sr_phone,
                 u.employee_code AS assigned_sr_code,
                 COALESCE(monthly.total_invoices, 0) AS monthly_total_invoices,
                 COALESCE(monthly.total_purchase, 0) AS monthly_total_purchase,
                 COALESCE(monthly.total_cash, 0)     AS monthly_total_cash,
                 COALESCE(monthly.total_credit, 0)   AS monthly_total_credit,
                 COALESCE(overall.total_invoices, 0) AS overall_total_invoices,
                 COALESCE(overall.total_purchase, 0) AS overall_total_purchase,
                 COALESCE(overall.total_cash, 0)     AS overall_total_cash,
                 COALESCE(overall.total_credit, 0)   AS overall_total_credit
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             JOIN tenants t   ON t.id = ccc.tenant_id
             LEFT JOIN customer_assignments ca ON ca.customer_id = c.id AND ca.is_active = true
             LEFT JOIN users u ON u.id = ca.worker_id
             LEFT JOIN LATERAL (
                 SELECT
                     COUNT(*)                        AS total_invoices,
                     COALESCE(SUM(net_amount), 0)    AS total_purchase,
                     COALESCE(SUM(cash_received), 0) AS total_cash,
                     COALESCE(SUM(credit_used), 0)   AS total_credit
                 FROM sales_transactions st
                 WHERE st.customer_id = c.id
                   AND (st.otp_verified = true OR st.otp_skipped = true)
                   AND date_trunc('month', st.created_at) = date_trunc('month', NOW())
             ) monthly ON true
             LEFT JOIN LATERAL (
                 SELECT
                     COUNT(*)                        AS total_invoices,
                     COALESCE(SUM(net_amount), 0)    AS total_purchase,
                     COALESCE(SUM(cash_received), 0) AS total_cash,
                     COALESCE(SUM(credit_used), 0)   AS total_credit
                 FROM sales_transactions st
                 WHERE st.customer_id = c.id
                   AND (st.otp_verified = true OR st.otp_skipped = true)
             ) overall ON true
             WHERE ccc.person_id = $1 AND ccc.status = 'connected'
             ORDER BY ccc.created_at ASC`,
            [personId]
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanySummary error:', err.message);
        res.status(500).json({ success: false, message: 'সারসংক্ষেপ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-monthly-trend
// ✅ NEW (আর্কিটেকচার ফিক্স, পার্ট ১) — Summary ট্যাবের ট্রেন্ড চার্ট
// আগে সেশন-স্কোপড এক কোম্পানির (/portal/monthly-summary) উপর নির্ভর
// করতো। এখন person_id দিয়ে সব connected কোম্পানির মাসিক লেনদেন যোগ
// করে একটাই "সব মিলিয়ে" ট্রেন্ড লাইন দেখায় — কোম্পানি সুইচ করার দরকার
// নেই। query params: months (default 6, max 24)
//
// ✅ POLICY (Phase 3): getAllCompanyOrders-এর মতো disconnect/block-পরও
// ডেটা hide হয় না (একই রিজনিং), কিন্তু এখানে connection_status কলাম
// যোগ করা হয়নি — এই কুয়েরি মাসভিত্তিক GROUP BY, প্রতিটা row একাধিক
// কোম্পানির (সম্ভবত ভিন্ন ভিন্ন connection status-এর) লেনদেন একসাথে
// যোগ করে, তাই একটামাত্র status কলাম দিয়ে সেটা অর্থপূর্ণভাবে প্রকাশ
// করা যায় না। per-company breakdown দরকার হলে all-orders/all-invoices
// (যেগুলোতে connection_status আছে) থেকে frontend-এ নিজে গ্রুপ করে
// নেওয়া যাবে।
// ============================================================
const getAllCompanyMonthlyTrend = async (req, res) => {
    try {
        const personId    = await getPersonId(req.portalUser);
        const monthsBack  = Math.min(24, Math.max(1, parseInt(req.query.months) || 6));

        const result = await query(
            `SELECT
                 TO_CHAR(st.created_at, 'YYYY-MM')  AS month_label,
                 COUNT(*)                            AS total_invoices,
                 COALESCE(SUM(st.net_amount), 0)     AS total_purchase,
                 COALESCE(SUM(st.cash_received), 0)  AS total_cash,
                 COALESCE(SUM(st.credit_used), 0)    AS total_credit
             FROM sales_transactions st
             JOIN customers c ON c.id = st.customer_id
             WHERE c.person_id = $1
               AND (st.otp_verified = true OR st.otp_skipped = true)
               AND date_trunc('month', st.created_at) >=
                   date_trunc('month', NOW()) - ($2 * INTERVAL '1 month')
             GROUP BY TO_CHAR(st.created_at, 'YYYY-MM')
             ORDER BY month_label DESC`,
            [personId, monthsBack - 1]
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyMonthlyTrend error:', err.message);
        res.status(500).json({ success: false, message: 'মাসিক ট্রেন্ড আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-payment-history
// ✅ NEW (Session 15) — Payments ট্যাব redesign
// পুরনো getPaymentHistory (customerPortal.controller.js)-এর মতোই cash +
// credit_payments UNION প্যাটার্ন, কিন্তু person_id দিয়ে সব কানেক্টেড
// কোম্পানি জুড়ে অ্যাগ্রিগেট করা, company ট্যাগসহ।
// query params: page, limit, type (cash|credit), date_from, date_to, tenant_id
//
// ✅ POLICY (Phase 3): getAllCompanyOrders-এর মতোই connection_status
// যোগ করা হলো (দুই ব্রাঞ্চেই — UNION-এ কলাম সংখ্যা/অবস্থান মিলতে হয়,
// তাই cashBranch ও creditBranch উভয়েই একই subquery পজিশনে বসানো হলো)।
// ============================================================
const getAllCompanyPaymentHistory = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const page  = Math.max(parseInt(req.query.page)  || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const offset = (page - 1) * limit;

        const typeFilter = (req.query.type || '').trim().toLowerCase();
        const date_from  = req.query.date_from || null;
        const date_to    = req.query.date_to   || null;
        const tenantId   = req.query.tenant_id  || null;

        // params ইনডেক্স মিলিয়ে দুই ব্রাঞ্চেই একই ফিল্টার বসানো হচ্ছে
        const params = [personId];
        let extraClause = '';
        if (date_from) { params.push(date_from); extraClause += ` AND created_at >= $${params.length}::date`; }
        if (date_to)   { params.push(date_to);   extraClause += ` AND created_at < ($${params.length}::date + INTERVAL '1 day')`; }
        if (tenantId)  { params.push(tenantId);  extraClause += ` AND tenant_id = $${params.length}`; }

        const connStatusSubquery = `(SELECT ccc.status FROM customer_company_connections ccc
             WHERE ccc.person_id = c.person_id AND ccc.tenant_id = t.id
             ORDER BY ccc.created_at DESC LIMIT 1) AS connection_status`;

        const cashBranch = `
            SELECT st.cash_received AS amount, 'cash' AS payment_type, st.invoice_number AS reference,
                   u.name_bn AS collected_by, st.created_at,
                   t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                   ${connStatusSubquery}
            FROM sales_transactions st
            JOIN customers c ON c.id = st.customer_id
            JOIN tenants t   ON t.id = c.tenant_id
            JOIN users u     ON u.id = st.worker_id
            WHERE c.person_id = $1
              AND (st.otp_verified = true OR st.otp_skipped = true)
              AND st.cash_received > 0
              ${extraClause}`;

        const creditBranch = `
            SELECT cp.amount AS amount, 'credit' AS payment_type, cp.notes AS reference,
                   u.name_bn AS collected_by, cp.created_at,
                   t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                   ${connStatusSubquery}
            FROM credit_payments cp
            JOIN customers c ON c.id = cp.customer_id
            JOIN tenants t   ON t.id = c.tenant_id
            JOIN users u     ON u.id = cp.worker_id
            WHERE c.person_id = $1
              ${extraClause}`;

        let unionSQL;
        if (typeFilter === 'cash')        unionSQL = cashBranch;
        else if (typeFilter === 'credit') unionSQL = creditBranch;
        else                               unionSQL = `${cashBranch} UNION ALL ${creditBranch}`;

        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

        const result = await query(
            `SELECT *, COUNT(*) OVER() AS total_count
             FROM (${unionSQL}) AS combined
             ORDER BY created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );

        const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const rows        = result.rows.map(({ total_count, ...rest }) => rest);

        // সারাংশ (ফিল্টার ছাড়া, সব সময়ের জন্য) — শুধু tenant ফিল্টার প্রযোজ্য হলে সেটাও মানা হয়
        const summaryParams = tenantId ? [personId, tenantId] : [personId];
        const summaryTenantClause = tenantId ? `AND c.tenant_id = $2` : '';
        const summaryResult = await query(
            `SELECT
                 COALESCE(SUM(CASE WHEN payment_type = 'cash'   THEN amount ELSE 0 END), 0) AS total_cash_received,
                 COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN amount ELSE 0 END), 0) AS total_credit_collected
             FROM (
                 SELECT st.cash_received AS amount, 'cash' AS payment_type, c.tenant_id
                 FROM sales_transactions st JOIN customers c ON c.id = st.customer_id
                 WHERE c.person_id = $1 AND (st.otp_verified = true OR st.otp_skipped = true) AND st.cash_received > 0 ${summaryTenantClause}
                 UNION ALL
                 SELECT cp.amount, 'credit' AS payment_type, c.tenant_id
                 FROM credit_payments cp JOIN customers c ON c.id = cp.customer_id
                 WHERE c.person_id = $1 ${summaryTenantClause}
             ) AS all_payments`,
            summaryParams
        );

        res.json({
            success: true,
            data: rows,
            summary: summaryResult.rows[0],
            pagination: { page, limit, total, total_pages: totalPages },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyPaymentHistory error:', err.message);
        res.status(500).json({ success: false, message: 'পেমেন্ট হিস্ট্রি আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-limit-requests
// ✅ NEW (Session 16) — Credit ট্যাব redesign
// সব কোম্পানির ক্রেডিট লিমিট বৃদ্ধির আবেদন — এক লিস্টে, company ট্যাগসহ।
// ============================================================
const getAllCompanyLimitRequests = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT clr.id, clr.current_limit, clr.requested_amount, clr.reason,
                    clr.status, clr.admin_note, clr.created_at, clr.resolved_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM credit_limit_requests clr
             JOIN customers c ON c.id = clr.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             WHERE c.person_id = $1
             ORDER BY clr.created_at DESC
             LIMIT 30`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyLimitRequests error:', err.message);
        res.status(500).json({ success: false, message: 'আবেদনের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/limit-request
// ✅ NEW (Session 16) — company-parameterized action
// switchCompany (session-swap) ব্যবহার না করেই নির্দিষ্ট কোম্পানির জন্য
// ক্রেডিট লিমিট আবেদন জমা দেওয়া যাবে — body-তে connection_id দিয়ে বলে
// দিতে হবে কোন কোম্পানির জন্য। এই প্যাটার্নটাই ভবিষ্যতে অন্য write-action
// ট্যাবগুলোর (complaints/returns) জন্যও অনুসরণ করা হবে।
// body: { connection_id, requested_amount, reason }
// ============================================================
const MAX_CREDIT_REQUEST_AGG = 10_000_000;
const MIN_CREDIT_REQUEST_AGG =      1_000;

const submitCompanyLimitRequest = async (req, res) => {
    try {
        const { connection_id, requested_amount, reason } = req.body;
        const amount = parseFloat(requested_amount);

        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'কোম্পানি বেছে নিন।' });
        }
        if (!requested_amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
        }
        if (amount < MIN_CREDIT_REQUEST_AGG) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ১,০০০ টাকার আবেদন করুন।' });
        }
        if (amount > MAX_CREDIT_REQUEST_AGG) {
            return res.status(400).json({ success: false, message: 'অনুরোধকৃত পরিমাণ সর্বোচ্চ ১,০০,০০,০০০ টাকার বেশি হবে না।' });
        }
        if (reason && reason.trim().length > 500) {
            return res.status(400).json({ success: false, message: 'কারণ ৫০০ অক্ষরের বেশি হবে না।' });
        }

        const personId = await getPersonId(req.portalUser);

        // এই connection সত্যিই এই person-এর এবং connected কিনা যাচাই
        const conn = await query(
            `SELECT c.id AS customer_id, c.credit_limit
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'`,
            [connection_id, personId]
        );
        if (conn.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }
        const targetCustomerId = conn.rows[0].customer_id;

        const existing = await query(
            `SELECT id FROM credit_limit_requests WHERE customer_id = $1 AND status = 'pending' LIMIT 1`,
            [targetCustomerId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'এই কোম্পানিতে আপনার একটি আবেদন ইতোমধ্যে প্রক্রিয়াধীন আছে।' });
        }

        const result = await query(
            `INSERT INTO credit_limit_requests (customer_id, current_limit, requested_amount, reason, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id, created_at`,
            [targetCustomerId, conn.rows[0].credit_limit, amount, reason?.trim() || null]
        );

        await query(
            `INSERT INTO customer_notifications (customer_id, title, body, type)
             VALUES ($1, $2, $3, 'credit_request')`,
            [
                targetCustomerId,
                '📋 ক্রেডিট লিমিট আবেদন জমা হয়েছে',
                `আপনার ৳${amount.toLocaleString()} ক্রেডিট লিমিট বৃদ্ধির আবেদন জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।`
            ]
        );

        res.status(201).json({ success: true, message: 'আবেদন সফলভাবে জমা হয়েছে।', data: { id: result.rows[0].id, created_at: result.rows[0].created_at } });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ submitCompanyLimitRequest error:', err.message);
        res.status(500).json({ success: false, message: 'আবেদন জমা দিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-complaints
// ✅ NEW (Session 18) — Complaints ট্যাব redesign
// সব কোম্পানির অভিযোগ/ফিডব্যাক — এক লিস্টে, company ট্যাগসহ।
// ============================================================
const getAllCompanyComplaints = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT cc.id, cc.type, cc.subject, cc.description, cc.status,
                    cc.admin_reply, cc.created_at, cc.resolved_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM customer_complaints cc
             JOIN customers c ON c.id = cc.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             WHERE c.person_id = $1
             ORDER BY cc.created_at DESC
             LIMIT 30`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyComplaints error:', err.message);
        res.status(500).json({ success: false, message: 'অভিযোগের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/complaint
// ✅ NEW (Session 18) — company-parameterized action, limit-request-এর
// মতোই প্যাটার্ন: session-switch ছাড়াই connection_id দিয়ে নির্দিষ্ট
// কোম্পানির জন্য অভিযোগ/ফিডব্যাক জমা দেওয়া যাবে।
// পুরনো customerPortal.controller.js-এর submitComplaint-এর মতোই ভ্যালিডেশন
// (subject ≤200, description ≤2000, valid types), কিন্তু duplicate-pending
// রেস্ট্রিকশন নেই (credit limit-request থেকে ভিন্ন) — একাধিক আলাদা অভিযোগ
// একসাথে খোলা থাকতে পারা স্বাভাবিক, পুরনো single-company আচরণের মতোই।
// body: { connection_id, type, subject, description }
// ============================================================
const VALID_COMPLAINT_TYPES_AGG = [
    'complaint', 'feedback', 'delivery_issue',
    'product_issue', 'payment_issue', 'other'
];

const submitCompanyComplaint = async (req, res) => {
    try {
        const { connection_id, type, subject, description } = req.body;

        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'কোম্পানি বেছে নিন।' });
        }
        if (!subject?.trim() || !description?.trim()) {
            return res.status(400).json({ success: false, message: 'বিষয় ও বিস্তারিত বিবরণ দিন।' });
        }
        if (subject.trim().length > 200) {
            return res.status(400).json({ success: false, message: 'বিষয় ২০০ অক্ষরের বেশি হবে না।' });
        }
        if (description.trim().length > 2000) {
            return res.status(400).json({ success: false, message: 'বিবরণ ২০০০ অক্ষরের বেশি হবে না।' });
        }
        if (type && !VALID_COMPLAINT_TYPES_AGG.includes(type)) {
            return res.status(400).json({ success: false, message: 'অবৈধ অভিযোগের ধরন।' });
        }

        const personId = await getPersonId(req.portalUser);

        // এই connection সত্যিই এই person-এর এবং connected কিনা যাচাই
        const conn = await query(
            `SELECT c.id AS customer_id
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'`,
            [connection_id, personId]
        );
        if (conn.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }
        const targetCustomerId = conn.rows[0].customer_id;

        const result = await query(
            `INSERT INTO customer_complaints
                 (customer_id, type, subject, description, status)
             VALUES ($1, $2, $3, $4, 'open')
             RETURNING id, created_at`,
            [targetCustomerId, type || 'complaint', subject.trim(), description.trim()]
        );

        await query(
            `INSERT INTO customer_notifications (customer_id, title, body, type)
             VALUES ($1, $2, $3, 'complaint')`,
            [
                targetCustomerId,
                '✅ আপনার অভিযোগ গ্রহণ হয়েছে',
                `"${subject.trim()}" — আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।`
            ]
        );

        res.status(201).json({
            success: true,
            message: 'অভিযোগ/ফিডব্যাক সফলভাবে জমা হয়েছে।',
            data: { id: result.rows[0].id, created_at: result.rows[0].created_at }
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ submitCompanyComplaint error:', err.message);
        res.status(500).json({ success: false, message: 'অভিযোগ জমা দিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-return-requests
// ✅ NEW (Session 19) — Returns ট্যাব redesign, "আমার অনুরোধ" সাব-ট্যাব
// সব কোম্পানির পণ্য ফেরত/রিপ্লেসমেন্ট অনুরোধ — এক লিস্টে, company ট্যাগসহ।
// পুরনো getMyReturnRequests (customerOrderRequest.controller.js)-এর মতোই
// কলাম/স্ট্যাটাস-লেবেল, কিন্তু person_id দিয়ে সব কানেক্টেড কোম্পানি জুড়ে।
// query params: status (pending|approved|rejected|completed|all)
// ============================================================
const RETURN_STATUS_BN = { pending: 'অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত', completed: 'সম্পন্ন' };
const RETURN_TYPE_BN   = { return: 'পণ্য ফেরত', replacement: 'রিপ্লেসমেন্ট' };

const getAllCompanyReturnRequests = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const status = req.query.status || 'all';
        const validStatuses = ['pending', 'approved', 'rejected', 'completed'];

        const params = [personId];
        let statusClause = '';
        if (validStatuses.includes(status)) {
            params.push(status);
            statusClause = `AND crr.status = $${params.length}`;
        }

        const result = await query(
            `SELECT crr.id, crr.invoice_number, crr.type, crr.items, crr.total_return_value,
                    crr.note, crr.status, crr.admin_note, crr.exchange_items, crr.total_exchange_value,
                    crr.created_at, crr.updated_at, crr.reviewed_at, crr.completed_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM customer_return_requests crr
             JOIN customers c ON c.id = crr.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             WHERE c.person_id = $1 ${statusClause}
             ORDER BY crr.created_at DESC
             LIMIT 30`,
            params
        );

        const enriched = result.rows.map(r => ({
            ...r,
            status_bn:    RETURN_STATUS_BN[r.status] || r.status,
            type_bn:      RETURN_TYPE_BN[r.type]     || r.type,
            extra_credit: r.total_exchange_value && r.total_return_value
                ? Math.max(0, parseFloat(r.total_exchange_value) - parseFloat(r.total_return_value))
                : 0,
        }));

        res.json({ success: true, data: enriched });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyReturnRequests error:', err.message);
        res.status(500).json({ success: false, message: 'ফেরত অনুরোধের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/connections/return-request
// ✅ NEW (Session 19) — company-parameterized action, complaint/limit-request-এর
// মতোই প্যাটার্ন: session-switch ছাড়াই connection_id দিয়ে নির্দিষ্ট কোম্পানির
// জন্য পণ্য ফেরত/রিপ্লেসমেন্ট অনুরোধ জমা দেওয়া যাবে।
// পুরনো createReturnRequest-এর মতোই ভ্যালিডেশন + product price lookup +
// duplicate-pending (একই invoice+type) চেক — কিন্তু ইনভয়েস মালিকানা এখন
// connection_id দিয়ে resolve করা customer_id-এর বিপরীতে যাচাই হয়।
// body: { connection_id, invoice_number, type, items, note }
// ============================================================
const submitCompanyReturnRequest = async (req, res) => {
    try {
        const { connection_id, invoice_number, note } = req.body;
        let { items } = req.body;
        const VALID_TYPES = ['return', 'replacement'];
        const type = VALID_TYPES.includes(req.body.type) ? req.body.type : 'return';

        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'কোম্পানি বেছে নিন।' });
        }
        if (!invoice_number || !invoice_number.trim()) {
            return res.status(400).json({ success: false, message: 'ইনভয়েস নম্বর দিন।' });
        }
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি পণ্য দিন।' });
        }
        for (const item of items) {
            if (!item.product_name || !item.qty || parseInt(item.qty) <= 0) {
                return res.status(400).json({ success: false, message: 'পণ্যের তথ্য সঠিক নয়।' });
            }
            if (!item.reason || !item.reason.trim()) {
                return res.status(400).json({ success: false, message: 'প্রতিটি পণ্যের কারণ দিন।' });
            }
        }

        const personId = await getPersonId(req.portalUser);

        // এই connection সত্যিই এই person-এর এবং connected কিনা যাচাই
        const conn = await query(
            `SELECT c.id AS customer_id, c.tenant_id
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'`,
            [connection_id, personId]
        );
        if (conn.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }
        const targetCustomerId = conn.rows[0].customer_id;
        const targetTenantId   = conn.rows[0].tenant_id;

        // ── ইনভয়েস যাচাই (এই নির্দিষ্ট কোম্পানির কাস্টমার আইডির বিপরীতে) ──
        const invoiceCheck = await query(
            `SELECT invoice_number FROM sales_transactions
             WHERE invoice_number = $1 AND customer_id = $2
               AND (otp_verified = true OR otp_skipped = true)`,
            [invoice_number.trim(), targetCustomerId]
        );
        if (invoiceCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'এই ইনভয়েস পাওয়া যায়নি বা এটি আপনার নয়।' });
        }

        // ── Duplicate check — একই invoice + type pending নেই? ──
        const dupCheck = await query(
            `SELECT id FROM customer_return_requests
             WHERE customer_id = $1 AND invoice_number = $2 AND type = $3 AND status = 'pending'`,
            [targetCustomerId, invoice_number.trim(), type]
        );
        if (dupCheck.rows.length > 0) {
            const typeBn = RETURN_TYPE_BN[type];
            return res.status(400).json({
                success: false,
                message: `এই ইনভয়েসে ইতোমধ্যে একটি ${typeBn} অনুরোধ প্রক্রিয়াধীন আছে।`,
                error_code: 'DUPLICATE_RETURN_REQUEST',
            });
        }

        // ── product_id থাকলে DB থেকে মূল্য নিয়ে subtotal হিসাব ──
        const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
        const productMap = {};
        if (productIds.length > 0) {
            const pRes = await query(
                `SELECT id, price, vat, tax FROM products WHERE id = ANY($1) AND is_active = true`,
                [productIds]
            );
            pRes.rows.forEach(p => { productMap[p.id] = p; });
        }

        let totalReturnValue = 0;
        const sanitizedItems = items.map(item => {
            const prod = productMap[item.product_id] || null;
            let unitPrice = 0;
            let subtotal  = 0;
            if (prod) {
                const base = parseFloat(prod.price) || 0;
                const vat  = parseFloat(prod.vat)   || 0;
                const tax  = parseFloat(prod.tax)   || 0;
                unitPrice  = parseFloat((base + base * vat / 100 + base * tax / 100).toFixed(2));
                subtotal   = parseFloat((unitPrice * parseInt(item.qty)).toFixed(2));
                totalReturnValue += subtotal;
            }
            return {
                product_id:   item.product_id || null,
                product_name: item.product_name,
                qty:          parseInt(item.qty),
                unit_price:   unitPrice,
                subtotal,
                reason:       item.reason.trim(),
            };
        });

        const result = await query(
            `INSERT INTO customer_return_requests
                 (customer_id, invoice_number, type, items, total_return_value, note, status, tenant_id)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'pending', $7)
             RETURNING id, created_at`,
            [
                targetCustomerId, invoice_number.trim(), type,
                JSON.stringify(sanitizedItems),
                parseFloat(totalReturnValue.toFixed(2)),
                note || null, targetTenantId,
            ]
        );

        await query(
            `INSERT INTO customer_notifications (customer_id, title, body, type)
             VALUES ($1, $2, $3, 'return_request')`,
            [
                targetCustomerId,
                type === 'replacement' ? '🔄 রিপ্লেসমেন্ট অনুরোধ জমা হয়েছে' : '↩️ পণ্য ফেরত অনুরোধ জমা হয়েছে',
                `ইনভয়েস ${invoice_number.trim()} — শীঘ্রই SR যোগাযোগ করবে।`,
            ]
        );

        const typeBn = RETURN_TYPE_BN[type];
        res.status(201).json({
            success: true,
            message: `${typeBn} অনুরোধ পাঠানো হয়েছে। শীঘ্রই SR যোগাযোগ করবে।`,
            data: {
                id: result.rows[0].id,
                created_at: result.rows[0].created_at,
                items_count: sanitizedItems.length,
                total_return_value: parseFloat(totalReturnValue.toFixed(2)),
            },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ submitCompanyReturnRequest error:', err.message);
        res.status(500).json({ success: false, message: 'অনুরোধ পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-sr-returns
// ✅ NEW (Session 19) — Returns ট্যাব redesign, "SR রেকর্ড" সাব-ট্যাব
// SR কর্তৃক বিক্রির সময়েই প্রসেস করা রিপ্লেসমেন্ট রেকর্ড (sales_transactions.
// replacement_value > 0) — এটা customer_return_requests থেকে আলাদা টেবিল/
// সোর্স (কাস্টমারের নিজের অনুরোধ না, SR-এর ঘটনাস্থলেই এন্ট্রি)। পুরনো
// dashboard-এর "returns" CTE-এর মতোই কলাম, কিন্তু person_id দিয়ে সব
// কানেক্টেড কোম্পানি জুড়ে অ্যাগ্রিগেট, company ট্যাগসহ।
// ============================================================
const getAllCompanySrReturnRecords = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const result = await query(
            `SELECT st.invoice_number, st.replacement_items, st.replacement_value,
                    st.credit_balance_added, st.created_at,
                    u.name_bn AS sr_name,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM sales_transactions st
             JOIN customers c ON c.id = st.customer_id
             JOIN tenants t   ON t.id = c.tenant_id
             LEFT JOIN users u ON u.id = st.worker_id
             WHERE c.person_id = $1
               AND (st.otp_verified = true OR st.otp_skipped = true)
               AND st.replacement_value > 0
             ORDER BY st.created_at DESC
             LIMIT 30`,
            [personId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanySrReturnRecords error:', err.message);
        res.status(500).json({ success: false, message: 'SR রেকর্ড আনতে সমস্যা হয়েছে।' });
    }
};

// ── Refresh-cookie helper (Session 11 fix) ──────────────────────
// customerPortal.controller.js-এ একই নামের helper আছে, কিন্তু সেই ফাইল
// স্পর্শ না করার নীতি মেনে (portalAuthShared.js-এর মতোই) এখানে আলাদা
// একটা কপি রাখা হলো — সেটিংস হুবহু এক (httpOnly/secure/sameSite/path/maxAge)।
const setRefreshCookie = (res, refreshJWT) => {
    res.cookie('portal_rt', refreshJWT, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge:   30 * 24 * 60 * 60 * 1000,   // 30 দিন (ms)
        path:     '/api/portal',
    });
};

// ============================================================
// POST /api/portal/connections/switch
// ✅ NEW (Session 11 — SaaS multi-company foundation)
// ✅ FIX (Session 12 — permanent): শুরুতে শুধু access token বদলানো
// হচ্ছিল, refresh cookie পুরনো কোম্পানির সাথেই বাঁধা থেকে যাচ্ছিল —
// ফলে ~15 মিনিট পর silent auto-refresh চুপচাপ পুরনো কোম্পানিতে ফিরিয়ে
// দিতে পারত। এখন switch করার সময় refresh cookie-ও নতুন কোম্পানির জন্য
// পুনরায় ইস্যু করা হয় (মূল লগইনের মতোই), তাই এরপর থেকে
// POST /portal/refresh স্বয়ংক্রিয়ভাবে সঠিক (নতুন) কোম্পানির জন্যই কাজ
// করবে। এখন access token আবার স্বাভাবিক ১৫-মিনিট মেয়াদেই ইস্যু হয়,
// কারণ refresh flow এখন সঠিকভাবে কোম্পানি-স্কোপড।
//
// রহিম একটা লগইনে একাধিক কোম্পানির সাথে কানেক্টেড থাকতে পারে (Phase 1)।
// এই এন্ডপয়েন্ট দিয়ে সে dashboard-এ company switcher থেকে অন্য কোম্পানি
// বেছে নিলে, সেই কোম্পানির জন্য নতুন করে scoped portalJWT ইস্যু হয় —
// পুরো সেশন re-login না করেই। ব্যাকএন্ডের সব বিদ্যমান portalAuth রুট
// (invoices/payments/summary ইত্যাদি) অপরিবর্তিত থাকে, কারণ তারা এখনো
// req.portalUser.customer_id দিয়েই কাজ করে — শুধু সেই customer_id-টা এখন
// active company অনুযায়ী বদলাতে পারবে।
// body: { connection_id }
// ============================================================
const switchCompany = async (req, res) => {
    try {
        const { connection_id } = req.body;
        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'connection_id প্রয়োজন।' });
        }

        const personId = await getPersonId(req.portalUser);

        // ✅ নিশ্চিত করা হচ্ছে এই connection সত্যিই এই person-এর, এবং connected অবস্থায় আছে
        const result = await query(
            `SELECT c.id AS target_customer_id, c.customer_code, c.is_active,
                    cpt.token_version, t.company_name
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             JOIN tenants t ON t.id = ccc.tenant_id
             LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
             WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'`,
            [connection_id, personId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }

        const target = result.rows[0];
        if (!target.is_active) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাকাউন্ট নিষ্ক্রিয়।' });
        }

        if (!process.env.JWT_PORTAL_SECRET) {
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        const jwtPayload = {
            customer_id:   target.target_customer_id,
            customer_code: target.customer_code,
            person_id:     personId,  // ✅ নতুন — বাকি সব login path-এর সাথে সামঞ্জস্যপূর্ণ
            type:          'customer_portal',
            token_version: target.token_version || 1,
        };

        // ✅ FIX (Session 12): এখন আবার স্বাভাবিক ১৫-মিনিট access token
        const newPortalJWT = jwt.sign(
            jwtPayload,
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '15m', algorithm: 'HS256' }
        );

        // ✅ FIX (Session 12): নতুন কোম্পানির জন্য refresh token-ও নতুন করে
        // ইস্যু করে cookie-তে বসিয়ে দেওয়া হলো — পুরনো (কোম্পানি A-এর)
        // refresh cookie এখানেই প্রতিস্থাপিত হয়ে যায়
        const newRefreshJWT = jwt.sign(
            { ...jwtPayload, type: 'customer_portal_refresh' },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );
        setRefreshCookie(res, newRefreshJWT);

        res.json({
            success: true,
            data: {
                portal_jwt:    newPortalJWT,
                expires_in:    900,
                customer_id:   target.target_customer_id,
                customer_code: target.customer_code,
                company_name:  target.company_name,
            }
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ switchCompany error:', err.message);
        res.status(500).json({ success: false, message: 'কোম্পানি পরিবর্তন করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getMyQrCode,
    regenerateMyQrCode,
    getMyCompanies,
    getPendingForMe,
    searchCompanies,
    requestConnectionToCompany,
    acceptCompanyRequest,
    rejectCompanyRequest,
    disconnectCompany,
    blockCompanyConnection,
    unblockCompanyConnection,
    getMyBlockedCompanies,
    getAllCompanyOrders,
    getAllCompanyInvoices,
    getAllCompanyCreditSummary,
    getAllCompanySummary,
    getAllCompanyMonthlyTrend,
    getAllCompanyPaymentHistory,
    getAllCompanyLimitRequests,
    submitCompanyLimitRequest,
    getAllCompanyComplaints,
    submitCompanyComplaint,
    getAllCompanyReturnRequests,
    submitCompanyReturnRequest,
    getAllCompanySrReturnRecords,
    switchCompany,
};
