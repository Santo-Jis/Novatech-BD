const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET SUPPLIERS
// GET /api/suppliers?search=&is_active=true
// ============================================================
const getSuppliers = async (req, res) => {
    try {
        const { search, is_active = true } = req.query;

        const conditions = [`s.tenant_id = $1`, `s.is_active = $2`];
        const params      = [req.tenantId, is_active];
        let paramCount    = 2;

        if (search) {
            paramCount++;
            conditions.push(`(s.name ILIKE $${paramCount} OR s.contact_person ILIKE $${paramCount} OR s.phone ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        const result = await query(
            `SELECT s.*,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS po_count,
                    (SELECT COALESCE(SUM(po.total_amount), 0) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS total_purchased
             FROM suppliers s
             WHERE ${conditions.join(' AND ')}
             ORDER BY s.name ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Suppliers Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE SUPPLIER
// GET /api/suppliers/:id
// ============================================================
const getSupplier = async (req, res) => {
    try {
        const result = await query(
            `SELECT s.*,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS po_count,
                    (SELECT COALESCE(SUM(po.total_amount), 0) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS total_purchased
             FROM suppliers s
             WHERE s.id = $1 AND s.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
        }

        const recentPOs = await query(
            `SELECT id, po_number, status, order_date, total_amount
             FROM purchase_orders WHERE supplier_id = $1
             ORDER BY created_at DESC LIMIT 10`,
            [req.params.id]
        );

        return res.status(200).json({
            success: true,
            data: { ...result.rows[0], recent_purchase_orders: recentPOs.rows }
        });
    } catch (error) {
        logger.error('❌ Get Supplier Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE SUPPLIER
// POST /api/suppliers
// ============================================================
const createSupplier = async (req, res) => {
    try {
        const { name, contact_person, phone, email, address, notes } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ারের নাম আবশ্যক।' });
        }

        const result = await query(
            `INSERT INTO suppliers (tenant_id, name, contact_person, phone, email, address, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.tenantId, name.trim(), contact_person || null, phone || null, email || null, address || null, notes || null]
        );

        return res.status(201).json({ success: true, message: 'সাপ্লায়ার যোগ হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Create Supplier Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের সাপ্লায়ার আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'সাপ্লায়ার তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE SUPPLIER
// PUT /api/suppliers/:id
// ============================================================
const updateSupplier = async (req, res) => {
    try {
        const { name, contact_person, phone, email, address, notes, is_active } = req.body;

        const result = await query(
            `UPDATE suppliers SET
                name           = COALESCE($1, name),
                contact_person = COALESCE($2, contact_person),
                phone          = COALESCE($3, phone),
                email          = COALESCE($4, email),
                address        = COALESCE($5, address),
                notes          = COALESCE($6, notes),
                is_active      = COALESCE($7, is_active),
                updated_at     = NOW()
             WHERE id = $8 AND tenant_id = $9
             RETURNING *`,
            [
                name ?? null, contact_person ?? null, phone ?? null, email ?? null,
                address ?? null, notes ?? null, is_active ?? null,
                req.params.id, req.tenantId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, message: 'আপডেট সফল।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Update Supplier Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের সাপ্লায়ার আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE SUPPLIER
// DELETE /api/suppliers/:id
// (শুধু তখনই ডিলিট হবে যদি কোনো Purchase Order এই সাপ্লায়ার ব্যবহার না করে)
// ============================================================
const deleteSupplier = async (req, res) => {
    try {
        const inUse = await query(
            `SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = $1`,
            [req.params.id]
        );

        if (parseInt(inUse.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: `এই সাপ্লায়ারের ${inUse.rows[0].count}টি Purchase Order আছে — ডিলিট না করে "নিষ্ক্রিয়" করুন।`
            });
        }

        const result = await query(
            `DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, message: 'সাপ্লায়ার মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Supplier Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier };
