const logger = require('../config/logger');
// ============================================================
// CUSTOMER ORDER REQUEST CONTROLLER
// backend/src/controllers/customerOrderRequest.controller.js
//
// কাস্টমার পোর্টাল থেকে অর্ডার রিকোয়েস্ট → Admin/Manager নোটিফিকেশন
// ============================================================

const { query, withTransaction } = require('../config/db');
const { sendPushToMany, sendCustomerPush } = require('../services/fcm.service');
const { getResolvedPrices } = require('../services/priceList.utils'); // ← নতুন (Step ৫: মাল্টিপল প্রাইস লিস্ট)
const { assertCustomerLimitAvailable } = require('../services/tenantLimits.service');
const { generateCustomerCode } = require('../services/employee.service');

// ── Helper: portal customer_id/JWT থেকে person_id বের করো ──
// customerPortalConnection.controller.js-এর getPersonId-এর হুবহু কপি —
// শেয়ার্ড সার্ভিসে তোলা হয়নি যাতে এই ফাইলটা স্বনির্ভর থাকে (ওই ফাইলের
// প্যাটার্নই অনুসরণ করা হলো, যেটা নিজেও একটা লোকাল হেল্পার)।
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
// HELPER — Admin ও Manager দের userId নাও
// ============================================================
const getAdminManagerIds = async (tenantId) => {
    const { rows } = await query(
        `SELECT id FROM users
         WHERE role IN ('admin', 'manager', 'supervisor')
           AND status = 'active'
           AND tenant_id = $1`,
        [tenantId]
    );
    return rows.map(r => r.id);
};

// ============================================================
// 1. কাস্টমার নতুন অর্ডার রিকোয়েস্ট দেবে
// POST /api/portal/order-request
// portalAuth middleware দরকার
// ============================================================
// ✅ ফিক্স (গুরুতর বাগ, একাধিক কোম্পানির কার্ট) — আগে এই ফাংশন সেশনের
// একটা মাত্র কোম্পানির tenant_id দিয়ে প্রোডাক্ট মেলাত আর একটাই order
// request বানাত। কার্টে অন্য কোম্পানির প্রোডাক্ট থাকলে সেগুলো productMap-এ
// পাওয়া যেত না, ফলে চুপচাপ বাদ পড়ে যেত (অথবা পুরো কার্টই অন্য কোম্পানির
// হলে "পণ্য পাওয়া যায়নি" এরর) — CheckoutSheet যা promise করত (কয়টা
// কোম্পানিতে ভাগ হবে), আসল সাবমিশন তা রাখত না।
//
// ব্যবসায়িক নিয়ম (নিশ্চিত করা হয়েছে): কাস্টমার অচেনা/অসংযুক্ত কোম্পানির
// প্রোডাক্টও কিনতে পারবে — কেনাকাটা আর "সংযুক্ত হওয়া" আলাদা জিনিস। সংযোগ
// (customer_company_connections, status='connected') শুধু request/accept
// বা SR-এর QR স্ক্যানেই হয় — এই ফাংশন কখনো সেটা তৈরি/পরিবর্তন করে না।
// তবে order_requests.customer_id-এর জন্য customers row লাগবেই (FK) —
// তাই না থাকলে একটা তৈরি হয় (is_verified=false, registration_source=
// 'marketplace' — acceptCompanyRequest-এর 'connection'+is_verified=true
// থেকে ইচ্ছাকৃতভাবে আলাদা, কারণ এখানে কোনো মিউচুয়াল সম্মতি নেই)।
const createOrderRequest = async (req, res) => {
    try {
        const { items, note, payment } = req.body;
        // ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং TrxID ভেরিফিকেশন)
        // payment = { method: 'cod' | 'bkash_manual' | 'nagad_manual',
        //             by_tenant: { [tenant_id]: { trx_id, sender_number } } }
        // method না দিলে (পুরনো ক্লায়েন্ট/ডিফল্ট) 'cod' ধরা হয়।
        const paymentMethod = payment?.method || 'cod';
        const paymentByTenant = payment?.by_tenant || {};

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি পণ্য সিলেক্ট করুন।' });
        }
        for (const item of items) {
            if (!item.product_id || !item.qty || item.qty <= 0) {
                return res.status(400).json({ success: false, message: 'পণ্যের পরিমাণ সঠিক নয়।' });
            }
        }

        const personId = await getPersonId(req.portalUser);

        // ✅ marketplace-wide — tenant_id দিয়ে ফিল্টার না করে সব কোম্পানির
        // প্রোডাক্ট থেকে খোঁজা হয়, তারপর প্রোডাক্টের নিজের tenant_id দিয়ে গ্রুপ
        const productIds = items.map(i => i.product_id);
        const prodResult = await query(
            `SELECT id, name, price, tenant_id FROM products WHERE id = ANY($1::uuid[]) AND is_active = true`,
            [productIds]
        );
        const productMap = {};
        prodResult.rows.forEach(p => { productMap[p.id] = p; });

        const groupsByTenant = {}; // tenant_id -> [{ item, product }]
        for (const item of items) {
            const prod = productMap[item.product_id];
            if (!prod) continue; // পাওয়া যায়নি/inactive — স্কিপ
            if (!groupsByTenant[prod.tenant_id]) groupsByTenant[prod.tenant_id] = [];
            groupsByTenant[prod.tenant_id].push({ item, product: prod });
        }
        const tenantIds = Object.keys(groupsByTenant);

        if (tenantIds.length === 0) {
            return res.status(400).json({ success: false, message: 'নির্বাচিত পণ্যগুলো পাওয়া যায়নি।' });
        }

        // ✅ NEW (ফেজ ৪) — মোবাইল ব্যাংকিং হলে প্রতিটা কোম্পানির জন্য
        // TrxID লাগবে (মাল্টি-ভেন্ডর কার্টে প্রতিটা কোম্পানির নম্বরে
        // আলাদা করে টাকা পাঠাতে হয়) + ডুপ্লিকেট TrxID প্রতিরোধ
        if (paymentMethod === 'bkash_manual' || paymentMethod === 'nagad_manual') {
            for (const tenantId of tenantIds) {
                const info = paymentByTenant[tenantId];
                if (!info || !info.trx_id || !info.trx_id.trim()) {
                    return res.status(400).json({ success: false, message: 'প্রতিটা কোম্পানির জন্য Transaction ID দিন।' });
                }
            }
            for (const tenantId of tenantIds) {
                const trxId = paymentByTenant[tenantId].trx_id.trim();
                const dup = await query(
                    `SELECT id FROM customer_order_requests WHERE tenant_id = $1 AND payment_trx_id = $2`,
                    [tenantId, trxId]
                );
                if (dup.rows.length > 0) {
                    return res.status(400).json({ success: false, message: `Transaction ID "${trxId}" আগেই ব্যবহার হয়েছে। সঠিক ID দিন।` });
                }
            }
        }

        // ── প্রতিটা কোম্পানির জন্য customer row resolve — reuse বা নতুন লাগবে
        // কিনা ঠিক করো (transaction-এর বাইরে; assertCustomerLimitAvailable
        // নিজেই soft/lock-ছাড়া চেক, acceptCompanyRequest-এও ঠিক এভাবেই
        // ব্যবহৃত হয়) ──
        const resolvedByTenant = {};
        for (const tenantId of tenantIds) {
            const existing = await query(
                `SELECT id, shop_name, owner_name, customer_code, route_id FROM customers
                 WHERE person_id = $1 AND tenant_id = $2 LIMIT 1`,
                [personId, tenantId]
            );
            if (existing.rows.length > 0) {
                resolvedByTenant[tenantId] = { isNew: false, customer: existing.rows[0] };
            } else {
                // নতুন customer row লাগবে — trial/plan সীমা এখানেই চেক (ছুড়তে
                // পারে CUSTOMER_LIMIT_REACHED, নিচের catch ব্লকে ধরা হয়)
                await assertCustomerLimitAvailable(tenantId);
                resolvedByTenant[tenantId] = { isNew: true, customer: null };
            }
        }

        // ── আসল সব INSERT একটা transaction-এ — একটা কোম্পানির অংশ ব্যর্থ
        // হলে বাকিগুলোও rollback হবে, "২টা কোম্পানিতে গেল, ৩য়টা চুপচাপ
        // বাদ" গোছের আধা-অবস্থা এড়াতে ──
        const createdRequests = await withTransaction(async (client) => {
            const cq = client.query.bind(client);
            const results = [];

            for (const tenantId of tenantIds) {
                let { isNew, customer } = resolvedByTenant[tenantId];

                if (isNew) {
                    const personRes = await cq(`SELECT * FROM persons WHERE id = $1`, [personId]);
                    const p = personRes.rows[0] || {};
                    const code = await generateCustomerCode(new Date());
                    const created = await cq(
                        `INSERT INTO customers
                            (customer_code, shop_name, owner_name, whatsapp, sms_phone, email,
                             created_by, tenant_id, person_id, registration_source, is_verified)
                         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, 'marketplace', false)
                         RETURNING id, shop_name, owner_name, customer_code, route_id`,
                        [code, p.full_name || 'নতুন কাস্টমার', p.full_name || 'নতুন কাস্টমার',
                         p.whatsapp || null, p.phone || null, p.email || null, tenantId, personId]
                    );
                    customer = created.rows[0];
                }

                const group = groupsByTenant[tenantId];
                const groupProductIds = group.map(g => g.product.id);

                const { prices: resolvedPrices } = await getResolvedPrices(cq, {
                    tenantId,
                    customerId: customer.id,
                    routeId:    customer.route_id,
                    channel:    'app_ecommerce',
                    productIds: groupProductIds
                });

                const enrichedItems = group.map(({ item, product }) => ({
                    product_id:   product.id,
                    product_name: product.name,
                    unit_price:   resolvedPrices[product.id] ?? parseFloat(product.price),
                    qty:          parseInt(item.qty),
                    item_note:    item.item_note || ''
                }));

                const pendingCheck = await cq(
                    `SELECT id FROM customer_order_requests WHERE customer_id = $1 AND status = 'pending' AND tenant_id = $2 LIMIT 1`,
                    [customer.id, tenantId]
                );

                // ✅ NEW (ফেজ ৪) — এই tenant-এর payment তথ্য
                const tenantPayment = paymentByTenant[tenantId] || {};
                const isMobileBanking = paymentMethod === 'bkash_manual' || paymentMethod === 'nagad_manual';

                const inserted = await cq(
                    `INSERT INTO customer_order_requests
                        (customer_id, items, note, status, tenant_id,
                         fulfillment_type, payment_status, payment_method,
                         payment_trx_id, payment_sender_number)
                     VALUES ($1, $2::jsonb, $3, 'pending', $4, $5, $6, $7, $8, $9)
                     RETURNING id, created_at`,
                    [
                        customer.id, JSON.stringify(enrichedItems), note || null, tenantId,
                        isMobileBanking ? 'online_payment' : 'order_request',
                        isMobileBanking ? 'pending_verification' : 'unpaid',
                        paymentMethod,
                        isMobileBanking ? tenantPayment.trx_id.trim() : null,
                        isMobileBanking ? (tenantPayment.sender_number || '').trim() || null : null,
                    ]
                );

                results.push({
                    request_id:         inserted.rows[0].id,
                    created_at:         inserted.rows[0].created_at,
                    tenant_id:          tenantId,
                    items_count:        enrichedItems.length,
                    has_pending_order:  pendingCheck.rows.length > 0,
                    customer_shop_name: customer.shop_name,
                    customer_code:      customer.customer_code,
                });
            }

            return results;
        });

        // ── Push notification — transaction-এর বাইরে, প্রতি কোম্পানি আলাদা
        // (আগের মতোই fire-and-forget, ব্যর্থ হলেও অর্ডার সেভ থাকে) ──
        for (const r of createdRequests) {
            try {
                const adminIds = await getAdminManagerIds(r.tenant_id);
                if (adminIds.length > 0) {
                    await sendPushToMany(adminIds, {
                        title: `🛒 নতুন অর্ডার রিকোয়েস্ট`,
                        body:  `${r.customer_shop_name} (${r.customer_code}) থেকে ${r.items_count}টি পণ্যের অর্ডার।`,
                        type:  'customer_order_request',
                        data:  { request_id: r.request_id }
                    });
                }
            } catch (pushErr) {
                logger.error('[OrderRequest] Push notification error:', pushErr.message);
            }
        }

        const anyPending = createdRequests.some(r => r.has_pending_order);
        const message = createdRequests.length > 1
            ? `✅ ${createdRequests.length}টি কোম্পানিতে ভাগ করে অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে।`
            : (anyPending
                ? '✅ অর্ডার পাঠানো হয়েছে। তবে আপনার আগের একটি অর্ডার এখনো pending আছে।'
                : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে।');

        return res.status(201).json({
            success: true,
            message,
            has_pending_order: anyPending,
            data: createdRequests.map(r => ({
                request_id:  r.request_id,
                created_at:  r.created_at,
                tenant_id:   r.tenant_id,
                items_count: r.items_count,
            })),
        });

    } catch (error) {
        if (error.code === 'CUSTOMER_LIMIT_REACHED') {
            return res.status(403).json({
                success: false,
                message: 'দুঃখিত, একটি কোম্পানি এই মুহূর্তে নতুন কাস্টমার নিচ্ছে না। বাকি প্রোডাক্টগুলো বাদ দিয়ে আবার চেষ্টা করুন।',
            });
        }
        if (error.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ createOrderRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'অর্ডার পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. কাস্টমার তার নিজের অর্ডার রিকোয়েস্ট লিস্ট দেখবে
// GET /api/portal/order-requests
// ============================================================
// ============================================================
// 2. কাস্টমার তার নিজের অর্ডার রিকোয়েস্ট লিস্ট দেখবে
// GET /api/portal/order-requests?page=1&limit=10&status=
//
// Query Params:
//   page   — page নম্বর (default: 1)
//   limit  — প্রতি পাতায় (default: 10, max: 50)
//   status — pending | confirmed | assigned | delivered | cancelled | all (default: all)
// ============================================================
const getMyOrderRequests = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        const status = req.query.status || 'all';

        const validStatuses = ['pending', 'confirmed', 'assigned', 'delivered', 'cancelled'];
        const statusFilter  = validStatuses.includes(status)
            ? `AND cor.status = $2`
            : '';  // 'all' বা অন্য কিছু → কোনো filter নেই

        const baseParams = validStatuses.includes(status)
            ? [customer_id, status]
            : [customer_id];

        const pLimit  = baseParams.length + 1;
        const pOffset = baseParams.length + 2;

        // মোট count — pagination metadata-র জন্য
        const countRes = await query(
            `SELECT COUNT(*) AS total
             FROM customer_order_requests cor
             WHERE cor.customer_id = $1 ${statusFilter}`,
            baseParams
        );
        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        const { rows } = await query(
            `SELECT
                cor.id, cor.items, cor.note, cor.status,
                cor.admin_note, cor.created_at, cor.updated_at,
                u.name_bn AS assigned_sr_name
             FROM customer_order_requests cor
             LEFT JOIN users u ON cor.assigned_to = u.id
             WHERE cor.customer_id = $1 ${statusFilter}
             ORDER BY cor.created_at DESC
             LIMIT $${pLimit} OFFSET $${pOffset}`,
            [...baseParams, limit, offset]
        );

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total,
                total_pages: totalPages,
                has_next:    page < totalPages,
                has_prev:    page > 1,
            },
        });

    } catch (error) {
        logger.error('❌ getMyOrderRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/connections/all-order-requests
// ✅ NEW (createOrderRequest মাল্টি-কোম্পানি ফিক্সের সাথের প্রয়োজনীয়
// সঙ্গী) — createOrderRequest এখন একাধিক কোম্পানিতে ভাগ করে অর্ডার
// রিকোয়েস্ট বানায়, কিন্তু getMyOrderRequests (উপরে) এখনো সেশনের এক
// কোম্পানিতে আটকে ছিল — মানে ৩-কোম্পানির অর্ডার সাবমিট করার পরও
// "আমার অর্ডার"-এ ১টাই দেখাত, বাকি ২টা ডেটাবেজে ঠিকই আছে কিন্তু চোখে
// পড়ত না। এটা getMyOrderRequests-এর হুবহু response shape রাখে (data
// row-এর ফিল্ড একই), শুধু person_id দিয়ে সব কোম্পানি জুড়ে + company
// ট্যাগ যোগ — যাতে ফ্রন্টএন্ডে আগের রেন্ডারিং লজিক প্রায় অপরিবর্তিত থাকে।
// query params: page, limit, status
// ============================================================
const getAllCompanyOrderRequests = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        const status = req.query.status || 'all';

        const validStatuses = ['pending', 'confirmed', 'assigned', 'delivered', 'cancelled'];
        const statusFilter  = validStatuses.includes(status) ? `AND cor.status = $2` : '';
        const baseParams    = validStatuses.includes(status) ? [personId, status] : [personId];
        const pLimit  = baseParams.length + 1;
        const pOffset = baseParams.length + 2;

        const countRes = await query(
            `SELECT COUNT(*) AS total
             FROM customer_order_requests cor
             JOIN customers c ON c.id = cor.customer_id
             WHERE c.person_id = $1 ${statusFilter}`,
            baseParams
        );
        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        const { rows } = await query(
            `SELECT
                cor.id, cor.items, cor.note, cor.status,
                cor.admin_note, cor.created_at, cor.updated_at,
                cor.fulfillment_type, cor.payment_status, cor.payment_method,
                u.name_bn AS assigned_sr_name,
                t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM customer_order_requests cor
             JOIN customers c ON c.id = cor.customer_id
             JOIN tenants t   ON t.id = cor.tenant_id
             LEFT JOIN users u ON cor.assigned_to = u.id
             WHERE c.person_id = $1 ${statusFilter}
             ORDER BY cor.created_at DESC
             LIMIT $${pLimit} OFFSET $${pOffset}`,
            [...baseParams, limit, offset]
        );

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                page, limit, total,
                total_pages: totalPages,
                has_next:    page < totalPages,
                has_prev:    page > 1,
            },
        });

    } catch (error) {
        if (error.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getAllCompanyOrderRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2b. কাস্টমার নিজের PENDING অর্ডার বাতিল করবে
// PATCH /api/portal/order-requests/:id/cancel
// portalAuth middleware দরকার
//
// নিয়ম:
//   - শুধু নিজের অর্ডার cancel করতে পারবে (customer_id match)
//   - শুধু 'pending' status-এ থাকলে cancel করা যাবে
//   - confirmed/assigned/delivered হলে SR-এর সাথে যোগাযোগ করতে হবে
// ============================================================
const cancelMyOrderRequest = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { id }    = req.params;

        // ✅ ফিক্স: আগে customer_id (সেশনের এক কোম্পানি) দিয়ে মালিকানা চেক
        // হতো — অ্যাগ্রিগেট অর্ডার-হিস্ট্রিতে অন্য কোম্পানির অর্ডার cancel
        // করতে গেলে "পাওয়া যায়নি" দেখাত। এখন person_id দিয়ে (যেকোনো
        // কোম্পানির নিজের অর্ডার) চেক হয়।
        const existing = await query(
            `SELECT cor.id, cor.status, cor.payment_status FROM customer_order_requests cor
             JOIN customers c ON c.id = cor.customer_id
             WHERE cor.id = $1 AND c.person_id = $2`,
            [id, personId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'অর্ডার পাওয়া যায়নি।'
            });
        }

        const order = existing.rows[0];

        // শুধু pending অর্ডার বাতিল করা যাবে
        if (order.status !== 'pending') {
            const statusBn = {
                confirmed: 'কনফার্ম',
                assigned:  'SR অ্যাসাইন',
                delivered: 'ডেলিভারি সম্পন্ন',
                cancelled: 'ইতোমধ্যে বাতিল',
            };
            return res.status(400).json({
                success: false,
                message: `এই অর্ডার "${statusBn[order.status] || order.status}" হয়ে গেছে। বাতিল করতে SR-এর সাথে যোগাযোগ করুন।`,
                error_code: 'ORDER_NOT_CANCELLABLE'
            });
        }

        // ✅ NEW (ফেজ ৪ — রিফান্ড ফ্লো): অর্ডার এখনো 'pending' থাকা অবস্থাতেই
        // মোবাইল ব্যাংকিং পেমেন্ট ভেরিফাই হয়ে যেতে পারে (admin দ্রুত চেক
        // করলে) — সেক্ষেত্রে বাতিল করলে টাকা ফেরত দেওয়া বাকি থাকে, তাই
        // payment_status='paid' হলে সাধারণ cancel না করে refund_pending-এ
        // পাঠানো হয় (Admin-এর "রিফান্ড বাকি" কিউতে দেখা যাবে)।
        const needsRefund = order.payment_status === 'paid';

        await query(
            `UPDATE customer_order_requests
             SET status = 'cancelled',
                 admin_note = 'কাস্টমার কর্তৃক বাতিল',
                 payment_status = CASE WHEN payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END,
                 updated_at = NOW()
             WHERE id = $1`,
            [id]
        );

        return res.status(200).json({
            success: true,
            message: needsRefund
                ? 'অর্ডার বাতিল করা হয়েছে। আপনার পেমেন্ট শীঘ্রই ফেরত দেওয়া হবে।'
                : 'অর্ডার বাতিল করা হয়েছে।'
        });

    } catch (error) {
        if (error.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ cancelMyOrderRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিল করতে সমস্যা হয়েছে।' });
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

        const conditions = [`cor.tenant_id = $1`];
        const params     = [req.tenantId];
        let   pIdx       = 2;

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
                cor.fulfillment_type, cor.payment_status, cor.payment_method,
                cor.payment_trx_id, cor.payment_sender_number,
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

        // ── N+1 Fix: সব order-এর সব product_id একসাথে collect করো ──────
        // আগে: প্রতিটি item-এর জন্য আলাদা query (50 orders × 5 items = 250 queries)
        // এখন: সব unique product_id → একটি WHERE id = ANY($1::uuid[]) query
        const allProductIds = [];
        const parsedRows = rows.map(row => {
            let items = row.items;
            if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
            if (!Array.isArray(items)) items = [];
            items.forEach(item => { if (item.product_id) allProductIds.push(item.product_id); });
            return { ...row, items };
        });

        // Unique product_id গুলো নিয়ে একটি batch query
        const productMap = {};
        if (allProductIds.length > 0) {
            const uniqueIds = [...new Set(allProductIds)];
            const prodRes = await query(
                `SELECT id, name, (stock - COALESCE(reserved_stock, 0)) AS available_stock
                 FROM products
                 WHERE id = ANY($1::uuid[])`,
                [uniqueIds]
            );
            prodRes.rows.forEach(p => { productMap[p.id] = p; });
        }

        // In-memory map থেকে প্রতিটি item enrich করো — আর কোনো DB call নেই
        const enriched = parsedRows.map(row => {
            const itemsWithStock = row.items.map(item => {
                const p         = productMap[item.product_id];
                const available = p ? parseInt(p.available_stock) : 0;
                return {
                    ...item,
                    product_name:    p?.name || item.product_name || 'অজানা পণ্য',
                    available_stock: available,
                    stock_ok:        available >= parseInt(item.qty || 1),
                };
            });
            const hasStockIssue = itemsWithStock.some(i => !i.stock_ok);
            return { ...row, items: itemsWithStock, has_stock_issue: hasStockIssue };
        });

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
        logger.error('\u274c getAllOrderRequests Error:', error.message);
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
        const { status, assigned_to, admin_note, payment_status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'assigned', 'delivered', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'অবৈধ স্ট্যাটাস।' });
        }
        // ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং TrxID ভেরিফিকেশন): Admin/SR
        // নিজের bKash/Nagad অ্যাপে TrxID মিলিয়ে এখান থেকে verify করবেন
        const validPaymentStatuses = ['unpaid', 'pending_verification', 'paid', 'failed', 'refund_pending', 'refunded'];
        if (payment_status && !validPaymentStatuses.includes(payment_status)) {
            return res.status(400).json({ success: false, message: 'অবৈধ পেমেন্ট স্ট্যাটাস।' });
        }

        // রিকোয়েস্ট আছে কিনা দেখো
        const existing = await query(
            `SELECT cor.id, cor.customer_id, cor.status, cor.payment_status,
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

            // ── status_history-এ নতুন entry append করো ────────
            // JSONB array-এ নতুন object push: { status, changed_at, changed_by }
            // এটা getOrderTracking()-এ timeline দেখাতে ব্যবহার হয়।
            // coalesce: column null হলে empty array দিয়ে শুরু করো।
            updates.push(`status_history = COALESCE(status_history, '[]'::jsonb) || $${paramIdx++}::jsonb`);
            values.push(JSON.stringify([{
                status,
                changed_at: new Date().toISOString(),
                changed_by: req.user?.id || null,
            }]));
        }
        if (assigned_to !== undefined) {
            updates.push(`assigned_to = $${paramIdx++}`);
            values.push(assigned_to || null);
        }
        if (admin_note !== undefined) {
            updates.push(`admin_note = $${paramIdx++}`);
            values.push(admin_note);
        }
        // ✅ NEW (ফেজ ৪)
        if (payment_status) {
            updates.push(`payment_status = $${paramIdx++}`);
            values.push(payment_status);
        }
        // ✅ NEW (ফেজ ৪ — রিফান্ড ফ্লো): Admin/SR যদি ইতিমধ্যে-পরিশোধিত
        // (payment_status='paid') অর্ডার বাতিল করে, আর এই একই রিকোয়েস্টে
        // payment_status স্পষ্টভাবে দেওয়া না থাকে — তাহলে স্বয়ংক্রিয়ভাবে
        // refund_pending-এ যাবে (cancelMyOrderRequest-এর ঠিক একই লজিক)
        if (status === 'cancelled' && request.payment_status === 'paid' && !payment_status) {
            updates.push(`payment_status = 'refund_pending'`);
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
                    `INSERT INTO customer_notifications (customer_id, title, body, type, tenant_id) VALUES ($1, $2, $3, 'order_request', $4)`,
                    [request.customer_id, notif.title, notif.body, req.tenantId]
                ).catch(e => logger.error('[OrderRequest] Customer notif DB error:', e.message));

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
        logger.error('❌ updateOrderRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 5. পোর্টালের জন্য পণ্য লিস্ট (public — শুধু active পণ্য)
// GET /api/portal/products?page=1&limit=30&search=
//
// Query Params:
//   page     — page নম্বর (default: 1)
//   limit    — প্রতি পাতায় পণ্য সংখ্যা (default: 30, max: 100)
//   search   — নাম দিয়ে ফিল্টার (optional, case-insensitive)
//   seller   — tenant_id দিয়ে ফিল্টার (optional)
//   category — category_id দিয়ে ফিল্টার (optional) ✅ FIX (ফেজ ০)
//   sort     — 'name' (ডিফল্ট) | 'newest' | 'bestseller' ✅ NEW (ফেজ ১)
//
// Response:
//   data — এই পাতার পণ্য তালিকা (price-enriched), প্রতিটায়:
//     base_price/final_price — এই কাস্টমারের জন্য রেজলভড দাম (VAT/Tax সহ)
//     list_price             — ডিফল্ট তালিকা-মূল্য (VAT/Tax সহ), তুলনার জন্য
//     has_special_price      — true হলে base_price < list_price (✅ ফেজ ০)
//   pagination — { page, limit, total, total_pages, has_next, has_prev }
// ============================================================
const getPortalProducts = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();
        // ✅ NEW (পার্ট ৩ — Shop কোম্পানি ফিল্টার): ?seller=<tenant_id>
        // দিলে শুধু সেই কোম্পানির প্রোডাক্ট দেখাবে। খালি থাকলে (ডিফল্ট)
        // আগের মতোই সব কোম্পানির প্রোডাক্ট (marketplace-wide)।
        const sellerId = (req.query.seller || '').trim();
        // ✅ FIX (ফেজ ০ — ক্যাটাগরি ফিল্টার বাগ): ?category=<category_id>
        // আগে এই প্যারামটা পড়াই হতো না, তাই ফ্রন্টএন্ডের চিপ কাজ করত না।
        // sellerId-এর মতোই প্যাটার্ন — খালি থাকলে সব ক্যাটাগরি দেখাবে।
        const categoryId = (req.query.category || '').trim();

        // ✅ CORRECTED (2 Aug 2026): আগে এখানে ভুলবশত কাস্টমারের নিজের
        // tenant_id দিয়ে ফিল্টার করা হয়েছিল, ধরে নিয়ে যে এটা single-company
        // storefront। কিন্তু এটা আসলে multi-vendor marketplace — একজন
        // customer একাধিক (এমনকি শত) company-র সাথে connected থাকতে পারে,
        // আর product browsing platform-wide open (connection ছাড়াও)।
        // এখন সব tenant-এর active product দেখানো হয়, company নাম-সহ।
        const custResult = await query(`SELECT route_id FROM customers WHERE id = $1`, [customer_id]);
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const { route_id: routeId } = custResult.rows[0];

        // ── কাউন্ট কুয়েরির params: search/seller যেটা আছে সেটাই যোগ হয় ──
        const countConds  = [];
        const countParams = [];
        if (search)     { countParams.push(`%${search}%`); countConds.push(`AND name ILIKE $${countParams.length}`); }
        if (sellerId)   { countParams.push(sellerId);       countConds.push(`AND tenant_id = $${countParams.length}`); }
        if (categoryId) { countParams.push(categoryId);     countConds.push(`AND category_id = $${countParams.length}`); }

        const countRes = await query(
            `SELECT COUNT(*) AS total
             FROM products
             WHERE is_active = true
               AND (stock - COALESCE(reserved_stock, 0)) > 0
               ${countConds.join(' ')}`,
            countParams
        );
        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // ── লিস্ট কুয়েরির params: limit, offset আগে, তারপর search/seller ──
        const listParams = [limit, offset];
        let listConds = '';
        if (search)     { listParams.push(`%${search}%`); listConds += ` AND p.name ILIKE $${listParams.length}`; }
        if (sellerId)   { listParams.push(sellerId);       listConds += ` AND p.tenant_id = $${listParams.length}`; }
        if (categoryId) { listParams.push(categoryId);     listConds += ` AND p.category_id = $${listParams.length}`; }

        // ✅ NEW (ফেজ ১ — বেস্টসেলার/নতুন রো): ?sort=name|newest|bestseller
        // ডিফল্ট 'name' — মূল গ্রিডের existing আচরণ অপরিবর্তিত থাকে।
        const sortMode = (req.query.sort || 'name').trim();
        let orderByClause  = 'p.name ASC';
        let bestsellerJoin = '';
        if (sortMode === 'newest') {
            orderByClause = 'p.created_at DESC';
        } else if (sortMode === 'bestseller') {
            bestsellerJoin = `LEFT JOIN (
                SELECT product_id, SUM(quantity) AS total_sold
                FROM sale_items
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY product_id
            ) sold ON sold.product_id = p.id`;
            orderByClause = 'COALESCE(sold.total_sold, 0) DESC, p.name ASC';
        }

        const { rows } = await query(
            `SELECT p.id, p.name, p.price, p.vat, p.tax, p.unit, p.description, p.image_url,
                    p.tenant_id,
                    t.company_name, t.company_name_bn, t.logo_url,
                    (p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock
             FROM products p
             JOIN tenants t ON t.id = p.tenant_id
             ${bestsellerJoin}
             WHERE p.is_active = true
               AND (p.stock - COALESCE(p.reserved_stock, 0)) > 0
               ${listConds}
             ORDER BY ${orderByClause}
             LIMIT $1 OFFSET $2`,
            listParams
        );

        // ─── Step ৫: মাল্টিপল প্রাইস লিস্ট — প্রতিটা tenant-এর নিজস্ব
        // price-list rule সেই tenant-এর প্রোডাক্টেই প্রযোজ্য, তাই tenant
        // অনুযায়ী group করে আলাদাভাবে resolve করা হচ্ছে।
        const byTenant = {};
        rows.forEach(p => { (byTenant[p.tenant_id] ??= []).push(p.id); });

        const resolvedPrices = {};
        await Promise.all(Object.entries(byTenant).map(async ([tId, productIds]) => {
            const { prices } = await getResolvedPrices(query, {
                tenantId: tId, customerId: customer_id, routeId, channel: 'app_ecommerce', productIds
            });
            Object.assign(resolvedPrices, prices);
        }));

        // কাস্টমার যা দেবে সেটা final_price (VAT + Tax সহ)
        const { calcFinalPrice } = require('../services/price.utils');
        const enriched = rows.map(p => {
            const listPrice = parseFloat(p.price); // tenant-এর ডিফল্ট/তালিকা মূল্য (price_list রেজোলিউশনের আগে)
            const basePrice = resolvedPrices[p.id] ?? listPrice;
            const { vatAmount, taxAmount, finalPrice } = calcFinalPrice(basePrice, p.vat, p.tax);
            // ✅ NEW (ফেজ ০ — "বিশেষ মূল্য" ব্যাজ): এই কাস্টমার/রুটের জন্য
            // price_list resolve করে যদি ডিফল্ট list price-এর চেয়ে কম আসে,
            // সেটাই "আপনার জন্য বিশেষ মূল্য"।
            const { finalPrice: listFinalPrice } = calcFinalPrice(listPrice, p.vat, p.tax);
            return {
                id:                p.id,
                name:              p.name,
                unit:              p.unit,
                description:       p.description,
                image_url:         p.image_url,
                available_stock:   p.available_stock,
                tenant_id:         p.tenant_id,
                company_name:      p.company_name,
                company_name_bn:   p.company_name_bn,
                logo_url:          p.logo_url,
                base_price:        basePrice,
                vat_amount:        vatAmount,
                tax_amount:        taxAmount,
                final_price:       finalPrice,
                has_extra:         vatAmount > 0 || taxAmount > 0,
                list_price:        listFinalPrice,
                has_special_price: basePrice < listPrice,
            };
        });

        return res.status(200).json({
            success: true,
            data: enriched,
            pagination: {
                page,
                limit,
                total,
                total_pages: totalPages,
                has_next:    page < totalPages,
                has_prev:    page > 1,
            },
        });

    } catch (error) {
        logger.error('❌ getPortalProducts Error:', error.message);
        return res.status(500).json({ success: false, message: 'পণ্য তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/categories
// ✅ FIX (ফেজ ০ — ক্যাটাগরি ফিল্টার বাগ): এই রুটটাই আগে ব্যাকএন্ডে
// ছিল না (শুধু /api/categories ছিল, admin auth দিয়ে, portalAuth দিয়ে
// না) — তাই ফ্রন্টএন্ডের চিপ রো silent fail হয়ে কখনো দেখাই যেত না।
//
// getProductSellers-এর মতোই marketplace-wide: যেসব ক্যাটাগরিতে
// অন্তত ১টা active/in-stock প্রোডাক্ট আছে, শুধু তাদের ছোট তালিকা
// (customer কোন কোম্পানির সাথে connected তা দিয়ে ফিল্টার হয় না)।
// ============================================================
const getPortalCategories = async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT DISTINCT c.id, c.name, c.name_bn
             FROM product_categories c
             JOIN products p ON p.category_id = c.id
             WHERE p.is_active = true
               AND (p.stock - COALESCE(p.reserved_stock, 0)) > 0
             ORDER BY c.name ASC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('❌ getPortalCategories Error:', error.message);
        res.status(500).json({ success: false, message: 'ক্যাটাগরি তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/payment-info?tenant_ids=id1,id2
// ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং TrxID ভেরিফিকেশন)
// চেকআউটে প্রতিটা বিক্রেতা-গ্রুপের bKash/Nagad নম্বর দেখানোর জন্য —
// system_settings-এ tenant admin যা সেভ করেছেন (Settings পেজ থেকে)
// সেটাই রিড করে। খালি স্ট্রিং থাকলে (এখনো সেটআপ করেনি) সেই তথ্য
// বাদ দেওয়া হয় — ফ্রন্টএন্ড তখন সেই কোম্পানির জন্য মোবাইল ব্যাংকিং
// অপশন লুকিয়ে রাখবে।
// ============================================================
const getTenantPaymentInfo = async (req, res) => {
    try {
        const tenantIds = (req.query.tenant_ids || '').split(',').map(s => s.trim()).filter(Boolean);
        if (tenantIds.length === 0) {
            return res.json({ success: true, data: {} });
        }
        const result = await query(
            `SELECT tenant_id, key, value FROM system_settings
             WHERE tenant_id = ANY($1::uuid[]) AND key IN ('bkash_number', 'nagad_number')`,
            [tenantIds]
        );
        const byTenant = {};
        result.rows.forEach(r => {
            if (!r.value) return; // খালি মানে সেটআপ করেনি
            byTenant[r.tenant_id] ??= {};
            byTenant[r.tenant_id][r.key] = r.value;
        });
        return res.json({ success: true, data: byTenant });
    } catch (error) {
        logger.error('❌ getTenantPaymentInfo Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/products/:id/related
// ✅ NEW (ফেজ ২ — রিলেটেড/ক্রস-সেল প্রোডাক্ট)
// প্রথমে একই ক্যাটাগরির প্রোডাক্ট, তারপর একই বিক্রেতার প্রোডাক্ট দিয়ে
// পূরণ। enrichment ঠিক getPortalProducts-এর মতোই, তাই ফ্রন্টএন্ডে
// একই ProductCard সরাসরি রিইউজ করা যায়।
// ============================================================
const getRelatedProducts = async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_id } = req.portalUser;

        const custResult = await query(`SELECT route_id FROM customers WHERE id = $1`, [customer_id]);
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const { route_id: routeId } = custResult.rows[0];

        const baseRes = await query(`SELECT category_id, tenant_id FROM products WHERE id = $1`, [id]);
        if (baseRes.rows.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const { category_id: categoryId, tenant_id: tenantId } = baseRes.rows[0];

        const { rows } = await query(
            `SELECT p.id, p.name, p.price, p.vat, p.tax, p.unit, p.image_url,
                    p.tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    (p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock,
                    (p.category_id = $2) AS same_category
             FROM products p
             JOIN tenants t ON t.id = p.tenant_id
             WHERE p.is_active = true
               AND p.id != $1
               AND (p.stock - COALESCE(p.reserved_stock, 0)) > 0
               AND (p.category_id = $2 OR p.tenant_id = $3)
             ORDER BY same_category DESC, p.name ASC
             LIMIT 8`,
            [id, categoryId, tenantId]
        );

        if (rows.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const byTenant = {};
        rows.forEach(p => { (byTenant[p.tenant_id] ??= []).push(p); });

        const priceMaps = {};
        await Promise.all(Object.keys(byTenant).map(async (tId) => {
            const { prices } = await getResolvedPrices(query, {
                tenantId: tId, customerId: customer_id, routeId, channel: 'app_ecommerce',
                productIds: byTenant[tId].map(p => p.id),
            });
            priceMaps[tId] = prices;
        }));

        const { calcFinalPrice } = require('../services/price.utils');
        const enriched = rows.map(p => {
            const listPrice = parseFloat(p.price);
            const basePrice = priceMaps[p.tenant_id]?.[p.id] ?? listPrice;
            const { vatAmount, taxAmount, finalPrice } = calcFinalPrice(basePrice, p.vat, p.tax);
            const { finalPrice: listFinalPrice } = calcFinalPrice(listPrice, p.vat, p.tax);
            return {
                id:                p.id,
                name:              p.name,
                unit:              p.unit,
                image_url:         p.image_url,
                available_stock:   p.available_stock,
                tenant_id:         p.tenant_id,
                company_name:      p.company_name,
                company_name_bn:   p.company_name_bn,
                logo_url:          p.logo_url,
                base_price:        basePrice,
                vat_amount:        vatAmount,
                tax_amount:        taxAmount,
                final_price:       finalPrice,
                has_extra:         vatAmount > 0 || taxAmount > 0,
                list_price:        listFinalPrice,
                has_special_price: basePrice < listPrice,
            };
        });

        return res.json({ success: true, data: enriched });

    } catch (error) {
        logger.error('❌ getRelatedProducts Error:', error.message);
        return res.status(500).json({ success: false, message: 'সংশ্লিষ্ট পণ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/product-sellers
// ✅ NEW (পার্ট ৩ — Shop কোম্পানি ফিল্টার)
// Shop-এ যেসব কোম্পানির অন্তত ১টা active/in-stock প্রোডাক্ট আছে,
// তাদের ছোট তালিকা (id + নাম + লোগো) — ফিল্টার চিপ বসানোর জন্য।
// getPortalProducts-এর মতোই marketplace-wide (customer কোন কোম্পানির
// সাথে connected তা দিয়ে ফিল্টার হয় না — connection ছাড়াও ব্রাউজ করা যায়)।
// ============================================================
const getProductSellers = async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT DISTINCT t.id AS tenant_id, t.company_name, t.company_name_bn, t.logo_url
             FROM products p
             JOIN tenants t ON t.id = p.tenant_id
             WHERE p.is_active = true
               AND (p.stock - COALESCE(p.reserved_stock, 0)) > 0
             ORDER BY t.company_name ASC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('❌ getProductSellers Error:', error.message);
        res.status(500).json({ success: false, message: 'বিক্রেতা তালিকা আনতে সমস্যা হয়েছে।' });
    }
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
            `SELECT cor.id, cor.tenant_id, c.shop_name, c.customer_code
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
            `SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND tenant_id = $1`,
            [order.tenant_id]
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
                `INSERT INTO notifications (user_id, title, body, type, reference_id, tenant_id) VALUES ($1, $2, $3, 'stock_warning', $4, $5)
                 ON CONFLICT DO NOTHING`,
                [adminId, title, body, id, order.tenant_id]
            ).catch(() => {}); // notifications table না থাকলেও চলবে
        }

        // ✅ FIX: sendPushToMany() চায় userIds (int[]), tokens নয়।
        // আগে fcm_token গুলো আলাদা query করে tokens array পাঠানো হচ্ছিল —
        // কিন্তু sendPushToMany() নিজেই ভেতরে getFCMTokens(userIds) call করে।
        // তাই সরাসরি adminIds পাঠাও; duplicate query ও বাদ যায়।
        await sendPushToMany(adminIds, { title, body, type: 'stock_warning' }).catch(() => {});

        return res.status(200).json({ success: true, message: 'Admin কে সতর্কতা পাঠানো হয়েছে।' });

    } catch (error) {
        logger.error('❌ notifyAdminStockWarning Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};


// ============================================================
// 6. কাস্টমার একটি নির্দিষ্ট অর্ডারের রিয়েলটাইম ট্র্যাকিং দেখবে
// GET /api/portal/order-requests/:id/tracking
// portalAuth middleware দরকার
//
// Response:
//   current_status  — বর্তমান অবস্থা
//   status_history  — কখন কোন status হয়েছিল (timeline)
//   assigned_sr     — কোন SR দায়িত্বে আছে (নাম + ফোন)
//   estimated_info  — admin_note থেকে delivery সংক্রান্ত তথ্য
//   items           — অর্ডারের পণ্যসমূহ
//
// কেন status_history JSON column?
//   customer_order_requests table-এ আলাদা history table নেই।
//   status পরিবর্তনের সময় status_history JSONB column-এ append করা হয়।
//   updateOrderRequest() এই column আপডেট করে।
//   মাইগ্রেশন: migration_new_features.sql-এ নিচে যোগ করা হয়েছে।
// ============================================================

// Status বাংলা label map — getOrderTracking ও updateOrderRequest দুজায়গায় ব্যবহার হয়
// const দিয়ে define, তাই getOrderTracking-এর আগে রাখা জরুরি
const STATUS_LABELS = {
    pending:   'অপেক্ষমাণ',
    confirmed: 'কনফার্ম হয়েছে',
    assigned:  'SR রওনা দিয়েছে',
    delivered: 'ডেলিভারি সম্পন্ন',
    cancelled: 'বাতিল',
};

const getOrderTracking = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { id }          = req.params;

        const result = await query(
            `SELECT
                cor.id, cor.status, cor.items, cor.note, cor.admin_note,
                cor.status_history,
                cor.created_at, cor.updated_at,
                u.name_bn  AS sr_name,
                u.phone    AS sr_phone
             FROM customer_order_requests cor
             LEFT JOIN users u ON cor.assigned_to = u.id
             WHERE cor.id = $1 AND cor.customer_id = $2`,
            [id, customer_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'অর্ডার পাওয়া যায়নি।'
            });
        }

        const order = result.rows[0];

        // ── Status pipeline — সব ধাপ ও বর্তমান অবস্থান ─────
        // Frontend এটা দিয়ে progress bar বানাতে পারবে।
        // cancelled হলে pipeline ভিন্ন।
        const pipeline = ['pending', 'confirmed', 'assigned', 'delivered'];
        const currentIdx = pipeline.indexOf(order.status);

        const steps = pipeline.map((step, idx) => {
            // status_history-তে এই step-এর timestamp খোঁজো
            let completedAt = null;
            if (Array.isArray(order.status_history)) {
                const found = order.status_history.find(h => h.status === step);
                if (found) completedAt = found.changed_at;
            }
            // pending step সবসময় created_at-এ হয়
            if (step === 'pending' && !completedAt) completedAt = order.created_at;

            return {
                step,
                label:        STATUS_LABELS[step] || step,
                completed:    order.status === 'cancelled' ? false : idx <= currentIdx,
                active:       order.status !== 'cancelled' && idx === currentIdx,
                completed_at: completedAt,
            };
        });

        // items parse (JSONB হলে already object, string হলে parse করো)
        let items = order.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }

        return res.status(200).json({
            success: true,
            data: {
                order_id:       order.id,
                current_status: order.status,
                is_cancelled:   order.status === 'cancelled',
                created_at:     order.created_at,
                updated_at:     order.updated_at,
                note:           order.note,
                admin_note:     order.admin_note,
                steps,
                assigned_sr: order.sr_name ? {
                    name:  order.sr_name,
                    phone: order.sr_phone,
                } : null,
                items,
            }
        });

    } catch (error) {
        logger.error('❌ getOrderTracking Error:', error.message);
        return res.status(500).json({ success: false, message: 'ট্র্যাকিং তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 7. কাস্টমার পণ্য ফেরতের অনুরোধ করবে
// POST /api/portal/return-request
// portalAuth middleware দরকার
//
// Body:
//   invoice_number  — কোন ইনভয়েসের পণ্য ফেরত দিতে চায়
//   items           — [{ product_id, product_name, qty, reason }]
//   note            — অতিরিক্ত বিবরণ (optional)
//
// নিয়ম:
//   - ইনভয়েস এই কাস্টমারের হতে হবে
//   - ইনভয়েস delivered/completed হতে হবে (otp_verified বা otp_skipped)
//   - একই ইনভয়েসে duplicate pending return request থাকলে block করবে
//   - Admin/Manager কে push notification যাবে
//
// DB: customer_return_requests table (মাইগ্রেশনে নিচে যোগ)
// ============================================================
const createReturnRequest = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { invoice_number, note } = req.body;
        let { items } = req.body;

        // ⚠️ BUG FIX: portalAuth রুটে req.tenantId সেট হয় না (একই কারণ যা
        // createOrderRequest-এ ছিল) — customer_return_requests.tenant_id
        // NOT NULL হওয়ায় এই INSERT আগে সবসময় fail করত।
        const custTenantResult = await query(`SELECT tenant_id FROM customers WHERE id = $1`, [customer_id]);
        if (custTenantResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const requestTenantId = custTenantResult.rows[0].tenant_id;

        // type: 'return' (বিক্রি হয়নি) অথবা 'replacement' (warranty-তে নষ্ট)
        const VALID_TYPES = ['return', 'replacement'];
        const type = VALID_TYPES.includes(req.body.type) ? req.body.type : 'return';

        // ── Validation ────────────────────────────────────────
        if (!invoice_number || !invoice_number.trim()) {
            return res.status(400).json({ success: false, message: 'ইনভয়েস নম্বর দিন।' });
        }
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি পণ্য সিলেক্ট করুন।' });
        }
        for (const item of items) {
            if (!item.product_name || !item.qty || parseInt(item.qty) <= 0) {
                return res.status(400).json({ success: false, message: 'পণ্যের তথ্য সঠিক নয়।' });
            }
            if (!item.reason || !item.reason.trim()) {
                return res.status(400).json({ success: false, message: 'প্রতিটি পণ্যের কারণ দিন।' });
            }
        }

        // ── ইনভয়েস যাচাই ────────────────────────────────────
        const invoiceCheck = await query(
            `SELECT invoice_number, net_amount, created_at
             FROM sales_transactions
             WHERE invoice_number = $1
               AND customer_id = $2
               AND (otp_verified = true OR otp_skipped = true)`,
            [invoice_number.trim(), customer_id]
        );
        if (invoiceCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'এই ইনভয়েস পাওয়া যায়নি বা এটি আপনার নয়।'
            });
        }

        // ── Duplicate check — একই invoice + type pending নেই? ─
        const dupCheck = await query(
            `SELECT id FROM customer_return_requests
             WHERE customer_id = $1
               AND invoice_number = $2
               AND type = $3
               AND status = 'pending'`,
            [customer_id, invoice_number.trim(), type]
        );
        if (dupCheck.rows.length > 0) {
            const typeBn = type === 'replacement' ? 'রিপ্লেসমেন্ট' : 'ফেরত';
            return res.status(400).json({
                success: false,
                message: `এই ইনভয়েসে ইতোমধ্যে একটি ${typeBn} অনুরোধ প্রক্রিয়াধীন আছে।`,
                error_code: 'DUPLICATE_RETURN_REQUEST'
            });
        }

        // ── product_id থাকলে DB থেকে মূল্য নিয়ে subtotal হিসাব ─
        const productIds = [...new Set(
            items.map(i => i.product_id).filter(Boolean)
        )];
        const productMap = {};
        if (productIds.length > 0) {
            const pRes = await query(
                `SELECT id, price, vat, tax, unit FROM products
                 WHERE id = ANY($1) AND is_active = true`,
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
                unitPrice  = parseFloat((base + base*vat/100 + base*tax/100).toFixed(2));
                subtotal   = parseFloat((unitPrice * parseInt(item.qty)).toFixed(2));
                totalReturnValue += subtotal;
            }
            return {
                product_id:   item.product_id   || null,
                product_name: item.product_name,
                qty:          parseInt(item.qty),
                unit_price:   unitPrice,
                subtotal,
                reason:       item.reason.trim(),
            };
        });

        // ── DB-তে সেভ ─────────────────────────────────────────
        const result = await query(
            `INSERT INTO customer_return_requests (customer_id, invoice_number, type, items, total_return_value, note, status, tenant_id) VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'pending', $7)
             RETURNING id, created_at`,
            [
                customer_id, invoice_number.trim(), type,
                JSON.stringify(sanitizedItems),
                parseFloat(totalReturnValue.toFixed(2)),
                note || null, requestTenantId]
        );
        const newRequest = result.rows[0];

        // ── Admin/Manager-কে push notification ────────────────
        try {
            const custRes = await query(
                `SELECT shop_name, customer_code FROM customers WHERE id = $1`,
                [customer_id]
            );
            const customer = custRes.rows[0] || {};
            const adminIds = await getAdminManagerIds(requestTenantId);
            if (adminIds.length > 0) {
                await sendPushToMany(adminIds, {
                    title: type === 'replacement' ? `🔄 রিপ্লেসমেন্ট অনুরোধ` : `↩️ পণ্য ফেরতের অনুরোধ`,
                    body:  `${customer.shop_name || ''} (${customer.customer_code || ''}) — ইনভয়েস: ${invoice_number}, ${sanitizedItems.length}টি পণ্য।`,
                    type:  'return_request',
                    data:  { return_request_id: newRequest.id },
                });
            }
        } catch (pushErr) {
            logger.error('[ReturnRequest] Push error:', pushErr.message);
        }

        const typeBn = type === 'replacement' ? 'রিপ্লেসমেন্ট' : 'ফেরত';
        return res.status(201).json({
            success: true,
            message: `${typeBn} অনুরোধ পাঠানো হয়েছে। শীঘ্রই SR যোগাযোগ করবে।`,
            data: {
                return_request_id:  newRequest.id,
                created_at:         newRequest.created_at,
                invoice_number,
                type,
                items_count:        sanitizedItems.length,
                total_return_value: parseFloat(totalReturnValue.toFixed(2)),
            }
        });

    } catch (error) {
        logger.error('❌ createReturnRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুরোধ পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 8. কাস্টমার তার ফেরতের অনুরোধ লিস্ট দেখবে
// GET /api/portal/return-requests?page=1&status=all
// portalAuth middleware দরকার
// ============================================================
const getMyReturnRequests = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;
        const status = req.query.status || 'all';

        const validStatuses = ['pending', 'approved', 'rejected', 'completed'];
        const statusFilter  = validStatuses.includes(status) ? `AND status = $2` : '';
        const baseParams    = validStatuses.includes(status) ? [customer_id, status] : [customer_id];

        const pLimit  = baseParams.length + 1;
        const pOffset = baseParams.length + 2;

        const { rows } = await query(
            `SELECT id, invoice_number, type, items, total_return_value,
                    note, status, admin_note,
                    exchange_items, total_exchange_value,
                    created_at, updated_at, reviewed_at, completed_at
             FROM customer_return_requests
             WHERE customer_id = $1 ${statusFilter}
             ORDER BY created_at DESC
             LIMIT $${pLimit} OFFSET $${pOffset}`,
            [...baseParams, limit, offset]
        );

        const countRes = await query(
            `SELECT COUNT(*) AS total FROM customer_return_requests
             WHERE customer_id = $1 ${statusFilter}`,
            baseParams
        );
        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // Status বাংলায় দেখাও
        const STATUS_BN = {
            pending:   'অপেক্ষমাণ',
            approved:  'অনুমোদিত',
            rejected:  'প্রত্যাখ্যাত',
            completed: 'সম্পন্ন',
        };
        const TYPE_BN = { return: 'পণ্য ফেরত', replacement: 'রিপ্লেসমেন্ট' };
        const enriched = rows.map(r => ({
            ...r,
            status_bn:    STATUS_BN[r.status] || r.status,
            type_bn:      TYPE_BN[r.type]     || r.type,
            extra_credit: r.total_exchange_value && r.total_return_value
                ? Math.max(0, parseFloat(r.total_exchange_value) - parseFloat(r.total_return_value))
                : 0,
        }));

        return res.status(200).json({
            success: true,
            data:    enriched,
            pagination: { page, limit, total, totalPages },
        });

    } catch (error) {
        logger.error('❌ getMyReturnRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 9. পোর্টালে একটি পণ্যের বিস্তারিত তথ্য + ছবি
// GET /api/portal/products/:id
// portalAuth middleware দরকার
//
// getPortalProducts()-এ list-এ image_url ও description আছে,
// কিন্তু কাস্টমার একটি পণ্যে ক্লিক করলে আরো বিস্তারিত দেখাবে:
//   - সম্পূর্ণ description
//   - price breakdown (base + vat + tax = final)
//   - available stock
//   - unit (পিস/কেজি/বাক্স ইত্যাদি)
// ============================================================
const getPortalProductDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_id } = req.portalUser;

        // ✅ CORRECTED (2 Aug 2026): একই কারণে — marketplace-এ যেকোনো
        // company-র product দেখা যাবে, শুধু নিজের tenant-এর না।
        const custResult = await query(`SELECT route_id FROM customers WHERE id = $1`, [customer_id]);
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const { route_id: routeId } = custResult.rows[0];

        const { rows } = await query(
            `SELECT p.id, p.name, p.price, p.vat, p.tax, p.unit, p.description, p.image_url,
                    p.tenant_id, t.company_name,
                    (p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock
             FROM products p
             JOIN tenants t ON t.id = p.tenant_id
             WHERE p.id = $1::uuid
               AND p.is_active = true`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }

        const p = rows[0];

        // ─── Step ৫: মাল্টিপল প্রাইস লিস্ট — এই product যে tenant-এর, সেই
        // tenant-এর নিজস্ব price-list rule অনুযায়ী resolve হবে ───
        const { prices: resolvedPrices } = await getResolvedPrices(query, {
            tenantId: p.tenant_id, customerId: customer_id, routeId, channel: 'app_ecommerce', productIds: [p.id]
        });
        const listPrice = parseFloat(p.price);
        const basePrice = resolvedPrices[p.id] ?? listPrice;

        // ── Price breakdown ───────────────────────────────────
        const { calcFinalPrice } = require('../services/price.utils');
        const { vatAmount, taxAmount, finalPrice } = calcFinalPrice(basePrice, p.vat, p.tax);
        // ✅ NEW (ফেজ ০) — getPortalProducts-এর মতোই "বিশেষ মূল্য" তথ্য
        const { finalPrice: listFinalPrice } = calcFinalPrice(listPrice, p.vat, p.tax);

        // ✅ NEW (ফেজ ২ — মাল্টি-ইমেজ গ্যালারি): cover ছবি (image_url) +
        // product_images টেবিলের সব ছবি, sort_order অনুযায়ী
        const galleryRes = await query(
            `SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [id]
        );
        const gallery = [p.image_url, ...galleryRes.rows.map(r => r.image_url)].filter(Boolean);

        return res.status(200).json({
            success: true,
            data: {
                id:              p.id,
                name:            p.name,
                unit:            p.unit,
                description:     p.description || '',
                image_url:       p.image_url   || null,
                gallery,         // ✅ NEW (ফেজ ২)
                tenant_id:       p.tenant_id,
                company_name:    p.company_name,
                available_stock: parseInt(p.available_stock),
                in_stock:        parseInt(p.available_stock) > 0,
                // Price breakdown — কাস্টমার দেখতে পাবে কোথায় কত যাচ্ছে
                pricing: {
                    base_price:        basePrice,
                    vat_amount:        vatAmount,
                    tax_amount:        taxAmount,
                    final_price:       finalPrice,
                    has_extra:         vatAmount > 0 || taxAmount > 0,
                    list_price:        listFinalPrice,
                    has_special_price: basePrice < listPrice,
                },
            }
        });

    } catch (error) {
        logger.error('❌ getPortalProductDetail Error:', error.message);
        return res.status(500).json({ success: false, message: 'পণ্যের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createOrderRequest,
    getMyOrderRequests,
    getAllCompanyOrderRequests,
    cancelMyOrderRequest,
    getAllOrderRequests,
    updateOrderRequest,
    notifyAdminStockWarning,
    getPortalProducts,
    getPortalCategories,   // ✅ NEW (ফেজ ০)
    getTenantPaymentInfo,  // ✅ NEW (ফেজ ৪)
    getProductSellers,
    getPortalProductDetail,
    getRelatedProducts,    // ✅ NEW (ফেজ ২)
    getOrderTracking,
    createReturnRequest,
    getMyReturnRequests,
};
