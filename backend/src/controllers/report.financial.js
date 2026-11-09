const logger = require('../config/logger');
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

        // সব query-তে একই param ক্রম: $1=from, $2=to, $3=tenant, ($4=manager)
        // (আগে string replace দিয়ে $-নম্বর বদলানো হতো — ভঙ্গুর ছিল)
        const params = [from, to, req.tenantId];
        let teamCond = '';
        if (req.teamFilter) {
            teamCond = ' AND u.manager_id = $4';
            params.push(req.teamFilter);
        }

        const [salesData, vatData, cogsData, expenseData, payrollData, paidData, missingCostData, returnsData] = await Promise.all([
            // ── ১. বিক্রয় ────────────────────────────────────────────
            query(
                `SELECT
                    COALESCE(SUM(st.total_amount), 0)      AS gross_sales,
                    COALESCE(SUM(st.cash_received), 0)     AS cash_collected,
                    COALESCE(SUM(st.credit_used), 0)       AS credit_given,
                    COALESCE(SUM(st.replacement_value), 0) AS replacement_value,
                    COALESCE(SUM(st.discount_amount), 0)   AS total_discount,
                    COALESCE(SUM(st.net_amount), 0)        AS net_sales,
                    COUNT(st.id)                           AS invoice_count
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.date BETWEEN $1 AND $2 AND st.tenant_id = $3 ${teamCond}`,
                params
            ),
            // ── ১ক. নেট বিক্রয়ের ভেতরে থাকা VAT ও ট্যাক্স ──────────────────
            // ⚠️ sales_transactions.vat_amount কলাম বিক্রয় তৈরির সময় কখনো লেখা হয় না
            // (সবসময় ০), তাই items JSON থেকে হিসাব। items-এর vat_amount/tax_amount
            // *প্রতি ইউনিটের* (final_price = price × (১ + VAT% + ট্যাক্স%)), তাই × qty।
            // ডিসকাউন্ট আনুপাতিক হারে কমে; রিপ্লেসমেন্টের VAT আলাদা করে বাদ যায়
            // (কারণ net_amount = total − discount − replacement)।
            query(
                `SELECT COALESCE(SUM(GREATEST(0, v.item_vat - v.repl_vat)), 0) AS vat,
                        COALESCE(SUM(GREATEST(0, v.item_tax - v.repl_tax)), 0) AS tax
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 CROSS JOIN LATERAL (
                    SELECT
                      k.keep * COALESCE((SELECT SUM((i->>'qty')::numeric * COALESCE((i->>'vat_amount')::numeric, 0))
                                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i), 0) AS item_vat,
                      k.keep * COALESCE((SELECT SUM((i->>'qty')::numeric * COALESCE((i->>'tax_amount')::numeric, 0))
                                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i), 0) AS item_tax,
                      COALESCE((SELECT SUM((r->>'qty')::numeric * COALESCE((r->>'vat_amount')::numeric, 0))
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(st.replacement_items) = 'array' THEN st.replacement_items ELSE '[]'::jsonb END) r), 0) AS repl_vat,
                      COALESCE((SELECT SUM((r->>'qty')::numeric * COALESCE((r->>'tax_amount')::numeric, 0))
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(st.replacement_items) = 'array' THEN st.replacement_items ELSE '[]'::jsonb END) r), 0) AS repl_tax
                    FROM (SELECT CASE WHEN st.total_amount > 0
                                      THEN GREATEST(0, 1 - COALESCE(st.discount_amount, 0) / st.total_amount)
                                      ELSE 1 END AS keep) k
                 ) v
                 WHERE st.date BETWEEN $1 AND $2 AND st.tenant_id = $3 ${teamCond}`,
                params
            ),
            // ── ২. COGS: বিক্রিত পণ্যের ক্রয়মূল্য ────────────────────
            // items JSONB-এর প্রতিটি লাইন × unit_cost (বিক্রয়ের মুহূর্তে সংরক্ষিত)।
            // unit_cost না থাকলে (বা ০ হলে) products.cost_price-এ fallback —
            // এতে পরে cost_price ঠিক করলে আগের ০-খরচের লাইনগুলোও ঠিক হয়ে যায়।
            // ফ্রি গিফট আইটেমও ধরা হয় — ওগুলোর খরচ কোম্পানিরই।
            query(
                `SELECT
                    COALESCE(SUM((item->>'qty')::numeric
                        * COALESCE(NULLIF((item->>'unit_cost')::numeric, 0), p.cost_price, 0)), 0) AS total_cogs,
                    COUNT(*) FILTER (WHERE COALESCE(NULLIF((item->>'unit_cost')::numeric, 0), p.cost_price, 0) = 0)
                                                                                           AS lines_without_cost
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 CROSS JOIN LATERAL jsonb_array_elements(
                     CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END
                 ) AS item
                 LEFT JOIN products p
                        ON p.id::text = item->>'product_id'
                       AND p.tenant_id = st.tenant_id
                 WHERE st.date BETWEEN $1 AND $2 AND st.tenant_id = $3 ${teamCond}`,
                params
            ),
            // ── ৩. পরিচালন খরচ (SR রিপোর্ট + কোম্পানির খরচ + ব্যাচ রাইট-অফ) ──
            query(
                `SELECT e.expense_type, COALESCE(SUM(e.amount), 0) AS amount
                 FROM expenses e
                 JOIN users u ON e.user_id = u.id
                 WHERE e.date BETWEEN $1 AND $2 AND e.tenant_id = $3 ${teamCond}
                 GROUP BY e.expense_type
                 ORDER BY amount DESC`,
                params
            ),
            // ── ৪. বেতন ও কমিশন — প্রাপ্য (accrual) ভিত্তিতে ──────────────
            // আগের সংস্করণে শুধু "পরিশোধিত" বেতন ধরা হতো, তাই পরিশোধের আগে বেতন ০
            // দেখাত ও মাসের মাঝে লাভ বেশি দেখাত। এখন সময়সীমার প্রতিটি মাসে প্রতিটি
            // কর্মী *ও ম্যানেজারের* জন্য (পরিশোধ হোক বা না হোক) — সিস্টেমের বেতন-
            // ব্যবস্থা শুধু worker-দের পরিশোধ ট্র্যাক করে, কিন্তু ম্যানেজারের বেতনও
            // কোম্পানির খরচ। টিম-ভিউতে (manager_id ফিল্টার) ম্যানেজারের নিজের বেতন আসে না:
            //   মূল বেতন × (সময়সীমার দিন ÷ মাসের দিন)   — পরিশোধিত হলে ওই রেকর্ডের বেতন
            //   + কমিশন  (commission টেবিল, তারিখ ধরে)
            //   − হাজিরা কর্তন (attendance টেবিল, তারিখ ধরে)
            // সিস্টেমের বেতন-স্লিপের মতোই কর্মী-মাসে ০-এর নিচে নামে না (GREATEST 0)।
            // গ্রাহকের বকেয়া কর্তন খরচ নয়, তাই ধরা হয়নি।
            query(
                `WITH months AS (
                    SELECT date_trunc('month', g)::date AS m_start
                    FROM generate_series(date_trunc('month', $1::date),
                                         date_trunc('month', $2::date), interval '1 month') g
                 ),
                 w AS (
                    SELECT u.id, u.role, u.basic_salary
                    FROM users u
                    WHERE u.role IN ('worker', 'manager') AND u.tenant_id = $3 ${teamCond}
                      AND (u.status = 'active' OR EXISTS (
                            SELECT 1 FROM salary_payments s2
                            WHERE s2.worker_id = u.id AND s2.tenant_id = $3
                              AND make_date(s2.year, s2.month, 1)
                                  BETWEEN date_trunc('month', $1::date) AND $2::date))
                 ),
                 wm AS (
                    SELECT w.id, w.role,
                           GREATEST($1::date, m.m_start) AS d_from,
                           LEAST($2::date, (m.m_start + interval '1 month')::date - 1) AS d_to,
                           EXTRACT(DAY FROM ((m.m_start + interval '1 month')::date - 1))::numeric AS days_in_month,
                           COALESCE(sp.basic_salary, w.basic_salary, 0) AS basic_full
                    FROM w CROSS JOIN months m
                    LEFT JOIN salary_payments sp
                           ON sp.worker_id = w.id
                          AND sp.month = EXTRACT(MONTH FROM m.m_start)
                          AND sp.year  = EXTRACT(YEAR  FROM m.m_start)
                          AND sp.status = 'paid'
                          AND sp.tenant_id = $3
                 ),
                 calc AS (
                    SELECT wm.id, wm.role,
                           wm.basic_full * (wm.d_to - wm.d_from + 1) / wm.days_in_month AS basic_part,
                           COALESCE((SELECT SUM(c.commission_amount) FROM commission c
                                     WHERE c.user_id = wm.id
                                       AND c.date BETWEEN wm.d_from AND wm.d_to), 0) AS commission,
                           COALESCE((SELECT SUM(a.salary_deduction) FROM attendance a
                                     WHERE a.user_id = wm.id AND a.tenant_id = $3
                                       AND a.date BETWEEN wm.d_from AND wm.d_to), 0) AS att_ded
                    FROM wm
                 )
                 SELECT COALESCE(SUM(basic_part), 0)                                   AS basic_salary,
                        COALESCE(SUM(commission), 0)                                   AS total_commission,
                        COALESCE(SUM(att_ded), 0)                                      AS attendance_deduction,
                        COALESCE(SUM(GREATEST(0, basic_part + commission - att_ded)), 0) AS total_cost,
                        COALESCE(SUM(GREATEST(0, basic_part + commission - att_ded))
                                 FILTER (WHERE role = 'manager'), 0)                   AS manager_cost,
                        COUNT(DISTINCT id)                                             AS staff_count
                 FROM calc`,
                params
            ),
            // ── ৫. আসলে পরিশোধিত বেতন (তথ্য হিসেবে; পরিশোধের তারিখ ধরে) ──
            query(
                `SELECT
                    COALESCE(SUM(sp.net_payable), 0)               AS net_paid,
                    COALESCE(SUM(sp.outstanding_dues_deducted), 0) AS dues_recovered,
                    COUNT(*)                                       AS payments_count
                 FROM salary_payments sp
                 JOIN users u ON sp.worker_id = u.id
                 WHERE sp.status = 'paid'
                   AND sp.paid_at::date BETWEEN $1 AND $2
                   AND sp.tenant_id = $3 ${teamCond}`,
                params
            ),
            // ── ৬. যেসব বিক্রিত পণ্যের ক্রয়মূল্য নেই (নাম সহ) ────────────
            query(
                `SELECT DISTINCT COALESCE(p.name, item->>'product_name') AS name
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 CROSS JOIN LATERAL jsonb_array_elements(
                     CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END
                 ) AS item
                 LEFT JOIN products p
                        ON p.id::text = item->>'product_id' AND p.tenant_id = st.tenant_id
                 WHERE st.date BETWEEN $1 AND $2 AND st.tenant_id = $3 ${teamCond}
                   AND COALESCE(NULLIF((item->>'unit_cost')::numeric, 0), p.cost_price, 0) = 0
                 LIMIT 10`,
                params
            ),
            // ── ৭. সেলস রিটার্ন (completed, type='return') ──────────────
            // • আয় থেকে বাদ যায় রিটার্নের *VAT/ট্যাক্স-বাদে* মূল্য। অগ্রাধিকার:
            //   ১) item.subtotal_ex_vat — রিটার্ন তৈরির সময় সংরক্ষিত (সবচেয়ে নির্ভুল)
            //   ২) item.subtotal ÷ (১ + সংরক্ষিত vat_rate + tax_rate)
            //   ৩) পুরোনো রিটার্ন (এই snapshot চালুর আগের): পণ্যের বর্তমান হার দিয়ে fallback
            // • COGS ফেরত শুধু বিক্রয়যোগ্য পণ্যের (SR রিটার্নে reason damaged/expired
            //   ছাড়া); নষ্ট/মেয়াদোত্তীর্ণের খরচ ক্ষতি হিসেবেই থাকে।
            // • গ্রাহক-পোর্টালের রিটার্নে reason নেই, তাই রক্ষণশীলভাবে COGS ফেরত ধরা হয় না।
            // • পোর্টালের রিটার্ন ম্যানেজার-ভিউতে সিস্টেমের নিজস্ব নিয়মেই আলাদা হয়:
            //   গ্রাহকের route ∈ ওই ম্যানেজারের routes (customerPortalReturn.controller-এর মতো)।
            // • replacement (বদলি) ধরা হয় না — ওটা আগেই নেট বিক্রয়ে সমন্বিত।
            query(
                `SELECT COALESCE(SUM(ex_value), 0)             AS total_value,
                        COALESCE(SUM(gross_value - ex_value), 0) AS vat_tax_returned,
                        COALESCE(SUM(cost), 0)                  AS reversible_cost,
                        COUNT(*)                                AS returns_count
                 FROM (
                    SELECT x.gross_value, x.ex_value,
                           CASE WHEN rr.reason IN ('damaged', 'expired') THEN 0 ELSE x.cost_all END AS cost
                    FROM return_requests rr
                    JOIN users u ON u.id = rr.sr_id
                    CROSS JOIN LATERAL (
                        SELECT COALESCE(SUM(COALESCE((i->>'subtotal')::numeric, 0)), 0) AS gross_value,
                               COALESCE(SUM(COALESCE((i->>'subtotal_ex_vat')::numeric,
                                   COALESCE((i->>'subtotal')::numeric, 0)
                                   / (1 + (COALESCE((i->>'vat_rate')::numeric, p.vat, 0)
                                         + COALESCE((i->>'tax_rate')::numeric, p.tax, 0)) / 100))), 0) AS ex_value,
                               COALESCE(SUM((i->>'qty')::numeric * COALESCE(p.cost_price, 0)), 0)      AS cost_all
                        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rr.items) = 'array' THEN rr.items ELSE '[]'::jsonb END) i
                        LEFT JOIN products p ON p.id::text = i->>'product_id' AND p.tenant_id = rr.tenant_id
                    ) x
                    WHERE rr.status = 'completed' AND rr.type = 'return'
                      AND rr.completed_at::date BETWEEN $1 AND $2
                      AND rr.tenant_id = $3 ${teamCond}

                    UNION ALL

                    SELECT y.gross_value, y.ex_value, 0
                    FROM customer_return_requests crr
                    JOIN customers c ON c.id = crr.customer_id
                    CROSS JOIN LATERAL (
                        SELECT COALESCE(SUM(COALESCE((i->>'subtotal')::numeric, 0)), 0) AS gross_value,
                               COALESCE(SUM(COALESCE((i->>'subtotal_ex_vat')::numeric,
                                   COALESCE((i->>'subtotal')::numeric, 0)
                                   / (1 + (COALESCE((i->>'vat_rate')::numeric, p.vat, 0)
                                         + COALESCE((i->>'tax_rate')::numeric, p.tax, 0)) / 100))), 0) AS ex_value
                        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(crr.items) = 'array' THEN crr.items ELSE '[]'::jsonb END) i
                        LEFT JOIN products p ON p.id::text = i->>'product_id' AND p.tenant_id = crr.tenant_id
                    ) y
                    WHERE crr.status = 'completed' AND crr.type = 'return'
                      AND crr.completed_at::date BETWEEN $1 AND $2
                      AND crr.tenant_id = $3
                      ${req.teamFilter
                          ? 'AND c.route_id IN (SELECT r.id FROM routes r WHERE r.manager_id = $4 AND r.tenant_id = $3)'
                          : ''}
                 ) t`,
                params
            )
        ]);

        const num = (v) => parseFloat(v || 0);

        const sales   = salesData.rows[0];
        const cogs    = cogsData.rows[0];
        const pay     = payrollData.rows[0];
        const paid    = paidData.rows[0];
        const ret     = returnsData.rows[0];
        const expRows = expenseData.rows.map(r => ({ expense_type: r.expense_type, amount: num(r.amount) }));

        const vatRow        = vatData.rows[0];
        const netSales      = num(sales.net_sales);
        const vat           = num(vatRow.vat);
        const tax           = num(vatRow.tax);
        // net_amount-এ VAT ও ট্যাক্স আগে থেকেই যুক্ত (final_price = price × (১ + VAT% + ট্যাক্স%))।
        // এগুলো গ্রাহকের কাছ থেকে নেওয়া হয়ে সরকারের কাছে যায়, কোম্পানির আয় নয় —
        // তাই মুনাফার হিসাবে বাদ। (ধরে নেওয়া হয়েছে পণ্যের 'tax'-ও সরকারি; কোম্পানি
        // নিজে রাখে এমন চার্জ হলে জানাবেন।)
        const vatTax        = vat + tax;
        const netSalesExVat = netSales - vatTax;

        // সেলস রিটার্ন: আয় কমে (VAT/ট্যাক্স-বাদে মূল্যে); বিক্রয়যোগ্য পণ্যের খরচ COGS থেকে ফেরত আসে।
        const returnsValue  = num(ret.total_value);
        const returnsCost   = num(ret.reversible_cost);

        const grossCogs     = num(cogs.total_cogs);
        const totalCogs     = Math.max(0, grossCogs - returnsCost);
        const totalExpenses = expRows.reduce((s, r) => s + r.amount, 0);

        const commission    = num(pay.total_commission);
        const payrollCost   = num(pay.total_cost);
        const salaryPortion = Math.max(0, payrollCost - commission);

        const netRevenue  = netSalesExVat - returnsValue;
        const grossProfit = netRevenue - totalCogs;
        const netProfit   = grossProfit - totalExpenses - payrollCost;

        return res.status(200).json({
            success: true,
            data: {
                period: { from, to },
                revenue: {
                    gross_sales:       num(sales.gross_sales),
                    discount:          num(sales.total_discount),
                    replacement_value: num(sales.replacement_value),
                    vat,
                    tax,
                    vat_tax:           vatTax,
                    net_sales:         netSales,
                    net_sales_ex_vat:  netSalesExVat,   // VAT ও ট্যাক্স দুটোই বাদে
                    cash_collected:    num(sales.cash_collected),
                    credit_given:      num(sales.credit_given),
                    invoice_count:     parseInt(sales.invoice_count)
                },
                returns: {
                    total_value:     returnsValue,
                    vat_tax_returned: num(ret.vat_tax_returned),
                    cost_reversed:   returnsCost,
                    count:           parseInt(ret.returns_count)
                },
                cogs: {
                    gross_cogs:         grossCogs,
                    total_cogs:         totalCogs,            // রিটার্নের খরচ ফেরতের পরে
                    lines_without_cost: parseInt(cogs.lines_without_cost),
                    products_without_cost: missingCostData.rows.map(r => r.name)
                },
                expenses: { breakdown: expRows, total_expenses: totalExpenses },
                payroll: {
                    total_salary:         salaryPortion,    // মূল বেতন − হাজিরা কর্তন
                    total_commission:     commission,
                    basic_salary:         num(pay.basic_salary),
                    attendance_deduction: num(pay.attendance_deduction),
                    total_cost:           payrollCost,      // প্রাপ্য (accrual) ভিত্তিতে
                    staff_count:          parseInt(pay.staff_count),
                    manager_cost:         num(pay.manager_cost),   // মোট বেতনের মধ্যে ম্যানেজারদের অংশ
                    // তথ্য: এই সময়ে আসলে কত পরিশোধ হয়েছে
                    net_paid:             num(paid.net_paid),
                    dues_recovered:       num(paid.dues_recovered),
                    payments_count:       parseInt(paid.payments_count),
                    basis:                'accrual'
                },
                summary: {
                    gross_profit:  grossProfit,
                    net_profit:    netProfit,
                    net_revenue:   netRevenue,   // ভ্যাট ও রিটার্ন বাদে আয়
                    gross_margin:  netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(2) : 0,
                    profit_margin: netRevenue > 0 ? ((netProfit   / netRevenue) * 100).toFixed(2) : 0
                }
            }
        });
    } catch (error) {
        logger.error('❌ P&L Error:', error.message);
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

        const params     = [fromDate, toDate, req.tenantId];
        let   paramCount = 3;
        let   workerCond = 'AND u.tenant_id = $3';
        if (worker_id) {
            paramCount++;
            params.push(worker_id);
            workerCond += ` AND u.id = $${paramCount}`;
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
        logger.error('❌ Ledger Error:', error.message);
        return res.status(500).json({ success: false, message: 'লেজার আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getPLStatement, getLedger };
