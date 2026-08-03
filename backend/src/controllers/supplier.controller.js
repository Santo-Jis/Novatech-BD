const logger = require('../config/logger');
const { query } = require('../config/db');

// সার্ভার-সাইড সর্ট — SQL ইনজেকশন ঠেকাতে whitelist ম্যাপিং (কখনো user input সরাসরি ORDER BY-তে বসানো যাবে না)
const SUPPLIER_SORT_MAP = {
    name_asc:      's.name ASC',
    name_desc:     's.name DESC',
    purchase_desc: 'total_purchased DESC NULLS LAST',
    po_count_desc: 'po_count DESC',
};

// ============================================================
// GET SUPPLIERS
// GET /api/suppliers?search=&is_active=true&page=&limit=&sort=
// ============================================================
const getSuppliers = async (req, res) => {
    try {
        const { search, is_active = true, sort = 'name_asc' } = req.query;

        // pagination সম্পূর্ণ opt-in — page/limit না দিলে আগের মতোই পুরো লিস্ট ফেরত যাবে।
        // এটা জরুরি: PurchaseOrders.jsx-এর সাপ্লায়ার ড্রপডাউন এখনো ?is_active=true দিয়ে
        // *সব* অ্যাক্টিভ সাপ্লায়ার আশা করে (page/limit পাঠায় না) — তাই ডিফল্ট limit বসালে
        // ৩০+ সাপ্লায়ার হলে সেই ড্রপডাউন নিঃশব্দে অসম্পূর্ণ হয়ে যেত।
        const isPaginated = req.query.page !== undefined || req.query.limit !== undefined;

        const conditions = [`s.tenant_id = $1`, `s.is_active = $2`];
        const params      = [req.tenantId, is_active];
        let paramCount    = 2;

        if (search) {
            paramCount++;
            conditions.push(`(s.name ILIKE $${paramCount} OR s.contact_person ILIKE $${paramCount} OR s.phone ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        const orderBy = SUPPLIER_SORT_MAP[sort] || SUPPLIER_SORT_MAP.name_asc;

        let limitClause = '';
        let pageNum, limitNum;
        if (isPaginated) {
            pageNum     = Math.max(parseInt(req.query.page, 10) || 1, 1);
            limitNum    = Math.min(parseInt(req.query.limit, 10) || 30, 100);
            limitClause = `LIMIT ${limitNum} OFFSET ${(pageNum - 1) * limitNum}`;
        }

        const result = await query(
            `SELECT s.*,
                    d.name_bn  AS division_name,
                    dt.name_bn AS district_name,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS po_count,
                    (SELECT COALESCE(SUM(po.total_amount), 0) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS total_purchased
             FROM suppliers s
             LEFT JOIN bd_divisions d  ON d.id  = s.division_id
             LEFT JOIN bd_districts dt ON dt.id = s.district_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY ${orderBy}
             ${limitClause}`,
            params
        );

        const response = { success: true, data: result.rows };

        if (isPaginated) {
            const countResult = await query(
                `SELECT COUNT(*) FROM suppliers s WHERE ${conditions.join(' AND ')}`,
                params
            );
            response.pagination = { page: pageNum, limit: limitNum, total: parseInt(countResult.rows[0].count, 10) };
        }

        return res.status(200).json(response);
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
                    d.name_bn  AS division_name,
                    dt.name_bn AS district_name,
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS po_count,
                    (SELECT COUNT(*) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS completed_po_count,
                    (SELECT COALESCE(SUM(po.total_amount), 0) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS total_purchased,
                    (SELECT MAX(po.order_date) FROM purchase_orders po
                        WHERE po.supplier_id = s.id AND po.status IN ('ordered','partial','received')) AS last_order_date
             FROM suppliers s
             LEFT JOIN bd_divisions d  ON d.id  = s.division_id
             LEFT JOIN bd_districts dt ON dt.id = s.district_id
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

// '' বা undefined থাকলে null বানায় — integer/date কলাম (division_id, district_id,
// trade_license_expiry) আর CHECK-constrained varchar (mfs_provider, supplier_type,
// payment_terms) এ খালি স্ট্রিং সরাসরি পাঠালে DB error (invalid input / check violation) হতো।
const asNullable = (v) => (v === '' || v === undefined) ? null : v;

// ============================================================
// CREATE SUPPLIER
// POST /api/suppliers
// ============================================================
const createSupplier = async (req, res) => {
    try {
        const {
            name, contact_person, phone, email, address, notes,
            supplier_type, tin_number, bin_number, trade_license_no, trade_license_expiry,
            payment_terms, bank_name, bank_account_no, bank_branch, mfs_provider, mfs_number,
            division_id, district_id
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ারের নাম আবশ্যক।' });
        }

        const result = await query(
            `INSERT INTO suppliers (
                tenant_id, name, contact_person, phone, email, address, notes,
                supplier_type, tin_number, bin_number, trade_license_no, trade_license_expiry,
                payment_terms, bank_name, bank_account_no, bank_branch, mfs_provider, mfs_number,
                division_id, district_id
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             RETURNING *`,
            [
                req.tenantId, name.trim(), contact_person || null, phone || null, email || null, address || null, notes || null,
                supplier_type || 'other', tin_number || null, bin_number || null, trade_license_no || null, asNullable(trade_license_expiry),
                payment_terms || 'net_30', bank_name || null, bank_account_no || null, bank_branch || null, asNullable(mfs_provider), mfs_number || null,
                asNullable(division_id), asNullable(district_id)
            ]
        );

        return res.status(201).json({ success: true, message: 'সাপ্লায়ার যোগ হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Create Supplier Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের সাপ্লায়ার আগে থেকেই আছে।' });
        }
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'বিভাগ/জেলা তথ্য সঠিক নয়।' });
        }
        if (error.code === '23514') {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ারের ধরন, পেমেন্ট শর্ত বা MFS প্রোভাইডার সঠিক নয়।' });
        }
        if (error.code === '22001') {
            return res.status(400).json({ success: false, message: 'কোনো একটা ফিল্ডের মান অনুমোদিত দৈর্ঘ্যের চেয়ে বড়।' });
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
        const {
            name, contact_person, phone, email, address, notes, is_active,
            supplier_type, tin_number, bin_number, trade_license_no, trade_license_expiry,
            payment_terms, bank_name, bank_account_no, bank_branch, mfs_provider, mfs_number,
            division_id, district_id
        } = req.body;

        const result = await query(
            `UPDATE suppliers SET
                name                  = COALESCE($1, name),
                contact_person        = COALESCE($2, contact_person),
                phone                 = COALESCE($3, phone),
                email                 = COALESCE($4, email),
                address               = COALESCE($5, address),
                notes                 = COALESCE($6, notes),
                is_active             = COALESCE($7, is_active),
                supplier_type         = COALESCE($8, supplier_type),
                tin_number            = COALESCE($9, tin_number),
                bin_number            = COALESCE($10, bin_number),
                trade_license_no      = COALESCE($11, trade_license_no),
                trade_license_expiry  = COALESCE($12, trade_license_expiry),
                payment_terms         = COALESCE($13, payment_terms),
                bank_name             = COALESCE($14, bank_name),
                bank_account_no       = COALESCE($15, bank_account_no),
                bank_branch           = COALESCE($16, bank_branch),
                mfs_provider          = COALESCE($17, mfs_provider),
                mfs_number            = COALESCE($18, mfs_number),
                division_id           = COALESCE($19, division_id),
                district_id           = COALESCE($20, district_id),
                updated_at            = NOW()
             WHERE id = $21 AND tenant_id = $22
             RETURNING *`,
            [
                name ?? null, contact_person ?? null, phone ?? null, email ?? null,
                address ?? null, notes ?? null, is_active ?? null,
                asNullable(supplier_type), tin_number ?? null, bin_number ?? null, trade_license_no ?? null, asNullable(trade_license_expiry),
                asNullable(payment_terms), bank_name ?? null, bank_account_no ?? null, bank_branch ?? null, asNullable(mfs_provider), mfs_number ?? null,
                asNullable(division_id), asNullable(district_id),
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
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'বিভাগ/জেলা তথ্য সঠিক নয়।' });
        }
        if (error.code === '23514') {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ারের ধরন, পেমেন্ট শর্ত বা MFS প্রোভাইডার সঠিক নয়।' });
        }
        if (error.code === '22001') {
            return res.status(400).json({ success: false, message: 'কোনো একটা ফিল্ডের মান অনুমোদিত দৈর্ঘ্যের চেয়ে বড়।' });
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
