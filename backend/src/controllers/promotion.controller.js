const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { getEligiblePromotions, needsApproval } = require('../services/promotion.utils');
const { uploadToCloudinary } = require('../services/employee.service'); // ← Phase ৫: banner upload-এর জন্য পুনঃব্যবহার

// ============================================================
// GET /api/promotions
// সব promotions list (Admin)
// ============================================================

const getAllPromotions = async (req, res) => {
    try {
        const { active_only } = req.query;
        const today = new Date().toISOString().slice(0, 10);

        let sql = `
            SELECT p.*,
                   u.name_bn AS created_by_name,
                   COUNT(pu.id)::INTEGER AS use_count,
                   COALESCE(SUM(pu.discount_given), 0)::NUMERIC AS total_discount_given
            FROM promotions p
            LEFT JOIN users u ON u.id = p.created_by
            LEFT JOIN promotion_uses pu ON pu.promotion_id = p.id
            WHERE p.tenant_id = $1
        `;
        // ✅ FIX: আগে এখানে tenant_id ফিল্টার ছিল না — এক tenant-এর admin
        // অন্য tenant-এর promotion তালিকাও দেখতে পেত।
        const params = [req.tenantId];
        if (active_only === 'true') {
            sql += ` AND p.is_active = true AND p.start_date <= $2 AND p.end_date >= $2`;
            params.push(today);
        }
        sql += ` GROUP BY p.id, u.name_bn ORDER BY p.created_at DESC`;

        const result = await query(sql, params);
        return res.json({ success: true, data: result.rows });

    } catch (err) {
        logger.error('[Promotion] getAllPromotions error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/promotions
// নতুন promotion তৈরি (Admin)
// ============================================================

const createPromotion = async (req, res) => {
    try {
        const adminId = req.user.id;
        const {
            name, description, type,
            buy_quantity, free_quantity, free_product_id,
            discount_value,
            min_order_amount, min_order_qty,
            apply_to, product_ids, route_ids, customer_ids, category_ids,
            start_date, end_date,
            max_uses, max_per_customer,
            promo_code, stackable, priority, tiers, budget_cap, // ← Phase ২
        } = req.body;
        // নোট: discount_type ইচ্ছাকৃতভাবে বাদ — type (percent_off/flat_off)
        // ফিল্ডই percent-vs-flat ঠিক করে, discount_type কখনো কোনো discount
        // logic-এ পড়া হতো না (redundant column, UI-তেও input ছিল না)।
        // DB কলামটা রেখে দেওয়া হয়েছে (নিরাপদ, harmless) — শুধু app কোড আর লিখছে না।

        if (!name || !type || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'নাম, ধরন, তারিখ দিন।' });
        }

        // ✅ NEW: buy_x_get_y-এর জন্য free_product_id বাধ্যতামূলক — আগে এই
        // চেক না থাকায় free_product_id ছাড়াই promo তৈরি হয়ে যেত এবং
        // কখনো আসলে কার্যকর হতো না।
        if (type === 'buy_x_get_y' && (!buy_quantity || !free_quantity || !free_product_id)) {
            return res.status(400).json({
                success: false,
                message: 'Buy X Get Y-এর জন্য কতটা কিনলে, কতটা ফ্রি ও কোন পণ্য ফ্রি — তিনটাই আবশ্যক।'
            });
        }

        // ✅ NEW (Phase ২): tiered_discount-এর জন্য অন্তত একটা tier আবশ্যক
        if (type === 'tiered_discount' && (!Array.isArray(tiers) || !tiers.length)) {
            return res.status(400).json({
                success: false,
                message: 'স্ল্যাব/টায়ার্ড ছাড়ের জন্য অন্তত একটা স্ল্যাব (কতটা হলে কত% ছাড়) দিন।'
            });
        }

        // ✅ NEW (Phase ৩ — Governance): বড় ছাড়/সীমাহীন বাজেট হলে সরাসরি লাইভ
        // না করে অনুমোদনের অপেক্ষায় রাখো। থ্রেশহোল্ড: promotion.utils.js →
        // APPROVAL_THRESHOLDS (needsApproval)।
        const approvalReason = needsApproval({ type, discount_value, budget_cap, tiers });
        const approvalStatus = approvalReason ? 'pending' : 'auto_approved';
        const isActive       = approvalReason ? false : true; // pending থাকা অবস্থায় কখনো checkout-এ apply হবে না

        const result = await query(
            `INSERT INTO promotions (
                name, description, type,
                buy_quantity, free_quantity, free_product_id,
                discount_value,
                min_order_amount, min_order_qty,
                apply_to, product_ids, route_ids, customer_ids, category_ids,
                start_date, end_date,
                max_uses, max_per_customer,
                promo_code, stackable, priority, tiers, budget_cap,
                is_active, approval_status, approval_reason,
                created_by, tenant_id) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,
                $10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
            [
                name, description, type,
                buy_quantity || null, free_quantity || null, free_product_id || null,
                discount_value || null,
                min_order_amount || 0, min_order_qty || 0,
                apply_to || 'all',
                JSON.stringify(product_ids  || []),
                JSON.stringify(route_ids    || []),
                JSON.stringify(customer_ids || []),
                JSON.stringify(category_ids || []),
                start_date, end_date,
                max_uses || null, max_per_customer || null,
                promo_code ? promo_code.trim().toUpperCase() : null,
                stackable !== false,           // ডিফল্ট true (না দিলেও stack করবে)
                priority || 0,
                tiers ? JSON.stringify(tiers) : null,
                budget_cap || null,
                isActive, approvalStatus, approvalReason,
                adminId,
                req.tenantId  // SaaS: tenant_id = $28
            ]
        );

        // ✅ NEW (Phase ৩): audit trail — বাকি ৯টা মডিউলের মতোই generic
        // audit_logs টেবিলে। promotion.controller.js আগে এই তালিকায় ছিল না।
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value, tenant_id)
             VALUES ($1, 'CREATE_PROMOTION', 'promotions', $2, $3, $4)`,
            [adminId, result.rows[0].id, JSON.stringify(result.rows[0]), req.tenantId]
        );

        // ✅ NEW (Phase ৫): approval না লাগলে সাথে সাথেই লাইভ — তখনই জানাও।
        // pending থাকলে approvePromotion()-এ notify হবে, এখানে না।
        if (!approvalReason) {
            await notifyPromotionLive(result.rows[0], req.tenantId, adminId);
        }

        return res.status(201).json({
            success: true,
            data: result.rows[0],
            message: approvalReason
                ? `Promotion তৈরি হয়েছে, কিন্তু ${approvalReason} — অনুমোদনের আগে চালু হবে না।`
                : 'Promotion তৈরি হয়েছে ও চালু আছে।'
        });

    } catch (err) {
        // ✅ NEW: promo_code ইতোমধ্যে ব্যবহৃত হলে বন্ধুত্বপূর্ণ বার্তা
        // (Postgres unique_violation = 23505)
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'এই কোডটা ইতোমধ্যে অন্য একটা প্রমোশনে ব্যবহৃত হচ্ছে — অন্য কোড দিন।' });
        }
        logger.error('[Promotion] createPromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/promotions/:id — Update (Admin)
// ============================================================

const updatePromotion = async (req, res) => {
    try {
        const { id } = req.params;
        const fields  = req.body;

        // ✅ NEW (Phase ৩): বর্তমান রো আগে আনো — audit-এর old_value-এর জন্য,
        // আর risk-fields বদলালে approval আবার হিসাব করার জন্য (merged state দিয়ে)
        const currentRes = await query(`SELECT * FROM promotions WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
        if (!currentRes.rows.length) {
            return res.status(404).json({ success: false, message: 'Promotion পাওয়া যায়নি।' });
        }
        const current = currentRes.rows[0];

        const allowed = [
            'name','description','discount_value',
            'start_date','end_date','is_active',
            'max_uses','max_per_customer',
            'product_ids','route_ids','customer_ids','category_ids',
            'min_order_amount','min_order_qty',
            'promo_code','stackable','priority','tiers','budget_cap', // ← Phase ২
            'buy_quantity','free_quantity','free_product_id', // ✅ FIX: এই তিনটা কখনো এখানে ছিলই না
            // (Phase ১-এর আগে থেকেই) — Buy X Get Y তৈরির পর এডিট করা যেত না।
        ];

        const sets   = [];
        const params = [];
        let   idx    = 1;

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = $${idx++}`);
                let val = fields[key];
                if (['product_ids','route_ids','customer_ids','category_ids','tiers'].includes(key)) {
                    val = val === null ? null : JSON.stringify(val);
                } else if (key === 'promo_code') {
                    val = val ? String(val).trim().toUpperCase() : null;
                } else if (['buy_quantity','free_quantity','free_product_id'].includes(key)) {
                    // ✅ FIX: ফাঁকা string ('') UUID/integer কলামে পাঠালে Postgres
                    // error দেবে — createPromotion-এর মতোই null-এ কোয়ার্স করা
                    val = (val === '' || val === undefined) ? null : val;
                }
                params.push(val);
            }
        }

        // ✅ FIX: buy_quantity/free_quantity/free_product_id-এর যেকোনোটা বদলালে,
        // promotion-টা buy_x_get_y হলে merged state-এ তিনটাই থাকতে হবে —
        // নাহলে এডিট করে চুপচাপ free_product_id ফাঁকা করে দিলে Phase ১-এ
        // ঠিক করা "ফ্রি প্রোডাক্ট ছাড়া অফার" বাগ আবার তৈরি হয়ে যেত।
        if (current.type === 'buy_x_get_y') {
            const bxgyFields = ['buy_quantity','free_quantity','free_product_id'];
            const bxgyChanged = bxgyFields.some(k => fields[k] !== undefined);
            if (bxgyChanged) {
                const mergedBxgy = {
                    buy_quantity:    fields.buy_quantity    !== undefined ? fields.buy_quantity    : current.buy_quantity,
                    free_quantity:   fields.free_quantity   !== undefined ? fields.free_quantity   : current.free_quantity,
                    free_product_id: fields.free_product_id !== undefined ? fields.free_product_id : current.free_product_id,
                };
                if (!mergedBxgy.buy_quantity || !mergedBxgy.free_quantity || !mergedBxgy.free_product_id) {
                    return res.status(400).json({
                        success: false,
                        message: 'Buy X Get Y-এর কতটা কিনলে, কতটা ফ্রি ও কোন পণ্য ফ্রি — তিনটাই থাকতে হবে, ফাঁকা রাখা যাবে না।'
                    });
                }
            }
        }

        // ✅ NEW (Phase ৩): discount_value/budget_cap/tiers-এর যেকোনোটা বদলালে
        // (type বদলানো যায় না — allowed তালিকায় নেই), merged state দিয়ে আবার
        // approval দরকার কিনা যাচাই করো। কেউ যেন এডিট করে চুপচাপ ছাড় বাড়িয়ে
        // approval এড়িয়ে যেতে না পারে।
        const riskFieldsChanged = ['discount_value','budget_cap','tiers'].some(k => fields[k] !== undefined);
        if (riskFieldsChanged) {
            const merged = {
                type:           current.type, // অপরিবর্তনীয়
                discount_value: fields.discount_value !== undefined ? fields.discount_value : current.discount_value,
                budget_cap:     fields.budget_cap     !== undefined ? fields.budget_cap     : current.budget_cap,
                tiers:          fields.tiers          !== undefined ? fields.tiers          : current.tiers,
            };
            const reason = needsApproval(merged);
            sets.push(`approval_status = $${idx++}`); params.push(reason ? 'pending' : 'auto_approved');
            sets.push(`approval_reason = $${idx++}`); params.push(reason);
            // reason থাকলে is_active জোর করে false — client যাই পাঠাক না কেন
            if (reason) { sets.push(`is_active = $${idx++}`); params.push(false); }
        }

        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'কিছু পরিবর্তন করুন।' });
        }

        params.push(id);
        params.push(req.tenantId);
        const result = await query(
            `UPDATE promotions SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx+1} RETURNING *`,
            params
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Promotion পাওয়া যায়নি।' });
        }

        // ✅ NEW (Phase ৩): audit trail — before/after দুটোই
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, tenant_id)
             VALUES ($1, 'UPDATE_PROMOTION', 'promotions', $2, $3, $4, $5)`,
            [req.user.id, id, JSON.stringify(current), JSON.stringify(fields), req.tenantId]
        );

        return res.json({
            success: true,
            data: result.rows[0],
            message: result.rows[0].approval_status === 'pending'
                ? `আপডেট হয়েছে, কিন্তু ${result.rows[0].approval_reason} — অনুমোদনের আগে বন্ধ থাকবে।`
                : 'আপডেট হয়েছে।'
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'এই কোডটা ইতোমধ্যে অন্য একটা প্রমোশনে ব্যবহৃত হচ্ছে — অন্য কোড দিন।' });
        }
        logger.error('[Promotion] updatePromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/promotions/:id — Deactivate (Admin)
// ============================================================

const deletePromotion = async (req, res) => {
    try {
        const result = await query(
            `UPDATE promotions SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id, name`,
            [req.params.id, req.tenantId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Promotion পাওয়া যায়নি।' });
        }

        // ✅ NEW (Phase ৩): audit trail
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value, tenant_id)
             VALUES ($1, 'DEACTIVATE_PROMOTION', 'promotions', $2, $3, $4)`,
            [req.user.id, req.params.id, JSON.stringify({ name: result.rows[0].name }), req.tenantId]
        );

        return res.json({ success: true, message: 'Promotion বন্ধ করা হয়েছে।' });
    } catch (err) {
        logger.error('[Promotion] deletePromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/promotions/active
// SR-এর জন্য চলমান promotions
// ============================================================

const getActivePromotions = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const result = await query(
            `SELECT p.id, p.name, p.description, p.type,
                    p.buy_quantity, p.free_quantity, p.free_product_id,
                    fp.name AS free_product_name,
                    p.discount_value, p.tiers, p.banner_image_url,
                    p.min_order_amount, p.min_order_qty,
                    p.apply_to, p.product_ids, p.route_ids,
                    p.start_date, p.end_date
             FROM promotions p
             LEFT JOIN products fp ON fp.id = p.free_product_id
             WHERE p.is_active = true
               AND p.start_date <= $1
               AND p.end_date   >= $1
               AND p.tenant_id  = $2
               AND p.promo_code IS NULL
             ORDER BY p.created_at DESC`,
            [today, req.tenantId]
        );
        return res.json({ success: true, data: result.rows });

    } catch (err) {
        logger.error('[Promotion] getActivePromotions error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/promotions/calculate
// Cart দিলে applicable promotions ও discount calculate করবে
// ============================================================

const calculatePromotions = async (req, res) => {
    try {
        const { items = [], customer_id, promo_code } = req.body;

        // ✅ REFACTOR: আসল হিসাব এখন getEligiblePromotions()-এ — এই একই
        // ফাংশন sales.controller.js-এর createSale()-ও ব্যবহার করে, তাই
        // এই প্রিভিউ আর আসল বিক্রয়ের discount কখনো আলাদা হবে না।
        // (আগে এখানে যা ছিল: tenant_id ফিল্টার ছিল না, client-পাঠানো
        //  item.price বিশ্বাস করা হতো, free_product_id/stock guard ছিল না,
        //  max_per_customer কখনো চেক হতো না — সবগুলো এখন ঠিক করা হয়েছে।)
        const { applicable, payableDiscount, freeItems } = await getEligiblePromotions({
            queryFn:    query,
            tenantId:   req.tenantId,
            items,
            customerId: customer_id || null,
            promoCode:  promo_code || null,
        });

        return res.json({
            success: true,
            data: {
                applicable_promotions: applicable.map(a => ({
                    promotion_id    : a.promotion.id,
                    name            : a.promotion.name,
                    type            : a.promotion.type,
                    discount_amount : a.discountAmount,
                    reduces_payable : a.reducesPayable,
                    message         : a.message,
                })),
                // total_discount = বিল আসলে যতটা কমবে (buy_x_get_y-এর ফ্রি
                // আইটেম বাদে — সেটা free_items-এ আলাদাভাবে দেখানো হচ্ছে)
                total_discount: payableDiscount,
                free_items:     freeItems,
            }
        });

    } catch (err) {
        logger.error('[Promotion] calculatePromotions error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/promotions/:id/report (Admin)
// ============================================================

const getPromotionReport = async (req, res) => {
    try {
        const { id } = req.params;

        const promoRes = await query(
            `SELECT * FROM promotions WHERE id = $1 AND tenant_id = $2`,
            [id, req.tenantId]
        );
        if (!promoRes.rows.length) {
            return res.status(404).json({ success: false, message: 'পাওয়া যায়নি।' });
        }
        const promo = promoRes.rows[0];

        const usageRes = await query(
            `SELECT
                pu.*,
                u.name_bn  AS worker_name,
                c.shop_name AS customer_name
             FROM promotion_uses pu
             LEFT JOIN users u      ON u.id = pu.worker_id
             LEFT JOIN customers c  ON c.id = pu.customer_id
             WHERE pu.promotion_id = $1 AND pu.tenant_id = $2
             ORDER BY pu.used_at DESC
             LIMIT 100`,
            [id, req.tenantId]
        );

        const stats = await query(
            `SELECT
                COUNT(*)::INTEGER                    AS total_uses,
                COALESCE(SUM(discount_given), 0)     AS total_discount,
                COUNT(DISTINCT worker_id)::INTEGER   AS unique_workers,
                COUNT(DISTINCT customer_id)::INTEGER AS unique_customers
             FROM promotion_uses WHERE promotion_id = $1 AND tenant_id = $2`,
            [id, req.tenantId]
        );

        // ✅ NEW (Phase ৪): SR-wise leaderboard — কোন SR সবচেয়ে বেশি এই
        // প্রমোশন redeem করাচ্ছেন
        const srLeaderboard = await query(
            `SELECT u.id AS worker_id, u.name_bn AS worker_name,
                    COUNT(*)::INTEGER AS redemptions,
                    COALESCE(SUM(pu.discount_given), 0) AS total_discount
             FROM promotion_uses pu
             JOIN users u ON u.id = pu.worker_id
             WHERE pu.promotion_id = $1 AND pu.tenant_id = $2
             GROUP BY u.id, u.name_bn
             ORDER BY total_discount DESC
             LIMIT 20`,
            [id, req.tenantId]
        );

        // ✅ NEW (Phase ৪): Route-wise leaderboard — কাস্টমারের route ধরে
        // (promotion_uses-এ route_id সরাসরি নেই, তাই customer দিয়ে জয়েন)
        const routeLeaderboard = await query(
            `SELECT r.id AS route_id, r.name AS route_name,
                    COUNT(*)::INTEGER AS redemptions,
                    COALESCE(SUM(pu.discount_given), 0) AS total_discount
             FROM promotion_uses pu
             JOIN customers c ON c.id = pu.customer_id
             LEFT JOIN routes r ON r.id = c.route_id
             WHERE pu.promotion_id = $1 AND pu.tenant_id = $2
             GROUP BY r.id, r.name
             ORDER BY total_discount DESC
             LIMIT 20`,
            [id, req.tenantId]
        );

        // ✅ NEW (Phase ৪): Before/after sales lift + ROI
        // পদ্ধতি: promotion_uses থেকে "কোন কাস্টমাররা আসলে এই promo-তে ছাড়
        // পেয়েছেন" বের করা হয় (targeting rule অনুমান না করে, ground-truth
        // redemption data ব্যবহার করা হচ্ছে — বেশি নির্ভরযোগ্য)। তারপর সেই
        // কাস্টমারদের মোট বিক্রি তুলনা করা হয়: promo period vs তার ঠিক
        // আগের সমান-দৈর্ঘ্যের period (baseline)।
        //
        // সীমাবদ্ধতা: কোনো কাস্টমার এই promo ছাড়াও অন্য কারণে বেশি/কম
        // কিনতে পারে (seasonality, অন্য promotion ইত্যাদি) — তাই এটা
        // "causal proof" না, একটা reasonable directional signal।
        const liftRes = await query(
            `WITH touched_customers AS (
                SELECT DISTINCT customer_id FROM promotion_uses
                WHERE promotion_id = $1 AND tenant_id = $2 AND customer_id IS NOT NULL
             ),
             period AS (
                SELECT
                    $3::date AS start_d,
                    LEAST($4::date, CURRENT_DATE) AS end_d
             ),
             during AS (
                SELECT COALESCE(SUM(st.total_amount), 0) AS revenue, COUNT(*)::INTEGER AS txns
                FROM sales_transactions st, period p
                WHERE st.tenant_id = $2
                  AND st.customer_id IN (SELECT customer_id FROM touched_customers)
                  AND st.created_at::date BETWEEN p.start_d AND p.end_d
             ),
             baseline AS (
                SELECT COALESCE(SUM(st.total_amount), 0) AS revenue, COUNT(*)::INTEGER AS txns
                FROM sales_transactions st, period p
                WHERE st.tenant_id = $2
                  AND st.customer_id IN (SELECT customer_id FROM touched_customers)
                  AND st.created_at::date BETWEEN
                      (p.start_d - ((p.end_d - p.start_d) + 1)) AND (p.start_d - 1)
             )
             SELECT
                (SELECT COUNT(*) FROM touched_customers)::INTEGER AS touched_customer_count,
                d.revenue AS during_revenue, d.txns AS during_txns,
                b.revenue AS baseline_revenue, b.txns AS baseline_txns
             FROM during d, baseline b`,
            [id, req.tenantId, promo.start_date, promo.end_date]
        );

        const lift = liftRes.rows[0] || {};
        const duringRevenue  = parseFloat(lift.during_revenue  || 0);
        const baselineRevenue = parseFloat(lift.baseline_revenue || 0);
        const totalDiscount   = parseFloat(stats.rows[0].total_discount || 0);
        const incrementalRevenue = duringRevenue - baselineRevenue;
        // ROI: ছাড়ের প্রতি টাকায় কত বাড়তি বিক্রি হলো (baseline-এর তুলনায়)
        const roiPercent = totalDiscount > 0
            ? Math.round(((incrementalRevenue - totalDiscount) / totalDiscount) * 10000) / 100
            : null;
        const liftPercent = baselineRevenue > 0
            ? Math.round((incrementalRevenue / baselineRevenue) * 10000) / 100
            : null;

        return res.json({
            success: true,
            data: {
                promotion: promo,
                stats: stats.rows[0],
                usage: usageRes.rows,
                sr_leaderboard:    srLeaderboard.rows,
                route_leaderboard: routeLeaderboard.rows,
                lift: {
                    touched_customer_count: lift.touched_customer_count || 0,
                    during_revenue:   duringRevenue,
                    during_txns:      lift.during_txns || 0,
                    baseline_revenue: baselineRevenue,
                    baseline_txns:    lift.baseline_txns || 0,
                    incremental_revenue: Math.round(incrementalRevenue * 100) / 100,
                    lift_percent: liftPercent,   // null মানে baseline-এ কোনো বিক্রিই ছিল না, তুলনা অর্থহীন
                    roi_percent:  roiPercent,    // null মানে কোনো discount ব্যয়ই হয়নি
                },
            }
        });

    } catch (err) {
        logger.error('[Promotion] getPromotionReport error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/promotions/dashboard-summary — সব প্রমোশনের overview KPI (Admin/Manager)
// ============================================================

const getPromotionsDashboardSummary = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);

        const summary = await query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE p.is_active AND p.start_date <= $1 AND p.end_date >= $1
                )::INTEGER AS active_count,
                COUNT(*) FILTER (WHERE p.approval_status = 'pending')::INTEGER AS pending_approval_count,
                COALESCE((
                    SELECT SUM(pu.discount_given) FROM promotion_uses pu
                    WHERE pu.tenant_id = $2 AND pu.used_at >= date_trunc('month', CURRENT_DATE)
                ), 0) AS discount_this_month,
                COALESCE((
                    SELECT COUNT(*) FROM promotion_uses pu
                    WHERE pu.tenant_id = $2 AND pu.used_at >= date_trunc('month', CURRENT_DATE)
                ), 0)::INTEGER AS redemptions_this_month
             FROM promotions p
             WHERE p.tenant_id = $2`,
            [today, req.tenantId]
        );

        const topPromo = await query(
            `SELECT p.id, p.name, COUNT(pu.id)::INTEGER AS redemptions,
                    COALESCE(SUM(pu.discount_given), 0) AS total_discount
             FROM promotions p
             JOIN promotion_uses pu ON pu.promotion_id = p.id
             WHERE p.tenant_id = $1 AND pu.used_at >= date_trunc('month', CURRENT_DATE)
             GROUP BY p.id, p.name
             ORDER BY total_discount DESC
             LIMIT 3`,
            [req.tenantId]
        );

        return res.json({
            success: true,
            data: { ...summary.rows[0], top_promotions_this_month: topPromo.rows }
        });
    } catch (err) {
        logger.error('[Promotion] getPromotionsDashboardSummary error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// Phase ৫: নতুন অফার লাইভ হলে staff + customer দুই audience-কেই
// notifications টেবিলে জানানো হয় (in-app notification list-এ দেখাবে)।
//
// সীমাবদ্ধতা: পুরো push-delivery pipeline (sendPushToMany/Firebase) এখানে
// wire করা হয়নি — শুধু notifications টেবিলে রেকর্ড তৈরি হয়, যেটা বিদ্যমান
// GET /notifications (staff) ও GET /portal/notifications (customer)
// endpoint-এ দেখাবে। Push alert চাইলে notification.controller.js-এর
// sendPushToMany() আলাদাভাবে wire করতে হবে।
// ============================================================

const notifyPromotionLive = async (promo, tenantId, senderId) => {
    try {
        // route-targeted হলে শুধু সেই route-এর কাস্টমার এলাকায়, নাহলে সবাইকে
        const isRouteTargeted = promo.apply_to === 'specific_routes' && (promo.route_ids || []).length;

        await query(
            `INSERT INTO notifications
                (tenant_id, sender_id, title, body, category, is_urgent, audience, target_type, target_value, recipient_count)
             VALUES ($1,$2,$3,$4,'order_sales',false,'staff','all_staff','{}',0)`,
            [tenantId, senderId, `নতুন অফার: ${promo.name}`, promo.description || 'নতুন প্রমোশন লাইভ হয়েছে — কাস্টমারদের জানান।']
        );

        await query(
            `INSERT INTO notifications
                (tenant_id, sender_id, title, body, category, is_urgent, audience, target_type, target_value, recipient_count)
             VALUES ($1,$2,$3,$4,'order_sales',false,'customer',$5,$6,0)`,
            [
                tenantId, senderId, `🎁 নতুন অফার: ${promo.name}`, promo.description || 'আপনার জন্য নতুন একটা অফার এসেছে!',
                isRouteTargeted ? 'customer_area' : 'all_customers',
                JSON.stringify(isRouteTargeted ? { route_ids: promo.route_ids } : {}),
            ]
        );
    } catch (err) {
        // নোটিফিকেশন ব্যর্থ হলে promotion তৈরি/অনুমোদন যেন আটকে না যায়
        logger.error('[Promotion] notifyPromotionLive error:', err.message);
    }
};

// ============================================================
// POST /api/promotions/:id/banner — banner ছবি আপলোড (Admin)
// ============================================================

const uploadPromotionBanner = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ছবি দিন।' });
        }

        const exists = await query(`SELECT id FROM promotions WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
        if (!exists.rows.length) {
            return res.status(404).json({ success: false, message: 'Promotion পাওয়া যায়নি।' });
        }

        const bannerUrl = await uploadToCloudinary(req.file.buffer, 'promotions', `promo_${id}`, req.file.mimetype);
        if (!bannerUrl) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        const result = await query(
            `UPDATE promotions SET banner_image_url = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
            [bannerUrl, id, req.tenantId]
        );

        return res.json({ success: true, data: result.rows[0], message: 'ব্যানার আপলোড হয়েছে।' });
    } catch (err) {
        logger.error('[Promotion] uploadPromotionBanner error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};
// নোট: বর্তমানে শুধু 'admin' role আছে বলে, একই admin যিনি promotion
// তৈরি করেছেন তিনিই approve করতে পারবেন — সত্যিকার segregation-of-duty
// (ভিন্ন approver role) এই সিস্টেমে এখনো নেই। এটা একটা সীমাবদ্ধতা,
// লুকানো হচ্ছে না — future-এ distinct "owner"/"super-admin-only-approve"
// role যোগ হলে এই route-এর permission শক্ত করা যাবে।

const approvePromotion = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `UPDATE promotions
             SET approval_status = 'approved', approved_by = $1, approved_at = NOW(), is_active = true
             WHERE id = $2 AND tenant_id = $3 AND approval_status = 'pending'
             RETURNING *`,
            [req.user.id, id, req.tenantId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'অনুমোদনের অপেক্ষায় থাকা এই promotion পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value, tenant_id)
             VALUES ($1, 'APPROVE_PROMOTION', 'promotions', $2, $3, $4)`,
            [req.user.id, id, JSON.stringify({ name: result.rows[0].name, approval_reason: result.rows[0].approval_reason }), req.tenantId]
        );

        // ✅ NEW (Phase ৫)
        await notifyPromotionLive(result.rows[0], req.tenantId, req.user.id);

        return res.json({ success: true, data: result.rows[0], message: `"${result.rows[0].name}" অনুমোদিত ও চালু হয়েছে।` });
    } catch (err) {
        logger.error('[Promotion] approvePromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/promotions/:id/reject — প্রত্যাখ্যান করে (Admin)
// ============================================================

const rejectPromotion = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `UPDATE promotions
             SET approval_status = 'rejected', approved_by = $1, approved_at = NOW(), is_active = false
             WHERE id = $2 AND tenant_id = $3 AND approval_status = 'pending'
             RETURNING *`,
            [req.user.id, id, req.tenantId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'অনুমোদনের অপেক্ষায় থাকা এই promotion পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value, tenant_id)
             VALUES ($1, 'REJECT_PROMOTION', 'promotions', $2, $3, $4)`,
            [req.user.id, id, JSON.stringify({ name: result.rows[0].name }), req.tenantId]
        );

        return res.json({ success: true, data: result.rows[0], message: `"${result.rows[0].name}" প্রত্যাখ্যাত হয়েছে।` });
    } catch (err) {
        logger.error('[Promotion] rejectPromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/promotions/active — কাস্টমার পোর্টালে অফার (Phase ৫)
// ============================================================
// এখানেই রাখা হলো (customerPortal.controller.js-এ না) — সেই ফাইল
// ইতোমধ্যে ২২০০+ লাইন, promotion logic এক জায়গায় রাখাই safer।
// customerPortal.routes.js থেকে import করে ব্যবহার হবে।

const getPortalActivePromotions = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const today = new Date().toISOString().slice(0, 10);

        const custRes = await query(
            `SELECT route_id FROM customers WHERE id = $1 AND tenant_id = $2`,
            [customer_id, req.tenantId]
        );
        const routeId = custRes.rows[0]?.route_id || null;

        // কোন কোন promo এই কাস্টমারের প্রাসঙ্গিক: 'all', product/category-targeted
        // (browse view — কার্ট এখনো নেই তাই সব দেখানো হয়, ঠিক SR-এর Active Offers-এর
        // মতোই), অথবা তার নিজের route/customer-id নির্দিষ্টভাবে টার্গেটেড।
        // কোড-ভিত্তিক (promo_code থাকা) promo এখানে দেখানো হয় না — বাকি সব জায়গার মতোই।
        const result = await query(
            `SELECT p.id, p.name, p.description, p.type, p.banner_image_url,
                    p.buy_quantity, p.free_quantity, fp.name AS free_product_name,
                    p.discount_value, p.min_order_amount,
                    p.start_date, p.end_date
             FROM promotions p
             LEFT JOIN products fp ON fp.id = p.free_product_id
             WHERE p.is_active = true AND p.start_date <= $1 AND p.end_date >= $1
               AND p.tenant_id = $2 AND p.promo_code IS NULL
               AND (
                   p.apply_to IN ('all', 'specific_products')
                   OR (p.apply_to = 'specific_routes'    AND p.route_ids    @> to_jsonb($3::text))
                   OR (p.apply_to = 'specific_customers' AND p.customer_ids @> to_jsonb($4::text))
               )
             ORDER BY p.created_at DESC`,
            [today, req.tenantId, routeId, customer_id]
        );

        return res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('[Promotion] getPortalActivePromotions error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/promotions/calculate
// ✅ NEW (ফেজ ০/৩ — Promotions পোর্টাল এক্সপোজার + কুপন-কোড)
// calculatePromotions (উপরে, worker/admin)-এর ঠিক একই getEligiblePromotions
// ইঞ্জিন ব্যবহার করে (margin guard/budget cap/stacking/targeting সব
// এমনিতেই পাওয়া যায়, ডুপ্লিকেট করতে হয়নি) — কিন্তু portal cart-এ
// একাধিক কোম্পানির item থাকতে পারে (multi-vendor), তাই tenant_id
// দিয়ে group করে প্রতিটা group আলাদাভাবে শুধু সেই tenant-এর
// promotion-এর বিপরীতে ক্যালকুলেট হয়।
//
// ⚠️ READ-ONLY / তথ্যমূলক প্রিভিউ — এটা শুধু চেকআউটে "প্রযোজ্য অফার"
// মেসেজ দেখানোর জন্য, recordPromotionUsage/deductFreeGiftStock এখানে
// call হয় না — portal order-request ফ্লোতে এখনো কোনো "commit" ধাপ
// নেই (sales.controller.js-এর createSale-এর মতো), SR অর্ডার প্রসেস
// করার সময় ম্যানুয়ালি প্রয়োগ করবেন।
// ============================================================

const calculatePortalPromotions = async (req, res) => {
    try {
        const { items = [], promo_code } = req.body;
        const { customer_id } = req.portalUser;

        if (!items.length) {
            return res.json({ success: true, data: { applicable_promotions: [], total_discount: 0, free_items: [], code_matched: null } });
        }

        const byTenant = {};
        items.forEach(i => { (byTenant[i.tenant_id] ??= []).push(i); });
        const tenantIds = Object.keys(byTenant);

        const results = await Promise.all(
            tenantIds.map(tenantId =>
                getEligiblePromotions({
                    queryFn:    query,
                    tenantId,
                    items:      byTenant[tenantId],
                    customerId: customer_id || null,
                    promoCode:  promo_code || null,
                })
            )
        );

        const combined = results.reduce((acc, r) => ({
            applicable:      [...acc.applicable, ...r.applicable],
            payableDiscount: acc.payableDiscount + r.payableDiscount,
            freeItems:       [...acc.freeItems, ...r.freeItems],
        }), { applicable: [], payableDiscount: 0, freeItems: [] });

        // ✅ (ফেজ ৩ — কুপন-কোড): promo_code দেওয়া থাকলে, কোনো tenant-এর
        // promotions-এ ওই কোড আদৌ আছে কিনা (শর্ত পূরণ হোক বা না হোক) —
        // "কোড ভুল" বনাম "কোড ঠিক কিন্তু শর্ত মেলেনি" আলাদা করে দেখানোর
        // জন্য। getEligiblePromotions এই তথ্য ফেরত দেয় না (এলিজিবল-ই বা
        // অ-এলিজিবল, শুধু সেটাই বলে), তাই এখানে আলাদা ছোট চেক।
        let codeMatched = null;
        if (promo_code && promo_code.trim()) {
            const codeCheck = await query(
                `SELECT id FROM promotions WHERE UPPER(promo_code) = UPPER($1) AND tenant_id = ANY($2::uuid[])`,
                [promo_code.trim(), tenantIds]
            );
            codeMatched = codeCheck.rows.length > 0;
        }

        return res.json({
            success: true,
            data: {
                applicable_promotions: combined.applicable.map(a => ({
                    promotion_id    : a.promotion.id,
                    name            : a.promotion.name,
                    type            : a.promotion.type,
                    discount_amount : a.discountAmount,
                    reduces_payable : a.reducesPayable,
                    message         : a.message,
                })),
                // total_discount = বিল আসলে যতটা কমবে (calculatePromotions-এর
                // মতোই payableDiscount ব্যবহার — buy_x_get_y-এর ফ্রি আইটেমের
                // মূল্য বাদে, সেটা free_items-এ আলাদাভাবে আছে)
                total_discount: Math.round(combined.payableDiscount * 100) / 100,
                free_items:     combined.freeItems,
                code_matched:   codeMatched,
            }
        });

    } catch (err) {
        logger.error('[Promotion] calculatePortalPromotions error:', err.message);
        return res.status(500).json({ success: false, message: 'ছাড় হিসাব করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getAllPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    approvePromotion,
    rejectPromotion,
    uploadPromotionBanner, // ← Phase ৫
    getActivePromotions,
    getPortalActivePromotions, // ← Phase ৫
    calculatePromotions,
    calculatePortalPromotions, // ✅ NEW (ফেজ ০/৩ — পোর্টাল multi-vendor checkout প্রিভিউ)
    getPromotionReport,
    getPromotionsDashboardSummary,
};
