// ============================================================
// অপারেশন স্বাস্থ্য — অ্যাডমিন/ম্যানেজার ড্যাশবোর্ড
//   ১. বকেয়া ও আদায়   (getReceivablesHealth)
//   ২. SR পারফরম্যান্স  (getSrPerformanceHealth)
//   ৩. আজ কী করতে হবে   (getActionList)
//
// pure ফাংশনগুলো (DB ছাড়া) আলাদা export — টেস্ট করা যায়।
// তারিখ সব Asia/Dhaka ধরে; DB-র date কলাম 'YYYY-MM-DD' স্ট্রিং করে নেওয়া হয়
// (pg Date অবজেক্টের টাইমজোন গোলমাল এড়াতে)।
// ============================================================

const { query } = require('../config/db');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b > 0 ? round2((a / b) * 100) : null);
const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };
const sortAlerts = (a) => a.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);

const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const hourBD = () => parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).format(new Date()), 10) % 24;
const daysBetween = (fromStr, toStr) =>
    Math.round((Date.parse(toStr + 'T00:00:00Z') - Date.parse(String(fromStr).slice(0, 10) + 'T00:00:00Z')) / 86400000);
const monthStart = (d) => d.slice(0, 8) + '01';
const daysInMonth = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// ============================================================
// ১. বকেয়া ও আদায় — PURE
// ============================================================
const AGE_BUCKETS = [
    { key: 'd0_30',  label: '০–৩০ দিন',  max: 30 },
    { key: 'd31_60', label: '৩১–৬০ দিন', max: 60 },
    { key: 'd61_90', label: '৬১–৯০ দিন', max: 90 },
    { key: 'd90p',   label: '৯০+ দিন',   max: Infinity },
];
const bucketOf = (age) => AGE_BUCKETS.find(b => age <= b.max).key;

/**
 * বকেয়ার বয়স। কোনো due-date নেই, তাই বয়স = বিক্রির তারিখ থেকে আজ।
 * দোকানের মোট বকেয়া (customers.current_credit) নির্ভরযোগ্য সংখ্যা। ইনভয়েস-ভিত্তিক বাকি
 * (credit_used − allocated) পুরোনো আদায়ের হিসাবে বেশি দেখাতে পারে, তাই FIFO ধরে:
 * আদায় পুরোনো ইনভয়েস থেকে কাটে → বাকি থাকে নতুনগুলো। অর্থাৎ নতুন→পুরোনো ক্রমে
 * দোকানের মোট বকেয়া পর্যন্ত ইনভয়েস বসাই। ইনভয়েস দিয়ে ব্যাখ্যা না হওয়া অংশ
 * (পুরোনো ব্যালেন্স/ম্যানুয়াল) আলাদা "unexplained" — বয়স অজানা।
 */
const ageDues = (customers, invoices, today) => {
    const byCustomer = new Map();
    for (const inv of invoices) {
        if (!byCustomer.has(inv.customer_id)) byCustomer.set(inv.customer_id, []);
        byCustomer.get(inv.customer_id).push(inv);
    }
    const buckets = Object.fromEntries(AGE_BUCKETS.map(b => [b.key, 0]));
    let unexplained = 0, total = 0;
    const overdue = [];

    for (const c of customers) {
        let left = num(c.current_credit);
        if (left <= 0) continue;
        total += left;
        const invs = (byCustomer.get(c.id) || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
        let oldestAge = null, over60 = 0;
        for (const inv of invs) {
            if (left <= 0.005) break;
            const take = Math.min(num(inv.remaining), left);
            if (take <= 0) continue;
            const age = Math.max(daysBetween(inv.date, today), 0);
            buckets[bucketOf(age)] += take;
            if (age > 60) over60 += take;
            oldestAge = oldestAge === null ? age : Math.max(oldestAge, age);
            left -= take;
        }
        if (left > 0.005) unexplained += left;
        if (over60 > 0) overdue.push({ id: c.id, name: c.shop_name, over60: round2(over60), oldest_days: oldestAge, due: round2(num(c.current_credit)) });
    }

    const over60Total = buckets.d61_90 + buckets.d90p;
    return {
        total: round2(total),
        buckets: AGE_BUCKETS.map(b => ({ key: b.key, label: b.label, amount: round2(buckets[b.key]), pct: pct(buckets[b.key], total) })),
        unexplained: round2(unexplained),
        over_60_total: round2(over60Total),
        over_60_pct: pct(over60Total, total),
        overdue_top: overdue.sort((a, b) => b.over60 - a.over60).slice(0, 5),
    };
};

/** ক্রেডিট সীমা ব্যবহার: সীমা ছাড়ানো ও সীমার কাছাকাছি */
const creditLimitUsage = (customers, thresholdPct = 80) => {
    const rows = customers
        .filter(c => num(c.credit_limit) > 0 && num(c.current_credit) > 0)
        .map(c => ({ name: c.shop_name, due: num(c.current_credit), limit: num(c.credit_limit),
                     used_pct: round2((num(c.current_credit) / num(c.credit_limit)) * 100) }));
    const over = rows.filter(r => r.used_pct > 100);
    const near = rows.filter(r => r.used_pct >= thresholdPct && r.used_pct <= 100);
    const top = [...over, ...near].sort((a, b) => b.used_pct - a.used_pct).slice(0, 5);
    return { over_count: over.length, near_count: near.length, threshold_pct: thresholdPct, top };
};

/** SR-এর হাতে আদায় করা কিন্তু কোম্পানিতে জমা/যাচাই হয়নি */
const summarizeTransit = (rows, today) => {
    const bySr = new Map();
    let total = 0, count = 0, oldest = null;
    for (const r of rows) {
        const amt = num(r.amt), cnt = parseInt(r.cnt) || 0;
        total += amt; count += cnt;
        if (r.oldest && (oldest === null || r.oldest < oldest)) oldest = r.oldest;
        const cur = bySr.get(r.sr_id) || { name: r.name, amount: 0, count: 0, oldest: null };
        cur.amount += amt; cur.count += cnt;
        if (r.oldest && (cur.oldest === null || r.oldest < cur.oldest)) cur.oldest = r.oldest;
        bySr.set(r.sr_id, cur);
    }
    return {
        total: round2(total), count,
        oldest_days: oldest ? Math.max(daysBetween(oldest, today), 0) : null,
        by_sr: [...bySr.values()].map(s => ({ ...s, amount: round2(s.amount), oldest_days: s.oldest ? Math.max(daysBetween(s.oldest, today), 0) : null }))
                                  .sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
};

const buildReceivableAlerts = ({ aging, limits, transit, srCashDues }) => {
    const alerts = [];
    if (aging) {
        if (aging.over_60_pct !== null && aging.over_60_pct >= 50) {
            alerts.push({ severity: 'danger', code: 'overdue_heavy', message: `মোট বকেয়ার ${aging.over_60_pct}% (৳${Math.round(aging.over_60_total)}) ৬০ দিনের বেশি পুরোনো — আদায় ঝুঁকিতে` });
        } else if (aging.over_60_pct !== null && aging.over_60_pct >= 25) {
            alerts.push({ severity: 'warning', code: 'overdue', message: `মোট বকেয়ার ${aging.over_60_pct}% (৳${Math.round(aging.over_60_total)}) ৬০ দিনের বেশি পুরোনো` });
        }
        if (aging.unexplained > 0 && aging.total > 0 && aging.unexplained / aging.total >= 0.2) {
            alerts.push({ severity: 'info', code: 'unexplained_due', message: `৳${Math.round(aging.unexplained)} বকেয়া কোনো ইনভয়েসের সাথে মেলে না (পুরোনো ব্যালেন্স/ম্যানুয়াল) — তাই এর বয়স দেখানো যায়নি` });
        }
    }
    if (limits) {
        if (limits.over_count > 0) alerts.push({ severity: 'danger', code: 'over_limit', message: `${limits.over_count}টি দোকান ক্রেডিট সীমা ছাড়িয়েছে` });
        if (limits.near_count > 0) alerts.push({ severity: 'warning', code: 'near_limit', message: `${limits.near_count}টি দোকান সীমার ${limits.threshold_pct}%+ ব্যবহার করেছে` });
    }
    if (transit && transit.total > 0) {
        const d = transit.oldest_days;
        const sev = d !== null && d >= 7 ? 'danger' : d !== null && d >= 3 ? 'warning' : 'info';
        alerts.push({ severity: sev, code: 'collections_in_transit',
            message: `৳${Math.round(transit.total)} আদায় (${transit.count}টি) SR-এর হাতে জমা/যাচাই হয়নি${d !== null ? ` — সবচেয়ে পুরোনোটি ${d} দিনের` : ''}` });
    }
    if (srCashDues && srCashDues.total > 0) {
        alerts.push({ severity: 'warning', code: 'sr_owes', message: `${srCashDues.count} জন SR-এর কাছে কোম্পানির পাওনা ৳${Math.round(srCashDues.total)} (ঘাটতি/নগদ গরমিল)` });
    }
    return sortAlerts(alerts);
};

// ============================================================
// ২. SR পারফরম্যান্স — PURE
// ============================================================
/**
 * @param hour  ঢাকার ঘণ্টা (০–২৩) — সকালে "ভিজিট/বিক্রি শূন্য" ধরলে ভুল সতর্কতা হয়, তাই সময় ধরে
 *  absent: ১০টার পর; ভিজিট শূন্য: ১২টার পর; বিক্রি শূন্য: ১৫টার পর
 */
const evaluateSr = ({ workers, attendance = [], leaveIds = [], visits = [], salesToday = [], salesMtd = [], today, hour }) => {
    const att = new Map(attendance.map(a => [a.user_id, a.status]));
    const leave = new Set(leaveIds);
    const vis = new Map(visits.map(v => [v.worker_id, parseInt(v.visits) || 0]));
    const sToday = new Map(salesToday.map(s => [s.worker_id, num(s.amount)]));
    const sMtd = new Map(salesMtd.map(s => [s.worker_id, num(s.amount)]));

    const dim = daysInMonth(today), day = parseInt(today.slice(8), 10);
    const expectedPct = round2((day / dim) * 100);

    const counts = { total: workers.length, present: 0, late: 0, on_leave: 0, absent: 0 };
    const absent = [], zeroVisit = [], zeroSales = [], behind = [];
    let targetSum = 0, achievedSum = 0;

    for (const w of workers) {
        const st = att.get(w.id);
        const isLeave = leave.has(w.id) || st === 'leave';
        const isPresent = st === 'present' || st === 'late';
        if (isLeave) counts.on_leave++;
        else if (isPresent) { counts.present++; if (st === 'late') counts.late++; }
        else if (hour >= 10) { counts.absent++; absent.push(w.name); }

        if (isPresent) {
            if (hour >= 12 && (vis.get(w.id) || 0) === 0) zeroVisit.push(w.name);
            if (hour >= 15 && (sToday.get(w.id) || 0) === 0) zeroSales.push(w.name);
        }

        const target = num(w.target);
        if (target > 0) {
            const got = sMtd.get(w.id) || 0;
            const achieved = round2((got / target) * 100);
            targetSum += target; achievedSum += got;
            if (day >= 5 && achieved < expectedPct * 0.7) {
                behind.push({ name: w.name, target: round2(target), achieved: round2(got), achieved_pct: achieved, shortfall: round2(target * expectedPct / 100 - got) });
            }
        }
    }
    behind.sort((a, b) => b.shortfall - a.shortfall);

    return {
        counts,
        absent: absent.slice(0, 8),
        zero_visit: zeroVisit.slice(0, 8),
        zero_sales: zeroSales.slice(0, 8),
        target: {
            expected_pct: expectedPct,
            team_target: round2(targetSum), team_achieved: round2(achievedSum),
            team_achieved_pct: pct(achievedSum, targetSum),
            behind_count: behind.length, behind: behind.slice(0, 5),
        },
    };
};

const buildSrAlerts = (ev, commission) => {
    const alerts = [];
    if (ev.counts.absent > 0) alerts.push({ severity: 'warning', code: 'sr_absent', message: `${ev.counts.absent} জন SR আজ হাজিরা দেননি (ছুটি ছাড়া): ${ev.absent.slice(0, 3).join(', ')}${ev.absent.length > 3 ? '…' : ''}` });
    if (ev.zero_visit.length > 0) alerts.push({ severity: 'warning', code: 'sr_zero_visit', message: `উপস্থিত কিন্তু আজ একটাও ভিজিট নেই: ${ev.zero_visit.slice(0, 3).join(', ')}${ev.zero_visit.length > 3 ? '…' : ''}` });
    if (ev.zero_sales.length > 0) alerts.push({ severity: 'info', code: 'sr_zero_sales', message: `আজ এখনো বিক্রি শূন্য: ${ev.zero_sales.slice(0, 3).join(', ')}${ev.zero_sales.length > 3 ? '…' : ''}` });
    if (ev.target.behind_count > 0) alerts.push({ severity: 'warning', code: 'sr_behind_target', message: `${ev.target.behind_count} জন SR মাসের টার্গেটের গতিতে পিছিয়ে (এ পর্যন্ত প্রত্যাশিত ${ev.target.expected_pct}%)` });
    if (commission && commission.count > 0) alerts.push({ severity: 'info', code: 'commission_unpaid', message: `${commission.count}টি কমিশন (৳${Math.round(commission.total)}) পরিশোধের অপেক্ষায়` });
    return sortAlerts(alerts);
};

// ============================================================
// ৩. কাজের তালিকা — PURE
// ============================================================
/** কাজ-তালিকার সারি → ভূমিকা অনুযায়ী লিংকসহ, জরুরি আগে */
const shapeActions = (rows, defs, role) => {
    const isAdmin = role === 'admin';
    const items = [];
    for (const d of defs) {
        const r = rows.find(x => x.key === d.key);
        const count = r ? parseInt(r.n) || 0 : 0;
        if (count <= 0) continue;
        items.push({
            key: d.key, label: d.label, count,
            value: d.money ? round2(num(r.v)) : null,
            oldest_days: r.oldest_days === null || r.oldest_days === undefined ? null : Math.max(parseInt(r.oldest_days) || 0, 0),
            link: (isAdmin ? d.admin : d.manager) || null,
            weight: d.weight,
        });
    }
    // জরুরি = ওজন + পুরোনো হলে বাড়তি; একই হলে বেশি সংখ্যা আগে
    return items.sort((a, b) => ((b.weight + Math.min(b.oldest_days || 0, 10)) - (a.weight + Math.min(a.oldest_days || 0, 10))) || (b.count - a.count));
};

// কাজের সংজ্ঞা: sql → (n, v, oldest_days) ; {t} = টিম-ফিল্টার ক্লজ (শুধু worker-ভিত্তিক টেবিলে)
const ACTION_DEFS = [
    { key: 'settlements',  label: 'সেটেলমেন্ট অনুমোদন',        weight: 9, admin: '/admin/approvals/settlements', manager: '/manager/settlements', teamable: true,
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(s.created_at)) oldest_days
              FROM daily_settlements s JOIN users u ON u.id = s.worker_id
             WHERE s.tenant_id = $1 AND s.status IN ('pending','disputed') {t}` },
    { key: 'orders',       label: 'SR অর্ডার অনুমোদন',          weight: 8, admin: '/admin/approvals/orders', manager: '/manager/orders', teamable: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(o.total_amount),0) v, EXTRACT(DAY FROM now() - MIN(o.requested_at)) oldest_days
              FROM orders o JOIN users u ON u.id = o.worker_id
             WHERE o.tenant_id = $1 AND o.status = 'pending' {t}`, money: true },
    { key: 'sr_expense',   label: 'SR খরচ অনুমোদন',            weight: 6, admin: '/admin/approvals/expense', manager: '/manager/expense', teamable: true, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(er.total_amount),0) v, EXTRACT(DAY FROM now() - MIN(er.created_at)) oldest_days
              FROM expense_reports er JOIN users u ON u.id = er.worker_id
             WHERE er.tenant_id = $1 AND er.status = 'pending' AND er.total_amount > 0 {t}` },
    { key: 'returns',      label: 'SR রিটার্ন/বদলি অনুমোদন',    weight: 7, admin: '/admin/approvals/returns', manager: '/manager/returns', teamable: true, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(rr.total_value),0) v, EXTRACT(DAY FROM now() - MIN(rr.created_at)) oldest_days
              FROM return_requests rr JOIN users u ON u.id = rr.sr_id
             WHERE rr.tenant_id = $1 AND rr.status = 'pending' {t}` },
    { key: 'credit_approvals', label: 'ক্রেডিট অনুমোদন (SR)',   weight: 7, admin: '/admin/approvals/credit', manager: '/manager/credit-approvals', teamable: true, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(c.requested_amount),0) v, EXTRACT(DAY FROM now() - MIN(c.created_at)) oldest_days
              FROM credit_approval_requests c JOIN users u ON u.id = c.worker_id
             WHERE c.tenant_id = $1 AND c.status = 'pending' {t}` },
    { key: 'collections',  label: 'আদায় যাচাই/জমা বাকি',       weight: 7, admin: null, manager: null, teamable: true, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(c.amount),0) v, EXTRACT(DAY FROM now() - MIN(c.created_at)) oldest_days
              FROM collections c JOIN users u ON u.id = c.sr_id
             WHERE c.tenant_id = $1 AND c.status IN ('pending','submitted') {t}` },
    { key: 'pending_users', label: 'নতুন কর্মীর অনুমোদন',        weight: 5, admin: '/admin/pending', manager: null,
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM users WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'leave',        label: 'ছুটির আবেদন',               weight: 5, admin: '/admin/leave-management', manager: null,
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM leave_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'customer_orders', label: 'কাস্টমার অর্ডার অনুরোধ',  weight: 7, admin: '/admin/customer-order-requests', manager: null,
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM customer_order_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'portal_returns', label: 'কাস্টমার রিটার্ন অনুরোধ',  weight: 6, admin: '/admin/portal-returns', manager: '/manager/portal-returns', money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(total_return_value),0) v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM customer_return_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'customer_edits', label: 'দোকানের তথ্য পরিবর্তন অনুরোধ', weight: 3, admin: '/admin/customer-requests', manager: '/manager/customer-requests',
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM customer_edit_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'credit_limit', label: 'ক্রেডিট সীমা বাড়ানোর অনুরোধ', weight: 5, admin: '/admin/credit-settings', manager: null, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(requested_amount),0) v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM credit_limit_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'routes',       label: 'রুট অনুরোধ',                weight: 3, admin: '/admin/routes', manager: null,
      sql: `SELECT COUNT(*) n, 0 v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM route_requests WHERE tenant_id = $1 AND status = 'pending'` },
    { key: 'commission',   label: 'কমিশন পরিশোধ বাকি',          weight: 4, admin: '/admin/commission-pay', manager: null, money: true,
      sql: `SELECT COUNT(*) n, COALESCE(SUM(COALESCE(net_payable, commission_amount)),0) v, EXTRACT(DAY FROM now() - MIN(created_at)) oldest_days FROM monthly_commissions WHERE tenant_id = $1 AND NOT paid` },
];

// ============================================================
// DB ফাংশন
// ============================================================
const teamClause = (req) => (req.teamFilter ? 'AND u.manager_id = $2' : '');
const teamParams = (req, base) => (req.teamFilter ? [...base, req.teamFilter] : base);

const getReceivablesHealth = async (req) => {
    const tenant = req.tenantId, today = todayBD();
    const companyWide = !req.teamFilter;

    const [custs, invs, cs, transitRows, todayColl, srDues] = await Promise.all([
        companyWide ? query(`SELECT id, shop_name, current_credit, credit_limit FROM customers
                              WHERE tenant_id = $1 AND is_active IS NOT FALSE AND current_credit > 0`, [tenant]) : null,
        companyWide ? query(
            `SELECT st.customer_id, to_char(st.date,'YYYY-MM-DD') AS date,
                    GREATEST(st.credit_used - COALESCE(pa.allocated,0), 0) AS remaining
               FROM sales_transactions st
               LEFT JOIN (SELECT sale_id, SUM(amount) AS allocated FROM payment_allocations
                           WHERE tenant_id = $1 GROUP BY sale_id) pa ON pa.sale_id = st.id
              WHERE st.tenant_id = $1 AND st.credit_used > 0
                AND st.credit_used - COALESCE(pa.allocated,0) > 0
                AND st.customer_id IN (SELECT id FROM customers WHERE tenant_id = $1 AND current_credit > 0)`, [tenant]) : null,
        companyWide ? query(`SELECT alert_threshold_pct FROM credit_settings WHERE tenant_id = $1 LIMIT 1`, [tenant]) : null,
        query(`SELECT c.sr_id, u.name_bn AS name, SUM(c.amount) AS amt, COUNT(*) AS cnt,
                      MIN(to_char(c.created_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD')) AS oldest
                 FROM collections c JOIN users u ON u.id = c.sr_id
                WHERE c.tenant_id = $1 AND c.status IN ('pending','submitted') ${teamClause(req)}
                GROUP BY c.sr_id, u.name_bn`, teamParams(req, [tenant])),
        query(`SELECT COALESCE(SUM(c.amount) FILTER (WHERE c.status <> 'rejected'),0) AS amt
                 FROM collections c JOIN users u ON u.id = c.sr_id
                WHERE c.tenant_id = $1 AND (c.created_at AT TIME ZONE 'Asia/Dhaka')::date = '${today}' ${teamClause(req)}`,
              teamParams(req, [tenant])),
        query(`SELECT COALESCE(SUM(COALESCE(u.cash_dues,0) + COALESCE(u.outstanding_dues,0)),0) AS total,
                      COUNT(*) FILTER (WHERE COALESCE(u.cash_dues,0) + COALESCE(u.outstanding_dues,0) > 0) AS cnt
                 FROM users u WHERE u.tenant_id = $1 AND u.role = 'worker' ${teamClause(req)}`, teamParams(req, [tenant])),
    ]);

    const aging  = companyWide ? ageDues(custs.rows, invs.rows, today) : null;
    const limits = companyWide ? creditLimitUsage(custs.rows, cs.rows[0] ? parseInt(cs.rows[0].alert_threshold_pct) || 80 : 80) : null;
    const transit = summarizeTransit(transitRows.rows, today);
    const sd = { total: round2(num(srDues.rows[0].total)), count: parseInt(srDues.rows[0].cnt) || 0 };

    return {
        as_of: today,
        aging, credit_limits: limits, collections_in_transit: transit,
        today_collected: round2(num(todayColl.rows[0].amt)),
        sr_owes: sd,
        alerts: buildReceivableAlerts({ aging, limits, transit, srCashDues: sd }),
    };
};

const getSrPerformanceHealth = async (req) => {
    const tenant = req.tenantId, today = todayBD(), hour = hourBD(), mStart = monthStart(today);
    const tc = teamClause(req);
    const p = (base) => teamParams(req, base);

    const [workers, att, leave, vis, sToday, sMtd, comm] = await Promise.all([
        query(`SELECT u.id, u.name_bn AS name, COALESCE(u.monthly_target,0) AS target FROM users u
                WHERE u.tenant_id = $1 AND u.role = 'worker' AND u.status = 'active' ${tc}`, p([tenant])),
        query(`SELECT a.user_id, a.status::text AS status FROM attendance a JOIN users u ON u.id = a.user_id
                WHERE a.tenant_id = $1 AND a.date = '${today}' ${tc}`, p([tenant])),
        query(`SELECT l.user_id FROM leave_requests l JOIN users u ON u.id = l.user_id
                WHERE l.tenant_id = $1 AND l.status = 'approved'
                  AND '${today}' BETWEEN l.start_date AND l.end_date ${tc}`, p([tenant])),
        query(`SELECT v.worker_id, COUNT(*) AS visits FROM visits v JOIN users u ON u.id = v.worker_id
                WHERE v.tenant_id = $1 AND v.visit_date = '${today}' ${tc} GROUP BY v.worker_id`, p([tenant])),
        query(`SELECT st.worker_id, COALESCE(SUM(COALESCE(st.net_amount, st.total_amount)),0) AS amount
                 FROM sales_transactions st JOIN users u ON u.id = st.worker_id
                WHERE st.tenant_id = $1 AND st.date = '${today}' ${tc} GROUP BY st.worker_id`, p([tenant])),
        query(`SELECT st.worker_id, COALESCE(SUM(COALESCE(st.net_amount, st.total_amount)),0) AS amount
                 FROM sales_transactions st JOIN users u ON u.id = st.worker_id
                WHERE st.tenant_id = $1 AND st.date BETWEEN '${mStart}' AND '${today}' ${tc} GROUP BY st.worker_id`, p([tenant])),
        query(`SELECT COUNT(*) AS cnt, COALESCE(SUM(COALESCE(m.net_payable, m.commission_amount)),0) AS total
                 FROM monthly_commissions m JOIN users u ON u.id = m.worker_id
                WHERE m.tenant_id = $1 AND NOT m.paid ${tc}`, p([tenant])),
    ]);

    const ev = evaluateSr({
        workers: workers.rows, attendance: att.rows, leaveIds: leave.rows.map(r => r.user_id),
        visits: vis.rows, salesToday: sToday.rows, salesMtd: sMtd.rows, today, hour,
    });
    const commission = { count: parseInt(comm.rows[0].cnt) || 0, total: round2(num(comm.rows[0].total)) };
    return { as_of: today, hour, ...ev, commission, alerts: buildSrAlerts(ev, commission) };
};

const getActionList = async (req) => {
    const tenant = req.tenantId;
    const team = !!req.teamFilter;
    // টিম-ভিউতে শুধু worker-ভিত্তিক কাজ (টিম দিয়ে ফিল্টার করা যায়) — কোম্পানি-ব্যাপী সংখ্যা ম্যানেজারকে দেখানো হয় না
    const defs = ACTION_DEFS.filter(d => !team || d.teamable);
    const results = await Promise.all(defs.map(d => {
        const useTeam = team && d.teamable;
        const sql = d.sql.replace('{t}', useTeam ? 'AND u.manager_id = $2' : '');
        return query(sql, useTeam ? [tenant, req.teamFilter] : [tenant])
            .then(r => ({ key: d.key, n: r.rows[0].n, v: r.rows[0].v, oldest_days: r.rows[0].oldest_days }));
    }));
    const items = shapeActions(results, defs, req.user && req.user.role);
    return { as_of: todayBD(), total: items.reduce((s, i) => s + i.count, 0), items };
};

module.exports = {
    getReceivablesHealth, getSrPerformanceHealth, getActionList,
    // pure — টেস্টের জন্য
    ageDues, creditLimitUsage, summarizeTransit, buildReceivableAlerts,
    evaluateSr, buildSrAlerts, shapeActions, ACTION_DEFS, daysBetween,
};
