const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET BATCHES
// GET /api/batches?product_id=&expiring_within_days=&status=all|expiring|expired&search=
// status: 'expiring' → expiry_date এখন থেকে N দিনের মধ্যে (ডিফল্ট 30)
//         'expired'  → expiry_date অতীতে
//         'all'      → (ডিফল্ট) স্টক আছে এমন সব ব্যাচ, expiry অনুযায়ী সাজানো (FEFO অর্ডার)
// ============================================================
const getBatches = async (req, res) => {
    try {
        const {
            product_id,
            status = 'all',
            expiring_within_days = 30,
            search
        } = req.query;

        const conditions = [`b.tenant_id = $1`, `b.quantity > 0`];
        const params      = [req.tenantId];
        let paramCount    = 1;

        if (product_id) {
            paramCount++;
            conditions.push(`b.product_id = $${paramCount}`);
            params.push(product_id);
        }

        if (search) {
            paramCount++;
            conditions.push(`(p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount} OR b.batch_number ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        if (status === 'expiring') {
            paramCount++;
            conditions.push(`b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + $${paramCount}::int`);
            params.push(parseInt(expiring_within_days, 10) || 30);
        } else if (status === 'expired') {
            conditions.push(`b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE`);
        }

        const result = await query(
            `SELECT b.*, p.name AS product_name, p.sku, p.unit,
                    CASE
                        WHEN b.expiry_date IS NULL THEN NULL
                        ELSE (b.expiry_date - CURRENT_DATE)
                    END AS days_to_expiry
             FROM product_batches b
             JOIN products p ON p.id = b.product_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY (b.expiry_date IS NULL), b.expiry_date ASC, b.created_at ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Batches Error:', error.message);
        return res.status(500).json({ success: false, message: 'ব্যাচের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET EXPIRY সামারি (ড্যাশবোর্ড/অ্যালার্ট-এর জন্য)
// GET /api/batches/summary
// ============================================================
const getBatchSummary = async (req, res) => {
    try {
        const result = await query(
            `SELECT
                COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)                                AS expired_count,
                COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + 30) AS expiring_soon_count,
                COALESCE(SUM(quantity) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE), 0)               AS expired_qty,
                COALESCE(SUM(quantity) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + 30), 0) AS expiring_soon_qty
             FROM product_batches
             WHERE tenant_id = $1 AND quantity > 0`,
            [req.tenantId]
        );

        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Get Batch Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'সারাংশ আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getBatches,
    getBatchSummary
};
