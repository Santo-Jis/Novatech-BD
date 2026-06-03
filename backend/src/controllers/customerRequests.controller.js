const logger = require('../config/logger');
// ============================================================
// customerRequests.controller.js
// Admin & Manager — Credit Limit Requests ও Complaints
// ============================================================
const { query } = require('../config/db');
const { sendCustomerNotification } = require('./customerNotification.controller');

// ══════════════════════════════════════════════════════════════
// CREDIT LIMIT REQUESTS
// ══════════════════════════════════════════════════════════════

// GET /api/customer-requests/credit-limit?status=pending
const getCreditLimitRequests = async (req, res) => {
    try {
        const { status = 'pending', limit = 50, offset = 0 } = req.query;
        const params = [];
        let whereClause = '';

        if (status !== 'all') {
            params.push(status);
            whereClause = `WHERE clr.status = $${params.length}`;
        }

        const result = await query(
            `SELECT
                 clr.id, clr.status, clr.current_limit,
                 clr.requested_amount, clr.reason,
                 clr.admin_note, clr.created_at, clr.resolved_at,
                 c.shop_name, c.owner_name, c.customer_code,
                 c.whatsapp, c.current_credit, c.credit_balance,
                 r.name AS route_name
             FROM credit_limit_requests clr
             JOIN customers c ON c.id = clr.customer_id
             LEFT JOIN routes r ON r.id = c.route_id
             ${whereClause}
             ORDER BY clr.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM credit_limit_requests clr ${whereClause}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: result.rows,
            total: parseInt(countResult.rows[0].count),
        });
    } catch (error) {
        logger.error('❌ Get Credit Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// PATCH /api/customer-requests/credit-limit/:id
const resolveCreditLimitRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_note, approved_amount } = req.body;
        // status: 'approved' | 'rejected'

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'status হবে approved বা rejected।' });
        }

        // Request আনো
        const reqResult = await query(
            `SELECT clr.*, c.id AS cust_id, c.shop_name, c.credit_limit
             FROM credit_limit_requests clr
             JOIN customers c ON c.id = clr.customer_id
             WHERE clr.id = $1 AND clr.status = 'pending'`,
            [id]
        );
        if (reqResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'আবেদন পাওয়া যায়নি বা ইতোমধ্যে প্রক্রিয়া হয়েছে।' });
        }
        const request = reqResult.rows[0];
        const finalAmount = parseFloat(approved_amount || request.requested_amount);

        // DB আপডেট
        await query(
            `UPDATE credit_limit_requests
             SET status = $1, admin_note = $2, resolved_at = NOW(),
                 approved_amount = $3
             WHERE id = $4`,
            [status, admin_note || null, finalAmount, id]
        );

        // Approved হলে customer এর credit_limit বাড়াও
        if (status === 'approved') {
            await query(
                `UPDATE customers SET credit_limit = $1 WHERE id = $2`,
                [finalAmount, request.cust_id]
            );
        }

        // কাস্টমারকে push notification পাঠাও
        const notifTitle = status === 'approved'
            ? '🎉 ক্রেডিট লিমিট বৃদ্ধি অনুমোদিত!'
            : '❌ ক্রেডিট লিমিট আবেদন নামঞ্জুর';
        const notifBody = status === 'approved'
            ? `আপনার ক্রেডিট লিমিট ৳${finalAmount.toLocaleString()} করা হয়েছে।${admin_note ? ' ' + admin_note : ''}`
            : `আপনার আবেদন নামঞ্জুর হয়েছে।${admin_note ? ' কারণ: ' + admin_note : ''}`;

        await sendCustomerNotification(request.cust_id, {
            title: notifTitle,
            body: notifBody,
            type: 'credit_request',
        });

        return res.status(200).json({
            success: true,
            message: status === 'approved' ? 'অনুমোদন সফল। ক্রেডিট লিমিট আপডেট হয়েছে।' : 'আবেদন নামঞ্জুর করা হয়েছে।'
        });
    } catch (error) {
        logger.error('❌ Resolve Credit Request Error:', error.message);
        return res.status(500).json({ success: false, message: 'প্রক্রিয়া করতে সমস্যা হয়েছে।' });
    }
};


// ══════════════════════════════════════════════════════════════
// COMPLAINT / FEEDBACK
// ══════════════════════════════════════════════════════════════

// GET /api/customer-requests/complaints?status=open&type=complaint
const getComplaints = async (req, res) => {
    try {
        const { status, type, limit = 50, offset = 0 } = req.query;
        const params = [];
        const conditions = [];

        if (status && status !== 'all') {
            params.push(status);
            conditions.push(`cc.status = $${params.length}`);
        }
        if (type && type !== 'all') {
            params.push(type);
            conditions.push(`cc.type = $${params.length}`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await query(
            `SELECT
                 cc.id, cc.type, cc.subject, cc.description,
                 cc.status, cc.admin_reply, cc.created_at, cc.resolved_at,
                 c.shop_name, c.owner_name, c.customer_code, c.whatsapp,
                 r.name AS route_name
             FROM customer_complaints cc
             JOIN customers c ON c.id = cc.customer_id
             LEFT JOIN routes r ON r.id = c.route_id
             ${where}
             ORDER BY cc.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const countResult = await query(
            `SELECT
                 COUNT(*) FILTER (WHERE status = 'open')       AS open_count,
                 COUNT(*) FILTER (WHERE status = 'in_progress') AS inprogress_count,
                 COUNT(*) FILTER (WHERE status = 'resolved')   AS resolved_count,
                 COUNT(*) AS total
             FROM customer_complaints cc ${where}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: result.rows,
            stats: countResult.rows[0],
        });
    } catch (error) {
        logger.error('❌ Get Complaints Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// PATCH /api/customer-requests/complaints/:id
const resolveComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_reply } = req.body;
        // status: 'in_progress' | 'resolved'

        if (!['in_progress', 'resolved', 'open'].includes(status)) {
            return res.status(400).json({ success: false, message: 'অবৈধ status।' });
        }

        const complaintResult = await query(
            `SELECT cc.*, c.id AS cust_id, c.shop_name
             FROM customer_complaints cc
             JOIN customers c ON c.id = cc.customer_id
             WHERE cc.id = $1`,
            [id]
        );
        if (complaintResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'অভিযোগ পাওয়া যায়নি।' });
        }
        const complaint = complaintResult.rows[0];

        await query(
            `UPDATE customer_complaints
             SET status = $1,
                 admin_reply = $2,
                 resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
             WHERE id = $3`,
            [status, admin_reply || null, id]
        );

        // কাস্টমারকে notification পাঠাও
        if (admin_reply) {
            const notifTitle = status === 'resolved'
                ? '✅ আপনার অভিযোগ সমাধান হয়েছে'
                : '📋 আপনার অভিযোগের আপডেট';

            await sendCustomerNotification(complaint.cust_id, {
                title: notifTitle,
                body: admin_reply,
                type: 'complaint',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'অভিযোগ আপডেট করা হয়েছে।'
        });
    } catch (error) {
        logger.error('❌ Resolve Complaint Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getCreditLimitRequests,
    resolveCreditLimitRequest,
    getComplaints,
    resolveComplaint,
};
