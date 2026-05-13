const { query } = require('../config/db');
const { calcFromProduct } = require('../services/price.utils');

// ============================================================
// POST /api/return/submit
// SR নতুন return/replacement রিকোয়েস্ট জমা দেবে
// ============================================================
const submitReturn = async (req, res) => {
    try {
        const srId = req.user.id;
        const {
            customer_id, sale_id,
            type = 'return',
            items = [],
            reason, note,
            photos = []
        } = req.body;

        if (!customer_id || !reason || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কাস্টমার, কারণ এবং কমপক্ষে একটি পণ্য আবশ্যক।'
            });
        }

        // কাস্টমার SR-এর কিনা যাচাই
        const custCheck = await query(
            `SELECT id FROM customers WHERE id = $1 AND created_by = $2`,
            [customer_id, srId]
        );
        if (custCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'এই কাস্টমার আপনার তালিকায় নেই।'
            });
        }

        // পণ্য তথ্য ও মূল্য হিসাব
        // ✅ FIX: N+1 query বন্ধ — আগে প্রতিটি item-এর জন্য আলাদা SELECT চলত।
        // এখন সব product_id একবারে WHERE id = ANY($1) দিয়ে আনা হচ্ছে।
        // ১০টি item = আগে ১০টি query, এখন ১টি query।
        const productIds = items.map(i => i.product_id);
        const productsRes = await query(
            `SELECT id, name, price, vat, tax, unit FROM products
             WHERE id = ANY($1) AND is_active = true`,
            [productIds]
        );
        const productMap = {};
        productsRes.rows.forEach(p => { productMap[p.id] = p; });

        let totalValue = 0;
        const processedItems = [];

        for (const item of items) {
            const prod = productMap[item.product_id];
            if (!prod) continue;

            const { finalPrice, subtotal } = calcFromProduct(prod, item.qty);
            totalValue += subtotal;

            processedItems.push({
                product_id:   item.product_id,
                product_name: prod.name,
                unit:         prod.unit,
                qty:          parseInt(item.qty),
                unit_price:   finalPrice,
                subtotal,
                reason:       item.reason || reason
            });
        }

        const result = await query(
            `INSERT INTO return_requests
                (sr_id, customer_id, sale_id, type, items,
                 reason, note, photos, total_value)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                srId, customer_id, sale_id || null, type,
                JSON.stringify(processedItems),
                reason, note || null,
                JSON.stringify(photos),
                totalValue
            ]
        );

        return res.status(201).json({
            success: true,
            message: type === 'return'
                ? 'রিটার্ন রিকোয়েস্ট পাঠানো হয়েছে। ম্যানেজার শীঘ্রই রিভিউ করবেন।'
                : 'রিপ্লেসমেন্ট রিকোয়েস্ট পাঠানো হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ submitReturn Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/return/my?year=&month=&status=
// SR নিজের ইতিহাস দেখবে
// ============================================================
const getMyReturns = async (req, res) => {
    try {
        const { year, month, status } = req.query;
        const y = parseInt(year  || new Date().getFullYear());
        const m = parseInt(month || new Date().getMonth() + 1);

        const params  = [req.user.id, y, m];
        const filters = [
            `rr.sr_id = $1`,
            `EXTRACT(YEAR  FROM rr.created_at) = $2`,
            `EXTRACT(MONTH FROM rr.created_at) = $3`
        ];

        if (status) {
            params.push(status);
            filters.push(`rr.status = $${params.length}`);
        }

        const result = await query(
            `SELECT
                rr.*,
                c.owner_name AS customer_name,
                c.shop_name,
                rv.name_bn AS reviewed_by_name
             FROM return_requests rr
             JOIN customers c ON c.id = rr.customer_id
             LEFT JOIN users rv ON rv.id = rr.reviewed_by
             WHERE ${filters.join(' AND ')}
             ORDER BY rr.created_at DESC`,
            params
        );

        const summary = {
            total:     result.rows.length,
            pending:   result.rows.filter(r => r.status === 'pending').length,
            approved:  result.rows.filter(r => r.status === 'approved').length,
            rejected:  result.rows.filter(r => r.status === 'rejected').length,
            completed: result.rows.filter(r => r.status === 'completed').length,
            total_value: result.rows.reduce((s, r) => s + parseFloat(r.total_value || 0), 0)
        };

        return res.json({ success: true, data: result.rows, summary, meta: { year: y, month: m } });

    } catch (error) {
        console.error('❌ getMyReturns Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/return/team?status=&sr_id=&date_from=&date_to=
// Manager দলের সব রিকোয়েস্ট দেখবে
// ============================================================
const getTeamReturns = async (req, res) => {
    try {
        const managerId   = req.user.id;
        const role        = req.user.role;
        const { status, sr_id, date_from, date_to, type } = req.query;

        const params  = [];
        const filters = [];

        if (!['admin', 'accountant'].includes(role)) {
            params.push(managerId);
            filters.push(`u.manager_id = $${params.length}`);
        }
        if (status)    { params.push(status);    filters.push(`rr.status = $${params.length}`); }
        if (sr_id)     { params.push(sr_id);     filters.push(`rr.sr_id = $${params.length}`); }
        if (type)      { params.push(type);      filters.push(`rr.type = $${params.length}`); }
        if (date_from) { params.push(date_from); filters.push(`rr.created_at >= $${params.length}`); }
        if (date_to)   { params.push(date_to);   filters.push(`rr.created_at <= $${params.length}::date + 1`); }

        const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

        const result = await query(
            `SELECT
                rr.*,
                u.name_bn      AS sr_name,
                u.employee_code,
                c.owner_name AS customer_name,
                c.shop_name,
                rv.name_bn     AS reviewed_by_name
             FROM return_requests rr
             JOIN users u     ON u.id  = rr.sr_id
             JOIN customers c ON c.id  = rr.customer_id
             LEFT JOIN users rv ON rv.id = rr.reviewed_by
             ${where}
             ORDER BY rr.created_at DESC`,
            params
        );

        return res.json({ success: true, data: result.rows, count: result.rows.length });

    } catch (error) {
        console.error('❌ getTeamReturns Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/return/:id/review
// Manager approve অথবা reject করবে
// ============================================================
const reviewReturn = async (req, res) => {
    try {
        const { id }          = req.params;
        const { status, review_note } = req.body;
        const reviewerId      = req.user.id;
        const reviewerRole    = req.user.role;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'status হতে হবে: approved অথবা rejected'
            });
        }

        const existing = await query(
            `SELECT rr.*, u.manager_id
             FROM return_requests rr
             JOIN users u ON u.id = rr.sr_id
             WHERE rr.id = $1`,
            [id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });

        const rr = existing.rows[0];

        if (!['admin', 'accountant'].includes(reviewerRole) && rr.manager_id !== reviewerId) {
            return res.status(403).json({ success: false, message: 'এই রিকোয়েস্ট review করার অনুমতি নেই।' });
        }
        if (rr.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `এই রিকোয়েস্ট আগেই ${rr.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'} হয়েছে।`
            });
        }

        const result = await query(
            `UPDATE return_requests SET
                status      = $1,
                reviewed_by = $2,
                review_note = $3,
                reviewed_at = NOW()
             WHERE id = $4 RETURNING *`,
            [status, reviewerId, review_note || null, id]
        );

        return res.json({
            success: true,
            message: status === 'approved' ? 'রিকোয়েস্ট অনুমোদিত হয়েছে।' : 'রিকোয়েস্ট বাতিল করা হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ reviewReturn Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/return/:id/complete
// SR approved রিকোয়েস্ট সম্পন্ন করবে (পণ্য ফেরত নিয়েছে)
// ============================================================
const completeReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const srId   = req.user.id;

        const existing = await query(
            `SELECT * FROM return_requests WHERE id = $1 AND sr_id = $2`,
            [id, srId]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });

        if (existing.rows[0].status !== 'approved')
            return res.status(400).json({ success: false, message: 'শুধুমাত্র approved রিকোয়েস্ট complete করা যাবে।' });

        const result = await query(
            `UPDATE return_requests SET
                status       = 'completed',
                completed_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id]
        );

        return res.json({
            success: true,
            message: 'রিটার্ন সম্পন্ন হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ completeReturn Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/reports/return?year=&month=
// Admin মাসিক রিপোর্ট
// ============================================================
const getReturnReport = async (req, res) => {
    try {
        const { year, month } = req.query;
        const y = parseInt(year  || new Date().getFullYear());
        const m = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT
                rr.*,
                u.name_bn       AS sr_name,
                u.employee_code,
                mgr.name_bn     AS manager_name,
                c.owner_name AS customer_name,
                c.shop_name,
                rv.name_bn      AS reviewed_by_name
             FROM return_requests rr
             JOIN users u     ON u.id   = rr.sr_id
             LEFT JOIN users mgr ON mgr.id = u.manager_id
             JOIN customers c ON c.id   = rr.customer_id
             LEFT JOIN users rv  ON rv.id  = rr.reviewed_by
             WHERE EXTRACT(YEAR  FROM rr.created_at) = $1
               AND EXTRACT(MONTH FROM rr.created_at) = $2
             ORDER BY rr.created_at DESC`,
            [y, m]
        );

        const summary = {
            total_count:     result.rows.length,
            approved_count:  result.rows.filter(r => r.status === 'approved').length,
            rejected_count:  result.rows.filter(r => r.status === 'rejected').length,
            completed_count: result.rows.filter(r => r.status === 'completed').length,
            return_count:     result.rows.filter(r => r.type === 'return').length,
            replacement_count:result.rows.filter(r => r.type === 'replacement').length,
            total_value:     result.rows.reduce((s, r) => s + parseFloat(r.total_value || 0), 0),
            approved_value:  result.rows.filter(r => ['approved','completed'].includes(r.status))
                                .reduce((s, r) => s + parseFloat(r.total_value || 0), 0),
        };

        return res.json({ success: true, data: result.rows, summary, meta: { year: y, month: m } });

    } catch (error) {
        console.error('❌ getReturnReport Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    submitReturn,
    getMyReturns,
    getTeamReturns,
    reviewReturn,
    completeReturn,
    getReturnReport
};
