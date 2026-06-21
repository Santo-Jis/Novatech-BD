const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

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
        `;
        const params = [];
        if (active_only === 'true') {
            sql += ` WHERE p.is_active = true AND p.start_date <= $1 AND p.end_date >= $1`;
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
            discount_value, discount_type,
            min_order_amount, min_order_qty,
            apply_to, product_ids, route_ids, customer_ids,
            start_date, end_date,
            max_uses, max_per_customer,
        } = req.body;

        if (!name || !type || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'নাম, ধরন, তারিখ দিন।' });
        }

        const result = await query(
            `INSERT INTO promotions (
                name, description, type,
                buy_quantity, free_quantity, free_product_id,
                discount_value, discount_type,
                min_order_amount, min_order_qty,
                apply_to, product_ids, route_ids, customer_ids,
                start_date, end_date,
                max_uses, max_per_customer,
                created_by, tenant_id) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19
             , $20) RETURNING *`,
            [
                name, description, type,
                buy_quantity || null, free_quantity || null, free_product_id || null,
                discount_value || null, discount_type || null,
                min_order_amount || 0, min_order_qty || 0,
                apply_to || 'all',
                JSON.stringify(product_ids  || []),
                JSON.stringify(route_ids    || []),
                JSON.stringify(customer_ids || []),
                start_date, end_date,
                max_uses || null, max_per_customer || null,
                adminId,
                req.tenantId  // SaaS: tenant_id = $20
            ]
        );

        return res.status(201).json({ success: true, data: result.rows[0], message: 'Promotion তৈরি হয়েছে।' });

    } catch (err) {
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
        const allowed = [
            'name','description','discount_value','discount_type',
            'start_date','end_date','is_active',
            'max_uses','max_per_customer',
            'product_ids','route_ids','customer_ids',
            'min_order_amount','min_order_qty',
        ];

        const sets   = [];
        const params = [];
        let   idx    = 1;

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = $${idx++}`);
                params.push(
                    ['product_ids','route_ids','customer_ids'].includes(key)
                        ? JSON.stringify(fields[key])
                        : fields[key]
                );
            }
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

        return res.json({ success: true, data: result.rows[0], message: 'আপডেট হয়েছে।' });

    } catch (err) {
        logger.error('[Promotion] updatePromotion error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/promotions/:id — Deactivate (Admin)
// ============================================================

const deletePromotion = async (req, res) => {
    try {
        await query(`UPDATE promotions SET is_active = false WHERE id = $1
             AND tenant_id = $2`, [req.params.id,
                req.tenantId]);
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
            `SELECT id, name, description, type,
                    buy_quantity, free_quantity, free_product_id,
                    discount_value, discount_type,
                    min_order_amount, min_order_qty,
                    apply_to, product_ids, route_ids,
                    start_date, end_date
             FROM promotions
             WHERE is_active = true
               AND start_date <= $1
               AND end_date   >= $1
             ORDER BY created_at DESC`,
            [today]
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
        const { items = [], customer_id } = req.body;
        if (!items.length) {
            return res.json({ success: true, data: { applicable_promotions: [], total_discount: 0, free_items: [] } });
        }

        const today = new Date().toISOString().slice(0, 10);
        const promoRes = await query(
            `SELECT * FROM promotions
             WHERE is_active = true AND start_date <= $1 AND end_date >= $1`,
            [today]
        );

        const cartTotal  = items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 0), 0);
        const cartQty    = items.reduce((sum, i) => sum + (i.qty || 0), 0);

        const applicable = [];
        const freeItems  = [];
        let   totalDiscount = 0;

        for (const promo of promoRes.rows) {
            // max_uses check
            if (promo.max_uses && promo.current_uses >= promo.max_uses) continue;

            // apply_to filter
            if (promo.apply_to === 'specific_products') {
                const promoProductIds = (promo.product_ids || []).map(String);
                const hasMatch = items.some(i => promoProductIds.includes(String(i.product_id)));
                if (!hasMatch) continue;
            }

            let discountAmount = 0;
            let message        = '';
            let promoFreeItems = [];

            switch (promo.type) {
                case 'percent_off':
                    if (cartTotal >= (promo.min_order_amount || 0)) {
                        discountAmount = cartTotal * (promo.discount_value / 100);
                        message = `${promo.name}: ${promo.discount_value}% ছাড়`;
                    }
                    break;

                case 'flat_off':
                    if (cartTotal >= (promo.min_order_amount || 0)) {
                        discountAmount = Math.min(promo.discount_value, cartTotal);
                        message = `${promo.name}: ৳${promo.discount_value} ছাড়`;
                    }
                    break;

                case 'buy_x_get_y':
                    if (cartQty >= promo.buy_quantity) {
                        const freeQty = Math.floor(cartQty / promo.buy_quantity) * promo.free_quantity;
                        const freeProdRes = await query(
                            `SELECT id, name, price FROM products WHERE id = $1`,
                            [promo.free_product_id]
                        );
                        if (freeProdRes.rows.length) {
                            const freeProd    = freeProdRes.rows[0];
                            discountAmount    = freeProd.price * freeQty;
                            promoFreeItems    = [{ product_id: freeProd.id, name: freeProd.name, qty: freeQty }];
                            message           = `${promo.name}: ${freeQty}টা ${freeProd.name} ফ্রি 🎁`;
                        }
                    }
                    break;

                case 'min_order':
                    if (cartTotal >= promo.min_order_amount) {
                        discountAmount = promo.discount_value || 0;
                        message = `${promo.name}: ন্যূনতম অর্ডারে বিশেষ সুবিধা`;
                    }
                    break;
            }

            if (discountAmount > 0 || promoFreeItems.length) {
                totalDiscount += discountAmount;
                freeItems.push(...promoFreeItems);
                applicable.push({
                    promotion_id    : promo.id,
                    name            : promo.name,
                    type            : promo.type,
                    discount_amount : Math.round(discountAmount * 100) / 100,
                    message,
                });
            }
        }

        return res.json({
            success: true,
            data: {
                applicable_promotions: applicable,
                total_discount       : Math.round(totalDiscount * 100) / 100,
                free_items           : freeItems,
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

        const promoRes = await query(`SELECT * FROM promotions WHERE id = $1`, [id]);
        if (!promoRes.rows.length) {
            return res.status(404).json({ success: false, message: 'পাওয়া যায়নি।' });
        }

        const usageRes = await query(
            `SELECT
                pu.*,
                u.name_bn  AS worker_name,
                c.shop_name AS customer_name
             FROM promotion_uses pu
             LEFT JOIN users u      ON u.id = pu.worker_id
             LEFT JOIN customers c  ON c.id = pu.customer_id
             WHERE pu.promotion_id = $1
             ORDER BY pu.used_at DESC
             LIMIT 100`,
            [id]
        );

        const stats = await query(
            `SELECT
                COUNT(*)::INTEGER                    AS total_uses,
                COALESCE(SUM(discount_given), 0)     AS total_discount,
                COUNT(DISTINCT worker_id)::INTEGER   AS unique_workers,
                COUNT(DISTINCT customer_id)::INTEGER AS unique_customers
             FROM promotion_uses WHERE promotion_id = $1`,
            [id]
        );

        return res.json({
            success: true,
            data: { promotion: promoRes.rows[0], stats: stats.rows[0], usage: usageRes.rows }
        });

    } catch (err) {
        logger.error('[Promotion] getPromotionReport error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getAllPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    getActivePromotions,
    calculatePromotions,
    getPromotionReport,
};
