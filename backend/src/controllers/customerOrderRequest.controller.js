// ============================================================
// CUSTOMER ORDER REQUEST CONTROLLER
// backend/src/controllers/customerOrderRequest.controller.js
//
// কাস্টমার পোর্টাল থেকে অর্ডার রিকোয়েস্ট → Admin/Manager নোটিফিকেশন
// ============================================================

const { query }  = require('../config/db');
const { sendPushToMany, sendCustomerPush } = require('../services/fcm.service');

// ============================================================
// HELPER — Admin ও Manager দের userId নাও
// ============================================================
const getAdminManagerIds = async () => {
    const { rows } = await query(
        `SELECT id FROM users
         WHERE role IN ('admin', 'manager', 'supervisor')
           AND status = 'active'`,
        []
    );
    return rows.map(r => r.id);
};

// ============================================================
// 1. কাস্টমার নতুন অর্ডার রিকোয়েস্ট দেবে
// POST /api/portal/order-request
// portalAuth middleware দরকার
// ============================================================
const createOrderRequest = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { items, note } = req.body;

        // Validation
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কমপক্ষে একটি পণ্য সিলেক্ট করুন।'
            });
        }

        // সব item-এ qty > 0 আছে কিনা দেখো
        for (const item of items) {
            if (!item.product_id || !item.qty || item.qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'পণ্যের পরিমাণ সঠিক নয়।'
                });
            }
        }

        // ✅ Pending check — block নয়, শুধু frontend-কে জানাও
        const pendingCheck = await query(
            `SELECT id FROM customer_order_requests
             WHERE customer_id = $1 AND status = 'pending'
             LIMIT 1`,
            [customer_id]
        );
        const hasPendingOrder = pendingCheck.rows.length > 0;

        // কাস্টমার তথ্য নাও
        const custResult = await query(
            `SELECT shop_name, owner_name, customer_code FROM customers WHERE id = $1`,
            [customer_id]
        );
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const customer = custResult.rows[0];

        // product_id গুলো DB থেকে যাচাই করো এবং নাম নাও
        const productIds = items.map(i => i.product_id);
        const prodResult = await query(
            `SELECT id, name, price FROM products WHERE id = ANY($1::uuid[]) AND is_active = true`,
            [productIds]
        );
        const productMap = {};
        prodResult.rows.forEach(p => { productMap[p.id] = p; });

        // items enrichment — product_name যোগ করো
        const enrichedItems = items.map(item => {
            const prod = productMap[item.product_id];
            if (!prod) return null;
            return {
                product_id:   item.product_id,
                product_name: prod.name,
                unit_price:   parseFloat(prod.price),
                qty:          parseInt(item.qty),
                item_note:    item.item_note || ''
            };
        }).filter(Boolean);

        if (enrichedItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'নির্বাচিত পণ্যগুলো পাওয়া যায়নি।'
            });
        }

        // DB-তে অর্ডার রিকোয়েস্ট সেভ করো
        const result = await query(
            `INSERT INTO customer_order_requests (customer_id, items, note, status)
             VALUES ($1, $2::jsonb, $3, 'pending')
             RETURNING id, created_at`,
            [customer_id, JSON.stringify(enrichedItems), note || null]
        );

        const newRequest = result.rows[0];

        // Admin ও Manager দের Push Notification পাঠাও
        try {
            const adminIds = await getAdminManagerIds();
            if (adminIds.length > 0) {
                await sendPushToMany(adminIds, {
                    title: `🛒 নতুন অর্ডার রিকোয়েস্ট`,
                    body:  `${customer.shop_name} (${customer.customer_code}) থেকে ${enrichedItems.length}টি পণ্যের অর্ডার।`,
                    type:  'customer_order_request',
                    data:  { request_id: newRequest.id }
                });
            }
        } catch (pushErr) {
            // Push ব্যর্থ হলেও অর্ডার সেভ হয়েছে — silent fail
            console.error('[OrderRequest] Push notification error:', pushErr.message);
        }

        return res.status(201).json({
            success: true,
            message: hasPendingOrder
                ? '✅ অর্ডার পাঠানো হয়েছে। তবে আপনার আগের একটি অর্ডার এখনো pending আছে।'
                : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে।',
            has_pending_order: hasPendingOrder,
            data: {
                request_id: newRequest.id,
                created_at: newRequest.created_at,
                items_count: enrichedItems.length
            }
        });

    } catch (error) {
        console.error('❌ createOrderRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'অর্ডার পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. কাস্টমার তার নিজের অর্ডার রিকোয়েস্ট লিস্ট দেখবে
// GET /api/portal/order-requests
// ============================================================
const getMyOrderRequests = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        const { rows } = await query(
            `SELECT
                cor.id, cor.items, cor.note, cor.status,
                cor.admin_note, cor.created_at, cor.updated_at,
                u.name_bn AS assigned_sr_name
             FROM customer_order_requests cor
             LEFT JOIN users u ON cor.assigned_to = u.id
             WHERE cor.customer_id = $1
             ORDER BY cor.created_at DESC
             LIMIT 20`,
            [customer_id]
        );

        return res.status(200).json({ success: true, data: rows });

    } catch (error) {
        console.error('❌ getMyOrderRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. Admin/Manager — সব pending রিকোয়েস্ট দেখবে
// GET /api/customer-order-requests?status=pending
// auth + isManager middleware দরকার
// ============================================================
const getAllOrderRequests = async (req, res) => {
    try {
        const { status = 'pending', limit = 50, offset = 0, route_id, worker_id, from, to } = req.query;

        const conditions = [];
        const params     = [];
        let   pIdx       = 1;

        if (status && status !== 'all') {
            conditions.push(`cor.status = $${pIdx++}`);
            params.push(status);
        }

        // Team Filter: Manager শুধু নিজের রুটের customer দেখবে
        if (req.teamFilter) {
            conditions.push(`r.manager_id = $${pIdx++}`);
            params.push(req.teamFilter);
        }

        if (route_id) { conditions.push(`c.route_id = $${pIdx++}`); params.push(parseInt(route_id)); }
        if (worker_id) { conditions.push(`cor.assigned_to = $${pIdx++}`); params.push(worker_id); }
        if (from) { conditions.push(`DATE(cor.created_at) >= $${pIdx++}`); params.push(from); }
        if (to)   { conditions.push(`DATE(cor.created_at) <= $${pIdx++}`); params.push(to); }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        params.push(parseInt(limit));
        params.push(parseInt(offset));

        const { rows } = await query(
            `SELECT
                cor.id, cor.items, cor.note, cor.status,
                cor.admin_note, cor.created_at, cor.updated_at,
                cor.customer_id,
                c.shop_name, c.owner_name, c.customer_code, c.whatsapp,
                r.name AS route_name,
                u.name_bn AS assigned_sr_name
             FROM customer_order_requests cor
             JOIN customers c ON cor.customer_id = c.id
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN users u ON cor.assigned_to = u.id
             ${whereClause}
             ORDER BY cor.created_at DESC
             LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
            params
        );

        // প্রতিটা order এর items এ stock তথ্য যোগ করো
        const enriched = await Promise.all(rows.map(async (row) => {
            let items = row.items;
            if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
            if (!Array.isArray(items)) items = [];

            const itemsWithStock = await Promise.all(items.map(async (item) => {
                const stockRes = await query(
                    `SELECT name, (stock - COALESCE(reserved_stock,0)) AS available_stock
                     FROM products WHERE id = $1`,
                    [item.product_id]
                );
                const p = stockRes.rows[0];
                const available = p ? parseInt(p.available_stock) : 0;
                return {
                    ...item,
                    product_name:    p?.name || item.product_name || 'অজানা পণ্য',
                    available_stock: available,
                    stock_ok:        available >= parseInt(item.qty || 1),
                };
            }));

            const hasStockIssue = itemsWithStock.some(i => !i.stock_ok);
            return { ...row, items: itemsWithStock, has_stock_issue: hasStockIssue };
        }));

        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM customer_order_requests cor
             JOIN customers c ON cor.customer_id = c.id
             LEFT JOIN routes r ON c.route_id = r.id
             ${whereClause}`,
            params.slice(0, -2)
        );

        return res.status(200).json({
            success: true,
            data: enriched,
            total: parseInt(countResult.rows[0].total)
        });

    } catch (error) {
        console.error('\u274c getAllOrderRequests Error:', error.message);
        return res.status(500).json({ success: false, message: '\u09a4\u09a5\u09cd\u09af \u0986\u09a8\u09a4\u09c7 \u09b8\u09ae\u09b8\u09cd\u09af\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964' });
    }
};

// ============================================================
// 4. Admin/Manager — রিকোয়েস্ট আপডেট করবে (SR অ্যাসাইন / কনফার্ম / বাতিল)
// PATCH /api/customer-order-requests/:id
// ============================================================
const updateOrderRequest = async (req, res) => {
    try {
        const { id }                     = req.params;
        const { status, assigned_to, admin_note } = req.body;

        const validStatuses = ['pending', 'confirmed', 'assigned', 'delivered', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'অবৈধ স্ট্যাটাস।' });
        }

        // রিকোয়েস্ট আছে কিনা দেখো
        const existing = await query(
            `SELECT cor.id, cor.customer_id, cor.status,
                    c.shop_name, c.owner_name
             FROM customer_order_requests cor
             JOIN customers c ON cor.customer_id = c.id
             WHERE cor.id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const request = existing.rows[0];

        // আপডেট করো
        const updates  = [];
        const values   = [];
        let   paramIdx = 1;

        if (status) {
            updates.push(`status = $${paramIdx++}`);
            values.push(status);
        }
        if (assigned_to !== undefined) {
            updates.push(`assigned_to = $${paramIdx++}`);
            values.push(assigned_to || null);
        }
        if (admin_note !== undefined) {
            updates.push(`admin_note = $${paramIdx++}`);
            values.push(admin_note);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'কোনো পরিবর্তন দেওয়া হয়নি।' });
        }

        values.push(id);
        await query(
            `UPDATE customer_order_requests SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            values
        );

        // কাস্টমারকে নোটিফিকেশন দাও (status পরিবর্তন হলে)
        if (status) {
            const statusMessages = {
                confirmed: { title: '✅ অর্ডার কনফার্ম', body: 'আপনার অর্ডার রিকোয়েস্ট কনফার্ম হয়েছে। শীঘ্রই SR আসবে।' },
                assigned:  { title: '🚶 SR অ্যাসাইন হয়েছে', body: 'আপনার অর্ডারের জন্য SR পাঠানো হয়েছে।' },
                delivered: { title: '📦 অর্ডার সম্পন্ন', body: 'আপনার অর্ডার ডেলিভারি হয়েছে।' },
                cancelled: { title: '❌ অর্ডার বাতিল', body: admin_note ? `কারণ: ${admin_note}` : 'আপনার অর্ডার রিকোয়েস্ট বাতিল হয়েছে।' },
            };

            const notif = statusMessages[status];
            if (notif) {
                // customer_notifications টেবিলে ইন-অ্যাপ নোটিফিকেশন সেভ করো
                await query(
                    `INSERT INTO customer_notifications (customer_id, title, body, type)
                     VALUES ($1, $2, $3, 'order_request')`,
                    [request.customer_id, notif.title, notif.body]
                ).catch(e => console.error('[OrderRequest] Customer notif DB error:', e.message));

                // Web Push — sendCustomerPush handles stale token cleanup automatically
                const { rows: fcmRows } = await query(
                    `SELECT fcm_token FROM customers WHERE id = $1 AND fcm_token IS NOT NULL`,
                    [request.customer_id]
                ).catch(() => ({ rows: [] }));

                if (fcmRows.length && fcmRows[0].fcm_token) {
                    await sendCustomerPush(fcmRows[0].fcm_token, {
                        title: notif.title,
                        body:  notif.body,
                        type:  'order_request',
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'রিকোয়েস্ট আপডেট হয়েছে।'
        });

    } catch (error) {
        console.error('❌ updateOrderRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 5. পোর্টালের জন্য পণ্য লিস্ট (public — শুধু active পণ্য)
// GET /api/portal/products
// ============================================================
const getPortalProducts = async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT id, name, price, vat, tax, unit, description, image_url,
                    (stock - COALESCE(reserved_stock, 0)) AS available_stock
             FROM products
             WHERE is_active = true
               AND (stock - COALESCE(reserved_stock, 0)) > 0
             ORDER BY name ASC`,
            []
        );

        // কাস্টমার যা দেবে সেটা final_price (VAT + Tax সহ)
        const { calcFinalPrice } = require('../services/price.utils');
        const enriched = rows.map(p => {
            const { vatAmount, taxAmount, finalPrice } = calcFinalPrice(p.price, p.vat, p.tax);
            return {
                id:              p.id,
                name:            p.name,
                unit:            p.unit,
                description:     p.description,
                image_url:       p.image_url,
                available_stock: p.available_stock,
                base_price:      parseFloat(p.price),   // মূল দাম
                vat_amount:      vatAmount,              // VAT টাকা
                tax_amount:      taxAmount,              // Tax টাকা
                final_price:     finalPrice,             // কাস্টমার যা দেবে
                has_extra:       vatAmount > 0 || taxAmount > 0,
            };
        });

        return res.status(200).json({ success: true, data: enriched });

    } catch (error) {
        console.error('❌ getPortalProducts Error:', error.message);
        return res.status(500).json({ success: false, message: 'পণ্য তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createOrderRequest,
    getMyOrderRequests,
    getAllOrderRequests,
    updateOrderRequest,
    notifyAdminStockWarning,
    getPortalProducts,
};

// ============================================================
// STOCK WARNING → Admin Notify
// POST /api/customer-order-requests/:id/stock-warning
// Manager ক্লিক করলে Admin কে notification যাবে
// ============================================================
const notifyAdminStockWarning = async (req, res) => {
    try {
        const { id } = req.params;
        const { items } = req.body; // stock কম এমন items

        // Order info নাও
        const orderRes = await query(
            `SELECT cor.id, c.shop_name, c.customer_code
             FROM customer_order_requests cor
             JOIN customers c ON cor.customer_id = c.id
             WHERE cor.id = $1`,
            [id]
        );
        if (orderRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'অর্ডার পাওয়া যায়নি।' });
        }
        const order = orderRes.rows[0];

        // Admin দের ID নাও
        const adminRes = await query(
            `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
        );
        const adminIds = adminRes.rows.map(r => r.id);

        if (adminIds.length === 0) {
            return res.status(200).json({ success: true, message: 'কোনো Admin নেই।' });
        }

        // প্রতিটা Admin এর জন্য notification সেভ করো
        const lowItems = Array.isArray(items) ? items : [];
        const itemText = lowItems.map(i => `${i.product_name} (চাই: ${i.qty}, আছে: ${i.available_stock})`).join(', ');

        const title = `⚠️ স্টক সংকট — ${order.shop_name}`;
        const body  = `অর্ডার #${order.customer_code}: ${itemText || 'কিছু পণ্যের স্টক কম।'}`;

        for (const adminId of adminIds) {
            await query(
                `INSERT INTO notifications (user_id, title, body, type, reference_id)
                 VALUES ($1, $2, $3, 'stock_warning', $4)
                 ON CONFLICT DO NOTHING`,
                [adminId, title, body, id]
            ).catch(() => {}); // notifications table না থাকলেও চলবে
        }

        // FCM Push — Admin দের কাছে
        const { sendPushToMany } = require('../services/fcm.service');
        const fcmRes = await query(
            `SELECT fcm_token FROM users WHERE id = ANY($1) AND fcm_token IS NOT NULL`,
            [adminIds]
        ).catch(() => ({ rows: [] }));

        const tokens = fcmRes.rows.map(r => r.fcm_token).filter(Boolean);
        if (tokens.length > 0) {
            await sendPushToMany(tokens, { title, body, type: 'stock_warning' }).catch(() => {});
        }

        return res.status(200).json({ success: true, message: 'Admin কে সতর্কতা পাঠানো হয়েছে।' });

    } catch (error) {
        console.error('❌ notifyAdminStockWarning Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};
