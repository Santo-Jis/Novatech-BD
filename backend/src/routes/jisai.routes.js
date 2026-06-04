const logger = require('../config/logger');
// ============================================================
// Novatech-BD — JIS-AI WhatsApp Integration Patch (v2)
// File: backend/src/routes/jisai.routes.js
//
// নতুন endpoints:
//   GET  /api/products-public          → product list (ছবি সহ)
//   GET  /api/products-public/:id      → single product detail
//   GET  /api/customer-by-phone        → phone দিয়ে customer খোঁজা
//   POST /api/whatsapp-order           → WhatsApp থেকে অর্ডার নেওয়া
//   POST /api/whatsapp-order-cancel    → WhatsApp থেকে অর্ডার বাতিল
//   GET  /api/order-public/:order_id   → order status
// ============================================================

const crypto = require('crypto');
const { query } = require('../config/db');
const { sendPushToMany } = require('../services/fcm.service');

// ── API Secret Middleware ────────────────────────────────────
// ✅ FIX: === দিয়ে string compare করলে timing attack সম্ভব।
// crypto.timingSafeEqual ব্যবহার করলে সব input-এ
// একই সময় লাগে — attacker secret আন্দাজ করতে পারে না।
const requireApiSecret = (req, res, next) => {
    const secret = req.headers['x-api-secret'];
    const expected = process.env.API_SECRET;
    if (
        !secret ||
        !expected ||
        secret.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

module.exports = (app) => {

    // ── 1. Product List (ছবি URL সহ) ───────────────────────
    app.get('/api/products-public', requireApiSecret, async (req, res) => {
        try {
            const { search, is_active = true } = req.query;
            let conditions = [`p.is_active = $1`];
            let params     = [is_active];
            let idx        = 1;

            if (search) {
                idx++;
                conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
                params.push(`%${search}%`);
            }

            const result = await query(
                `SELECT
                    p.id,
                    p.name,
                    p.unit,
                    p.price_per_unit   AS price,
                    p.category,
                    p.description,
                    p.image_url,           -- ← Cloudinary URL
                    GREATEST(0, p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock
                 FROM products p
                 WHERE ${conditions.join(' AND ')}
                   AND GREATEST(0, p.stock - COALESCE(p.reserved_stock, 0)) > 0
                 ORDER BY p.name ASC
                 LIMIT 50`,
                params
            );

            // ⚠️ SECURITY: cost, margin, internal data বাদ
            return res.json({ success: true, data: result.rows });

        } catch (err) {
            logger.error('❌ JIS-AI Products Error:', err.message);
            return res.status(500).json({ success: false });
        }
    });

    // ── 2. Single Product Detail ────────────────────────────
    app.get('/api/products-public/:id', requireApiSecret, async (req, res) => {
        try {
            const { rows } = await query(
                `SELECT
                    id, name, unit, price_per_unit AS price,
                    description, image_url,
                    GREATEST(0, stock - COALESCE(reserved_stock, 0)) AS available_stock
                 FROM products
                 WHERE id = $1::uuid AND is_active = true`,
                [req.params.id]
            );
            if (!rows[0]) return res.status(404).json({ success: false });
            return res.json({ success: true, data: rows[0] });

        } catch (err) {
            return res.status(500).json({ success: false });
        }
    });

    // ── 3. Customer Phone Lookup ─────────────────────────────
    // JIS-AI WhatsApp-এর phone দিয়ে customer_id বের করে
    app.get('/api/customer-by-phone', requireApiSecret, async (req, res) => {
        try {
            const { phone } = req.query;
            if (!phone) return res.status(400).json({ success: false, message: 'phone দিন' });

            // Phone format normalize করো: 01XXXXXXXXX → 880XXXXXXXXXX
            const digits = phone.replace(/\D/g, '');
            const normalized = digits.startsWith('880') ? digits : '880' + digits.replace(/^0/, '');

            const { rows } = await query(
                `SELECT id, shop_name, owner_name, customer_code
                 FROM customers
                 WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') IN ($1, $2)
                   AND is_active = true
                 LIMIT 1`,
                [digits, normalized]
            );

            if (!rows[0]) {
                return res.status(404).json({
                    success: false,
                    message: 'এই নম্বরে কোনো registered customer নেই।'
                });
            }

            return res.json({ success: true, data: rows[0] });

        } catch (err) {
            logger.error('❌ Customer Phone Lookup Error:', err.message);
            return res.status(500).json({ success: false });
        }
    });

    // ── 4. WhatsApp Order Create ─────────────────────────────
    // JIS-AI এখান থেকে সরাসরি order request তৈরি করে
    app.post('/api/whatsapp-order', requireApiSecret, async (req, res) => {
        try {
            const { customer_id, items, note } = req.body;

            if (!customer_id || !items?.length) {
                return res.status(400).json({ success: false, message: 'customer_id ও items দিন' });
            }

            // Customer আছে কিনা যাচাই
            const custCheck = await query(
                'SELECT id, shop_name FROM customers WHERE id = $1 AND is_active = true',
                [customer_id]
            );
            if (!custCheck.rows[0]) {
                return res.status(404).json({ success: false, message: 'Customer পাওয়া যায়নি।' });
            }

            // Product ID গুলো যাচাই ও enrich
            const productIds = items.map(i => i.product_id);
            const prodRes = await query(
                `SELECT id, name, price_per_unit AS price
                 FROM products
                 WHERE id = ANY($1::uuid[]) AND is_active = true`,
                [productIds]
            );
            const productMap = {};
            prodRes.rows.forEach(p => { productMap[p.id] = p; });

            const enrichedItems = items
                .map(item => {
                    const prod = productMap[item.product_id];
                    if (!prod || !item.qty || item.qty <= 0) return null;
                    return {
                        product_id:   item.product_id,
                        product_name: prod.name,
                        unit_price:   parseFloat(prod.price),
                        qty:          parseInt(item.qty),
                        item_note:    item.item_note || ''
                    };
                })
                .filter(Boolean);

            if (!enrichedItems.length) {
                return res.status(400).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
            }

            // Order request সেভ করো
            const result = await query(
                `INSERT INTO customer_order_requests (customer_id, items, note, status)
                 VALUES ($1, $2::jsonb, $3, 'pending')
                 RETURNING id, created_at`,
                [customer_id, JSON.stringify(enrichedItems), note || 'WhatsApp থেকে অর্ডার']
            );
            const newReq = result.rows[0];

            // Admin/Manager কে push notification পাঠাও
            try {
                const adminIds = await query(
                    `SELECT id FROM users WHERE role IN ('admin','manager') AND status = 'active'`
                );
                if (adminIds.rows.length > 0) {
                    await sendPushToMany(adminIds.rows.map(r => r.id), {
                        title: `📱 WhatsApp অর্ডার`,
                        body:  `${custCheck.rows[0].shop_name} থেকে ${enrichedItems.length}টি পণ্যের অর্ডার।`,
                        type:  'whatsapp_order',
                        data:  { request_id: newReq.id }
                    });
                }
            } catch (pushErr) {
                logger.error('[WhatsApp Order] Push error:', pushErr.message);
            }

            return res.status(201).json({
                success: true,
                message: 'অর্ডার নেওয়া হয়েছে।',
                data: {
                    request_id:  newReq.id,
                    items_count: enrichedItems.length,
                    created_at:  newReq.created_at
                }
            });

        } catch (err) {
            logger.error('❌ WhatsApp Order Error:', err.message);
            return res.status(500).json({ success: false, message: 'অর্ডার নিতে সমস্যা হয়েছে।' });
        }
    });

    // ── 5. WhatsApp Order Cancel ─────────────────────────────
    app.post('/api/whatsapp-order-cancel', requireApiSecret, async (req, res) => {
        try {
            const { order_id, phone } = req.body;

            // Phone থেকে customer_id নাও
            const digits     = (phone || '').replace(/\D/g, '');
            const normalized = digits.startsWith('880') ? digits : '880' + digits.replace(/^0/, '');

            const custRes = await query(
                `SELECT id FROM customers
                 WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') IN ($1, $2) AND is_active = true
                 LIMIT 1`,
                [digits, normalized]
            );
            if (!custRes.rows[0]) {
                return res.status(404).json({ success: false, message: 'Customer পাওয়া যায়নি।' });
            }
            const customer_id = custRes.rows[0].id;

            // অর্ডার যাচাই — এই customer-এরই কিনা
            const orderRes = await query(
                `SELECT id, status FROM customer_order_requests
                 WHERE id = $1 AND customer_id = $2`,
                [order_id, customer_id]
            );
            if (!orderRes.rows[0]) {
                return res.status(404).json({ success: false, message: 'অর্ডার পাওয়া যায়নি।' });
            }
            if (orderRes.rows[0].status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'শুধু pending অর্ডার বাতিল করা যাবে।'
                });
            }

            await query(
                `UPDATE customer_order_requests
                 SET status = 'cancelled', admin_note = 'WhatsApp থেকে বাতিল', updated_at = NOW()
                 WHERE id = $1`,
                [order_id]
            );

            return res.json({ success: true, message: 'অর্ডার বাতিল হয়েছে।' });

        } catch (err) {
            logger.error('❌ WhatsApp Cancel Error:', err.message);
            return res.status(500).json({ success: false });
        }
    });

    // ── 6. Order Status (public) ─────────────────────────────
    app.get('/api/order-public/:order_id', requireApiSecret, async (req, res) => {
        try {
            const { rows } = await query(
                `SELECT id, status, tracking_number,
                        TO_CHAR(created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS order_date
                 FROM customer_order_requests
                 WHERE id = $1`,
                [req.params.order_id]
            );
            if (!rows[0]) return res.status(404).json({ success: false, message: 'পাওয়া যায়নি' });
            return res.json({ success: true, ...rows[0] });

        } catch (err) {
            return res.status(500).json({ success: false });
        }
    });

};

// ============================================================
// যোগ করার নিয়ম — backend/src/app.js বা server.js এ:
//
//   const jisAiRoutes = require('./src/routes/jisai.routes');
//   jisAiRoutes(app);
// ============================================================
