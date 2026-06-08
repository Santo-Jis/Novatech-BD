const logger = require('../config/logger');
// ============================================================
// CUSTOMER PORTAL — Return Request Admin/Manager Review
// backend/src/controllers/customerPortalReturn.controller.js
//
// ✅ Improvements:
//   1. type filter (return / replacement)
//   2. completed_by — কে complete করেছে সংরক্ষণ ও দেখানো
//   3. Manager route filter — manager শুধু নিজের route দেখবে
//   4. Bulk approve/reject
// ============================================================

const { query } = require('../config/db');
const { sendCustomerPush } = require('../services/fcm.service');

// ── Manager route filter (adminDevice.controller থেকে অনুসরণ) ──
const buildManagerRouteFilter = async (user, params, alias = 'c') => {
    if (user.role === 'admin') return { clause: '', params };

    const routeResult = await query(
        'SELECT id FROM routes WHERE manager_id = $1',
        [user.id]
    );

    if (routeResult.rows.length === 0) {
        return { clause: `AND 1=0`, params }; // route নেই → empty
    }

    const routeIds = routeResult.rows.map(r => r.id);
    params.push(routeIds);
    return { clause: `AND ${alias}.route_id = ANY($${params.length})`, params };
};

// ============================================================
// GET /api/admin/portal-returns
// ✅ নতুন filter: type (return/replacement), manager route filter
// ============================================================
const getPortalReturnRequests = async (req, res) => {
    try {
        const { status, type, customer_id, date_from, date_to } = req.query;
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        let params  = [];
        let filters = [];

        if (status && ['pending','approved','rejected','completed'].includes(status)) {
            params.push(status);
            filters.push(`crr.status = $${params.length}`);
        }

        // ✅ নতুন — type filter
        if (type && ['return', 'replacement'].includes(type)) {
            params.push(type);
            filters.push(`crr.type = $${params.length}`);
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

        // ✅ নতুন — Manager route filter
        const { clause, params: updatedParams } = await buildManagerRouteFilter(req.user, params);
        params = updatedParams;
        if (clause) filters.push(clause.replace(/^AND /, ''));

        const where  = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
        const pLimit  = params.length + 1;
        const pOffset = params.length + 2;

        const { rows } = await query(
            `SELECT
                crr.id,
                crr.type,
                crr.invoice_number,
                crr.total_return_value,
                crr.items,
                crr.note,
                crr.status,
                crr.admin_note,
                crr.created_at,
                crr.updated_at,
                crr.reviewed_at,
                crr.completed_at,
                c.owner_name      AS customer_name,
                c.shop_name,
                c.customer_code,
                c.whatsapp,
                c.sms_phone,
                rv.name_bn        AS reviewed_by_name,
                cb.name_bn        AS completed_by_name
             FROM customer_return_requests crr
             JOIN customers c     ON c.id  = crr.customer_id
             LEFT JOIN users rv   ON rv.id = crr.reviewed_by
             LEFT JOIN users cb   ON cb.id = crr.completed_by
             ${where}
             ORDER BY
                 CASE crr.status WHEN 'pending' THEN 0 ELSE 1 END,
                 crr.created_at DESC
             LIMIT $${pLimit} OFFSET $${pOffset}`,
            [...params, limit, offset]
        );

        const [countRes, summaryRes] = await Promise.all([
            query(
                `SELECT COUNT(*) AS total
                 FROM customer_return_requests crr
                 JOIN customers c ON c.id = crr.customer_id
                 ${where}`,
                params
            ),
            // Summary — filter ছাড়া সব status-এর count
            query(`
                SELECT
                    type,
                    COUNT(*) FILTER (WHERE status='pending')   AS pending,
                    COUNT(*) FILTER (WHERE status='approved')  AS approved,
                    COUNT(*) FILTER (WHERE status='rejected')  AS rejected,
                    COUNT(*) FILTER (WHERE status='completed') AS completed,
                    COUNT(*)                                    AS total
                FROM customer_return_requests
                GROUP BY type
            `),
        ]);

        const total      = parseInt(countRes.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // summary → { return: {...}, replacement: {...}, all: {...} }
        const summary = { all: { pending:0, approved:0, rejected:0, completed:0, total:0 } };
        summaryRes.rows.forEach(r => {
            summary[r.type] = {
                pending:   parseInt(r.pending),
                approved:  parseInt(r.approved),
                rejected:  parseInt(r.rejected),
                completed: parseInt(r.completed),
                total:     parseInt(r.total),
            };
            ['pending','approved','rejected','completed','total'].forEach(k => {
                summary.all[k] = (summary.all[k] || 0) + parseInt(r[k]);
            });
        });

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
// ✅ completed_by_name যোগ হয়েছে
// ============================================================
const getPortalReturnRequestDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await query(
            `SELECT
                crr.*,
                c.owner_name      AS customer_name,
                c.shop_name,
                c.customer_code,
                c.whatsapp,
                c.sms_phone,
                rv.name_bn        AS reviewed_by_name,
                cb.name_bn        AS completed_by_name
             FROM customer_return_requests crr
             JOIN customers c     ON c.id  = crr.customer_id
             LEFT JOIN users rv   ON rv.id = crr.reviewed_by
             LEFT JOIN users cb   ON cb.id = crr.completed_by
             WHERE crr.id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const invoiceRes = await query(
            `SELECT invoice_number, net_amount, created_at, payment_method, payment_status
             FROM sales_transactions
             WHERE invoice_number = $1 AND customer_id = $2
             LIMIT 1`,
            [rows[0].invoice_number, rows[0].customer_id]
        );

        return res.json({
            success: true,
            data: { ...rows[0], invoice_info: invoiceRes.rows[0] || null }
        });

    } catch (error) {
        logger.error('❌ getPortalReturnRequestDetail Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/admin/portal-returns/:id/review
// approve অথবা reject — অপরিবর্তিত
// ============================================================
const reviewPortalReturnRequest = async (req, res) => {
    try {
        const { id }                 = req.params;
        const { status, admin_note } = req.body;
        const reviewerId             = req.user.id;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'status হতে হবে: approved অথবা rejected' });
        }

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

        const result = await query(
            `UPDATE customer_return_requests SET
                status      = $1,
                admin_note  = $2,
                reviewed_by = $3,
                reviewed_at = NOW()
             WHERE id = $4 RETURNING *`,
            [status, admin_note || null, reviewerId, id]
        );

        // Push notification
        try {
            const isApproved = status === 'approved';
            await sendCustomerPush(rr.customer_id, {
                title: isApproved ? '✅ ফেরতের অনুরোধ অনুমোদিত' : '❌ ফেরতের অনুরোধ বাতিল',
                body:  isApproved
                    ? `ইনভয়েস ${rr.invoice_number}-এর ফেরতের অনুরোধ অনুমোদন হয়েছে।`
                    : `ইনভয়েস ${rr.invoice_number}-এর ফেরতের অনুরোধ বাতিল হয়েছে।${admin_note ? ' কারণ: ' + admin_note : ''}`,
                type: 'return_request_update',
                data: { return_request_id: id, status }
            });
        } catch (pushErr) {
            logger.error('[PortalReturn] Push error:', pushErr.message);
        }

        const statusBn = status === 'approved' ? 'অনুমোদিত' : 'বাতিল';
        return res.json({ success: true, message: `রিকোয়েস্ট ${statusBn} করা হয়েছে।`, data: result.rows[0] });

    } catch (error) {
        logger.error('❌ reviewPortalReturnRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিভিউ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/admin/portal-returns/:id/complete
// ✅ নতুন — completed_by সংরক্ষণ করা হচ্ছে
// ============================================================
const completePortalReturnRequest = async (req, res) => {
    try {
        const { id }    = req.params;
        const completedById = req.user.id;

        const existing = await query(
            `SELECT * FROM customer_return_requests WHERE id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }
        if (existing.rows[0].status !== 'approved') {
            return res.status(400).json({ success: false, message: 'শুধুমাত্র approved রিকোয়েস্ট complete করা যাবে।' });
        }

        // ✅ completed_by সংরক্ষণ
        const result = await query(
            `UPDATE customer_return_requests SET
                status       = 'completed',
                completed_at = NOW(),
                completed_by = $1
             WHERE id = $2 RETURNING *`,
            [completedById, id]
        );

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

        return res.json({ success: true, message: 'ফেরত প্রক্রিয়া সম্পন্ন হয়েছে।', data: result.rows[0] });

    } catch (error) {
        logger.error('❌ completePortalReturnRequest Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/admin/portal-returns/bulk-review
// ✅ নতুন — একসাথে অনেকগুলো approve/reject
// Body: { ids: [uuid, ...], status: 'approved'|'rejected', admin_note? }
// ============================================================
const bulkReviewPortalReturnRequests = async (req, res) => {
    try {
        const { ids, status, admin_note } = req.body;
        const reviewerId = req.user.id;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'ids array দিন।' });
        }
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'status হতে হবে: approved অথবা rejected' });
        }
        if (ids.length > 50) {
            return res.status(400).json({ success: false, message: 'একবারে সর্বোচ্চ ৫০টি করা যাবে।' });
        }

        // শুধু pending গুলো update করো
        const result = await query(
            `UPDATE customer_return_requests SET
                status      = $1,
                admin_note  = $2,
                reviewed_by = $3,
                reviewed_at = NOW()
             WHERE id = ANY($4)
               AND status = 'pending'
             RETURNING id, customer_id, invoice_number, status`,
            [status, admin_note || null, reviewerId, ids]
        );

        const updated = result.rows;
        const skipped = ids.length - updated.length;

        // Push notification — সবাইকে
        const pushTitle = status === 'approved' ? '✅ ফেরতের অনুরোধ অনুমোদিত' : '❌ ফেরতের অনুরোধ বাতিল';
        await Promise.allSettled(
            updated.map(rr =>
                sendCustomerPush(rr.customer_id, {
                    title: pushTitle,
                    body:  `ইনভয়েস ${rr.invoice_number}-এর ফেরতের অনুরোধ ${status === 'approved' ? 'অনুমোদন' : 'বাতিল'} হয়েছে।`,
                    type:  'return_request_update',
                    data:  { return_request_id: rr.id, status }
                }).catch(e => logger.error('[BulkReview] Push error:', e.message))
            )
        );

        const statusBn = status === 'approved' ? 'অনুমোদিত' : 'বাতিল';
        return res.json({
            success:  true,
            message:  `${updated.length}টি রিকোয়েস্ট ${statusBn} করা হয়েছে।${skipped > 0 ? ` (${skipped}টি pending ছিল না — বাদ দেওয়া হয়েছে)` : ''}`,
            updated:  updated.length,
            skipped,
        });

    } catch (error) {
        logger.error('❌ bulkReviewPortalReturnRequests Error:', error.message);
        return res.status(500).json({ success: false, message: 'Bulk review-এ সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getPortalReturnRequests,
    getPortalReturnRequestDetail,
    reviewPortalReturnRequest,
    completePortalReturnRequest,
    bulkReviewPortalReturnRequests,  // ✅ নতুন
};
