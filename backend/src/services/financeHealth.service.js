// ============================================================
// আয়-ব্যয় স্বাস্থ্য (Finance Health)
//
// P&L (getPLStatement) আগে থেকেই accrual ভিত্তিতে মুনাফা হিসাব করে — সেটাই
// একমাত্র "সত্যের উৎস", এখানে পুনরায় হিসাব করা হয় না। এই সার্ভিস তার ওপর যোগ করে:
//   ১. ক্যাশ চিত্র      — আদায় বনাম আসলে দেওয়া খরচ (মুনাফা ≠ হাতে টাকা)
//   ২. সম্ভাব্য খরচ     — অনুমোদনের অপেক্ষায় থাকা SR খরচ (মুনাফায় ধরা হয় না)
//   ৩. সতর্কতা          — বাজেট, অস্বাভাবিক SR খরচ, খরচ/আয় অনুপাত, ক্রয়মূল্য অনুপস্থিত
//   ৪. পূর্বাভাস        — পরের মাসের আনুমানিক পরিচালন খরচ
//
// pure ফাংশনগুলো (DB ছাড়া) আলাদা export করা — টেস্ট করা যায়।
// ============================================================

const { query } = require('../config/db');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

// ── তারিখ সহায়ক (Asia/Dhaka) ────────────────────────────────
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
// মাস-অফসেট: ('2026-11-21', -1) → { start:'2026-10-01', end:'2026-10-31' }
const monthShift = (dateStr, offset) => {
    const [y, m] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    const yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return { start: ymd(yy, mm, 1), end: ymd(yy, mm, last) };
};

// ============================================================
// PURE LOGIC
// ============================================================

// সতর্কতার তীব্রতা: danger > warning > info
const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };

/**
 * পরের মাসের আনুমানিক পরিচালন খরচ।
 *   = গত মাসগুলোর "পরিবর্তনশীল" খরচের গড়  (নির্দিষ্ট মাসিক ও অগ্রিম কিস্তি বাদে)
 *   + চালু নির্দিষ্ট মাসিক খরচের যোগফল
 *   + পরের মাসে পড়বে এমন অগ্রিম খরচের কিস্তি
 * নির্দিষ্ট ও অগ্রিম আলাদা ধরা হয় যাতে গড়ের ভেতরেও ঢুকে double-count না হয়।
 */
const forecastNextMonth = ({ variableByMonth = [], recurringActive = [], prepaid = [], nextMonthStart }) => {
    const months = variableByMonth.filter(v => Number.isFinite(v));
    const variableAvg = months.length ? months.reduce((s, v) => s + v, 0) / months.length : 0;
    const recurringTotal = recurringActive.reduce((s, r) => s + num(r.amount), 0);

    const [ny, nm] = nextMonthStart.split('-').map(Number);
    const nextIdx = ny * 12 + (nm - 1);
    let prepaidTotal = 0;
    for (const p of prepaid) {
        const [sy, sm] = String(p.start_month).slice(0, 7).split('-').map(Number);
        const startIdx = sy * 12 + (sm - 1);
        if (nextIdx >= startIdx && nextIdx < startIdx + Number(p.months)) {
            prepaidTotal += num(p.total_amount) / Number(p.months);
        }
    }
    return {
        variable_avg:    round2(variableAvg),
        recurring_fixed: round2(recurringTotal),
        prepaid_install: round2(prepaidTotal),
        total:           round2(variableAvg + recurringTotal + prepaidTotal),
        basis_months:    months.length,
    };
};

/**
 * SR-এর কোন রিপোর্ট তার নিজের গড়ের তুলনায় অস্বাভাবিক বেশি।
 * নিয়ম: আগের কমপক্ষে ৩টি রিপোর্ট থাকতে হবে, আর নতুনটি গড়ের ২ গুণের বেশি ও
 * গড়ের চেয়ে অন্তত ৳১০০ বেশি (ছোট অঙ্কে ভুয়া সতর্কতা এড়াতে)।
 */
const findAnomalies = (reports, { minHistory = 3, factor = 2, minExtra = 100 } = {}) => {
    const byWorker = new Map();
    for (const r of reports) {
        if (!byWorker.has(r.worker_id)) byWorker.set(r.worker_id, []);
        byWorker.get(r.worker_id).push(r);
    }
    const out = [];
    for (const list of byWorker.values()) {
        list.sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
        for (let i = minHistory; i < list.length; i++) {
            const prev = list.slice(0, i).map(x => num(x.total_amount));
            const avg = prev.reduce((s, v) => s + v, 0) / prev.length;
            const cur = num(list[i].total_amount);
            if (avg > 0 && cur > avg * factor && cur - avg >= minExtra) {
                out.push({
                    worker_id: list[i].worker_id, name: list[i].name, date: list[i].report_date,
                    amount: cur, average: round2(avg),
                });
            }
        }
    }
    return out;
};

/** সব সতর্কতা এক জায়গায় — ইনপুট শুধু সংখ্যা, তাই টেস্টযোগ্য */
const buildAlerts = ({ budgetRows = [], anomalies = [], expenseRatio, prevExpenseRatio,
                       missingCostProducts = [], unappliedLandedCost = 0,
                       pendingTotal = 0, pendingCount = 0, cashNet, netProfit }) => {
    const alerts = [];

    for (const b of budgetRows) {
        if (b.budget === null || !(b.budget > 0)) continue;
        const pct = (b.actual / b.budget) * 100;
        if (pct >= 100) {
            alerts.push({ severity: 'danger', code: 'budget_exceeded',
                message: `"${b.name}" খরচ বাজেট ছাড়িয়েছে (৳${Math.round(b.actual)} / ৳${Math.round(b.budget)}, ${Math.round(pct)}%)` });
        } else if (pct >= 80) {
            alerts.push({ severity: 'warning', code: 'budget_80',
                message: `"${b.name}" খরচ বাজেটের ${Math.round(pct)}% হয়ে গেছে (৳${Math.round(b.actual)} / ৳${Math.round(b.budget)})` });
        }
    }

    for (const a of anomalies.slice(0, 5)) {
        alerts.push({ severity: 'warning', code: 'sr_expense_spike',
            message: `${a.name || 'SR'}-এর ${String(a.date).slice(0, 10)} তারিখের খরচ ৳${Math.round(a.amount)} — তার গড় ৳${Math.round(a.average)}-এর ২ গুণের বেশি` });
    }

    if (Number.isFinite(expenseRatio) && Number.isFinite(prevExpenseRatio) && expenseRatio - prevExpenseRatio >= 5) {
        alerts.push({ severity: 'warning', code: 'expense_ratio_up',
            message: `আয়ের তুলনায় খরচের অনুপাত বেড়েছে: ${prevExpenseRatio.toFixed(1)}% → ${expenseRatio.toFixed(1)}%` });
    }

    if (missingCostProducts.length > 0) {
        alerts.push({ severity: 'warning', code: 'missing_cost',
            message: `${missingCostProducts.length}টি বিক্রিত পণ্যের ক্রয়মূল্য নেই, তাই মুনাফা বেশি দেখাতে পারে (${missingCostProducts.slice(0, 3).join(', ')})` });
    }
    if (unappliedLandedCost > 0) {
        alerts.push({ severity: 'info', code: 'landed_cost',
            message: `৳${Math.round(unappliedLandedCost)} আমদানি/পরিবহন খরচ এখনো পণ্যের ক্রয়মূল্যে যোগ হয়নি` });
    }
    if (pendingCount > 0) {
        alerts.push({ severity: 'info', code: 'pending_sr_expense',
            message: `${pendingCount}টি SR খরচ (৳${Math.round(pendingTotal)}) অনুমোদনের অপেক্ষায়` });
    }
    if (Number.isFinite(netProfit) && Number.isFinite(cashNet) && netProfit > 0 && cashNet < 0) {
        alerts.push({ severity: 'danger', code: 'profit_without_cash',
            message: `কাগজে মুনাফা আছে (৳${Math.round(netProfit)}) কিন্তু নগদ প্রবাহ ঋণাত্মক (৳${Math.round(cashNet)}) — বাকি আদায় দেখুন` });
    }

    return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};

// ============================================================
// P&L ফিরিয়ে আনা — getPLStatement-কেই কাজে লাগানো (লজিক নকল না করে)
// ============================================================
const runPL = (getPLStatement, req, from, to) => new Promise((resolve, reject) => {
    const fakeReq = { query: { from, to }, tenantId: req.tenantId, teamFilter: req.teamFilter, user: req.user };
    const fakeRes = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(body) { body && body.success ? resolve(body.data) : reject(new Error((body && body.message) || 'P&L failed')); },
    };
    Promise.resolve(getPLStatement(fakeReq, fakeRes)).catch(reject);
});

const ratio = (pl) => {
    const rev = num(pl.summary && pl.summary.net_revenue);
    if (!(rev > 0)) return null;
    const exp = num(pl.expenses && pl.expenses.total_expenses) + num(pl.payroll && pl.payroll.total_cost);
    return (exp / rev) * 100;
};

// ============================================================
// মূল ফাংশন
// ============================================================
const getFinanceHealth = async (req, getPLStatement) => {
    const tenant = req.tenantId;
    const today  = todayBD();
    const cur    = monthShift(today, 0);
    const prev   = monthShift(today, -1);
    const next   = monthShift(today, 1);
    const from   = req.query.from || cur.start;
    const to     = req.query.to   || today;

    // টিম-ভিউ (manager_id ফিল্টার) এ কোম্পানি-ব্যাপী সংখ্যা দেখানো যাবে না
    const companyWide = !req.teamFilter;

    const threeAgo = monthShift(today, -3).start;
    const lastFullEnd = prev.end;

    const [plCur, plPrev, cash, pending, budgetData, anomalyRows, varMonths, recurring, prepaid] = await Promise.all([
        runPL(getPLStatement, req, from, to),
        runPL(getPLStatement, req, prev.start, prev.end).catch(() => null),

        // ক্যাশ: আদায় বনাম খরচ
        companyWide ? Promise.all([
            query(`SELECT COALESCE(SUM(cash_received),0) AS v FROM sales_transactions
                    WHERE tenant_id=$1 AND date BETWEEN $2 AND $3`, [tenant, from, to]),
            query(`SELECT
                      COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('pending','submitted','rejected')),0) AS confirmed,
                      COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','submitted')),0)               AS in_transit
                   FROM collections
                   WHERE tenant_id=$1 AND created_at::date BETWEEN $2 AND $3`, [tenant, from, to]),
            query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses
                    WHERE tenant_id=$1 AND date BETWEEN $2 AND $3`, [tenant, from, to]),
            query(`SELECT COALESCE(SUM(net_payable),0) AS v FROM salary_payments
                    WHERE tenant_id=$1 AND status='paid' AND paid_at::date BETWEEN $2 AND $3`, [tenant, from, to]),
        ]) : Promise.resolve(null),

        // অনুমোদনের অপেক্ষায় SR খরচ
        query(`SELECT COUNT(*) AS c, COALESCE(SUM(er.total_amount),0) AS s
                 FROM expense_reports er
                 ${req.teamFilter ? 'JOIN users u ON u.id = er.worker_id' : ''}
                WHERE er.tenant_id=$1 AND er.status='pending' AND er.total_amount > 0
                  AND er.report_date BETWEEN $2 AND $3
                  ${req.teamFilter ? 'AND u.manager_id = $4' : ''}`,
            req.teamFilter ? [tenant, from, to, req.teamFilter] : [tenant, from, to]),

        // চলতি মাসের বাজেট বনাম আসল (ক্যাটাগরি ধরে)
        companyWide ? Promise.all([
            query(`SELECT id, name FROM expense_categories WHERE tenant_id=$1 AND is_active=true`, [tenant]),
            query(`SELECT category_id, month, amount FROM expense_budgets
                    WHERE tenant_id=$1 AND (month IS NULL OR month=$2)`, [tenant, cur.start]),
            query(`SELECT expense_type, COALESCE(SUM(amount),0) AS amount FROM expenses
                    WHERE tenant_id=$1 AND date BETWEEN $2 AND $3 GROUP BY expense_type`, [tenant, cur.start, cur.end]),
        ]) : Promise.resolve(null),

        // অস্বাভাবিক SR খরচ: গত ৯০ দিনের রিপোর্ট (pending+approved)
        query(`SELECT er.worker_id, u.name_bn AS name, to_char(er.report_date,'YYYY-MM-DD') AS report_date, er.total_amount
                 FROM expense_reports er JOIN users u ON u.id = er.worker_id
                WHERE er.tenant_id=$1 AND er.status IN ('pending','approved')
                  AND er.report_date >= ($2::date - 90)
                  ${req.teamFilter ? 'AND u.manager_id = $3' : ''}
                ORDER BY er.report_date`,
            req.teamFilter ? [tenant, today, req.teamFilter] : [tenant, today]),

        // পূর্বাভাসের জন্য: গত ৩ পূর্ণ মাসের পরিবর্তনশীল খরচ
        companyWide ? query(
            `SELECT to_char(date_trunc('month', date),'YYYY-MM') AS ym, COALESCE(SUM(amount),0) AS amount
               FROM expenses
              WHERE tenant_id=$1 AND date BETWEEN $2 AND $3
                AND COALESCE(source,'manual') NOT IN ('recurring','prepaid')
              GROUP BY 1`, [tenant, threeAgo, lastFullEnd]) : Promise.resolve(null),
        companyWide ? query(`SELECT amount FROM recurring_expenses
                              WHERE tenant_id=$1 AND is_active=true
                                AND start_date <= $3 AND (end_date IS NULL OR end_date >= $2)`,
                            [tenant, next.start, next.end]) : Promise.resolve(null),
        companyWide ? query(`SELECT total_amount, months, start_month FROM prepaid_expenses WHERE tenant_id=$1`, [tenant])
                    : Promise.resolve(null),
    ]);

    // ── ক্যাশ ──
    let cashBlock = null;
    if (cash) {
        const [saleCash, coll, exp, sal] = cash.map(r => r.rows[0]);
        const cashIn  = num(saleCash.v) + num(coll.confirmed);
        const cashOut = num(exp.v) + num(sal.v);
        cashBlock = {
            cash_in:          round2(cashIn),
            cash_sales:       round2(num(saleCash.v)),
            collections:      round2(num(coll.confirmed)),
            collections_in_transit: round2(num(coll.in_transit)),   // এখনো যাচাই/জমা হয়নি
            cash_out:         round2(cashOut),
            expenses_paid:    round2(num(exp.v)),
            salary_paid:      round2(num(sal.v)),
            net_cash:         round2(cashIn - cashOut),
        };
    }

    // ── বাজেট সারি ──
    let budgetRows = [];
    if (budgetData) {
        const [cats, budgets, actuals] = budgetData;
        const actualByName = new Map(actuals.rows.map(r => [r.expense_type, num(r.amount)]));
        budgetRows = cats.rows.map(c => {
            const hit = budgets.rows.find(b => b.category_id === c.id && b.month)
                     || budgets.rows.find(b => b.category_id === c.id && !b.month);
            return { name: c.name, budget: hit ? num(hit.amount) : null, actual: actualByName.get(c.name) || 0 };
        });
    }

    // ── পূর্বাভাস ──
    let forecast = null;
    if (varMonths) {
        forecast = forecastNextMonth({
            variableByMonth: varMonths.rows.map(r => num(r.amount)),
            recurringActive: recurring.rows,
            prepaid: prepaid.rows,
            nextMonthStart: next.start,
        });
    }

    // শুধু নির্বাচিত সময়ের ভেতরের অস্বাভাবিক রিপোর্ট দেখাও (ইতিহাস গড়ের জন্য ৯০ দিন নেওয়া)
    const anomalies = findAnomalies(anomalyRows.rows).filter(a => a.date >= from && a.date <= to);

    const pendingCount = parseInt(pending.rows[0].c) || 0;
    const pendingTotal = num(pending.rows[0].s);
    const netProfit = num(plCur.summary.net_profit);

    const alerts = buildAlerts({
        budgetRows, anomalies,
        expenseRatio: ratio(plCur),
        prevExpenseRatio: plPrev ? ratio(plPrev) : null,
        missingCostProducts: plCur.cogs.products_without_cost || [],
        unappliedLandedCost: num(plCur.cogs.unapplied_landed_cost),
        pendingTotal, pendingCount,
        cashNet: cashBlock ? cashBlock.net_cash : NaN,
        netProfit,
    });

    return {
        period: { from, to },
        profit: {
            net_revenue:  num(plCur.summary.net_revenue),
            gross_profit: num(plCur.summary.gross_profit),
            net_profit:   netProfit,
            profit_margin: num(plCur.summary.profit_margin),
            expense_ratio: ratio(plCur) === null ? null : round2(ratio(plCur)),
            prev_expense_ratio: plPrev && ratio(plPrev) !== null ? round2(ratio(plPrev)) : null,
            basis: 'accrual',
        },
        cash: cashBlock,                    // টিম-ভিউতে null
        pending_expenses: { count: pendingCount, total: round2(pendingTotal) },
        forecast,                           // টিম-ভিউতে null
        alerts,
    };
};

module.exports = {
    getFinanceHealth,
    // pure — টেস্টের জন্য
    forecastNextMonth, findAnomalies, buildAlerts, monthShift, runPL,
};
