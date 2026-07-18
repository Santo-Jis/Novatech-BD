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

// ── Helper: portal customer_id থেকে person_id বের করো ──
async function getPersonId(customerId) {
    const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [customerId]);
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
        const personId = await getPersonId(req.portalUser.customer_id);
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
// GET /api/portal/connections/my-companies
// সব কানেক্টেড কোম্পানি (dashboard-এর company switcher/tags-এর জন্য)
// ============================================================
const getMyCompanies = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser.customer_id);
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
        const personId = await getPersonId(req.portalUser.customer_id);
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
const searchCompanies = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে ২ অক্ষর লিখুন।' });
        }
        const result = await query(
            `SELECT id AS tenant_id, company_name, company_name_bn, logo_url, company_address
             FROM tenants
             WHERE (company_name ILIKE $1 OR company_name_bn ILIKE $1)
               AND status != 'suspended'
             LIMIT 20`,
            [`%${q}%`]
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
// ============================================================
const requestConnectionToCompany = async (req, res) => {
    try {
        const { tenant_id } = req.body;
        if (!tenant_id) {
            return res.status(400).json({ success: false, message: 'tenant_id দিন।' });
        }
        const personId = await getPersonId(req.portalUser.customer_id);

        const dup = await query(
            `SELECT id, status FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2 AND status IN ('pending','connected')`,
            [personId, tenant_id]
        );
        if (dup.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: dup.rows[0].status === 'connected' ? 'ইতিমধ্যে সংযুক্ত।' : 'রিকোয়েস্ট আগে থেকেই পাঠানো আছে।',
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
        const personId = await getPersonId(req.portalUser.customer_id);

        const conn = await query(
            `SELECT * FROM customer_company_connections
             WHERE id = $1 AND person_id = $2 AND status = 'pending'`,
            [id, personId]
        );
        if (conn.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        // এই tenant-এ person-এর জন্য customer row থাকলে reuse, না থাকলে বানাও
        const { generateCustomerCode } = require('../services/employee.service');
        let customerId;
        const existingCust = await query(
            `SELECT id FROM customers WHERE person_id = $1 AND tenant_id = $2 LIMIT 1`,
            [personId, conn.rows[0].tenant_id]
        );
        if (existingCust.rows.length > 0) {
            customerId = existingCust.rows[0].id;
        } else {
            const person = await query(`SELECT * FROM persons WHERE id = $1`, [personId]);
            const p = person.rows[0];
            const code = await generateCustomerCode(new Date());
            const created = await query(
                `INSERT INTO customers
                    (customer_code, shop_name, owner_name, whatsapp, sms_phone, email,
                     created_by, tenant_id, person_id, registration_source, is_verified)
                 VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'connection', true)
                 RETURNING id`,
                [code, p.full_name || 'নতুন কাস্টমার', p.full_name || 'নতুন কাস্টমার',
                 p.whatsapp, p.phone, p.email, conn.rows[0].tenant_id, personId]
            );
            customerId = created.rows[0].id;
        }

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
        const personId = await getPersonId(req.portalUser.customer_id);
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
        const personId = await getPersonId(req.portalUser.customer_id);
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
// GET /api/portal/connections/all-orders
// সব কোম্পানির অর্ডার/সেল হিস্ট্রি — এক লিস্টে, কোম্পানি ট্যাগসহ (aggregated dashboard)
// ============================================================
const getAllCompanyOrders = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser.customer_id);
        const result = await query(
            `SELECT st.id, st.invoice_number, st.total_amount, st.net_amount,
                    st.payment_method, st.created_at,
                    t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
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
// ============================================================
const getAllCompanyInvoices = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser.customer_id);

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
        const personId = await getPersonId(req.portalUser.customer_id);
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

        const personId = await getPersonId(req.portalUser.customer_id);

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
    getMyCompanies,
    getPendingForMe,
    searchCompanies,
    requestConnectionToCompany,
    acceptCompanyRequest,
    rejectCompanyRequest,
    disconnectCompany,
    getAllCompanyOrders,
    getAllCompanyInvoices,
    getAllCompanyCreditSummary,
    switchCompany,
};
