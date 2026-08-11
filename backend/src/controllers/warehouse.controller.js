// warehouse.controller.js — গুদাম ম্যানেজমেন্ট (মাল্টি-ওয়্যারহাউজ ধাপ ২)
//
// এই মুহূর্তে products.stock এখনো একটা সিঙ্গেল অ্যাগ্রিগেট সংখ্যা (per-warehouse
// না) — এই কন্ট্রোলার শুধু warehouses টেবিলের CRUD, আর product_batches/
// purchase_orders-এর warehouse_id ফিল্ড ম্যানেজ করার জন্য ভিত্তি তৈরি করে।
// products.stock-কে per-warehouse করা একটা আলাদা, বড় প্রজেক্ট (এখনো করা হয়নি)।

const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// ============================================================
// GET WAREHOUSES
// GET /api/warehouses?is_active=true|false (ঐচ্ছিক — না দিলে সব দেখাবে)
// ============================================================
const getWarehouses = async (req, res) => {
    try {
        const { is_active } = req.query;

        const conditions = [`w.tenant_id = $1`];
        const params      = [req.tenantId];

        if (is_active === 'true' || is_active === 'false') {
            conditions.push(`w.is_active = $${params.length + 1}`);
            params.push(is_active === 'true');
        }

        const result = await query(
            `SELECT w.*,
                    (SELECT COUNT(*) FROM product_batches pb WHERE pb.warehouse_id = w.id AND pb.quantity > 0) AS active_batch_count,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.warehouse_id = w.id) AS po_count
             FROM warehouses w
             WHERE ${conditions.join(' AND ')}
             ORDER BY w.is_default DESC, w.name ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Warehouses Error:', error.message);
        return res.status(500).json({ success: false, message: 'গুদামের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE WAREHOUSE
// GET /api/warehouses/:id
// ============================================================
const getWarehouse = async (req, res) => {
    try {
        const result = await query(
            `SELECT w.*,
                    (SELECT COUNT(*) FROM product_batches pb WHERE pb.warehouse_id = w.id AND pb.quantity > 0) AS active_batch_count,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.warehouse_id = w.id) AS po_count
             FROM warehouses w
             WHERE w.id = $1 AND w.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'গুদাম পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Get Warehouse Error:', error.message);
        return res.status(500).json({ success: false, message: 'গুদামের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET WAREHOUSE STOCK BREAKDOWN (per-warehouse স্টক ধাপ ৫)
// GET /api/warehouses/:id/stock?search=
// warehouse_stock টেবিল থেকে এই গুদামে কোন পণ্যের কত আছে তার তালিকা।
// শুধু quantity > 0 দেখানো হয় (খালি এন্ট্রি বাদ) যাতে লিস্ট পরিষ্কার থাকে।
// ============================================================
const getWarehouseStock = async (req, res) => {
    try {
        const warehouseCheck = await query(
            `SELECT id, name FROM warehouses WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (warehouseCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'গুদাম পাওয়া যায়নি।' });
        }

        const { search } = req.query;
        const conditions = [`ws.warehouse_id = $1`, `ws.tenant_id = $2`, `ws.quantity > 0`];
        const params      = [req.params.id, req.tenantId];

        if (search) {
            conditions.push(`(p.name ILIKE $${params.length + 1} OR p.sku ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }

        const result = await query(
            `SELECT ws.product_id, ws.quantity, ws.updated_at,
                    p.name AS product_name, p.sku, p.unit, p.stock AS total_stock
             FROM warehouse_stock ws
             JOIN products p ON p.id = ws.product_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY p.name ASC`,
            params
        );

        return res.status(200).json({
            success: true,
            data: {
                warehouse: warehouseCheck.rows[0],
                items: result.rows,
                total_quantity: result.rows.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0)
            }
        });
    } catch (error) {
        logger.error('❌ Get Warehouse Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'গুদামের স্টক তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE WAREHOUSE
// POST /api/warehouses   body: { name, code, address, is_default }
// ============================================================
const createWarehouse = async (req, res) => {
    try {
        const { name, code, address, is_default } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'গুদামের নাম আবশ্যক।' });
        }

        const warehouse = await withTransaction(async (client) => {
            // নতুনটাকে ডিফল্ট বানাতে চাইলে আগের ডিফল্ট গুদামের ফ্ল্যাগ সরিয়ে দাও
            // (DB-তে ইউনিক ইনডেক্স আছে — একটার বেশি ডিফল্ট থাকতেই পারবে না)
            if (is_default === true) {
                await client.query(
                    `UPDATE warehouses SET is_default = false WHERE tenant_id = $1 AND is_default = true`,
                    [req.tenantId]
                );
            }

            const result = await client.query(
                `INSERT INTO warehouses (tenant_id, name, code, address, is_default, is_active)
                 VALUES ($1, $2, $3, $4, $5, true)
                 RETURNING *`,
                [req.tenantId, name.trim(), code || null, address || null, is_default === true]
            );
            return result.rows[0];
        });

        return res.status(201).json({ success: true, message: 'গুদাম যোগ হয়েছে।', data: warehouse });
    } catch (error) {
        logger.error('❌ Create Warehouse Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের গুদাম আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'গুদাম তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE WAREHOUSE
// PATCH /api/warehouses/:id   body: { name, code, address, is_active, is_default }
//
// সেফটি রুল:
//  - তেনান্টের একমাত্র সক্রিয় গুদাম নিষ্ক্রিয় করা যাবে না
//  - ডিফল্ট গুদাম নিষ্ক্রিয় করার আগে অন্য একটাকে ডিফল্ট বানাতে হবে
//  - ডিফল্ট গুদামকে সরাসরি is_default=false পাঠিয়ে "ডিফল্টহীন" করা যাবে না —
//    অন্য একটা গুদামকে is_default=true করলে এটা এমনিতেই false হয়ে যাবে
// ============================================================
const updateWarehouse = async (req, res) => {
    try {
        const { name, code, address, is_active, is_default } = req.body;

        const existingRes = await query(
            `SELECT * FROM warehouses WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existingRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'গুদাম পাওয়া যায়নি।' });
        }
        const existing = existingRes.rows[0];

        if (is_active === false && existing.is_active === true) {
            const activeCountRes = await query(
                `SELECT COUNT(*) FROM warehouses WHERE tenant_id = $1 AND is_active = true`,
                [req.tenantId]
            );
            if (parseInt(activeCountRes.rows[0].count, 10) <= 1) {
                return res.status(400).json({ success: false, message: 'অন্তত একটা সক্রিয় গুদাম থাকতেই হবে — এটাই একমাত্র সক্রিয় গুদাম।' });
            }
            if (existing.is_default) {
                return res.status(400).json({ success: false, message: 'এটা ডিফল্ট গুদাম — নিষ্ক্রিয় করার আগে অন্য কোনো গুদামকে ডিফল্ট বানান।' });
            }
        }

        const warehouse = await withTransaction(async (client) => {
            if (is_default === true && !existing.is_default) {
                await client.query(
                    `UPDATE warehouses SET is_default = false WHERE tenant_id = $1 AND is_default = true`,
                    [req.tenantId]
                );
            }
            // ডিফল্ট গুদামকে সরাসরি false করতে দেওয়া হবে না (উপরের মন্তব্য দ্রষ্টব্য)
            const effectiveIsDefault = (is_default === false && existing.is_default) ? true : is_default;

            const result = await client.query(
                `UPDATE warehouses SET
                    name       = COALESCE($1, name),
                    code       = COALESCE($2, code),
                    address    = COALESCE($3, address),
                    is_active  = COALESCE($4, is_active),
                    is_default = COALESCE($5, is_default),
                    updated_at = NOW()
                 WHERE id = $6 AND tenant_id = $7
                 RETURNING *`,
                [
                    name ?? null, code ?? null, address ?? null,
                    is_active ?? null, effectiveIsDefault ?? null,
                    req.params.id, req.tenantId
                ]
            );
            return result.rows[0];
        });

        return res.status(200).json({ success: true, message: 'আপডেট সফল।', data: warehouse });
    } catch (error) {
        logger.error('❌ Update Warehouse Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের গুদাম আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE WAREHOUSE
// DELETE /api/warehouses/:id
// শুধু তখনই হার্ড-ডিলিট হবে যদি:
//   - এটা ডিফল্ট গুদাম না হয়
//   - তেনান্টের একমাত্র গুদাম না হয়
//   - কোনো ব্যাচ/PO এই গুদাম রেফারেন্স না করে (নাহলে "নিষ্ক্রিয়" করতে বলা হবে)
// ============================================================
const deleteWarehouse = async (req, res) => {
    try {
        const existingRes = await query(
            `SELECT * FROM warehouses WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (existingRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'গুদাম পাওয়া যায়নি।' });
        }
        const existing = existingRes.rows[0];

        if (existing.is_default) {
            return res.status(400).json({ success: false, message: 'ডিফল্ট গুদাম ডিলিট করা যাবে না — আগে অন্য একটা গুদামকে ডিফল্ট বানান।' });
        }

        const totalCountRes = await query(`SELECT COUNT(*) FROM warehouses WHERE tenant_id = $1`, [req.tenantId]);
        if (parseInt(totalCountRes.rows[0].count, 10) <= 1) {
            return res.status(400).json({ success: false, message: 'অন্তত একটা গুদাম থাকতেই হবে।' });
        }

        const batchCountRes = await query(`SELECT COUNT(*) FROM product_batches WHERE warehouse_id = $1`, [req.params.id]);
        const poCountRes    = await query(`SELECT COUNT(*) FROM purchase_orders WHERE warehouse_id = $1`, [req.params.id]);
        // ✅ per-warehouse স্টক: warehouse_stock-এ এন্ট্রি থাকলেও ডিলিট আটকানো —
        // নাহলে ON DELETE CASCADE-এ ট্র্যাক করা স্টক নিঃশব্দে মুছে যেত
        const stockCountRes = await query(
            `SELECT COALESCE(SUM(quantity), 0) AS total FROM warehouse_stock WHERE warehouse_id = $1`,
            [req.params.id]
        );
        const batchCount = parseInt(batchCountRes.rows[0].count, 10);
        const poCount    = parseInt(poCountRes.rows[0].count, 10);
        const stockTotal = parseInt(stockCountRes.rows[0].total, 10);

        if (batchCount + poCount + stockTotal > 0) {
            return res.status(400).json({
                success: false,
                message: `এই গুদামে ${batchCount}টা ব্যাচ, ${poCount}টা PO ও ${stockTotal} ইউনিট ট্র্যাক করা স্টক আছে — ডিলিট না করে "নিষ্ক্রিয়" করুন।`
            });
        }

        await query(`DELETE FROM warehouses WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);

        return res.status(200).json({ success: true, message: 'গুদাম মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Warehouse Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getWarehouses,
    getWarehouse,
    getWarehouseStock,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse
};
