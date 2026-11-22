// ============================================================
// আজকের ভিজিট তালিকা (Planning ধাপ ৩): কোন কাস্টমারের কাছে আগে যেতে হবে
//
// প্রতিটি দোকানের স্কোর (সর্বোচ্চ ≈ ৮৫); একই ১→২→৩ মাসের জানালার ডেটা থেকে:
//   ১) অর্ডারের সময় হয়েছে  (০–৫০): রেশিও = (শেষ অর্ডারের পর কত দিন) ÷ (এই দোকান সাধারণত যত দিন পরপর অর্ডার দেয়)
//        রেশিও ০.৮ এর নিচে ০; ২.৫ বা বেশিতে পূর্ণ ৫০
//        অর্ডারের ব্যবধান = জানালার অর্ডার-তারিখগুলোর ব্যবধানের মধ্যমা (কমপক্ষে ৩ দিন);
//        মাত্র একটি অর্ডার থাকলে ১৪ দিন ধরা হয় (ডেটা কম, তাই "সাধারণ ধরা")
//   ২) আদায়ের সুযোগ        (০–৩৫): বকেয়া ÷ গড় অর্ডার (সর্বোচ্চ ২০) + বকেয়া ৩০+ দিনের হলে ৮, ৬০+ হলে ১৫
//   ৩) দোকানের মান          (০–১৫): গড় অর্ডার ÷ সবচেয়ে বড় গড় অর্ডার
//   ক্রেডিট সীমা পূর্ণ → অর্ডারের পয়েন্ট অর্ধেক ("আগে আদায়, নতুন বাকি নয়")
//   গত ২ দিনে ভিজিট করেও বিক্রি হয়নি → −২০; আজই ভিজিট হয়ে গেছে → তালিকায় নেই
//   স্কোর ১৫-এর কম → তালিকায় নেই
// ধরন: অর্ডারের সময় / আদায় / দুটোই / হারিয়ে যাচ্ছে (৪৫+ দিন ও ব্যবধানের ৩ গুণ) / নতুন (কখনো অর্ডার নেই, ৭+ দিন আগে যোগ)
// দোকান ↔ SR (অগ্রাধিকার ক্রমে):
//   ১) দোকানে সরাসরি বরাদ্দ (customer_assignments, দোকান-স্তর, সর্বশেষ active)  ← অ্যাপের "দায়িত্বে থাকা SR"
//   ২) রুটে বরাদ্দ (customer_assignments, রুট-স্তর) — দোকানের রুটের দায়িত্বে থাকা SR
//   ৩) গত জানালায় যে SR সবচেয়ে বেশি ইনভয়েস করেছে (অনুমান)
//   কোনোটাই না থাকলে "অনির্ধারিত"।
// ============================================================

const { query } = require('../config/db');
const { analysisWindow, getDataStart } = require('./planning.service');
const { ageDues } = require('./opsHealth.service');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const money = (n) => `৳${Math.round(num(n)).toLocaleString('bn-BD')}`;
const bn = (n) => Math.round(num(n)).toLocaleString('bn-BD');
const MIN_SCORE = 15, DEFAULT_INTERVAL = 14, PER_SR = 10;
const LABEL = { reorder: 'অর্ডারের সময়', collect: 'আদায়', both: 'অর্ডার + আদায়', lapsed: 'হারিয়ে যাচ্ছে', new: 'নতুন, অর্ডার নেই' };

// ── PURE ──
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** অর্ডার-তারিখ (বাছাই, ইউনিক) থেকে সাধারণ ব্যবধান */
const orderInterval = (dates) => {
    if (dates.length >= 2) {
        const gaps = []; for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
        return { interval: Math.max(Math.round(median(gaps)), 3), basis: 'history' };
    }
    return { interval: DEFAULT_INTERVAL, basis: 'default' };
};

const scoreCustomer = (c) => {
    const { orders, lastOrderDays, interval, basis, avgOrder, topAvg, due, limit, oldestDueDays, lastVisitDays, lastVisitSold, createdDays } = c;
    if (lastVisitDays === 0) return null;                              // আজই ভিজিট হয়ে গেছে
    const reasons = [];
    if (orders === 0) {
        if (createdDays < 7) return null;
        const score = 25 - (lastVisitDays !== null && lastVisitDays <= 2 && !lastVisitSold ? 20 : 0);
        if (score < MIN_SCORE) return null;
        return { score, category: 'new', blocked: false, reasons: [`এখনো কোনো অর্ডার নেই (${bn(createdDays)} দিন আগে যোগ হয়েছে)`] };
    }
    const ratio = lastOrderDays / interval;
    let reorder = ratio < 0.8 ? 0 : Math.min((ratio - 0.8) / 1.7, 1) * 50;
    const blocked = limit > 0 && due >= limit;
    if (blocked) reorder *= 0.5;
    let collect = 0;
    if (due > 0) collect = Math.min(due / Math.max(avgOrder, 1000), 1) * 20 + (oldestDueDays >= 60 ? 15 : oldestDueDays >= 30 ? 8 : 0);
    const value = topAvg > 0 ? Math.min(avgOrder / topAvg, 1) * 15 : 0;
    let score = reorder + collect + value;
    if (lastVisitDays !== null && lastVisitDays <= 2 && !lastVisitSold) { score -= 20; reasons.push('সম্প্রতি ভিজিট করেও বিক্রি হয়নি'); }
    score = Math.max(score, 0);
    if (score < MIN_SCORE) return null;

    const lapsed = lastOrderDays >= Math.max(45, interval * 3);
    if (reorder >= 10 || lapsed) reasons.unshift(`শেষ অর্ডার ${bn(lastOrderDays)} দিন আগে (${basis === 'history' ? 'সাধারণত প্রতি' : 'সাধারণ ধরা'} ${bn(interval)} দিনে নেয়)`);
    if (collect >= 10 || due > 0) reasons.push(`বকেয়া ${money(due)}${oldestDueDays > 0 ? `, সবচেয়ে পুরোনো ${bn(oldestDueDays)} দিনের` : ''}`);
    if (blocked) reasons.push('ক্রেডিট সীমা পূর্ণ — আগে আদায়, নতুন বাকি নয়');
    if (avgOrder > 0) reasons.push(`গড় অর্ডার ${money(avgOrder)}`);
    const category = lapsed ? 'lapsed' : reorder >= 10 && collect >= 10 ? 'both' : collect > reorder ? 'collect' : 'reorder';
    return { score: round2(score), category, blocked, reasons };
};

/** দোকানের দায়িত্বে কোন SR — বরাদ্দ > রুট-বরাদ্দ > বিক্রি থেকে অনুমান */
const resolveSr = ({ assigned, routeAssigned, bySales }) => {
    if (assigned) return { sr: assigned, source: 'assigned' };
    if (routeAssigned) return { sr: routeAssigned, source: 'route' };
    if (bySales) return { sr: bySales, source: 'sales' };
    return { sr: null, source: null };
};
const SOURCE_LABEL = { assigned: 'সরাসরি বরাদ্দ', route: 'রুটের দায়িত্বে', sales: 'বিক্রির ইতিহাস থেকে' };

/** সব দোকান → স্কোর → SR অনুযায়ী ভাগ */
const buildPlan = ({ customers, history, primarySr, lastVisits, dues, today }) => {
    // primarySr: Map(customerId → { sr, source }) অথবা (পুরোনো রূপ) Map(customerId → sr)
    const topAvg = Math.max(0, ...customers.map(c => (history.get(c.id) ? history.get(c.id).avg : 0)));
    const rows = [];
    for (const c of customers) {
        const h = history.get(c.id) || { dates: [], orders: 0, avg: 0 };
        const lv = lastVisits.get(c.id), d = dues.get(c.id) || { due: 0, oldest: 0 };
        const { interval, basis } = orderInterval(h.dates);
        const last = h.dates.length ? h.dates[h.dates.length - 1] : null;
        const r = scoreCustomer({
            orders: h.orders, lastOrderDays: last ? Math.max(daysBetween(last, today), 0) : null, interval, basis, avgOrder: h.avg, topAvg,
            due: d.due, limit: num(c.credit_limit), oldestDueDays: d.oldest,
            lastVisitDays: lv ? Math.max(daysBetween(lv.date, today), 0) : null, lastVisitSold: lv ? lv.sold !== false : true,
            createdDays: c.created_date ? Math.max(daysBetween(c.created_date, today), 0) : 0,
        });
        if (!r) continue;
        const ps = primarySr.get(c.id);
        const sr = ps ? (ps.sr !== undefined ? ps.sr : ps) : null, source = ps && ps.sr !== undefined ? ps.source : null;
        rows.push({ customer_id: c.id, name: c.shop_name, route: c.route_name || '', sr_id: sr ? sr.id : null, sr_name: sr ? sr.name : 'অনির্ধারিত', sr_source: source ? SOURCE_LABEL[source] : '',
                    category: r.category, category_label: LABEL[r.category], score: r.score, last_order_days: last ? Math.max(daysBetween(last, today), 0) : null,
                    interval: h.orders > 0 ? interval : null, due: round2(d.due), avg_order: round2(h.avg), blocked: r.blocked, reason: r.reasons.join(' · ') });
    }
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return rows;
};

const groupBySr = (rows, perSr = PER_SR) => {
    const m = new Map();
    for (const r of rows) {
        const k = r.sr_id || 'none';
        if (!m.has(k)) m.set(k, { sr_id: r.sr_id, sr_name: r.sr_name, total: 0, due_total: 0, rows: [] });
        const g = m.get(k); g.total++; g.due_total += r.due; if (g.rows.length < perSr) g.rows.push(r);
    }
    return [...m.values()].map(g => ({ ...g, due_total: round2(g.due_total) }))
        .sort((a, b) => (a.sr_id === null) - (b.sr_id === null) || b.total - a.total);
};

// ── DB ──
const loadPlanRows = async (req) => {
    const tenant = req.tenantId, today = todayBD();
    const dataStart = await getDataStart(tenant);
    const win = analysisWindow({ today, dataStart });
    if (!win.ready) return { win, rows: [] };

    const [custs, hist, srCnt, visits, users, dueInv, asg] = await Promise.all([
        query(`SELECT c.id, c.route_id, c.shop_name, c.credit_limit, c.current_credit, r.name AS route_name, to_char(c.created_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS created_date
                 FROM customers c LEFT JOIN routes r ON r.id = c.route_id WHERE c.tenant_id = $1 AND c.is_active IS NOT FALSE`, [tenant]),
        query(`SELECT customer_id, array_agg(d ORDER BY d) AS dates, SUM(n) AS orders, SUM(a) AS amount
                 FROM (SELECT customer_id, to_char(date,'YYYY-MM-DD') AS d, COUNT(*) AS n, SUM(COALESCE(net_amount,total_amount)) AS a
                         FROM sales_transactions WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 AND customer_id IS NOT NULL GROUP BY 1,2) x GROUP BY customer_id`, [tenant, win.from, win.to]),
        query(`SELECT customer_id, worker_id, COUNT(*) AS n, MAX(date) AS last FROM sales_transactions
                WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 AND customer_id IS NOT NULL GROUP BY 1,2`, [tenant, win.from, win.to]),
        query(`SELECT DISTINCT ON (customer_id) customer_id, to_char(visit_date,'YYYY-MM-DD') AS date, will_sell
                 FROM visits WHERE tenant_id = $1 AND visit_date >= $2 ORDER BY customer_id, visit_date DESC, created_at DESC`, [tenant, win.from]),
        query(`SELECT id, name_bn AS name, manager_id FROM users WHERE tenant_id = $1 AND role = 'worker' AND status = 'active'`, [tenant]),
        query(`SELECT st.customer_id, to_char(st.date,'YYYY-MM-DD') AS date, GREATEST(st.credit_used - COALESCE(pa.allocated,0), 0) AS remaining
                 FROM sales_transactions st
                 LEFT JOIN (SELECT sale_id, SUM(amount) AS allocated FROM payment_allocations WHERE tenant_id = $1 GROUP BY sale_id) pa ON pa.sale_id = st.id
                WHERE st.tenant_id = $1 AND st.credit_used > 0 AND st.credit_used - COALESCE(pa.allocated,0) > 0
                  AND st.customer_id IN (SELECT id FROM customers WHERE tenant_id = $1 AND current_credit > 0)`, [tenant]),
        query(`SELECT customer_id, route_id, worker_id FROM (
                 SELECT DISTINCT ON (COALESCE(customer_id::text, 'r:' || route_id::text)) customer_id, route_id, worker_id
                   FROM customer_assignments WHERE tenant_id = $1 AND is_active = true
                  ORDER BY COALESCE(customer_id::text, 'r:' || route_id::text), assigned_at DESC) a`, [tenant]),
    ]);

    const userMap = new Map(users.rows.map(u => [u.id, u]));
    const history = new Map(hist.rows.map(h => [h.customer_id, { dates: h.dates, orders: parseInt(h.orders, 10), avg: parseInt(h.orders, 10) > 0 ? num(h.amount) / parseInt(h.orders, 10) : 0 }]));
    // primary SR: সবচেয়ে বেশি ইনভয়েস (সমান হলে সর্বশেষ)
    const best = new Map();
    for (const r of srCnt.rows) {
        const u = userMap.get(r.worker_id); if (!u) continue;
        const cur = best.get(r.customer_id), n = parseInt(r.n, 10), last = String(r.last);
        if (!cur || n > cur.n || (n === cur.n && last > cur.last)) best.set(r.customer_id, { n, last, u });
    }
    const asgCust = new Map(), asgRoute = new Map();
    for (const a of asg.rows) { const u = userMap.get(a.worker_id); if (!u) continue; if (a.customer_id) asgCust.set(a.customer_id, u); else if (a.route_id) asgRoute.set(a.route_id, u); }
    const primarySr = new Map(custs.rows.map(c => [c.id, resolveSr({ assigned: asgCust.get(c.id), routeAssigned: c.route_id ? asgRoute.get(c.route_id) : null, bySales: best.get(c.id) ? best.get(c.id).u : null })]));
    const lastVisits = new Map(visits.rows.map(v => [v.customer_id, { date: v.date, sold: v.will_sell }]));
    const aged = ageDues(custs.rows.filter(c => num(c.current_credit) > 0), dueInv.rows, today, true);
    const dues = new Map(aged.rows.map(r => [r.id, { due: r.due, oldest: r.oldest_days || 0 }]));

    let rows = buildPlan({ customers: custs.rows, history, primarySr, lastVisits, dues, today });

    // পরিধি: worker → শুধু নিজের; ম্যানেজার → নিজের টিমের SR (অনির্ধারিত বাদ)
    if (req.user && req.user.role === 'worker') rows = rows.filter(r => r.sr_id === req.user.id);
    else if (req.teamFilter) rows = rows.filter(r => r.sr_id && userMap.get(r.sr_id) && userMap.get(r.sr_id).manager_id === req.teamFilter);
    return { win, rows };
};

const getVisitPlan = async (req) => {
    const { win, rows } = await loadPlanRows(req);
    if (!win.ready) return { window: win, groups: [], summary: { total: 0 } };
    const cnt = (k) => rows.filter(r => r.category === k).length;
    return {
        window: win,
        summary: { total: rows.length, reorder: cnt('reorder'), collect: cnt('collect'), both: cnt('both'), lapsed: cnt('lapsed'), new: cnt('new'), due_total: round2(rows.reduce((s, r) => s + r.due, 0)) },
        groups: groupBySr(rows),
    };
};

const getVisitPlanRows = async (req) => (await loadPlanRows(req)).rows;

module.exports = { getVisitPlan, getVisitPlanRows, resolveSr, scoreCustomer, orderInterval, buildPlan, groupBySr, median, LABEL, MIN_SCORE };
