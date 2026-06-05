const logger = require('../config/logger');
// ============================================================
// CUSTOMER PORTAL — Return Request Admin/Manager Review
// backend/src/controllers/customerPortalReturn.controller.js
//
// Admin ও Manager কাস্টমার পোর্টালের return request
// review (approve/reject/complete) করবে।
// ============================================================

const { query } = require('../config/db');
const { sendCustomerPush } = require('../services/fcm.service');

// ============================================================
// GET /api/admin/portal-returns
// Admin/Manager সব portal return request দেখবে
// Query params: status, customer_id, date_from, date_to, page, limit
// ============================================================
const getPortalReturnRequests = async (req, res) => {
    try {
        const { status, customer_id, date_from, date_to } = req.query;
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const params  = [];
        const filters = [];

        if (status && ['pending','approved','rejected','completed'].includes(status)) {
            params.push(status);
            filters.push(`crr.status = $${params.length}`);
        }
        if (customer_id) {
            params.push(customer_id);
            filters.push(`crr.customer_id = $${params.length}`);
        }
        if (date_from) {
            params.push(date_from);
            filters.push(`crr.created_at >= $${params.length}`);
        }
        if (date_to) {
            params.push(date_to);
            filters.push(`crr.created_at <= $${params.length}::date + 1`);
        }

        const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

        const pLimit  = params.length + 1;
        const pOffset = params.length + 2;

        const { rows } = await query(
            `SELECT
                crr.id,
                crr.invoice_number,
                crr.items,
                crr.note,
                crr.status,
                crr.admin_note,
                crr.created_at,
                crr.updated_at,
                crr.reviewed_at,
                crr.completed_at,
                c.owner_name   AS customer_name,
                c.shop_name,
                c.customer_code,
                c.whatsapp,
                c.sms_phone,
                rv.name_bn     AS reviewed_by_name
             FROM customer_return_requests crr
             JOIN customers c  ON c.id  = crr.customer_id
             LEFT JOIN users rv ON rv.id = crr.reviewed_by
             ${where}
             ORDER BY
                 CASE crr.status WHEN 'pending' THEN 0 ELSE 1 END,
                 crr.created_at DESC
             LIMIT $${pLimit} OFFSET $${pOffset}`,
            [...params, limit, offset]
        );

        const countRes = await query(
            `SELECT COUNT(*) AS total
             FROM customer_return_requests crr
             ${where}`,
            params
        );

        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // Summary (pending count)
        const summaryRes = await query(
            `SELECT status, COUNT(*) AS cnt
             FROM customer_return_requests
             GROUP BY status`
        );
        const summary = { pending: 0, approved: 0, rejected: 0, completed: 0 };
        summaryRes.rows.forEach(r => { summary[r.status] = parseInt(r.cnt); });

        return res.json({
            success: true,
            data: rows,
            summary,
            pagination: { page, limit, total, totalPages }
        });

    } catch (error) {
        logger.error('❌ getPortalReturnRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/admin/portal-returns/:id
// একটি নির্দিষ্ট return request-এর বিস্তারিত
// ============================================================
const getPortalReturnRequestDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await query(
            `SELECT
                crr.*,
                c.owner_name   AS customer_name,
                c.shop_name,
                c.customer_code,
                c.whatsapp,
                c.sms_phone,
                rv.name_bn     AS reviewed_by_name
             FROM customer_return_requests crr
             JOIN customers c  ON c.id  = crr.customer_id
             LEFT JOIN users rv ON rv.id = crr.reviewed_by
             WHERE crr.id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        // সংশ্লিষ্ট invoice তথ্য আনো
        const invoiceRes = await query(
            `SELECT invoice_number, net_amount, created_at, payment_method, payment_status
             FROM sales_transactions
             WHERE invoice_number = $1 AND customer_id = $2
             LIMIT 1`,
            [rows[0].invoice_number, rows[0].customer_id]
        );

        return res.json({
            success: true,
            data: {
                ...rows[0],
                invoice_info: invoiceRes.rows[0] || null
            }
        });

    } catch (error) {
        logger.error('❌ getPortalReturnRequestDetail Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/admin/portal-returns/:id/review
// Admin/Manager: approve অথবা reject করবে
// Body: { status: 'approved'|'rejected', admin_note }
// ============================================================
const reviewPortalReturnRequest = async (req, res) => {
    try {
        const { id }                   = req.params;
        const { status, admin_note }   = req.body;
        const reviewerId               = req.user.id;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'status হতে হবে: approved অথবা rejected'
            });
        }

        // রিকোয়েস্ট খোঁজো
        const existing = await query(
            `SELECT crr.*, c.owner_name, c.shop_name
             FROM customer_return_requests crr
             JOIN customers c ON c.id = crr.customer_id
             WHERE crr.id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const rr = existing.rows[0];

        if (rr.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `এই রিকোয়েস্ট আগেই ${rr.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'} হয়েছে।`
            });
        }

        // DB আপডেট
        const result = await query(
            `UPDATE customer_return_requests SET
                status      = $1,
                admin_note  = $2,
                reviewed_by = $3,
                reviewed_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [status, admin_note || null, reviewerId, id]
        );

        // কাস্টমারকে push notification পাঠাও
        try {
            const pushTitle = status === 'approved'
                ? '✅ ফেরতের অনুরোধ অনুমোদিত'
                : '❌ ফেরতের অনুরোধ বাতিল';
            const pushBody = status === 'approved'
                ? `ইনভয়েস ${rr.invoice_number}-এর ফেরতের অনুরোধ অনুমোদন হয়েছে। SR শীঘ্রই যোগাযোগ করবে।`
                : `ইনভয়েস ${rr.invoice_number}-এর ফেরতের অনুরোধ বাতিল হয়েছে।${admin_note ? ' কারণ: ' + admin_note : ''}`;

            await sendCustomerPush(rr.customer_id, {
                title: pushTitle,
                body:  pushBody,
                type:  'return_request_update',
                data:  { return_request_id: id, status }
            });
        } catch (pushErr) {
            // push ব্যর্থ হলেও মূল কাজ বাতিল হবে না
            logger.error('[PortalReturn] Push error:', pushErr.message);
        }

        const statusBn = status === 'approved' ? 'অনুমোদিত' : 'বাতিল';
        return res.json({
            success: true,
            message: `রিকোয়েস্ট ${statusBn} করা হয়েছে।`,
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ reviewPortalReturnRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিভিউ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/admin/portal-returns/:id/complete
// SR বা Admin: approved রিকোয়েস্ট সম্পন্ন করবে
// (কাস্টমারের কাছ থেকে পণ্য ফেরত নেওয়া হয়েছে)
// ============================================================
const completePortalReturnRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await query(
            `SELECT * FROM customer_return_requests WHERE id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        if (existing.rows[0].status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'শুধুমাত্র approved রিকোয়েস্ট complete করা যাবে।'
            });
        }

        const result = await query(
            `UPDATE customer_return_requests SET
                status       = 'completed',
                completed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // কাস্টমারকে completion notification
        try {
            await sendCustomerPush(existing.rows[0].customer_id, {
                title: '📦 পণ্য ফেরত সম্পন্ন',
                body:  `ইনভয়েস ${existing.rows[0].invoice_number}-এর পণ্য ফেরত প্রক্রিয়া সম্পন্ন হয়েছে।`,
                type:  'return_request_update',
                data:  { return_request_id: id, status: 'completed' }
            });
        } catch (pushErr) {
            logger.error('[PortalReturn] Complete push error:', pushErr.message);
        }

        return res.json({
            success: true,
            message: 'ফেরত প্রক্রিয়া সম্পন্ন হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ completePortalReturnRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getPortalReturnRequests,
    getPortalReturnRequestDetail,
    reviewPortalReturnRequest,
    completePortalReturnRequest
};
