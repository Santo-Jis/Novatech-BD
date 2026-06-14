const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// SR মাসিক লেজার — সারসংক্ষেপ কার্ড (বিভাগ ১)
// GET /api/monthly-ledger/summary?month=&year=
//
// রিটার্ন করে:
//   - মোট বিক্রয়, কর্মদিবস, মোট কমিশন, নেট পাওনা
//   - মাসিক টার্গেট vs অর্জন (%)
//   - এই মাসের টপ ১০ বিক্রিত পণ্য (নাম + পিস + টাকা)
// ============================================================

const getSummaryCard = async (req, res) => {
    try {
        const workerId    = req.user.id;
        const targetMonth = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const targetYear  = parseInt(req.query.year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        const [userRes, salesRes, attRes, commRes, topRes] = await Promise.all([

            // মূল বেতন, বকেয়া, মাসিক টার্গেট
            query(
                `SELECT basic_salary, outstanding_dues, monthly_target
                 FROM users WHERE id = $1`,
                [workerId]
            ),

            // মোট মাসিক বিক্রি
            query(
                `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
                 FROM sales_transactions
                 WHERE worker_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            // কর্মদিবস + উপস্থিতি কর্তন
            query(
                `SELECT
                    COUNT(*) FILTER (WHERE status IN ('present','late')) AS working_days,
                    COALESCE(SUM(salary_deduction), 0)                   AS attendance_deduction
                 FROM attendance
                 WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            // মোট কমিশন (বিক্রয় কমিশন + উপস্থিতি বোনাস)
            query(
                `SELECT COALESCE(SUM(commission_amount), 0) AS total_commission
                 FROM commission
                 WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            // এই মাসের টপ ১০ পণ্য — items JSONB থেকে প্রোডাক্ট-ভিত্তিক যোগফল
            query(
                `SELECT
                    item->>'product_id'   AS product_id,
                    item->>'product_name' AS product_name,
                    SUM((item->>'qty')::numeric)      AS total_qty,
                    SUM((item->>'subtotal')::numeric) AS total_amount
                 FROM sales_transactions st,
                      jsonb_array_elements(
                          CASE WHEN jsonb_typeof(st.items::jsonb) = 'array'
                               THEN st.items::jsonb ELSE '[]'::jsonb END
                      ) AS item
                 WHERE st.worker_id = $1
                   AND st.date BETWEEN $2 AND $3
                 GROUP BY item->>'product_id', item->>'product_name'
                 ORDER BY total_qty DESC
                 LIMIT 10`,
                [workerId, from, to]
            ),
        ]);

        const user = userRes.rows[0] || {};
        const basicSalary     = parseFloat(user.basic_salary     || 0);
        const outstandingDues = parseFloat(user.outstanding_dues || 0);
        const monthlyTarget   = parseFloat(user.monthly_target   || 0);

        const totalSales      = parseFloat(salesRes.rows[0]?.total_sales || 0);
        const workingDays     = parseInt(attRes.rows[0]?.working_days || 0);
        const attendanceDed   = parseFloat(attRes.rows[0]?.attendance_deduction || 0);
        const totalCommission = parseFloat(commRes.rows[0]?.total_commission || 0);

        // নেট পাওনা = মূল বেতন + মোট কমিশন − উপস্থিতি কর্তন − বকেয়া
        const netPayable = Math.max(
            0,
            basicSalary + totalCommission - attendanceDed - outstandingDues
        );

        const targetPercent = monthlyTarget > 0
            ? Math.round((totalSales / monthlyTarget) * 100)
            : null;

        const topProducts = topRes.rows.map(r => ({
            product_id:   r.product_id,
            product_name: r.product_name || 'অজানা পণ্য',
            qty:          parseInt(r.total_qty      || 0),
            amount:       parseFloat(r.total_amount || 0),
        }));

        return res.status(200).json({
            success: true,
            data: {
                month: targetMonth,
                year:  targetYear,

                total_sales:      totalSales,
                working_days:     workingDays,
                total_commission: totalCommission,
                net_payable:      netPayable,

                monthly_target: monthlyTarget,
                target_percent: targetPercent,

                top_products: topProducts,
            },
        });

    } catch (error) {
        logger.error('❌ Monthly Ledger Summary Card Error:', error.message);
        return res.status(500).json({ success: false, message: 'সারসংক্ষেপ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// বিভাগ ২ — দৈনিক লেজার (তালিকা)
// GET /api/monthly-ledger/daily?month=&year=
// প্রতিদিনের সারি: তারিখ | বিক্রয় | নগদ | বাকি | ঘাটতি | কমিশন | স্ট্যাটাস
// daily_settlements টেবিল-ই মূল সোর্স (একদিনে একটাই সেটেলমেন্ট সাবমিট হয়)
// ============================================================

const getDailyLedger = async (req, res) => {
    try {
        const workerId    = req.user.id;
        const targetMonth = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const targetYear  = parseInt(req.query.year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        const [settlementRes, commissionRes] = await Promise.all([
            query(
                `SELECT
                    settlement_date::text AS date,
                    total_sales_amount, cash_collected,
                    credit_given, shortage_qty_value, status
                 FROM daily_settlements
                 WHERE worker_id = $1 AND settlement_date BETWEEN $2 AND $3
                 ORDER BY settlement_date ASC`,
                [workerId, from, to]
            ),
            query(
                `SELECT date::text AS date, commission_amount
                 FROM commission
                 WHERE user_id = $1 AND date BETWEEN $2 AND $3 AND type = 'daily'`,
                [workerId, from, to]
            ),
        ]);

        const commByDate = {};
        commissionRes.rows.forEach(r => {
            commByDate[r.date] = parseFloat(r.commission_amount || 0);
        });

        const days = settlementRes.rows.map(row => ({
            date:       row.date,
            sales:      parseFloat(row.total_sales_amount || 0),
            cash:       parseFloat(row.cash_collected     || 0),
            due:        parseFloat(row.credit_given        || 0),
            shortage:   parseFloat(row.shortage_qty_value  || 0),
            commission: commByDate[row.date] || 0,
            status:     row.status,
        }));

        return res.status(200).json({
            success: true,
            data: { month: targetMonth, year: targetYear, days }
        });

    } catch (error) {
        logger.error('❌ Daily Ledger List Error:', error.message);
        return res.status(500).json({ success: false, message: 'দৈনিক লেজার আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// বিভাগ ২ — একটি দিনের বিস্তারিত (এক্সপ্যান্ড করলে)
// GET /api/monthly-ledger/daily/:date
//
// ফেরত দেয়:
//   shops      — সেদিন কোন দোকানে কী বিক্রি হলো (বিভাগ ৭)
//   stock      — কোন পণ্য নিল/বিক্রি/ফেরত + ফেরতের কারণ (বিভাগ ৮)
//   visits     — কয়টা দোকানে গেলো, কয়টায় বিক্রি হয়নি ও কেন (বিভাগ ১০)
//   expense    — সেদিনের খরচ (বিভাগ ৯)
//   attendance — চেক-ইন/আউট সময় + দেরি/কর্তন (বিভাগ ১৩)
// ============================================================

const getDailyLedgerDetail = async (req, res) => {
    try {
        const workerId = req.user.id;
        const { date }  = req.params;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, message: 'তারিখের ফরম্যাট সঠিক নয়।' });
        }

        const [shopsRes, stockRes, returnsRes, visitSummaryRes, noSaleRes, expenseRes, attendanceRes] = await Promise.all([

            // ৭. দোকান-ভিত্তিক বিক্রয় (প্রতিটি sale-এ items সহ)
            query(
                `SELECT
                    st.id, st.total_amount, st.cash_received, st.credit_used, st.items,
                    COALESCE(c.shop_name, 'সাধারণ গ্রাহক') AS shop_name
                 FROM sales_transactions st
                 LEFT JOIN customers c ON st.customer_id = c.id
                 WHERE st.worker_id = $1 AND st.date = $2
                 ORDER BY st.created_at ASC`,
                [workerId, date]
            ),

            // ৮. পণ্য চলাচল — নিল (order_in) / বিক্রি (sale_out) / ফেরত (return_out)
            query(
                `SELECT
                    product_id, product_name,
                    SUM(CASE WHEN txn_type = 'order_in'   THEN qty ELSE 0 END) AS taken,
                    SUM(CASE WHEN txn_type = 'sale_out'   THEN qty ELSE 0 END) AS sold,
                    SUM(CASE WHEN txn_type = 'return_out' THEN qty ELSE 0 END) AS returned
                 FROM sr_stock_ledger
                 WHERE worker_id = $1::uuid AND DATE(created_at) = $2
                 GROUP BY product_id, product_name
                 HAVING SUM(qty) > 0
                 ORDER BY product_name`,
                [workerId, date]
            ),

            // ৮. ফেরত/রিপ্লেসমেন্টের কারণ
            query(
                `SELECT type, reason, note, total_value, items
                 FROM return_requests
                 WHERE sr_id = $1 AND DATE(created_at) = $2
                 ORDER BY created_at ASC`,
                [workerId, date]
            ),

            // ১০. ভিজিট সারসংক্ষেপ
            query(
                `SELECT
                    COUNT(*)                                  AS total_visits,
                    COUNT(*) FILTER (WHERE will_sell = true)  AS sold_visits,
                    COUNT(*) FILTER (WHERE will_sell = false) AS no_sale_visits
                 FROM visits
                 WHERE worker_id = $1 AND visit_date = $2`,
                [workerId, date]
            ),

            // ১০. বিক্রি হয়নি এমন দোকান + কারণ
            query(
                `SELECT COALESCE(c.shop_name, 'অজানা দোকান') AS shop_name, v.no_sell_reason
                 FROM visits v
                 LEFT JOIN customers c ON v.customer_id = c.id
                 WHERE v.worker_id = $1 AND v.visit_date = $2 AND v.will_sell = false`,
                [workerId, date]
            ),

            // ৯. দৈনিক খরচ
            query(
                `SELECT transport_cost, food_cost, misc_cost, misc_note, status
                 FROM expense_reports
                 WHERE worker_id = $1 AND report_date = $2`,
                [workerId, date]
            ),

            // ১৩. চেক-ইন/আউট
            query(
                `SELECT
                    check_in_time::text  AS check_in,
                    check_out_time::text AS check_out,
                    status, late_minutes, salary_deduction
                 FROM attendance
                 WHERE user_id = $1 AND date = $2`,
                [workerId, date]
            ),
        ]);

        const shops = shopsRes.rows.map(r => ({
            id:        r.id,
            shop_name: r.shop_name,
            total:     parseFloat(r.total_amount  || 0),
            cash:      parseFloat(r.cash_received || 0),
            due:       parseFloat(r.credit_used   || 0),
            items:     Array.isArray(r.items) ? r.items : [],
        }));

        const stock = stockRes.rows.map(r => ({
            product_id:   r.product_id,
            product_name: r.product_name,
            taken:        parseInt(r.taken    || 0),
            sold:         parseInt(r.sold     || 0),
            returned:     parseInt(r.returned || 0),
        }));

        const returns = returnsRes.rows.map(r => ({
            type:        r.type,
            reason:      r.reason,
            note:        r.note,
            total_value: parseFloat(r.total_value || 0),
            items:       Array.isArray(r.items) ? r.items : [],
        }));

        const vs = visitSummaryRes.rows[0] || {};
        const visits = {
            total:        parseInt(vs.total_visits   || 0),
            sold:         parseInt(vs.sold_visits    || 0),
            not_sold:     parseInt(vs.no_sale_visits || 0),
            no_sale_list: noSaleRes.rows.map(r => ({ shop_name: r.shop_name, reason: r.no_sell_reason })),
        };

        const expRow  = expenseRes.rows[0];
        const expense = expRow ? {
            transport: parseFloat(expRow.transport_cost || 0),
            food:      parseFloat(expRow.food_cost      || 0),
            misc:      parseFloat(expRow.misc_cost      || 0),
            misc_note: expRow.misc_note,
            status:    expRow.status,
            total:     parseFloat(expRow.transport_cost || 0)
                     + parseFloat(expRow.food_cost      || 0)
                     + parseFloat(expRow.misc_cost      || 0),
        } : null;

        const attRow     = attendanceRes.rows[0];
        const attendance = attRow ? {
            check_in:     attRow.check_in,
            check_out:    attRow.check_out,
            status:       attRow.status,
            late_minutes: parseInt(attRow.late_minutes       || 0),
            deduction:    parseFloat(attRow.salary_deduction || 0),
        } : null;

        return res.status(200).json({
            success: true,
            data: { date, shops, stock, returns, visits, expense, attendance }
        });

    } catch (error) {
        logger.error('❌ Daily Ledger Detail Error:', error.message);
        return res.status(500).json({ success: false, message: 'দিনের বিস্তারিত আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// বিভাগ ৪ — বেতন স্লিপ + পরিশোধ স্ট্যাটাস
// GET /api/monthly-ledger/salary-slip?month=&year=
//
// হিসাবের ধাপ:
//   মূল বেতন + মোট মাসিক বিক্রি (info) + বিক্রয় কমিশন + উপস্থিতি বোনাস
//   − উপস্থিতি কর্তন − বকেয়া কর্তন = নেট পাওনা
// + পরিশোধ স্ট্যাটাস: তারিখ | অনুমোদনকারী | রেফারেন্স (salary_payments থেকে)
// ============================================================

const getMySalarySlip = async (req, res) => {
    try {
        const workerId    = req.user.id;
        const targetMonth = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const targetYear  = parseInt(req.query.year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        const [userRes, attRes, commRes, salesRes, payRes] = await Promise.all([

            query(
                `SELECT basic_salary, outstanding_dues FROM users WHERE id = $1`,
                [workerId]
            ),

            query(
                `SELECT COALESCE(SUM(salary_deduction), 0) AS attendance_deduction
                 FROM attendance
                 WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            query(
                `SELECT
                    COALESCE(SUM(CASE WHEN type = 'daily'            THEN commission_amount END), 0) AS sales_commission,
                    COALESCE(SUM(CASE WHEN type = 'attendance_bonus' THEN commission_amount END), 0) AS attendance_bonus
                 FROM commission
                 WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            query(
                `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
                 FROM sales_transactions
                 WHERE worker_id = $1 AND date BETWEEN $2 AND $3`,
                [workerId, from, to]
            ),

            query(
                `SELECT sp.status, sp.paid_at::text, sp.payment_reference,
                        sp.payment_method, sp.outstanding_dues_deducted,
                        approver.name_bn AS approved_by_name
                 FROM salary_payments sp
                 LEFT JOIN users approver ON sp.approved_by = approver.id
                 WHERE sp.worker_id = $1 AND sp.month = $2 AND sp.year = $3`,
                [workerId, targetMonth, targetYear]
            ),
        ]);

        const user = userRes.rows[0] || {};
        const basicSalary = parseFloat(user.basic_salary || 0);

        const attendanceDeduction = parseFloat(attRes.rows[0]?.attendance_deduction || 0);
        const salesCommission     = parseFloat(commRes.rows[0]?.sales_commission    || 0);
        const attendanceBonus     = parseFloat(commRes.rows[0]?.attendance_bonus    || 0);
        const totalSales          = parseFloat(salesRes.rows[0]?.total_sales        || 0);

        const payment = payRes.rows[0] || null;

        // পরিশোধ হয়ে থাকলে সেই সময়ের কাটা বকেয়া দেখাও, না হলে বর্তমান বকেয়া
        const duesDeduction = payment
            ? parseFloat(payment.outstanding_dues_deducted || 0)
            : parseFloat(user.outstanding_dues || 0);

        const netPayable = Math.max(
            0,
            basicSalary + salesCommission + attendanceBonus - attendanceDeduction - duesDeduction
        );

        return res.status(200).json({
            success: true,
            data: {
                month: targetMonth,
                year:  targetYear,

                basic_salary:         basicSalary,
                total_sales:          totalSales,
                sales_commission:     salesCommission,
                attendance_bonus:     attendanceBonus,
                attendance_deduction: attendanceDeduction,
                dues_deduction:       duesDeduction,
                net_payable:          netPayable,

                payment: payment ? {
                    status:            payment.status,
                    paid_at:           payment.paid_at,
                    approved_by_name:  payment.approved_by_name,
                    payment_reference: payment.payment_reference,
                    payment_method:    payment.payment_method,
                } : null,
            },
        });

    } catch (error) {
        logger.error('❌ My Salary Slip Error:', error.message);
        return res.status(500).json({ success: false, message: 'বেতন স্লিপ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// বিভাগ ৫ — বাকি লেজার (২ ট্যাব)
// GET /api/monthly-ledger/dues?month=&year=
//
//   my_dues       — ট্যাব ১: আমার বকেয়া (পণ্য/নগদ ঘাটতি ইতিহাস + কর্তন)
//   customer_dues — ট্যাব ২: গ্রাহকের বাকি (এ মাসে বাড়ল/কমল)
// ============================================================

const DUE_TYPE_LABEL = {
    cash_mismatch:    'নগদ ঘাটতি',
    product_shortage: 'পণ্য ঘাটতি',
};

const getDuesLedger = async (req, res) => {
    try {
        const workerId    = req.user.id;
        const targetMonth = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const targetYear  = parseInt(req.query.year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        const [userRes, historyRes, paymentRes, customerRes] = await Promise.all([

            // বর্তমান মোট বকেয়া (লাইভ ব্যালেন্স)
            query(
                `SELECT outstanding_dues, cash_dues FROM users WHERE id = $1`,
                [workerId]
            ),

            // এই মাসে যা যা বকেয়ায় যোগ হয়েছে — কারণ ও পরিমাণ
            query(
                `SELECT created_at AS date, due_type, amount, note
                 FROM dues_ledger
                 WHERE worker_id = $1 AND created_at::date BETWEEN $2 AND $3
                 ORDER BY created_at DESC`,
                [workerId, from, to]
            ),

            // এই মাসে বেতন থেকে কত বকেয়া কর্তন হয়েছে
            query(
                `SELECT outstanding_dues_deducted
                 FROM salary_payments
                 WHERE worker_id = $1 AND month = $2 AND year = $3`,
                [workerId, targetMonth, targetYear]
            ),

            // ট্যাব ২ — প্রতিটি দোকানের বর্তমান বাকি + এ মাসের পরিবর্তন
            query(
                `SELECT
                    c.id, c.shop_name,
                    COALESCE(c.current_credit, 0)                  AS current_due,
                    COALESCE(SUM(st.credit_used), 0)               AS increased,
                    COALESCE(SUM(st.credit_balance_used), 0)       AS collected
                 FROM customer_assignments ca
                 JOIN customers c ON c.id = ca.customer_id
                 LEFT JOIN sales_transactions st
                        ON st.customer_id = c.id
                       AND st.worker_id   = $1
                       AND st.date BETWEEN $2 AND $3
                 WHERE ca.worker_id = $1 AND ca.is_active = true AND ca.customer_id IS NOT NULL
                 GROUP BY c.id, c.shop_name, c.current_credit
                 HAVING c.current_credit > 0
                     OR COALESCE(SUM(st.credit_used), 0) > 0
                     OR COALESCE(SUM(st.credit_balance_used), 0) > 0
                 ORDER BY c.current_credit DESC`,
                [workerId, from, to]
            ),
        ]);

        const user = userRes.rows[0] || {};

        const myDues = {
            current_balance:     parseFloat(user.outstanding_dues || 0),
            cash_dues:           parseFloat(user.cash_dues        || 0),
            deducted_this_month: parseFloat(paymentRes.rows[0]?.outstanding_dues_deducted || 0),
            history: historyRes.rows.map(r => ({
                date:   r.date,
                type:   r.due_type,
                label:  DUE_TYPE_LABEL[r.due_type] || r.due_type,
                amount: parseFloat(r.amount || 0),
                note:   r.note,
            })),
        };

        const customerDues = customerRes.rows.map(r => ({
            id:          r.id,
            shop_name:   r.shop_name,
            current_due: parseFloat(r.current_due || 0),
            increased:   parseFloat(r.increased   || 0),
            collected:   parseFloat(r.collected   || 0),
        }));

        return res.status(200).json({
            success: true,
            data: {
                month: targetMonth,
                year:  targetYear,
                my_dues:       myDues,
                customer_dues: customerDues,
            },
        });

    } catch (error) {
        logger.error('❌ Dues Ledger Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাকি লেজার আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSummaryCard, getDailyLedger, getDailyLedgerDetail, getMySalarySlip, getDuesLedger };
