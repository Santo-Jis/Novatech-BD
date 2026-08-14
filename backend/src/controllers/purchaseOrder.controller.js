const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// ============================================================
// ধাপ ৩: Purchase Order — লাইফসাইকেল
//
//   draft ── place-order ──> ordered ── receive ──> partial ── receive ──> received
//     │                          │
//     └──────── cancel ──────────┘   (draft/ordered অবস্থায় বাতিল করা যায়, partial/received-এ না)
//     └──────── delete (শুধু draft) ──> মুছে ফেলা
//
// মাল গ্রহণের সময়:
//   ১. purchase_order_items.quantity_received বাড়ে
//   ২. products.stock বাড়ে
//   ৩. products.cost_price ওয়েটেড এভারেজ দিয়ে রিক্যালকুলেট হয়
//      new_cost = (old_stock*old_cost + received_qty*unit_cost) / (old_stock+received_qty)
//   ৪. stock_movements-এ লগ হয় (reference_type='purchase', reference_id=PO id)
// ============================================================

// PO নাম্বার: PO-YYYYMM-XXXX (প্রতি মাসে ০০০১ থেকে শুরু, প্রতি tenant আলাদা)
const generatePoNumber = async (tenantId) => {
    const now    = new Date();
    const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const result = await query(
        `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE tenant_id = $1 AND po_number LIKE $2`,
        [tenantId, `${prefix}-%`]
    );
    const seq = parseInt(result.rows[0].cnt, 10) + 1;
    return `${prefix}-${String(seq).padStart(4, '0')}`;
};

// ============================================================
// GET PURCHASE ORDERS (তালিকা)
// GET /api/purchase-orders?status=&supplier_id=&search=&page=&limit=
// ============================================================
const getPurchaseOrders = async (req, res) => {
    try {
        const { status, supplier_id, search, page = 1, limit = 30 } = req.query;

        const conditions = [`po.tenant_id = $1`];
        const params      = [req.tenantId];
        let paramCount    = 1;

        if (status) {
            paramCount++;
            conditions.push(`po.status = $${paramCount}`);
            params.push(status);
        }
        if (supplier_id) {
            paramCount++;
            conditions.push(`po.supplier_id = $${paramCount}`);
            params.push(supplier_id);
        }
        if (search) {
            paramCount++;
            conditions.push(`(po.po_number ILIKE $${paramCount} OR s.name ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        const limitNum  = Math.min(parseInt(limit, 10) || 30, 100);
        const offsetNum = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limitNum;

        const result = await query(
            `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name,
                    (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS item_count
             FROM purchase_orders po
             JOIN suppliers s ON s.id = po.supplier_id
             LEFT JOIN warehouses w ON w.id = po.warehouse_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY po.created_at DESC
             LIMIT ${limitNum} OFFSET ${offsetNum}`,
            params
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE ${conditions.join(' AND ')}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page, 10) || 1,
                limit: limitNum,
                total: parseInt(countResult.rows[0].count, 10)
            }
        });
    } catch (error) {
        logger.error('❌ Get Purchase Orders Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE PURCHASE ORDER (বিস্তারিত + আইটেম)
// GET /api/purchase-orders/:id
// ============================================================
const getPurchaseOrder = async (req, res) => {
    try {
        const poResult = await query(
            `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone, u.name_bn AS created_by_name,
                    w.name AS warehouse_name
             FROM purchase_orders po
             JOIN suppliers s ON s.id = po.supplier_id
             LEFT JOIN users u ON u.id = po.created_by
             LEFT JOIN warehouses w ON w.id = po.warehouse_id
             WHERE po.id = $1 AND po.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );

        if (poResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }

        const itemsResult = await query(
            `SELECT poi.*, p.name AS product_name, p.sku, p.unit
             FROM purchase_order_items poi
             JOIN products p ON p.id = poi.product_id
             WHERE poi.purchase_order_id = $1
             ORDER BY p.name ASC`,
            [req.params.id]
        );

        return res.status(200).json({
            success: true,
            data: { ...poResult.rows[0], items: itemsResult.rows }
        });
    } catch (error) {
        logger.error('❌ Get Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE PURCHASE ORDER (ড্রাফট হিসেবে তৈরি হয়)
// POST /api/purchase-orders
// body: { supplier_id, order_date, expected_date, notes, items: [{ product_id, quantity_ordered, unit_cost }] }
// ============================================================
const ALLOWED_CURRENCIES = ['BDT', 'USD', 'EUR', 'CNY', 'INR', 'GBP', 'OTHER'];
const ALLOWED_ALLOCATION_METHODS = ['value', 'quantity', 'equal'];

const createPurchaseOrder = async (req, res) => {
    try {
        const { supplier_id, order_date, expected_date, notes, items, currency, exchange_rate, cost_allocation_method } = req.body;
        let { warehouse_id } = req.body;

        if (!supplier_id) {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ার বাছাই করুন।' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটি পণ্য যোগ করুন।' });
        }

        // মুদ্রা — বিদেশি হলে exchange_rate বাধ্যতামূলক (PO-র unit_cost সবসময় BDT-তে থাকে,
        // এটা শুধু "কত বিদেশি মুদ্রায় কেনা হয়েছিল" রেফারেন্সের জন্য)
        const poCurrency = ALLOWED_CURRENCIES.includes(currency) ? currency : 'BDT';
        const poRate = poCurrency === 'BDT' ? 1 : parseFloat(exchange_rate);
        if (poCurrency !== 'BDT' && (!poRate || poRate <= 0)) {
            return res.status(400).json({ success: false, message: 'বিদেশি মুদ্রার জন্য সঠিক এক্সচেঞ্জ রেট দিন।' });
        }
        const allocMethod = ALLOWED_ALLOCATION_METHODS.includes(cost_allocation_method) ? cost_allocation_method : 'value';

        // সাপ্লায়ার এই tenant-এর কিনা যাচাই
        const supplierCheck = await query(
            `SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2`,
            [supplier_id, req.tenantId]
        );
        if (supplierCheck.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
        }

        // ✅ মাল্টি-ওয়্যারহাউজ ধাপ ৩: warehouse_id দেওয়া না থাকলে tenant-এর ডিফল্ট
        // গুদাম বসানো হবে (Step ১ মাইগ্রেশনে প্রতিটা tenant-এর জন্য একটা ডিফল্ট
        // "প্রধান গুদাম" গ্যারান্টিড আছে, তাই এই lookup কখনো ফাঁকা আসবে না)
        if (warehouse_id) {
            const warehouseCheck = await query(
                `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
                [warehouse_id, req.tenantId]
            );
            if (warehouseCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'গুদাম পাওয়া যায়নি বা নিষ্ক্রিয়।' });
            }
        } else {
            const defaultWarehouse = await query(
                `SELECT id FROM warehouses WHERE tenant_id = $1 AND is_default = true`,
                [req.tenantId]
            );
            warehouse_id = defaultWarehouse.rows[0]?.id || null;
        }

        // প্রতিটা আইটেম যাচাই
        const cleanItems = [];
        for (const [idx, item] of items.entries()) {
            const qty  = parseInt(item.quantity_ordered, 10);
            const cost = parseFloat(item.unit_cost);

            if (!item.product_id) {
                return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}: পণ্য বাছাই করুন।` });
            }
            if (isNaN(qty) || qty <= 0) {
                return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}: পরিমাণ ০-এর বেশি হতে হবে।` });
            }
            if (isNaN(cost) || cost < 0) {
                return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}: ইউনিট মূল্য সঠিক নয়।` });
            }

            const productCheck = await query(
                `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
                [item.product_id, req.tenantId]
            );
            if (productCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}: পণ্য পাওয়া যায়নি।` });
            }

            const foreignCost = (item.foreign_unit_cost !== undefined && item.foreign_unit_cost !== null && item.foreign_unit_cost !== '')
                ? parseFloat(item.foreign_unit_cost) : null;

            cleanItems.push({ product_id: item.product_id, quantity_ordered: qty, unit_cost: cost, foreign_unit_cost: foreignCost });
        }

        const totalAmount = cleanItems.reduce((sum, i) => sum + (i.quantity_ordered * i.unit_cost), 0);

        // po_number generate করা ও সংঘর্ষ হলে আবার চেষ্টা (সর্বোচ্চ ৩ বার)
        let po = null;
        for (let attempt = 0; attempt < 3 && !po; attempt++) {
            const poNumber = await generatePoNumber(req.tenantId);
            try {
                po = await withTransaction(async (client) => {
                    const poInsert = await client.query(
                        `INSERT INTO purchase_orders
                            (tenant_id, po_number, supplier_id, status, order_date, expected_date, notes, total_amount, created_by, warehouse_id,
                             currency, exchange_rate, cost_allocation_method)
                         VALUES ($1, $2, $3, 'draft', COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, $10, $11, $12)
                         RETURNING *`,
                        [
                            req.tenantId, poNumber, supplier_id,
                            order_date || null, expected_date || null, notes || null,
                            totalAmount, req.user.id, warehouse_id,
                            poCurrency, poRate, allocMethod
                        ]
                    );
                    const poRow = poInsert.rows[0];

                    for (const item of cleanItems) {
                        await client.query(
                            `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost, foreign_unit_cost)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [poRow.id, item.product_id, item.quantity_ordered, item.unit_cost, item.foreign_unit_cost]
                        );
                    }

                    return poRow;
                });
            } catch (err) {
                if (err.code === '23505') continue; // po_number সংঘর্ষ — আবার চেষ্টা
                throw err;
            }
        }

        if (!po) {
            return res.status(500).json({ success: false, message: 'PO নাম্বার তৈরি করতে সমস্যা হয়েছে — আবার চেষ্টা করুন।' });
        }

        return res.status(201).json({ success: true, message: `Purchase Order তৈরি হয়েছে — ${po.po_number}`, data: po });
    } catch (error) {
        logger.error('❌ Create Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'Purchase Order তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE PURCHASE ORDER (শুধু draft অবস্থায়)
// PUT /api/purchase-orders/:id
// body: { supplier_id, order_date, expected_date, notes, items: [...] }  (items দিলে পুরোটা replace হবে)
// ============================================================
const updatePurchaseOrder = async (req, res) => {
    try {
        const existing = await query(
            `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ success: false, message: 'শুধু ড্রাফট অবস্থার Purchase Order সম্পাদনা করা যায়।' });
        }

        const { supplier_id, order_date, expected_date, notes, items, warehouse_id, currency, exchange_rate } = req.body;

        // নিরাপত্তা: সাপ্লায়ার বদলাতে চাইলে সেটা এই tenant-এর কিনা যাচাই
        if (supplier_id) {
            const supplierCheck = await query(
                `SELECT id FROM suppliers WHERE id = $1 AND tenant_id = $2`,
                [supplier_id, req.tenantId]
            );
            if (supplierCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
            }
        }

        if (warehouse_id) {
            const warehouseCheck = await query(
                `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
                [warehouse_id, req.tenantId]
            );
            if (warehouseCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'গুদাম পাওয়া যায়নি বা নিষ্ক্রিয়।' });
            }
        }

        // মুদ্রা বদলাতে চাইলে যাচাই (না দিলে বিদ্যমান মান অপরিবর্তিত থাকবে)
        let poCurrency = null, poRate = null;
        if (currency !== undefined) {
            poCurrency = ALLOWED_CURRENCIES.includes(currency) ? currency : 'BDT';
            poRate = poCurrency === 'BDT' ? 1 : parseFloat(exchange_rate);
            if (poCurrency !== 'BDT' && (!poRate || poRate <= 0)) {
                return res.status(400).json({ success: false, message: 'বিদেশি মুদ্রার জন্য সঠিক এক্সচেঞ্জ রেট দিন।' });
            }
        }

        let totalAmount = existing.rows[0].total_amount;
        let cleanItems  = null;

        if (Array.isArray(items)) {
            cleanItems = [];
            for (const [idx, item] of items.entries()) {
                const qty  = parseInt(item.quantity_ordered, 10);
                const cost = parseFloat(item.unit_cost);
                if (!item.product_id || isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
                    return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}-এ ভুল তথ্য আছে।` });
                }
                // নিরাপত্তা: প্রতিটা পণ্য এই tenant-এর কিনা যাচাই (createPurchaseOrder-এর মতোই)
                const productCheck = await query(
                    `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
                    [item.product_id, req.tenantId]
                );
                if (productCheck.rows.length === 0) {
                    return res.status(400).json({ success: false, message: `আইটেম #${idx + 1}: পণ্য পাওয়া যায়নি।` });
                }
                const foreignCost = (item.foreign_unit_cost !== undefined && item.foreign_unit_cost !== null && item.foreign_unit_cost !== '')
                    ? parseFloat(item.foreign_unit_cost) : null;
                cleanItems.push({ product_id: item.product_id, quantity_ordered: qty, unit_cost: cost, foreign_unit_cost: foreignCost });
            }
            totalAmount = cleanItems.reduce((sum, i) => sum + (i.quantity_ordered * i.unit_cost), 0);
        }

        const updated = await withTransaction(async (client) => {
            const poUpdate = await client.query(
                `UPDATE purchase_orders SET
                    supplier_id   = COALESCE($1, supplier_id),
                    order_date    = COALESCE($2, order_date),
                    expected_date = $3,
                    notes         = $4,
                    total_amount  = $5,
                    warehouse_id  = COALESCE($6, warehouse_id),
                    currency       = COALESCE($7, currency),
                    exchange_rate  = COALESCE($8, exchange_rate),
                    updated_at    = NOW()
                 WHERE id = $9 AND tenant_id = $10
                 RETURNING *`,
                [
                    supplier_id ?? null, order_date ?? null,
                    expected_date ?? existing.rows[0].expected_date,
                    notes ?? existing.rows[0].notes,
                    totalAmount, warehouse_id ?? null, poCurrency, poRate, req.params.id, req.tenantId
                ]
            );

            if (cleanItems) {
                await client.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [req.params.id]);
                for (const item of cleanItems) {
                    await client.query(
                        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost, foreign_unit_cost)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [req.params.id, item.product_id, item.quantity_ordered, item.unit_cost, item.foreign_unit_cost]
                    );
                }
            }

            return poUpdate.rows[0];
        });

        return res.status(200).json({ success: true, message: 'আপডেট সফল।', data: updated });
    } catch (error) {
        logger.error('❌ Update Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PLACE ORDER (draft → ordered)
// POST /api/purchase-orders/:id/place-order
// ============================================================
const placeOrder = async (req, res) => {
    try {
        const existing = await query(
            `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ success: false, message: 'শুধু ড্রাফট PO অর্ডার করা যায়।' });
        }

        const itemCheck = await query(`SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = $1`, [req.params.id]);
        if (parseInt(itemCheck.rows[0].count, 10) === 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটি পণ্য ছাড়া অর্ডার করা যাবে না।' });
        }

        const result = await query(
            `UPDATE purchase_orders SET status = 'ordered', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
            [req.params.id, req.tenantId]
        );

        return res.status(200).json({ success: true, message: `${result.rows[0].po_number} সাপ্লায়ারকে অর্ডার করা হয়েছে।`, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Place Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'অর্ডার করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// RECEIVE GOODS (আংশিক বা সম্পূর্ণ)
// POST /api/purchase-orders/:id/receive
// body: { note, items: [{ item_id, quantity_received_now, unit_cost? }] }
// ============================================================
const receivePurchaseOrder = async (req, res) => {
    try {
        const { note, items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'কী পরিমাণ মাল এসেছে তা উল্লেখ করুন।' });
        }

        const poResult = await query(
            `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (poResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        const po = poResult.rows[0];

        if (!['ordered', 'partial'].includes(po.status)) {
            return res.status(400).json({
                success: false,
                message: po.status === 'draft'
                    ? 'আগে PO সাপ্লায়ারকে অর্ডার করুন, তারপর মাল গ্রহণ করা যাবে।'
                    : `${po.status === 'received' ? 'এই PO ইতিমধ্যে সম্পূর্ণ গ্রহণ করা হয়েছে।' : 'বাতিল করা PO-তে মাল গ্রহণ করা যাবে না।'}`
            });
        }

        const updatedPO = await withTransaction(async (client) => {
            for (const [idx, entry] of items.entries()) {
                const qtyNow = parseInt(entry.quantity_received_now, 10);
                if (!entry.item_id || isNaN(qtyNow) || qtyNow <= 0) {
                    throw Object.assign(new Error(`আইটেম #${idx + 1}: সঠিক পরিমাণ দিন।`), { isValidation: true });
                }

                const itemResult = await client.query(
                    `SELECT * FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2 FOR UPDATE`,
                    [entry.item_id, req.params.id]
                );
                if (itemResult.rows.length === 0) {
                    throw Object.assign(new Error(`আইটেম #${idx + 1} এই PO-তে পাওয়া যায়নি।`), { isValidation: true });
                }
                const item = itemResult.rows[0];

                const remaining = item.quantity_ordered - item.quantity_received;
                if (qtyNow > remaining) {
                    throw Object.assign(
                        new Error(`অর্ডারকৃত পরিমাণের বেশি গ্রহণ করা যাবে না (বাকি আছে ${remaining})।`),
                        { isValidation: true }
                    );
                }

                const unitCost = entry.unit_cost !== undefined && entry.unit_cost !== null && entry.unit_cost !== ''
                    ? parseFloat(entry.unit_cost)
                    : parseFloat(item.unit_cost);

                // ১. আইটেমের quantity_received বাড়াও
                await client.query(
                    `UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE id = $2`,
                    [qtyNow, item.id]
                );

                // ২. প্রডাক্টের স্টক + cost_price (ওয়েটেড এভারেজ) আপডেট করো
                const productResult = await client.query(
                    `SELECT stock, cost_price FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                    [item.product_id, req.tenantId]
                );
                const product   = productResult.rows[0];
                const oldStock  = parseInt(product.stock, 10) || 0;
                const oldCost   = parseFloat(product.cost_price) || 0;
                const newStock  = oldStock + qtyNow;
                const newCost   = newStock > 0
                    ? Math.round(((oldStock * oldCost + qtyNow * unitCost) / newStock) * 100) / 100
                    : unitCost;

                await client.query(
                    `UPDATE products SET stock = $1, cost_price = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
                    [newStock, newCost, item.product_id, req.tenantId]
                );

                // ✅ per-warehouse স্টক ধাপ ২: products.stock-এর পাশাপাশি (সমান্তরাল)
                // warehouse_stock-এও এই PO-র গুদামে ক্রেডিট করা হচ্ছে। এই আপডেট ব্যর্থ
                // হলেও products.stock ইতোমধ্যে আপডেট হয়ে গেছে, তাই মূল ফ্লো অক্ষত থাকবে —
                // কিন্তু আমরা একই ট্রানজ্যাকশনে থাকায় দুটো একসাথেই কমিট/রোলব্যাক হবে।
                if (po.warehouse_id) {
                    await client.query(
                        `INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, quantity, updated_at)
                         VALUES ($1, $2, $3, $4, NOW())
                         ON CONFLICT (warehouse_id, product_id)
                         DO UPDATE SET quantity = warehouse_stock.quantity + $4, updated_at = NOW()`,
                        [req.tenantId, po.warehouse_id, item.product_id, qtyNow]
                    );
                }

                // ৩. স্টক মুভমেন্ট লগ
                // Step ৪ (Batch/Expiry): batch_id নিচে ব্যাচ তৈরি হলে সেট হবে, না হলে NULL থাকবে
                // (batch tracking ঐচ্ছিক — সব পণ্যের জন্য batch/expiry না দিলেও রিসিভ করা যায়)
                let batchId = null;

                // ৩ক. ব্যাচ/মেয়াদ তথ্য দেওয়া থাকলে product_batches-এ নতুন ব্যাচ তৈরি করো
                // (batch_number বা expiry_date যেকোনো একটা দিলেই যথেষ্ট — দুটোই বাধ্যতামূলক নয়)
                if (entry.batch_number || entry.expiry_date) {
                    const batchResult = await client.query(
                        `INSERT INTO product_batches
                            (tenant_id, product_id, batch_number, quantity, manufacture_date, expiry_date, received_at,
                             status, unit_cost, supplier_id, purchase_order_id, warehouse_id)
                         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active', $7, $8, $9, $10)
                         RETURNING id`,
                        [
                            req.tenantId,
                            item.product_id,
                            entry.batch_number || null,
                            qtyNow,
                            entry.manufacture_date || null,
                            entry.expiry_date || null,
                            unitCost,
                            po.supplier_id || null,
                            po.id,
                            po.warehouse_id || null
                        ]
                    );
                    batchId = batchResult.rows[0].id;
                }

                await client.query(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_id, reference_type, note, created_by, tenant_id, batch_id)
                     VALUES ($1, 'in', $2, $3, 'purchase', $4, $5, $6, $7)`,
                    [item.product_id, qtyNow, po.id, note || `${po.po_number} থেকে মাল গ্রহণ`, req.user.id, req.tenantId, batchId]
                );
            }

            // ৪. সব আইটেম মিলিয়ে PO-এর সার্বিক status ঠিক করো
            const allItems = await client.query(
                `SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE purchase_order_id = $1`,
                [req.params.id]
            );
            const fullyReceived = allItems.rows.every(i => i.quantity_received >= i.quantity_ordered);
            const anyReceived   = allItems.rows.some(i => i.quantity_received > 0);
            const newStatus     = fullyReceived ? 'received' : (anyReceived ? 'partial' : po.status);

            const poUpdate = await client.query(
                `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [newStatus, req.params.id]
            );
            return poUpdate.rows[0];
        });

        return res.status(200).json({
            success: true,
            message: updatedPO.status === 'received' ? 'সব পণ্য গ্রহণ সম্পন্ন — PO সম্পূর্ণ।' : 'আংশিক মাল গ্রহণ রেকর্ড করা হয়েছে।',
            data: updatedPO
        });
    } catch (error) {
        if (error.isValidation) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error('❌ Receive Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'মাল গ্রহণ রেকর্ড করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CANCEL PURCHASE ORDER
// POST /api/purchase-orders/:id/cancel
// ============================================================
const cancelPurchaseOrder = async (req, res) => {
    try {
        const existing = await query(
            `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        if (!['draft', 'ordered'].includes(existing.rows[0].status)) {
            return res.status(400).json({
                success: false,
                message: existing.rows[0].status === 'cancelled'
                    ? 'এই PO আগে থেকেই বাতিল করা আছে।'
                    : 'কিছু পণ্য ইতিমধ্যে গ্রহণ করা হয়েছে — এই PO বাতিল করা যাবে না।'
            });
        }

        const result = await query(
            `UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
            [req.params.id, req.tenantId]
        );

        return res.status(200).json({ success: true, message: 'Purchase Order বাতিল করা হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Cancel Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিল করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE PURCHASE ORDER (শুধু draft)
// DELETE /api/purchase-orders/:id
// ============================================================
const deletePurchaseOrder = async (req, res) => {
    try {
        const existing = await query(
            `SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ success: false, message: 'শুধু ড্রাফট PO মুছে ফেলা যায় — অন্যগুলো "বাতিল" করুন।' });
        }

        await query(`DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);

        return res.status(200).json({ success: true, message: 'Purchase Order মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Purchase Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getPurchaseOrders,
    getPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    placeOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    deletePurchaseOrder
};
