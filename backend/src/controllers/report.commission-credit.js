// ============================================================
// COMMISSION & CREDIT REPORT CONTROLLERS
// GET /api/reports/commission
// GET /api/reports/credit
// ============================================================

const { query } = require('../config/db');
const {
    exportCommissionExcel,
    exportCreditExcel,
} = require('./report.exports');

// ============================================================
// COMMISSION REPORT
// ============================================================

const getCommissionReport = async (req, res) => {
    try {
        const { month, year, worker_id, export: exportType } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            'EXTRACT(YEAR FROM c.date) = $1',
            'EXTRACT(MONTH FROM c.date) = $2',
            "u.role = 'worker'"
        ];
        let params     = [currentYear, currentMonth];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }
        if (worker_id) {
            paramCount++;
            conditions.push(`c.user_id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code, u.basic_salary,
                    COALESCE(SUM(c.sales_amount), 0)  AS total_sales,
                    COALESCE(SUM(CASE WHEN c.type='daily' THEN c.commission_amount END), 0)            AS commission,
                    COALESCE(SUM(CASE WHEN c.type='attendance_bonus' THEN c.commission_amount END), 0) AS bonus,
                    u.outstanding_dues
             FROM users u
             LEFT JOIN commission c ON u.id = c.user_id
                AND EXTRACT(YEAR FROM c.date) = $1
                AND EXTRACT(MONTH FROM c.date) = $2
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code, u.basic_salary, u.outstanding_dues
             ORDER BY total_sales DESC`,
            params
        );

        const enriched = result.rows.map(row => ({
            ...row,
            net_payable: Math.max(0,
                parseFloat(row.basic_salary     || 0) +
                parseFloat(row.commission       || 0) +
                parseFloat(row.bonus            || 0) -
                parseFloat(row.outstanding_dues || 0)
            )
        }));

        if (exportType === 'excel') {
            return await exportCommissionExcel(res, enriched, currentYear, currentMonth);
        }

        return res.status(200).json({
            success: true,
            data: { month: currentMonth, year: currentYear, workers: enriched }
        });

    } catch (error) {
        console.error('❌ Commission Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREDIT RECOVERY REPORT
// ============================================================

const getCreditReport = async (req, res) => {
    try {
        const { route_id, export: exportType } = req.query;

        let conditions = ['c.is_active = true', 'c.current_credit > 0'];
        let params     = [];
        let paramCount = 0;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(
                `c.route_id IN (SELECT id FROM routes WHERE manager_id = $${paramCount})`
            );
            params.push(req.teamFilter);
        }
        if (route_id) {
            paramCount++;
            conditions.push(`c.route_id = $${paramCount}`);
            params.push(route_id);
        }

        const result = await query(
            `SELECT c.customer_code, c.shop_name, c.owner_name,
                    c.whatsapp, c.sms_phone,
                    c.credit_limit, c.current_credit,
                    r.name AS route_name,
                    ROUND((c.current_credit / NULLIF(c.credit_limit, 0) * 100)::numeric, 1) AS usage_pct,
                    MAX(st.date) AS last_sale_date
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN sales_transactions st ON c.id = st.customer_id
             WHERE ${conditions.join(' AND ')}
             GROUP BY c.id, c.customer_code, c.shop_name, c.owner_name,
                      c.whatsapp, c.sms_phone, c.credit_limit, c.current_credit,
                      r.name
             ORDER BY c.current_credit DESC`,
            params
        );

        const totalOutstanding = result.rows.reduce(
            (sum, r) => sum + parseFloat(r.current_credit || 0), 0
        );

        if (exportType === 'excel') {
            return await exportCreditExcel(res, result.rows, totalOutstanding);
        }

        return res.status(200).json({
            success: true,
            data: { customers: result.rows, total_outstanding: totalOutstanding }
        });

    } catch (error) {
        console.error('❌ Credit Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getCommissionReport, getCreditReport };
