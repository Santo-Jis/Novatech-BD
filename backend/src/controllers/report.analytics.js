// ============================================================
// ANALYTICS & MISC REPORT CONTROLLERS
// GET /api/reports/kpi
// GET /api/reports/top-products
// GET /api/reports/top-shops
// GET /api/reports/archive
// GET /api/reports/employee/:id/pdf
// ============================================================

const { query }               = require('../config/db');
const { generateEmployeePDF } = require('../services/employee.service');

// ============================================================
// DASHBOARD KPI
// ============================================================

const getDashboardKPI = async (req, res) => {
    try {
        const { from, to } = req.query;
        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];

        const fromDate = from || firstOfMonth;
        const toDate   = to   || today;

        let workerFilter = '';
        let workerParams = [fromDate, toDate];
        let paramCount   = 2;

        if (req.teamFilter) {
            paramCount++;
            workerFilter = `AND u.manager_id = $${paramCount}`;
            workerParams.push(req.teamFilter);
        }

        const salesKPI = await query(
            `SELECT
                COUNT(DISTINCT st.worker_id)           AS active_workers,
                COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                COALESCE(SUM(st.cash_received), 0)     AS cash_collected,
                COALESCE(SUM(st.credit_used), 0)       AS credit_given,
                COALESCE(SUM(st.replacement_value), 0) AS replacement_value,
                COUNT(st.id)                           AS total_invoices
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE st.date BETWEEN $1 AND $2 ${workerFilter}`,
            workerParams
        );

        const attendanceKPI = await query(
            `SELECT
                COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS present,
                COUNT(CASE WHEN a.status = 'absent' THEN 1 END)            AS absent,
                COUNT(CASE WHEN a.status = 'late' THEN 1 END)              AS late,
                COUNT(u.id)                                                 AS total_workers
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id AND a.date = $1
             WHERE u.role = 'worker' AND u.status = 'active'
               ${req.teamFilter ? 'AND u.manager_id = $2' : ''}`,
            req.teamFilter ? [today, req.teamFilter] : [today]
        );

        const creditKPI = await query(
            `SELECT
                COUNT(c.id)                          AS total_customers,
                COALESCE(SUM(c.current_credit), 0)   AS total_outstanding,
                COUNT(CASE WHEN c.current_credit > 0 THEN 1 END) AS customers_with_dues
             FROM customers c
             JOIN routes r ON c.route_id = r.id
             WHERE c.is_active = true
               ${req.teamFilter ? 'AND r.manager_id = $1' : ''}`,
            req.teamFilter ? [req.teamFilter] : []
        );

        const pendingSettlements = await query(
            `SELECT COUNT(*) AS count
             FROM daily_settlements ds
             JOIN users u ON ds.worker_id = u.id
             WHERE ds.status = 'pending'
               ${req.teamFilter ? 'AND u.manager_id = $1' : ''}`,
            req.teamFilter ? [req.teamFilter] : []
        );

        return res.status(200).json({
            success: true,
            data: {
                period:              { from: fromDate, to: toDate },
                sales:               salesKPI.rows[0],
                attendance:          attendanceKPI.rows[0],
                credit:              creditKPI.rows[0],
                pending_settlements: parseInt(pendingSettlements.rows[0].count)
            }
        });

    } catch (error) {
        console.error('❌ KPI Error:', error.message);
        return res.status(500).json({ success: false, message: 'KPI আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TOP PRODUCTS
// ============================================================

const getTopProducts = async (req, res) => {
    try {
        const { from, to, limit = 10 } = req.query;
        const today    = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;

        const result = await query(
            `SELECT
                p.name AS product_name,
                p.sku,
                SUM(si.quantity)           AS total_qty,
                SUM(si.subtotal)           AS total_revenue,
                COUNT(DISTINCT si.sale_id) AS order_count,
                AVG(si.unit_price)         AS avg_price
             FROM sale_items si
             JOIN products p ON si.product_id = p.id
             JOIN sales_transactions st ON si.sale_id = st.id
             WHERE st.date BETWEEN $1 AND $2
             GROUP BY p.id, p.name, p.sku
             ORDER BY total_revenue DESC
             LIMIT $3`,
            [fromDate, toDate, limit]
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Top Products Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TOP SHOPS
// ============================================================

const getTopShops = async (req, res) => {
    try {
        const { from, to, limit = 10 } = req.query;
        const today    = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;

        const result = await query(
            `SELECT
                c.shop_name,
                c.owner_name,
                r.name AS route_name,
                c.current_credit,
                COUNT(st.id)                      AS order_count,
                COALESCE(SUM(st.total_amount), 0) AS total_purchase
             FROM customers c
             LEFT JOIN sales_transactions st ON st.customer_id = c.id
               AND st.date BETWEEN $1 AND $2
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE c.is_active = true
             GROUP BY c.id, c.shop_name, c.owner_name, r.name, c.current_credit
             ORDER BY total_purchase DESC
             LIMIT $3`,
            [fromDate, toDate, limit]
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Top Shops Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MONTHLY ARCHIVE
// ============================================================

const getMonthlyArchive = async (req, res) => {
    try {
        const { year, month } = req.query;
        if (!year || !month) {
            return res.status(400).json({ success: false, message: 'year ও month দিন।' });
        }

        const [salesSum, attendanceSum, commissionSum, topWorkers] = await Promise.all([
            query(
                `SELECT
                    COUNT(st.id) AS invoice_count,
                    COALESCE(SUM(total_amount), 0)      AS gross_sales,
                    COALESCE(SUM(net_amount), 0)        AS net_sales,
                    COALESCE(SUM(cash_received), 0)     AS cash_collected,
                    COALESCE(SUM(credit_used), 0)       AS credit_given,
                    COALESCE(SUM(replacement_value), 0) AS replacement,
                    COALESCE(SUM(vat_amount), 0)        AS total_vat
                 FROM sales_transactions
                 WHERE EXTRACT(YEAR FROM date) = $1
                   AND EXTRACT(MONTH FROM date) = $2`,
                [year, month]
            ),
            query(
                `SELECT
                    COUNT(CASE WHEN status = 'present' THEN 1 END) AS present,
                    COUNT(CASE WHEN status = 'late'    THEN 1 END) AS late,
                    COUNT(CASE WHEN status = 'absent'  THEN 1 END) AS absent,
                    COALESCE(SUM(salary_deduction), 0)             AS total_deduction
                 FROM attendance
                 WHERE EXTRACT(YEAR FROM date) = $1
                   AND EXTRACT(MONTH FROM date) = $2`,
                [year, month]
            ),
            query(
                `SELECT
                    COALESCE(SUM(commission_amount), 0) AS total_commission,
                    COALESCE(SUM(net_payable), 0)       AS total_payable
                 FROM monthly_commissions
                 WHERE year = $1 AND month = $2`,
                [year, month]
            ),
            query(
                `SELECT u.name_bn, u.employee_code,
                    COALESCE(SUM(st.total_amount), 0) AS total_sales,
                    COUNT(st.id) AS invoice_count
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE EXTRACT(YEAR FROM st.date) = $1
                   AND EXTRACT(MONTH FROM st.date) = $2
                 GROUP BY u.id, u.name_bn, u.employee_code
                 ORDER BY total_sales DESC
                 LIMIT 5`,
                [year, month]
            )
        ]);

        return res.status(200).json({
            success: true,
            data: {
                period:      { year: parseInt(year), month: parseInt(month) },
                sales:       salesSum.rows[0],
                attendance:  attendanceSum.rows[0],
                payroll:     commissionSum.rows[0],
                top_workers: topWorkers.rows
            }
        });
    } catch (error) {
        console.error('❌ Archive Error:', error.message);
        return res.status(500).json({ success: false, message: 'Archive আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// EMPLOYEE PDF REPORT
// ============================================================

const getEmployeePDFReport = async (req, res) => {
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }
        const { password_hash, ...employee } = result.rows[0];
        const pdfBuffer = await generateEmployeePDF(employee);

        res.setHeader('Content-Type',        'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="employee_${employee.employee_code || employee.id}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ Employee PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'PDF তৈরিতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getDashboardKPI,
    getTopProducts,
    getTopShops,
    getMonthlyArchive,
    getEmployeePDFReport,
};
