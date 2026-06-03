const logger = require('../config/logger');
// ============================================================
// SALES & ATTENDANCE REPORT CONTROLLERS
// GET /api/reports/sales
// GET /api/reports/attendance
// ============================================================

const { query } = require('../config/db');
const {
    exportSalesExcel,
    exportAttendanceExcel,
    exportSalesPDF,
} = require('./report.exports');

// ============================================================
// SALES REPORT
// ============================================================
// Default (বিস্তারিত) mode-এ DB-level pagination আছে।
// Export mode-এ সব row DB থেকে আনা হয় (JS slice নেই)।
// group_by mode দুটো (worker, day) aggregate — row count ছোট।
// ============================================================

const getSalesReport = async (req, res) => {
    try {
        const {
            from, to, worker_id, route_id,
            group_by,
            export: exportType,
            page  = 1,
            limit = 100
        } = req.query;

        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        const fromDate = from || firstOfMonth;
        const toDate   = to   || today;

        if (fromDate > toDate) {
            return res.status(400).json({
                success: false,
                message: '"from" তারিখ "to" তারিখের পরে হতে পারে না।'
            });
        }

        let conditions = ['st.date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }
        if (worker_id) {
            paramCount++;
            conditions.push(`st.worker_id = $${paramCount}`);
            params.push(worker_id);
        }
        if (route_id) {
            paramCount++;
            conditions.push(`c.route_id = $${paramCount}`);
            params.push(route_id);
        }

        const whereClause = conditions.join(' AND ');
        let data = [];

        // ── group_by: worker ──────────────────────────────────
        if (group_by === 'worker') {
            const result = await query(
                `SELECT u.name_bn AS worker_name, u.employee_code,
                        COUNT(st.id)                           AS total_invoices,
                        COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                        COALESCE(SUM(st.cash_received), 0)     AS cash,
                        COALESCE(SUM(st.credit_used), 0)       AS credit,
                        COALESCE(SUM(st.replacement_value), 0) AS replacement
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 WHERE ${whereClause}
                 GROUP BY u.id, u.name_bn, u.employee_code
                 ORDER BY total_sales DESC`,
                params
            );
            data = result.rows;

        // ── group_by: day ─────────────────────────────────────
        } else if (group_by === 'day') {
            const result = await query(
                `SELECT st.date,
                        COUNT(st.id)                           AS total_invoices,
                        COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                        COALESCE(SUM(st.cash_received), 0)     AS cash,
                        COALESCE(SUM(st.credit_used), 0)       AS credit
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 WHERE ${whereClause}
                 GROUP BY st.date
                 ORDER BY st.date DESC`,
                params
            );
            data = result.rows;

        // ── Default: বিস্তারিত তালিকা ─────────────────────────
        } else {
            // Export — সব row লাগে, pagination skip
            if (exportType === 'excel' || exportType === 'pdf') {
                const result = await query(
                    `SELECT st.date, st.invoice_number,
                            u.name_bn AS worker_name,
                            c.shop_name,
                            r.name AS route_name,
                            st.total_amount, st.net_amount,
                            st.payment_method, st.otp_verified,
                            st.cash_received, st.credit_used,
                            st.replacement_value, st.created_at
                     FROM sales_transactions st
                     JOIN users u     ON st.worker_id   = u.id
                     JOIN customers c ON st.customer_id = c.id
                     LEFT JOIN routes r ON c.route_id = r.id
                     WHERE ${whereClause}
                     ORDER BY st.date DESC, st.created_at DESC`,
                    params
                );
                data = result.rows;

                if (exportType === 'excel') return await exportSalesExcel(res, data, fromDate, toDate);
                if (exportType === 'pdf')   return await exportSalesPDF(res, data, fromDate, toDate);
            }

            // JSON — DB-level pagination
            const pageInt  = Math.max(1, parseInt(page));
            const limitInt = Math.min(500, Math.max(1, parseInt(limit)));
            const offset   = (pageInt - 1) * limitInt;

            const [countResult, result] = await Promise.all([
                query(
                    `SELECT COUNT(*) AS total
                     FROM sales_transactions st
                     JOIN users u     ON st.worker_id   = u.id
                     JOIN customers c ON st.customer_id = c.id
                     WHERE ${whereClause}`,
                    params
                ),
                query(
                    `SELECT st.date, st.invoice_number,
                            u.name_bn AS worker_name,
                            c.shop_name,
                            r.name AS route_name,
                            st.total_amount, st.net_amount,
                            st.payment_method, st.otp_verified,
                            st.cash_received, st.credit_used,
                            st.replacement_value, st.created_at
                     FROM sales_transactions st
                     JOIN users u     ON st.worker_id   = u.id
                     JOIN customers c ON st.customer_id = c.id
                     LEFT JOIN routes r ON c.route_id = r.id
                     WHERE ${whereClause}
                     ORDER BY st.date DESC, st.created_at DESC
                     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
                    [...params, limitInt, offset]
                )
            ]);

            const total = parseInt(countResult.rows[0].total);
            data = result.rows;

            const summary = await query(
                `SELECT
                    COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                    COALESCE(SUM(st.cash_received), 0)     AS total_cash,
                    COALESCE(SUM(st.credit_used), 0)       AS total_credit,
                    COALESCE(SUM(st.replacement_value), 0) AS total_replacement,
                    COUNT(st.id)                           AS total_invoices,
                    COUNT(DISTINCT st.worker_id)           AS total_workers,
                    COUNT(DISTINCT st.customer_id)         AS total_customers
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 WHERE ${whereClause}`,
                params
            );

            return res.status(200).json({
                success: true,
                data: {
                    period:     { from: fromDate, to: toDate },
                    summary:    summary.rows[0],
                    records:    data,
                    pagination: {
                        total,
                        page:       pageInt,
                        limit:      limitInt,
                        totalPages: Math.ceil(total / limitInt)
                    }
                }
            });
        }

        // group_by mode — export বা JSON
        if (exportType === 'excel') return await exportSalesExcel(res, data, fromDate, toDate);
        if (exportType === 'pdf')   return await exportSalesPDF(res, data, fromDate, toDate);

        return res.status(200).json({
            success: true,
            data: { period: { from: fromDate, to: toDate }, records: data }
        });

    } catch (error) {
        logger.error('❌ Sales Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ATTENDANCE REPORT
// ============================================================

const getAttendanceReport = async (req, res) => {
    try {
        const { month, year, worker_id, export: exportType } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            "u.role = 'worker'",
            "u.status = 'active'",
            'EXTRACT(YEAR FROM a.date) = $1',
            'EXTRACT(MONTH FROM a.date) = $2'
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
            conditions.push(`u.id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code,
                    COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present,
                    COUNT(CASE WHEN a.status = 'late'    THEN 1 END) AS late,
                    COUNT(CASE WHEN a.status = 'absent'  THEN 1 END) AS absent,
                    COUNT(CASE WHEN a.status = 'leave'   THEN 1 END) AS leave,
                    COALESCE(SUM(a.late_minutes), 0)                  AS total_late_min,
                    COALESCE(SUM(a.salary_deduction), 0)              AS total_deduction
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code
             ORDER BY u.name_bn`,
            params
        );

        if (exportType === 'excel') {
            return await exportAttendanceExcel(res, result.rows, currentYear, currentMonth);
        }

        return res.status(200).json({
            success: true,
            data: { month: currentMonth, year: currentYear, workers: result.rows }
        });

    } catch (error) {
        logger.error('❌ Attendance Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSalesReport, getAttendanceReport };
