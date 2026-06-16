const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// ============================================================
// CREDIT SETTINGS
// Admin থেকে threshold ও approval toggle সেট করা হয়
// Table: credit_settings (singleton row, id=1)
//   alert_threshold_pct   INT     default 80   (80% হলে SR-কে alert)
//   require_approval      BOOLEAN default false (limit-এ পৌঁছলে approval লাগবে)
//   updated_by            UUID
//   updated_at            TIMESTAMPTZ
// ============================================================

// GET /api/credit-approvals/settings
const getSettings = async (req, res) => {
    try {
        const result = await query(
            `SELECT alert_threshold_pct, require_approval
             FROM credit_settings
             WHERE id = 1`
        );

        // Row না থাকলে default দাও
        if (result.rows.length === 0) {
            return res.status(200).json({
                success: true,
                data: { alert_threshold_pct: 80, require_approval: false }
            });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Get Credit Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'সেটিংস আনতে সমস্যা হয়েছে।' });
    }
};

// PUT /api/credit-approvals/settings  (Admin only)
const updateSettings = async (req, res) => {
    try {
        const { alert_threshold_pct, require_approval } = req.body;

        if (
            alert_threshold_pct === undefined ||
            alert_threshold_pct < 1 ||
            alert_threshold_pct > 100
        ) {
            return res.status(400).json({
                success: false,
                message: 'threshold ১–১০০ এর মধ্যে হতে হবে।'
            });
        }

        // UPSERT — row না থাকলে insert, থাকলে update
        await query(
            `INSERT INTO credit_settings (id, alert_threshold_pct, require_approval, updated_by, updated_at, tenant_id) VALUES (1, $1, $2, $3, NOW(, $4))
             ON CONFLICT (id) DO UPDATE
               SET alert_threshold_pct = EXCLUDED.alert_threshold_pct,
                   require_approval    = EXCLUDED.require_approval,
                   updated_by          = EXCLUDED.updated_by,
                   updated_at          = NOW()`,
            [
                parseInt(alert_threshold_pct),
                require_approval === true || require_approval === 'true',
                req.user.id, req.tenantId]
        );

        return res.status(200).json({
            success: true,
            message: 'ক্রেডিট সেটিংস সংরক্ষিত হয়েছে।',
            data: {
                alert_threshold_pct: parseInt(alert_threshold_pct),
                require_approval: require_approval === true || require_approval === 'true'
            }
        });
    } catch (error) {
        logger.error('❌ Update Credit Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'সেটিংস সংরক্ষণে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREDIT APPROVAL REQUESTS
// SR যখন credit limit-এ approval চায়
// Table: credit_approval_requests
//   id              SERIAL PK
//   customer_id     UUID  FK customers
//   worker_id       UUID  FK users (SR)
//   manager_id      UUID  FK users (যে manager রিভিউ করবে)
//   requested_amount NUMERIC
//   note            TEXT
//   status          ENUM('pending','approved','rejected')  default 'pending'
//   reviewed_by     UUID FK users
//   reviewed_at     TIMESTAMPTZ
//   review_note     TEXT
//   created_at      TIMESTAMPTZ default NOW()
//   expires_at      TIMESTAMPTZ (২৪ ঘন্টা পরে expire)
// ============================================================

// POST /api/credit-approvals/request  (Worker/SR)
// SR Sales Form থেকে call করে
const requestApproval = async (req, res) => {
    try {
        const { customer_id, requested_amount, note } = req.body;

        if (!customer_id || !requested_amount) {
            return res.status(400).json({
                success: false,
                message: 'customer_id এবং requested_amount আবশ্যক।'
            });
        }

        // Customer তথ্য
        const custResult = await query(
            `SELECT c.id, c.shop_name, c.current_credit, c.credit_limit,
                    ca.worker_id,
                    r.manager_id
             FROM customers c
             LEFT JOIN customer_assignments ca
               ON ca.customer_id = c.id AND ca.is_active = true AND ca.worker_id = $2
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE c.id = $1`,
            [customer_id, req.user.id,
                req.tenantId]
        );

        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = custResult.rows[0];

        // আগে pending request আছে কিনা চেক করো (একই customer-এর জন্য)
        const existing = await query(
            `SELECT id FROM credit_approval_requests
             WHERE customer_id = $1
               AND worker_id   = $2
               AND status      = 'pending'
               AND expires_at  > NOW()
             AND tenant_id = $3`,
            [customer_id, req.user.id]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success:    false,
                message:    'এই কাস্টমারের জন্য ইতোমধ্যে একটি pending approval request আছে।',
                request_id: existing.rows[0].id
            });
        }

        const result = await query(
            `INSERT INTO credit_approval_requests (customer_id, worker_id, manager_id, requested_amount, note, expires_at, tenant_id) VALUES ($1, $2, $3, $4, $5, NOW(, $6) + INTERVAL '24 hours')
             RETURNING id, created_at`,
            [
                customer_id,
                req.user.id,
                cust.manager_id || null,
                parseFloat(requested_amount),
                note || null, req.tenantId]
        );

        return res.status(201).json({
            success:    true,
            message:    'ম্যানেজারের কাছে approval request পাঠানো হয়েছে।',
            request_id: result.rows[0].id,
            created_at: result.rows[0].created_at
        });

    } catch (error) {
        logger.error('❌ Request Approval Error:', error.message);
        return res.status(500).json({ success: false, message: 'Request পাঠাতে সমস্যা হয়েছে।' });
    }
};

// GET /api/credit-approvals/pending  (Manager/Admin)
// Pending approval list
const getPendingApprovals = async (req, res) => {
    try {
        let whereClause = `car.status = 'pending' AND car.expires_at > NOW()`;
        const params = [];

        // Manager শুধু নিজের route-এর দেখবে
        if (req.user.role === 'manager') {
            whereClause += ` AND car.manager_id = $1`;
            params.push(req.user.id);
        }

        const result = await query(
            `SELECT
                car.id,
                car.created_at,
                car.expires_at,
                car.requested_amount,
                car.note,
                car.status,
                c.id            AS customer_id,
                c.shop_name,
                c.owner_name,
                c.current_credit,
                c.credit_limit,
                w.id            AS worker_id,
                w.name_bn       AS sr_name,
                m.name_bn       AS manager_name,
                ROUND((c.current_credit::numeric / NULLIF(c.credit_limit::numeric, 0)) * 100) AS credit_used_pct
             FROM credit_approval_requests car
             JOIN customers c ON car.customer_id = c.id
             JOIN users     w ON car.worker_id   = w.id
             LEFT JOIN users m ON car.manager_id = m.id
             WHERE ${whereClause}
             ORDER BY car.created_at DESC`,
            params
        );

        return res.status(200).json({
            success: true,
            count:   result.rows.length,
            data:    result.rows
        });

    } catch (error) {
        logger.error('❌ Get Pending Approvals Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// PUT /api/credit-approvals/:id/approve  (Manager/Admin)
const approveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { review_note } = req.body;

        const result = await query(
            `UPDATE credit_approval_requests
             SET status      = 'approved',
                 reviewed_by = $1,
                 reviewed_at = NOW(),
                 review_note = $2
             WHERE id = $3
               AND status = 'pending'
             RETURNING id, customer_id, worker_id, requested_amount`,
            [req.user.id, review_note || null, parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Request পাওয়া যায়নি বা ইতোমধ্যে review হয়েছে।'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Approval দেওয়া হয়েছে। SR বিক্রয় করতে পারবে।',
            data:    result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Approve Request Error:', error.message);
        return res.status(500).json({ success: false, message: 'Approval-এ সমস্যা হয়েছে।' });
    }
};

// PUT /api/credit-approvals/:id/reject  (Manager/Admin)
const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { review_note } = req.body;

        const result = await query(
            `UPDATE credit_approval_requests
             SET status      = 'rejected',
                 reviewed_by = $1,
                 reviewed_at = NOW(),
                 review_note = $2
             WHERE id = $3
               AND status = 'pending'
             RETURNING id, customer_id, worker_id`,
            [req.user.id, review_note || null, parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Request পাওয়া যায়নি বা ইতোমধ্যে review হয়েছে।'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Request reject করা হয়েছে।',
            data:    result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Reject Request Error:', error.message);
        return res.status(500).json({ success: false, message: 'Reject-এ সমস্যা হয়েছে।' });
    }
};

// GET /api/credit-approvals/check/:customerId  (Worker)
// SR Sales Form থেকে check করে — এই customer-এ approved request আছে কিনা
const checkApprovalStatus = async (req, res) => {
    try {
        const { customerId } = req.params;

        const result = await query(
            `SELECT id, status, reviewed_at, review_note, expires_at
             FROM credit_approval_requests
             WHERE customer_id = $1
               AND worker_id   = $2
               AND expires_at  > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [customerId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({ success: true, status: 'none' });
        }

        return res.status(200).json({
            success: true,
            status:  result.rows[0].status,   // 'pending' | 'approved' | 'rejected'
            data:    result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Check Approval Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DUE LEADERBOARD — বকেয়া ranking
// GET /api/credit-approvals/due-leaderboard  (Manager/Admin)
// ============================================================
const getDueLeaderboard = async (req, res) => {
    try {
        let routeFilter = '';
        const params = [];

        if (req.user.role === 'manager') {
            routeFilter = `AND r.manager_id = $1`;
            params.push(req.user.id);
        }

        const result = await query(
            `SELECT
                c.id,
                c.shop_name,
                c.owner_name,
                c.current_credit,
                c.credit_limit,
                c.credit_balance,
                CASE
                    WHEN c.credit_limit > 0
                    THEN ROUND((c.current_credit::numeric / c.credit_limit::numeric) * 100)
                    ELSE 0
                END                         AS credit_used_pct,
                GREATEST(0, c.credit_limit - c.current_credit) AS remaining,
                w.name_bn                   AS assigned_sr,
                r.name                      AS route_name,
                -- সর্বশেষ বাকি বিক্রয়ের তারিখ
                MAX(st.created_at)          AS last_credit_sale_at
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN customer_assignments ca
               ON ca.customer_id = c.id AND ca.is_active = true
             LEFT JOIN users w ON ca.worker_id = w.id
             LEFT JOIN sales_transactions st
               ON st.customer_id = c.id AND st.payment_method = 'credit'
             WHERE c.current_credit > 0
               ${routeFilter}
             GROUP BY c.id, c.shop_name, c.owner_name,
                      c.current_credit, c.credit_limit, c.credit_balance,
                      w.name_bn, r.name
             ORDER BY c.current_credit DESC
             LIMIT 100`,
            params
        );

        // Summary stats
        const totalDue      = result.rows.reduce((s, r) => s + parseFloat(r.current_credit || 0), 0);
        const overLimitCount = result.rows.filter(r =>
            parseFloat(r.credit_limit) > 0 &&
            parseFloat(r.current_credit) >= parseFloat(r.credit_limit)
        ).length;
        const highRiskCount = result.rows.filter(r => parseInt(r.credit_used_pct) >= 80).length;

        return res.status(200).json({
            success: true,
            summary: {
                total_customers_with_due: result.rows.length,
                total_due_amount:         totalDue,
                over_limit_count:         overLimitCount,
                high_risk_count:          highRiskCount
            },
            data: result.rows
        });

    } catch (error) {
        logger.error('❌ Due Leaderboard Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// GET /api/credit-approvals/history  (Manager/Admin)
// approved/rejected history
const getApprovalHistory = async (req, res) => {
    try {
        const { from, to, status } = req.query;
        const params = [];
        const conditions = [`car.status != 'pending'`];

        if (req.user.role === 'manager') {
            conditions.push(`car.manager_id = $${params.length + 1}`);
            params.push(req.user.id);
        }
        if (from) { conditions.push(`DATE(car.created_at) >= $${params.length + 1}`); params.push(from); }
        if (to)   { conditions.push(`DATE(car.created_at) <= $${params.length + 1}`); params.push(to); }
        if (status && ['approved','rejected'].includes(status)) {
            conditions.push(`car.status = $${params.length + 1}`); params.push(status);
        }

        const result = await query(
            `SELECT
                car.id, car.created_at, car.reviewed_at,
                car.status, car.requested_amount, car.review_note,
                c.shop_name, c.owner_name,
                w.name_bn  AS sr_name,
                rv.name_bn AS reviewed_by_name
             FROM credit_approval_requests car
             JOIN customers c  ON car.customer_id = c.id
             JOIN users     w  ON car.worker_id   = w.id
             LEFT JOIN users rv ON car.reviewed_by = rv.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY car.reviewed_at DESC
             LIMIT 200`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Approval History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    requestApproval,
    getPendingApprovals,
    approveRequest,
    rejectRequest,
    checkApprovalStatus,
    getDueLeaderboard,
    getApprovalHistory
};
