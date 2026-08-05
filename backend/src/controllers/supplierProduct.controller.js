// backend/src/controllers/supplierProduct.controller.js
// Product-Supplier ম্যাপিং — কোন সাপ্লায়ার কোন পণ্য কী দামে/কত দিন লিড টাইমে সরবরাহ করে।
// PurchaseOrders.jsx-এর "Create PO" ফর্মে পণ্য বাছাইয়ের সময় এই দর অটো-সাজেস্ট হিসেবে
// ব্যবহৃত হয় (ম্যাপিং না থাকলে products.cost_price-এ ফলব্যাক, আগের মতোই)।

const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET SUPPLIER PRODUCTS (এই সাপ্লায়ার যেসব পণ্য সরবরাহ করে)
// GET /api/suppliers/:id/products
// ============================================================
const getSupplierProducts = async (req, res) => {
    try {
        const result = await query(
            `SELECT sp.*, p.name AS product_name, p.sku AS product_sku, p.cost_price AS product_cost_price
             FROM supplier_products sp
             JOIN products p ON p.id = sp.product_id
             WHERE sp.supplier_id = $1 AND sp.tenant_id = $2
             ORDER BY p.name ASC`,
            [req.params.id, req.tenantId]
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Supplier Products Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPSERT SUPPLIER PRODUCT (দাম/লিড টাইম যোগ বা আপডেট)
// POST /api/suppliers/:id/products
// body: { product_id, unit_price, lead_time_days, notes }
// ============================================================
const upsertSupplierProduct = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const { product_id, unit_price, lead_time_days, notes } = req.body;

        if (!product_id) {
            return res.status(400).json({ success: false, message: 'পণ্য বাছাই করুন।' });
        }
        const parsedPrice = parseFloat(unit_price);
        if (unit_price === undefined || unit_price === null || unit_price === '' || isNaN(parsedPrice) || parsedPrice < 0) {
            return res.status(400).json({ success: false, message: 'সঠিক দাম দিন।' });
        }
        const parsedLeadTime = (lead_time_days === '' || lead_time_days === undefined || lead_time_days === null)
            ? null
            : parseInt(lead_time_days, 10);

        // upsert — একই সাপ্লায়ার+পণ্যে আগে থেকে থাকলে দাম/লিড টাইম আপডেট হবে, ডুপ্লিকেট রো হবে না
        const result = await query(
            `INSERT INTO supplier_products (tenant_id, supplier_id, product_id, unit_price, lead_time_days, notes)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (supplier_id, product_id)
             DO UPDATE SET unit_price = EXCLUDED.unit_price,
                            lead_time_days = EXCLUDED.lead_time_days,
                            notes = EXCLUDED.notes,
                            updated_at = NOW()
             RETURNING *`,
            [req.tenantId, supplierId, product_id, parsedPrice, parsedLeadTime, notes || null]
        );

        return res.status(200).json({ success: true, message: 'দাম সংরক্ষণ হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Upsert Supplier Product Error:', error.message);
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ার বা পণ্য তথ্য সঠিক নয়।' });
        }
        if (error.code === '23514') {
            return res.status(400).json({ success: false, message: 'দাম বা লিড টাইম ঋণাত্মক হতে পারবে না।' });
        }
        return res.status(500).json({ success: false, message: 'সংরক্ষণে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE SUPPLIER PRODUCT (ম্যাপিং সরানো)
// DELETE /api/suppliers/:id/products/:productId
// ============================================================
const deleteSupplierProduct = async (req, res) => {
    try {
        const result = await query(
            `DELETE FROM supplier_products WHERE supplier_id = $1 AND product_id = $2 AND tenant_id = $3 RETURNING id`,
            [req.params.id, req.params.productId, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ম্যাপিং পাওয়া যায়নি।' });
        }
        return res.status(200).json({ success: true, message: 'মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Supplier Product Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSupplierProducts, upsertSupplierProduct, deleteSupplierProduct };
