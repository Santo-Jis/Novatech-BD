const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET /api/invoice-target/my-progress
// SR এই মাসে কতটা unique দোকানে invoice করেছে
// ============================================================

const getMyProgress = async (req, res) => {
    try {
        const workerId = req.user.id;
        const now      = new Date();
        const month    = now.getMonth() + 1;
        const year     = now.getFullYear();

        // target বের করো
        const targetRes = await query(
            `SELECT COALESCE(monthly_invoice_target, 0) AS target FROM users WHERE id = $1
             AND tenant_id = $2`,
            [workerId, req.tenantId]
        );
        const target = parseInt(targetRes.rows[0]?.target || 0);

        // এই মাসে unique customer-এ কতটা verified sale হয়েছে
        const progressRes = await query(
            `SELECT COUNT(DISTINCT customer_id)::INTEGER AS achieved
             FROM sales_transactions
             WHERE worker_id = $1
               AND EXTRACT(MONTH FROM created_at) = $2
               AND EXTRACT(YEAR  FROM created_at) = $3
               AND status = 'verified'
             AND tenant_id = $4`,
            [workerId, month, year, req.tenantId]
        );
        const achieved = parseInt(progressRes.rows[0]?.achieved || 0);

        const remaining  = Math.max(0, target - achieved);
        const pct        = target > 0 ? Math.min(100, Math.round(achieved / target * 100)) : 0;
        const daysInMonth = new Date(year, month, 0).getDate();
        const today      = now.getDate();
        const daysLeft   = daysInMonth - today;

        return res.json({
            success: true,
            data: { target, achieved, remaining, pct, days_left: daysLeft, month, year }
        });

    } catch (err) {
        logger.error('[InvoiceTarget] getMyProgress error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/invoice-target/team-progress
// Manager-এর team-এর সবার invoice target progress
// ============================================================

const getTeamProgress = async (req, res) => {
    try {
        const managerId = req.user.id;
        const now   = new Date();
        const month = parseInt(req.query.month) || now.getMonth() + 1;
        const year  = parseInt(req.query.year)  || now.getFullYear();

        const teamRes = await query(
            `SELECT t.id FROM teams t WHERE t.manager_id = $1
             AND t.tenant_id = $2
             LIMIT 1`,
            [managerId, req.tenantId]
        );
        if (!teamRes.rows.length) {
            return res.json({ success: true, data: [] });
        }
        const teamId = teamRes.rows[0].id;

        const result = await query(
            `SELECT
                u.id, u.name_bn AS name,
                COALESCE(u.monthly_invoice_target, 0)::INTEGER AS target,
                COUNT(DISTINCT st.customer_id)::INTEGER         AS achieved
             FROM users u
             LEFT JOIN sales_transactions st
                ON st.worker_id = u.id
                AND EXTRACT(MONTH FROM st.created_at) = $2
                AND EXTRACT(YEAR  FROM st.created_at) = $3
                AND st.status = 'verified'
             WHERE u.team_id = $1 AND u.role = 'worker'
             GROUP BY u.id, u.name_bn, u.monthly_invoice_target
             ORDER BY achieved DESC`,
            [teamId, month, year]
        );

        const data = result.rows.map(r => ({
            ...r,
            remaining : Math.max(0, r.target - r.achieved),
            pct       : r.target > 0 ? Math.min(100, Math.round(r.achieved / r.target * 100)) : 0,
        }));

        return res.json({ success: true, data });

    } catch (err) {
        logger.error('[InvoiceTarget] getTeamProgress error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/invoice-target/set
// Admin/Manager — SR-এর invoice target set করবে
// ============================================================

const setTarget = async (req, res) => {
    try {
        const { worker_id, target } = req.body;

        if (!worker_id || target === undefined) {
            return res.status(400).json({ success: false, message: 'worker_id ও target দিন।' });
        }

        await query(
            `UPDATE users SET monthly_invoice_target = $1 WHERE id = $2
             AND tenant_id = $3`,
            [parseInt(target), worker_id, req.tenantId]
        );

        return res.json({ success: true, message: 'Invoice target সেট হয়েছে।' });

    } catch (err) {
        logger.error('[InvoiceTarget] setTarget error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getMyProgress, getTeamProgress, setTarget };
