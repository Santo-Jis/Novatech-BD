// ============================================================
// FINANCIAL REPORT CONTROLLERS
// GET /api/reports/pl
// GET /api/reports/ledger
// ============================================================

const { query } = require('../config/db');

// ============================================================
// P&L STATEMENT
// ============================================================

const getPLStatement = async (req, res) => {
    try {
        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        const from = req.query.from || firstOfMonth;
        const to   = req.query.to   || today;

        let teamCond  = '';
        let teamParam = [];
        if (req.teamFilter) {
            teamCond  = 'AND u.manager_id = $3';
            teamParam = [req.teamFilter];
        }

        const [salesData, expenseData, payrollData] = await Promise.all([
            query(
                `SELECT
                    COALESCE(SUM(total_amount), 0)      AS gross_sales,
                    COALESCE(SUM(cash_received), 0)     AS cash_collected,
                    COALESCE(SUM(credit_used), 0)       AS credit_given,
                    COALESCE(SUM(replacement_value), 0) AS replacement_value,
                    COALESCE(SUM(vat_amount), 0)        AS total_vat,
                    COALESCE(SUM(discount_amount), 0)   AS total_discount,
                    COALESCE(SUM(net_amount), 0)        AS net_sales,
                    COUNT(st.id)                        AS invoice_count
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.date BETWEEN $1 AND $2 ${teamCond}`,
                [from, to, ...teamParam]
            ),
            query(
                `SELECT
                    COALESCE(SUM(e.amount), 0) AS total_expenses,
                    expense_type,
                    COALESCE(SUM(e.amount), 0) AS amount
                 FROM expenses e
                 JOIN users u ON e.user_id = u.id
                 WHERE e.date BETWEEN $1 AND $2 ${teamCond}
                 GROUP BY expense_type`,
                [from, to, ...teamParam]
            ),
            // Salary ও Commission একটাই query-তে
            query(
                `SELECT
                    COALESCE(SUM(net_payable), 0)       AS total_salary,
                    COALESCE(SUM(commission_amount), 0) AS total_commission
                 FROM monthly_commissions mc
                 JOIN users u ON mc.worker_id = u.id
                 WHERE mc.year  = EXTRACT(YEAR  FROM $1::date)
                   AND mc.month = EXTRACT(MONTH FROM $1::date)
                   ${teamCond}`,
                [from, ...teamParam]
            )
        ]);

        const sales         = salesData.rows[0];
        const expRows       = expenseData.rows;
        const payroll       = payrollData.rows[0];
        const totalExpenses = expRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const grossProfit   = parseFloat(sales.net_sales)
            - totalExpenses
            - parseFloat(payroll.total_salary || 0);

        return res.status(200).json({
            success: true,
            data: {
                period: { from, to },
                revenue: {
                    gross_sales:       parseFloat(sales.gross_sales),
                    discount:          parseFloat(sales.total_discount),
                    vat:               parseFloat(sales.total_vat),
                    net_sales:         parseFloat(sales.net_sales),
                    cash_collected:    parseFloat(sales.cash_collected),
                    credit_given:      parseFloat(sales.credit_given),
                    replacement_value: parseFloat(sales.replacement_value),
                    invoice_count:     parseInt(sales.invoice_count)
                },
                expenses: { breakdown: expRows, total_expenses: totalExpenses },
                payroll: {
                    total_salary:     parseFloat(payroll.total_salary || 0),
                    total_commission: parseFloat(payroll.total_commission || 0)
                },
                summary: {
                    gross_profit:  grossProfit,
                    net_profit:    grossProfit,
                    profit_margin: parseFloat(sales.net_sales) > 0
                        ? ((grossProfit / parseFloat(sales.net_sales)) * 100).toFixed(2)
                        : 0
                }
            }
        });
    } catch (error) {
        console.error('❌ P&L Error:', error.message);
        return res.status(500).json({ success: false, message: 'P&L আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// LEDGER (সম্পূর্ণ লেনদেন ইতিহাস)
// ============================================================
// UNION ALL দিয়ে একটাই query → DB-তেই ORDER BY + LIMIT + OFFSET।
// JS-এ কোনো sort বা slice নেই।
// ============================================================

const getLedger = async (req, res) => {
    try {
        const { from, to, type, worker_id, page = 1, limit = 50 } = req.query;
        const today    = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;

        if (fromDate > toDate) {
            return res.status(400).json({
                success: false,
                message: '"from" তারিখ "to" তারিখের পরে হতে পারে না।'
            });
        }

        const pageInt  = Math.max(1, parseInt(page));
        const limitInt = Math.min(200, Math.max(1, parseInt(limit)));
        const offset   = (pageInt - 1) * limitInt;

        const includeSale    = !type || type === 'sale';
        const includePayment = !type || type === 'payment';
        const includeExpense = !type || type === 'expense';

        const params     = [fromDate, toDate];
        let   paramCount = 2;
        let   workerCond = '';
        if (worker_id) {
            paramCount++;
            params.push(worker_id);
            workerCond = `AND u.id = $${paramCount}`;
        }

        const unions = [];

        if (includeSale) {
            unions.push(`
                SELECT st.id::text, 'বিক্রয়' AS type, st.date,
                       st.total_amount AS amount, st.payment_method,
                       c.shop_name AS party, u.name_bn AS worker_name,
                       st.invoice_number AS ref, 'income' AS entry_type
                FROM sales_transactions st
                JOIN customers c ON st.customer_id = c.id
                JOIN users u ON st.worker_id = u.id
                WHERE st.date BETWEEN $1 AND $2 ${workerCond}`);
        }

        if (includePayment) {
            unions.push(`
                SELECT cp.id::text, 'পেমেন্ট গ্রহণ' AS type, cp.payment_date AS date,
                       cp.amount, 'নগদ' AS payment_method,
                       c.shop_name AS party, u.name_bn AS worker_name,
                       CONCAT('PAY-', cp.id) AS ref, 'income' AS entry_type
                FROM credit_payments cp
                JOIN customers c ON cp.customer_id = c.id
                JOIN users u ON cp.collected_by = u.id
                WHERE cp.payment_date BETWEEN $1 AND $2 ${workerCond}`);
        }

        if (includeExpense) {
            unions.push(`
                SELECT e.id::text, CONCAT('খরচ — ', e.expense_type) AS type,
                       e.date, e.amount, '-' AS payment_method,
                       e.note AS party, u.name_bn AS worker_name,
                       CONCAT('EXP-', e.id) AS ref, 'expense' AS entry_type
                FROM expenses e
                JOIN users u ON e.user_id = u.id
                WHERE e.date BETWEEN $1 AND $2 ${workerCond}`);
        }

        if (unions.length === 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটি type দিন।' });
        }

        const unionSQL = unions.join(' UNION ALL ');

        const [countResult, rowResult] = await Promise.all([
            query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(CASE WHEN entry_type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
                        COALESCE(SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
                 FROM (${unionSQL}) t`,
                params
            ),
            query(
                `SELECT * FROM (${unionSQL}) t
                 ORDER BY date DESC
                 LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
                [...params, limitInt, offset]
            )
        ]);

        const { total, total_income, total_expense } = countResult.rows[0];

        return res.status(200).json({
            success: true,
            data: {
                entries: rowResult.rows,
                summary: {
                    total_income:  parseFloat(total_income),
                    total_expense: parseFloat(total_expense),
                    net:           parseFloat(total_income) - parseFloat(total_expense)
                },
                total:      parseInt(total),
                page:       pageInt,
                limit:      limitInt,
                totalPages: Math.ceil(parseInt(total) / limitInt)
            }
        });

    } catch (error) {
        console.error('❌ Ledger Error:', error.message);
        return res.status(500).json({ success: false, message: 'লেজার আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getPLStatement, getLedger };
