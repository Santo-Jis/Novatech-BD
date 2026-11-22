// ============================================================
// পরিকল্পনা (Planning): সিস্টেম নিজে থেকে বলে দেয় কত বিক্রি করতে হবে
//
// ধাপ ১ (এই ফাইল): অ্যাডাপ্টিভ বিশ্লেষণ-জানালা + ব্রেক-ইভেন টার্গেট + SR টার্গেট প্রস্তাব
//
// ── বিশ্লেষণ-জানালা (প্রতিটি প্রতিষ্ঠানের জন্য একই নিয়ম) ──
//   "ডেটার বয়স" = প্রথম বিক্রির তারিখ থেকে আজ পর্যন্ত দিন
//   (নিবন্ধনের তারিখ নয় — নিবন্ধনের পর বিক্রি শুরু হতে দেরি হতে পারে)
//     ৭ দিনের কম  → পর্যাপ্ত ডেটা নেই, প্রস্তাব দেওয়া হয় না
//     ৭–৫৯ দিন    → ১ মাসের ডেটা (বয়স ৩০ দিনের কম হলে যতটুকু আছে ততটুকু)
//     ৬০–৮৯ দিন   → ২ মাসের ডেটা
//     ৯০+ দিন     → ৩ মাসের ডেটা (চলমান জানালা)
//   সব হিসাব "দৈনিক হার" ধরে, তাই আংশিক মাসেও সংখ্যা ঠিক থাকে।
//
// ── ব্রেক-ইভেন ──
//   মাসের খরচ  = জানালার (খরচ + বেতন, accrual) ÷ জানালার দিন × চলতি মাসের দিন
//   মার্জিন    = জানালার মোট মুনাফা ÷ নিট আয়
//   ব্রেক-ইভেন = (মাসের খরচ + কাঙ্ক্ষিত মুনাফা) ÷ মার্জিন
//   মুনাফার হিসাব getPLStatement থেকেই (একই উৎস); এখানে শুধু তার ওপর পরিকল্পনা।
// ============================================================

const { query } = require('../config/db');
const { runPL, monthShift } = require('./financeHealth.service');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const monthDays = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const MIN_DAYS = 7;

// ============================================================
// PURE LOGIC
// ============================================================

/** ডেটার বয়স থেকে বিশ্লেষণ-জানালা ঠিক করা */
const analysisWindow = ({ today, dataStart }) => {
    if (!dataStart) return { ready: false, age_days: 0, months: 0, window_days: 0, from: null, to: today, stage: 'ডেটা নেই', note: 'এখনো কোনো বিক্রি হয়নি।' };
    const age = Math.max(daysBetween(dataStart, today) + 1, 1);
    if (age < MIN_DAYS) {
        return { ready: false, age_days: age, months: 0, window_days: age, from: dataStart, to: today, stage: 'ডেটা জমছে',
                 note: `বিক্রির ডেটা মাত্র ${age} দিনের। কমপক্ষে ${MIN_DAYS} দিনের ডেটা জমলে প্রস্তাব দেওয়া হবে।` };
    }
    const months = age < 60 ? 1 : age < 90 ? 2 : 3;
    const windowDays = Math.min(age, months * 30);
    const stage = `${months} মাসের বিশ্লেষণ`;
    const note = age < 30
        ? `বিক্রির ডেটা ${age} দিনের — এই ${age} দিনের হারের ওপর ভিত্তি করে। ডেটা বাড়লে প্রস্তাব আরও নির্ভুল হবে।`
        : months < 3 ? `গত ${windowDays} দিনের ডেটার ভিত্তিতে। ৯০ দিন পূর্ণ হলে ৩ মাসের গড়ে যাবে।` : `গত ${windowDays} দিনের (৩ মাস) ডেটার ভিত্তিতে।`;
    return { ready: true, age_days: age, months, window_days: windowDays, from: addDays(today, -(windowDays - 1)), to: today, stage, note };
};

/** ব্রেক-ইভেন ও দৈনিক প্রয়োজন */
const breakEven = ({ netRevenue, grossProfit, costs, windowDays, mtdRevenue, today, desiredProfit = 0 }) => {
    const dim = monthDays(today), dayNo = parseInt(today.slice(8), 10), daysLeft = dim - dayNo + 1;   // আজকের দিনসহ
    const perDayRev = windowDays > 0 ? netRevenue / windowDays : 0;
    const monthlyCost = windowDays > 0 ? (costs / windowDays) * dim : 0;
    const margin = netRevenue > 0 ? grossProfit / netRevenue : 0;
    const out = { month_days: dim, days_left: daysLeft, monthly_cost: round2(monthlyCost), gross_margin_pct: round2(margin * 100),
                  desired_profit: round2(desiredProfit), daily_pace: round2(perDayRev), mtd_revenue: round2(mtdRevenue) };
    if (!(margin > 0)) {
        return { ...out, feasible: false, breakeven_revenue: null, remaining: null, per_day_needed: null, projected: null, status: 'no_margin',
                 message: netRevenue > 0 ? 'মোট মুনাফা (মার্জিন) শূন্য বা ঋণাত্মক — বিক্রয়মূল্য/ক্রয়মূল্য ঠিক আছে কি না দেখুন; বিক্রি বাড়িয়ে ব্রেক-ইভেন সম্ভব নয়।' : 'বিক্রি নেই।' };
    }
    const be = (monthlyCost + desiredProfit) / margin;
    const remaining = Math.max(be - mtdRevenue, 0);
    const projected = mtdRevenue + perDayRev * daysLeft;
    const needed = daysLeft > 0 ? remaining / daysLeft : remaining;
    const status = remaining === 0 ? 'reached' : projected >= be ? 'on_track' : 'behind';
    return { ...out, feasible: true, breakeven_revenue: round2(be), remaining: round2(remaining), per_day_needed: round2(needed), projected: round2(projected),
             gap: round2(Math.max(be - projected, 0)), status };
};

/**
 * SR-ভিত্তিক টার্গেট প্রস্তাব। প্রতি SR-এর ভাগ = জানালায় তার বিক্রির অনুপাত।
 * বিক্রি নেই এমন (নতুন) SR-কে গড় ভাগের অর্ধেক ধরা হয় (যাতে ০ টার্গেট না পায়)।
 * সব ০ হলে সমান ভাগ। ৫০০ টাকার ধাপে ওপরে রাউন্ড।
 */
const suggestSrTargets = ({ srs, windowSales, totalTarget, windowDays, mtdBySr, today }) => {
    if (!(totalTarget > 0) || srs.length === 0) return [];
    const sales = srs.map(s => num(windowSales.get(s.id)));
    const pos = sales.filter(v => v > 0);
    const avgPos = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0;
    const weights = sales.map(v => (v > 0 ? v : avgPos > 0 ? avgPos * 0.5 : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    const dim = monthDays(today);
    return srs.map((s, i) => {
        const suggested = Math.ceil((totalTarget * weights[i]) / sum / 500) * 500;
        const pace = windowDays > 0 ? (sales[i] / windowDays) * dim : 0;       // বর্তমান গতিতে মাসে কত
        const current = num(s.target);
        return { id: s.id, name: s.name, current_target: current, suggested_target: suggested, monthly_pace: round2(pace),
                 mtd: round2(num(mtdBySr.get(s.id))), share_pct: round2((weights[i] / sum) * 100),
                 change: current > 0 ? round2(suggested - current) : null, is_new: sales[i] <= 0 };
    }).sort((a, b) => b.suggested_target - a.suggested_target);
};

// ============================================================
// DB
// ============================================================
const getDataStart = async (tenant) => {
    // নিবন্ধন/অ্যাক্টিভেশনের তারিখ নয় (সেটা ডামি হতে পারে) — প্রথম বিক্রির তারিখ
    const r = await query(`SELECT to_char(MIN(date),'YYYY-MM-DD') AS d FROM sales_transactions WHERE tenant_id = $1`, [tenant]);
    return (r.rows[0] && r.rows[0].d) || null;
};

const getTargetPlan = async (req, getPLStatement) => {
    const tenant = req.tenantId, today = todayBD();
    if (req.teamFilter) return { restricted: true };          // কোম্পানি-ব্যাপী হিসাব, টিম-ভিউতে নয়

    const dataStart = await getDataStart(tenant);
    const win = analysisWindow({ today, dataStart });
    if (!win.ready) return { window: win, breakeven: null, sr_targets: [] };

    const mStart = monthShift(today, 0).start;
    const desiredProfit = Math.max(num(req.query && req.query.desired_profit), 0);

    const [plWin, plMtd, invWin, srs, srWin, srMtd] = await Promise.all([
        runPL(getPLStatement, req, win.from, win.to),
        runPL(getPLStatement, req, mStart, today),
        query(`SELECT COALESCE(SUM(COALESCE(net_amount,total_amount)),0) AS v FROM sales_transactions WHERE tenant_id = $1 AND date BETWEEN $2 AND $3`, [tenant, win.from, win.to]),
        query(`SELECT id, name_bn AS name, COALESCE(monthly_target,0) AS target FROM users WHERE tenant_id = $1 AND role = 'worker' AND status = 'active' ORDER BY name_bn`, [tenant]),
        query(`SELECT worker_id, SUM(COALESCE(net_amount,total_amount)) AS v FROM sales_transactions WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY worker_id`, [tenant, win.from, win.to]),
        query(`SELECT worker_id, SUM(COALESCE(net_amount,total_amount)) AS v FROM sales_transactions WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY worker_id`, [tenant, mStart, today]),
    ]);

    const netRev = num(plWin.summary.net_revenue), gp = num(plWin.summary.gross_profit);
    const costs = num(plWin.expenses.total_expenses) + num(plWin.payroll.total_cost);
    const be = breakEven({ netRevenue: netRev, grossProfit: gp, costs, windowDays: win.window_days, mtdRevenue: num(plMtd.summary.net_revenue), today, desiredProfit });

    // SR-এর টার্গেট ইনভয়েস-নিট ভিত্তিতে মাপা হয় (ভ্যাটসহ), P&L-এর আয় ভ্যাট ছাড়া — অনুপাত দিয়ে মেলানো
    const invNet = num(invWin.rows[0].v);
    const basisRatio = netRev > 0 && invNet > 0 ? Math.min(Math.max(invNet / netRev, 1), 1.5) : 1;
    const srTotal = be.feasible ? be.breakeven_revenue * basisRatio : 0;
    const sr = suggestSrTargets({
        srs: srs.rows, windowSales: new Map(srWin.rows.map(r => [r.worker_id, num(r.v)])), totalTarget: srTotal,
        windowDays: win.window_days, mtdBySr: new Map(srMtd.rows.map(r => [r.worker_id, num(r.v)])), today,
    });

    return {
        window: win,
        breakeven: { ...be, costs_window: round2(costs), gross_profit_window: round2(gp), net_revenue_window: round2(netRev) },
        sr_targets: sr,
        sr_total_suggested: round2(sr.reduce((a, r) => a + r.suggested_target, 0)),
        sr_total_current: round2(sr.reduce((a, r) => a + r.current_target, 0)),
        warnings: [
            ...(num(plWin.cogs.lines_without_cost) > 0 ? [`ক্রয়মূল্য ছাড়া ${plWin.cogs.lines_without_cost}টি বিক্রির লাইন আছে — মার্জিন বেশি দেখাতে পারে।`] : []),
        ],
    };
};

/** অ্যাডমিন প্রস্তাবিত টার্গেট নিশ্চিত করলে users.monthly_target আপডেট (শুধু নিজের প্রতিষ্ঠানের SR) */
const applySrTargets = async (req) => {
    const list = Array.isArray(req.body && req.body.targets) ? req.body.targets : [];
    if (list.length === 0 || list.length > 500) { const e = new Error('invalid'); e.status = 400; throw e; }
    const clean = [];
    for (const t of list) {
        const v = Number(t && t.target);
        if (!t || typeof t.id !== 'string' || !Number.isFinite(v) || v < 0 || v > 1e9) { const e = new Error('invalid'); e.status = 400; throw e; }
        clean.push({ id: t.id, target: Math.round(v) });
    }
    const r = await query(
        `UPDATE users u SET monthly_target = x.target
           FROM (SELECT unnest($2::uuid[]) AS id, unnest($3::numeric[]) AS target) x
          WHERE u.id = x.id AND u.tenant_id = $1 AND u.role = 'worker'`,
        [req.tenantId, clean.map(c => c.id), clean.map(c => c.target)]);
    return { updated: r.rowCount };
};

module.exports = { getTargetPlan, applySrTargets, getDataStart, analysisWindow, breakEven, suggestSrTargets, MIN_DAYS };
