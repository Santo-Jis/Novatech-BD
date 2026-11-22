// ============================================================
// কাস্টমার-কেন্দ্রিক চিত্র (Admin ধাপ ৫): ব্যবসা কতজন দোকানের ওপর নির্ভর করছে, কারা আসছে/হারাচ্ছে, কোন রুট চলছে
//
// বিশ্লেষণ-জানালা পরিকল্পনার (planning.service.js) একই: প্রথম বিক্রি থেকে ১→২→৩ মাস।
//   নির্ভরতা (concentration): শীর্ষ ১ ও শীর্ষ ৫ দোকানের অংশ (জানালার নিট বিক্রির)।
//       ঝুঁকি = সক্রিয় দোকান ≥ ৫ এবং (শীর্ষ ১ ≥ ২৫% অথবা শীর্ষ ৫ ≥ ৬০%)
//   সক্রিয়/নতুন: জানালায় অন্তত একটি অর্ডার = সক্রিয়; জীবনে প্রথম অর্ডার জানালার ভেতরে = নতুন।
//   ধরে রাখা (retention): আগের সমান-দৈর্ঘ্যের সময়ে যারা কিনেছিল তাদের কত % এখনও কিনছে।
//       আগের সময়ের ডেটা না থাকলে (ডেটা জানালার ২× এর কম) দেখানো হয় না — অনুমান করা হয় না।
//   হারিয়ে যাওয়া: আগে কিনেছিল কিন্তু এই জানালায় একবারও কেনেনি।
//   রুট: জানালার বিক্রি, সক্রিয় দোকান ও সক্রিয়তার হার; দোকান ≥ ৩টি অথচ বিক্রি শূন্য = "নিষ্ক্রিয় রুট"।
// ম্যানেজার শুধু নিজের রুটের দোকান দেখেন।
// ============================================================

const { query } = require('../config/db');
const { analysisWindow, getDataStart } = require('./planning.service');

const num = (v) => parseFloat(v || 0) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const bn = (n) => Math.round(num(n)).toLocaleString('bn-BD');
const money = (n) => `৳${bn(n)}`;
const SEV = { danger: 0, warning: 1, info: 2 };

// ── PURE ──
const concentration = (sales) => {
    const list = sales.filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);
    const total = list.reduce((s, x) => s + x.amount, 0);
    if (!list.length || total <= 0) return { total: 0, active: 0, top1_pct: 0, top5_pct: 0, top5: [], risk: false };
    const pct = (a) => round1((a / total) * 100);
    const top5 = list.slice(0, 5).map(x => ({ id: x.id, name: x.name, amount: x.amount, pct: pct(x.amount) }));
    const top1 = pct(list[0].amount), top5p = pct(list.slice(0, 5).reduce((s, x) => s + x.amount, 0));
    return { total, active: list.length, top1_pct: top1, top5_pct: top5p, top5, risk: list.length >= 5 && (top1 >= 25 || top5p >= 60) };
};

const routeStats = (routes, sales) => {
    const m = new Map(routes.map(r => [r.id, { id: r.id, name: r.name, customers: r.customers, active: 0, sales: 0 }]));
    for (const s of sales) { if (s.amount <= 0 || !m.has(s.route_id)) continue; const r = m.get(s.route_id); r.active++; r.sales += s.amount; }
    const total = [...m.values()].reduce((a, r) => a + r.sales, 0);
    return [...m.values()].map(r => ({ ...r, sales: Math.round(r.sales * 100) / 100, active_pct: r.customers > 0 ? round1((r.active / r.customers) * 100) : 0,
        avg_per_active: r.active ? Math.round(r.sales / r.active) : 0, share_pct: total > 0 ? round1((r.sales / total) * 100) : 0 })).sort((a, b) => b.sales - a.sales);
};

const buildAlerts = ({ conc, activity, routes }) => {
    const a = [];
    if (conc.risk) a.push({ severity: conc.top1_pct >= 40 ? 'danger' : 'warning', code: 'customer_concentration', message: `বিক্রির ${conc.top1_pct}% একটি দোকানের ওপর, শীর্ষ ৫ দোকানের ওপর ${conc.top5_pct}% — একজন চলে গেলে বড় ক্ষতি` });
    if (activity.prior_customers >= 5 && activity.lapsed / activity.prior_customers >= 0.2) a.push({ severity: 'warning', code: 'customers_lapsed', message: `আগের সময়ের ${bn(activity.lapsed)}/${bn(activity.prior_customers)} দোকান (${round1((activity.lapsed / activity.prior_customers) * 100)}%) এই সময়ে আর কেনেনি` });
    if (activity.total_customers >= 10 && activity.active_pct < 30) a.push({ severity: 'info', code: 'low_active_customers', message: `${bn(activity.total_customers)}টি দোকানের মাত্র ${activity.active_pct}% এ সময়ে কিনেছে` });
    const idle = routes.filter(r => r.customers >= 3 && r.sales <= 0);
    if (idle.length) a.push({ severity: 'info', code: 'route_idle', message: `${bn(idle.length)}টি রুটে (${idle.slice(0, 3).map(r => r.name).join(', ')}${idle.length > 3 ? '…' : ''}) দোকান আছে কিন্তু এ সময়ে বিক্রি নেই` });
    return a.sort((x, y) => SEV[x.severity] - SEV[y.severity]);
};

// ── DB ──
const scopeSql = (req, alias = 'c', idx) => (req.teamFilter ? `AND ${alias}.route_id IN (SELECT id FROM routes WHERE manager_id = $${idx})` : '');

const loadAll = async (req) => {
    const tenant = req.tenantId, today = todayBD();
    const dataStart = await getDataStart(tenant);
    const win = analysisWindow({ today, dataStart });
    if (!win.ready) return { win };
    const prevFrom = addDays(win.from, -win.window_days), prevTo = addDays(win.from, -1);
    const hasPrior = dataStart <= prevTo;                     // আগের সময়ে অন্তত কিছু ডেটা থাকতে হবে
    const tf = req.teamFilter ? [req.teamFilter] : [];
    const sc = (idx) => scopeSql(req, 'c', idx);

    const [sales, prior, lapsed, routes, created] = await Promise.all([
        query(`SELECT c.id, c.shop_name AS name, c.route_id, r.name AS route_name, COALESCE(SUM(COALESCE(st.net_amount,st.total_amount)),0) AS amount, COUNT(st.id) AS orders, to_char(MAX(st.date),'YYYY-MM-DD') AS last,
                      (SELECT to_char(MIN(x.date),'YYYY-MM-DD') FROM sales_transactions x WHERE x.customer_id = c.id AND x.tenant_id = $1) AS first_order
                 FROM customers c LEFT JOIN routes r ON r.id = c.route_id
                 JOIN sales_transactions st ON st.customer_id = c.id AND st.tenant_id = $1 AND st.date BETWEEN $2 AND $3
                WHERE c.tenant_id = $1 ${sc(4)} GROUP BY c.id, c.shop_name, c.route_id, r.name`, [tenant, win.from, win.to, ...tf]),
        hasPrior ? query(`SELECT DISTINCT st.customer_id AS id FROM sales_transactions st JOIN customers c ON c.id = st.customer_id
                           WHERE st.tenant_id = $1 AND st.date BETWEEN $2 AND $3 ${sc(4)}`, [tenant, prevFrom, prevTo, ...tf]) : Promise.resolve({ rows: [] }),
        query(`SELECT c.id, c.shop_name AS name, r.name AS route_name, to_char(MAX(st.date),'YYYY-MM-DD') AS last, COUNT(*) AS orders, COALESCE(SUM(COALESCE(st.net_amount,st.total_amount)),0) AS lifetime
                 FROM sales_transactions st JOIN customers c ON c.id = st.customer_id LEFT JOIN routes r ON r.id = c.route_id
                WHERE st.tenant_id = $1 AND st.date < $2 ${sc(4)}
                  AND NOT EXISTS (SELECT 1 FROM sales_transactions y WHERE y.customer_id = c.id AND y.tenant_id = $1 AND y.date BETWEEN $2 AND $3)
                GROUP BY c.id, c.shop_name, r.name`, [tenant, win.from, win.to, ...tf]),
        query(`SELECT r.id, r.name, COUNT(c.id) AS customers FROM routes r LEFT JOIN customers c ON c.route_id = r.id AND c.is_active IS NOT FALSE
                WHERE r.tenant_id = $1 ${req.teamFilter ? 'AND r.manager_id = $2' : ''} GROUP BY r.id, r.name`, [tenant, ...tf]),
        query(`SELECT COUNT(*) AS n FROM customers c WHERE c.tenant_id = $1 AND c.is_active IS NOT FALSE AND (c.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN $2 AND $3 ${sc(4)}`, [tenant, win.from, win.to, ...tf]),
    ]);
    return { win, hasPrior, sales: sales.rows, prior: prior.rows, lapsed: lapsed.rows, routes: routes.rows, created: parseInt(created.rows[0].n, 10) };
};

const analyze = (d) => {
    const sales = d.sales.map(r => ({ id: r.id, name: r.name, route_id: r.route_id, route_name: r.route_name || '', amount: num(r.amount), orders: parseInt(r.orders, 10), last: r.last, first_order: r.first_order }));
    const conc = concentration(sales);
    const routes = routeStats(d.routes.map(r => ({ id: r.id, name: r.name, customers: parseInt(r.customers, 10) })), sales);
    const totalCustomers = routes.reduce((s, r) => s + r.customers, 0);
    const active = sales.filter(s => s.amount > 0).length;
    const newOnes = sales.filter(s => s.first_order && s.first_order >= d.win.from).length;
    const priorIds = new Set(d.prior.map(r => r.id)), activeIds = new Set(sales.filter(s => s.orders > 0).map(s => s.id));
    const retained = [...priorIds].filter(id => activeIds.has(id)).length;
    const activity = {
        total_customers: totalCustomers, active, active_pct: totalCustomers ? round1((active / totalCustomers) * 100) : 0,
        new_ordering: newOnes, registered: d.created,
        prior_customers: d.hasPrior ? priorIds.size : null, retained: d.hasPrior ? retained : null,
        retention_pct: d.hasPrior && priorIds.size ? round1((retained / priorIds.size) * 100) : null,
        lapsed: d.hasPrior ? priorIds.size - retained : (d.lapsed.length || 0),
    };
    return { sales, conc, routes, activity };
};

const getCustomerInsights = async (req) => {
    const d = await loadAll(req);
    if (!d.win.ready) return { window: d.win, ready: false };
    const { conc, routes, activity } = analyze(d);
    return { ready: true, window: d.win, concentration: conc, activity, routes: routes.slice(0, 5), route_count: routes.length,
             idle_routes: routes.filter(r => r.customers >= 3 && r.sales <= 0).length, alerts: buildAlerts({ conc, activity, routes }) };
};

/** বিস্তারিত তালিকাগুলো (healthDetail) */
const getCustomerRows = async (req) => {
    const d = await loadAll(req); if (!d.win.ready) return [];
    const { sales, conc } = analyze(d);
    return sales.filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount).map(s => ({ name: s.name, route: s.route_name, orders: s.orders, amount: s.amount,
        share_pct: conc.total ? round1((s.amount / conc.total) * 100) : 0, avg_order: s.orders ? Math.round(s.amount / s.orders) : 0, last: s.last, is_new: s.first_order && s.first_order >= d.win.from ? 'নতুন' : '' }));
};
const getRouteRows = async (req) => { const d = await loadAll(req); return d.win.ready ? analyze(d).routes : []; };
const getLapsedRows = async (req) => {
    const d = await loadAll(req); if (!d.win.ready) return [];
    const today = todayBD(), days = (a) => Math.round((Date.parse(today) - Date.parse(a)) / 86400000);
    return d.lapsed.map(r => ({ name: r.name, route: r.route_name || '', last: r.last, days_ago: days(r.last), orders: parseInt(r.orders, 10), lifetime: num(r.lifetime) })).sort((a, b) => b.lifetime - a.lifetime);
};

module.exports = { getCustomerInsights, getCustomerRows, getRouteRows, getLapsedRows, concentration, routeStats, buildAlerts, analyze };
