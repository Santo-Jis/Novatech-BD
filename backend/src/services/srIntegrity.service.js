// ============================================================
// SR-দের ওপর নজর (অনিয়ম শনাক্ত): কার আচরণ বাকিদের থেকে অস্বাভাবিক
//
// গত ৩০ দিনের প্রতিটি SR-এর সূচক (সবই "অনুপাত", তাই বড়/ছোট SR সমান ন্যায্যভাবে মাপা হয়):
//   ১) ভিজিটের লোকেশন না মেলা   (location_matched = false ÷ মোট ভিজিট)        ন্যূনতম ৫ ভিজিট
//   ২) ভিজিট করেও বিক্রি না     (will_sell = false ÷ মোট ভিজিট)                 ন্যূনতম ৮ ভিজিট
//   ৩) রিটার্নের হার           (সম্পন্ন রিটার্নের মূল্য ÷ বিক্রি)                 ন্যূনতম ৳৫,০০০ বিক্রি
//   ৪) ছাড়ের হার              (discount_amount ÷ মোট বিক্রি)                  ন্যূনতম ৳৫,০০০ বিক্রি
//   ৫) খরচের হার              (খরচ রিপোর্ট ÷ বিক্রি) + সীমা ছাড়ানো রিপোর্টের সংখ্যা
//   ৬) দেরি/অনুপস্থিতি         (দেরি ÷ উপস্থিত দিন; ছুটি ছাড়া অনুপস্থিত দিন)       ন্যূনতম ৫ দিন
//   ৭) SR-এর কাছে জমা বাকি     (cash_dues + outstanding_dues) — ৩ দিনের গড় বিক্রির বেশি হলে
//
// পতাকা (flag) ওঠে যখন মান নিরঙ্কুশ সীমা পেরোয় **এবং** (সেই সূচকে ৩+ জন SR-এর বৈধ নমুনা থাকলে) বাকিদের মধ্যমার তুলনায় যথেষ্ট বেশি হয়।
// ⚠️ সবার মান একসাথে বেশি হলে (যেমন লোকেশন ৭০%+ SR-এরই না মেলা) সেটা SR-এর দোষ নয়, সিস্টেমের সমস্যা হতে পারে
//   (দোকানের লোকেশন সেট নেই) — তখন SR-ভিত্তিক পতাকা না দিয়ে একটি কোম্পানি-স্তরের নোট দেওয়া হয়।
// পতাকা মানে "দেখুন", "দোষী" নয়।
// ============================================================

const { query } = require('../config/db');

const num = (v) => parseFloat(v || 0) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const bn = (n) => Math.round(num(n)).toLocaleString('bn-BD');
const money = (n) => `৳${bn(n)}`;
const pct = (r) => `${bn(round1(r * 100))}%`;
const WINDOW_DAYS = 30, SYSTEMIC = 0.7;

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * ratio-সূচকের নিয়ম: { code, label, value(sr)→অনুপাত|null (null = নমুনা কম), abs (নিরঙ্কুশ সীমা), over (মধ্যমার চেয়ে কতটা বেশি লাগবে: +pp বা ×), danger }
 */
const RULES = [
    { code: 'location_mismatch', label: 'ভিজিটের লোকেশন মেলেনি', systemic: true,
      value: s => (s.visits >= 5 ? s.mismatch / s.visits : null), abs: 0.4, margin: 0.25, mode: 'add', danger: 0.7,
      text: (s, v) => `${bn(s.mismatch)}/${bn(s.visits)} ভিজিটের লোকেশন মেলেনি (${pct(v)})` },
    { code: 'no_sale_visits', label: 'ভিজিট করেও বিক্রি নেই',
      value: s => (s.visits >= 8 ? s.no_sell / s.visits : null), abs: 0.7, margin: 0.2, mode: 'add', danger: 0.9,
      text: (s, v) => `${bn(s.no_sell)}/${bn(s.visits)} ভিজিটে বিক্রি হয়নি (${pct(v)})` },
    { code: 'high_returns', label: 'রিটার্ন বেশি',
      value: s => (s.sales >= 5000 ? s.returns / s.sales : null), abs: 0.10, margin: 2, mode: 'mul', danger: 0.2,
      text: (s, v) => `রিটার্ন ${money(s.returns)} — বিক্রির ${pct(v)}` },
    { code: 'high_discount', label: 'ছাড় বেশি',
      value: s => (s.gross >= 5000 ? s.discount / s.gross : null), abs: 0.05, margin: 2, mode: 'mul', danger: 0.12,
      text: (s, v) => `ছাড় ${money(s.discount)} — বিক্রির ${pct(v)}` },
    { code: 'high_expense', label: 'খরচ বেশি',
      value: s => (s.sales >= 5000 ? s.expense / s.sales : null), abs: 0.10, margin: 2, mode: 'mul', danger: 0.2,
      text: (s, v) => `খরচ ${money(s.expense)} — বিক্রির ${pct(v)}` },
    { code: 'late_attendance', label: 'প্রায়ই দেরি',
      value: s => (s.present >= 5 ? s.late / s.present : null), abs: 0.5, margin: 0.25, mode: 'add', danger: 0.8,
      text: (s, v) => `${bn(s.late)}/${bn(s.present)} দিন দেরিতে এসেছেন (${pct(v)})` },
];

const exceeds = (rule, v, med, hasPeers) => {
    if (v === null || v < rule.abs) return false;
    if (!hasPeers) return true;                                           // ৩ জনের কম SR → নিরঙ্কুশ সীমাই যথেষ্ট
    return rule.mode === 'add' ? v >= med + rule.margin : v >= med * rule.margin;
};

const evaluateIntegrity = (srs) => {
    const hasPeers = srs.length >= 3;
    const notes = [], flagsBy = new Map(srs.map(s => [s.id, []])), peer = {};

    for (const rule of RULES) {
        const vals = srs.map(s => ({ s, v: rule.value(s) })).filter(x => x.v !== null);
        const med = median(vals.map(x => x.v));
        peer[rule.code] = { median: round1(med * 100) / 100, n: vals.length };
        if (rule.systemic && vals.length >= 2 && vals.filter(x => x.v >= SYSTEMIC).length / vals.length >= 0.6) {
            notes.push({ code: 'systemic_' + rule.code, message: `প্রায় সব SR-এরই "${rule.label}" (মধ্যমা ${pct(med)}) — এটা SR-এর সমস্যা নয়, সম্ভবত দোকানের লোকেশন সঠিকভাবে সেট করা নেই। আগে দোকানের অবস্থান ঠিক করুন; তাই SR-ভিত্তিক পতাকা দেওয়া হয়নি।` });
            continue;
        }
        const peersOk = vals.length >= 3;                                  // তুলনার জন্য ৩+ SR-এর বৈধ নমুনা দরকার, নইলে মধ্যমা নিজেই সেই SR
        for (const { s, v } of vals) {
            if (!exceeds(rule, v, med, peersOk)) continue;
            flagsBy.get(s.id).push({ code: rule.code, label: rule.label, severity: v >= rule.danger ? 'danger' : 'warning', value: round1(v * 1000) / 1000,
                                     message: rule.text(s, v) + (peersOk && med > 0 ? ` (সবার মধ্যমা ${pct(med)})` : '') });
        }
    }
    // সীমা ছাড়ানো খরচ রিপোর্ট
    for (const s of srs) if (s.over_limit >= 3) flagsBy.get(s.id).push({ code: 'over_limit_expense', label: 'বারবার খরচের সীমা ছাড়িয়েছেন', severity: s.over_limit >= 6 ? 'danger' : 'warning', value: s.over_limit, message: `${bn(s.over_limit)}টি খরচ রিপোর্ট সীমা ছাড়িয়েছে` });
    // ছুটি ছাড়া অনুপস্থিতি
    for (const s of srs) if (s.absent >= 3) flagsBy.get(s.id).push({ code: 'absent_days', label: 'ছুটি ছাড়া অনুপস্থিত', severity: s.absent >= 6 ? 'danger' : 'warning', value: s.absent, message: `ছুটি ছাড়া ${bn(s.absent)} দিন অনুপস্থিত` });
    // জমা বাকি (৩ দিনের গড় বিক্রি = 3 × sales/30)
    for (const s of srs) {
        const threeDays = (s.sales / WINDOW_DAYS) * 3;
        if (s.cash_owed > 0 && s.cash_owed > Math.max(threeDays, 2000)) flagsBy.get(s.id).push({ code: 'cash_owed', label: 'জমা দেওয়া বাকি', severity: s.cash_owed > threeDays * 3 ? 'danger' : 'warning', value: s.cash_owed, message: `কোম্পানির কাছে জমা বাকি ${money(s.cash_owed)} (৩ দিনের গড় বিক্রি ${money(threeDays)})` });
    }

    const rank = { danger: 0, warning: 1 };
    const flagged = srs.map(s => {
        const f = flagsBy.get(s.id).sort((a, b) => rank[a.severity] - rank[b.severity]);
        return { id: s.id, name: s.name, score: f.reduce((a, x) => a + (x.severity === 'danger' ? 2 : 1), 0), flags: f };
    }).filter(x => x.flags.length).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return { flagged, notes, peer, has_peers: hasPeers };
};

// ── DB ──
const loadSrMetrics = async (req) => {
    const tenant = req.tenantId, to = todayBD(), from = addDays(to, -(WINDOW_DAYS - 1));
    const team = req.teamFilter ? 'AND u.manager_id = $4' : '';
    const p = (extra) => (req.teamFilter ? [tenant, from, to, req.teamFilter] : [tenant, from, to]);
    const [users, vis, sal, ret, exp, att] = await Promise.all([
        query(`SELECT u.id, u.name_bn AS name, COALESCE(u.cash_dues,0) + COALESCE(u.outstanding_dues,0) AS owed FROM users u
                WHERE u.tenant_id = $1 AND u.role = 'worker' AND u.status = 'active' ${req.teamFilter ? 'AND u.manager_id = $2' : ''}`,
            req.teamFilter ? [tenant, req.teamFilter] : [tenant]),
        query(`SELECT v.worker_id AS w, COUNT(*) AS n, COUNT(*) FILTER (WHERE v.location_matched = false) AS mm, COUNT(*) FILTER (WHERE v.will_sell = false) AS ns
                 FROM visits v JOIN users u ON u.id = v.worker_id WHERE v.tenant_id = $1 AND v.visit_date BETWEEN $2 AND $3 ${team} GROUP BY v.worker_id`, p()),
        query(`SELECT st.worker_id AS w, COALESCE(SUM(st.total_amount),0) AS gross, COALESCE(SUM(st.discount_amount),0) AS disc, COALESCE(SUM(COALESCE(st.net_amount,st.total_amount)),0) AS net
                 FROM sales_transactions st JOIN users u ON u.id = st.worker_id WHERE st.tenant_id = $1 AND st.date BETWEEN $2 AND $3 ${team} GROUP BY st.worker_id`, p()),
        query(`SELECT rr.sr_id AS w, COALESCE(SUM(rr.total_value),0) AS v FROM return_requests rr JOIN users u ON u.id = rr.sr_id
                WHERE rr.tenant_id = $1 AND rr.status = 'completed' AND rr.completed_at::date BETWEEN $2 AND $3 ${team} GROUP BY rr.sr_id`, p()),
        query(`SELECT er.worker_id AS w, COALESCE(SUM(er.total_amount) FILTER (WHERE er.status IN ('approved','pending')),0) AS v, COUNT(*) FILTER (WHERE er.over_limit) AS ol
                 FROM expense_reports er JOIN users u ON u.id = er.worker_id WHERE er.tenant_id = $1 AND er.report_date BETWEEN $2 AND $3 ${team} GROUP BY er.worker_id`, p()),
        query(`SELECT COALESCE(a.worker_id, a.user_id) AS w, COUNT(*) FILTER (WHERE a.status IN ('present','late')) AS present, COUNT(*) FILTER (WHERE a.status = 'late') AS late,
                      COUNT(*) FILTER (WHERE a.status = 'absent' AND NOT COALESCE(a.leave_approved,false)) AS absent
                 FROM attendance a JOIN users u ON u.id = COALESCE(a.worker_id, a.user_id) WHERE a.tenant_id = $1 AND a.date BETWEEN $2 AND $3 ${team} GROUP BY 1`, p()),
    ]);
    const by = (r, k = 'w') => new Map(r.rows.map(x => [x[k], x]));
    const V = by(vis), S = by(sal), R = by(ret), E = by(exp), A = by(att);
    return users.rows.map(u => ({
        id: u.id, name: u.name, cash_owed: num(u.owed),
        visits: parseInt((V.get(u.id) || {}).n || 0, 10), mismatch: parseInt((V.get(u.id) || {}).mm || 0, 10), no_sell: parseInt((V.get(u.id) || {}).ns || 0, 10),
        sales: num((S.get(u.id) || {}).net), gross: num((S.get(u.id) || {}).gross), discount: num((S.get(u.id) || {}).disc),
        returns: num((R.get(u.id) || {}).v), expense: num((E.get(u.id) || {}).v), over_limit: parseInt((E.get(u.id) || {}).ol || 0, 10),
        present: parseInt((A.get(u.id) || {}).present || 0, 10), late: parseInt((A.get(u.id) || {}).late || 0, 10), absent: parseInt((A.get(u.id) || {}).absent || 0, 10),
    }));
};

const getSrIntegrity = async (req) => {
    const srs = await loadSrMetrics(req);
    const r = evaluateIntegrity(srs);
    return { window_days: WINDOW_DAYS, checked: srs.length, flagged: r.flagged, notes: r.notes, has_peers: r.has_peers,
             danger_count: r.flagged.filter(x => x.flags.some(f => f.severity === 'danger')).length };
};

/** বিস্তারিত: সব SR-এর সব সূচক */
const getSrIntegrityRows = async (req) => {
    const srs = await loadSrMetrics(req);
    const rr = (a, b) => (b > 0 ? round1((a / b) * 1000) / 10 : null);
    return srs.map(s => ({ name: s.name, visits: s.visits, mismatch_pct: rr(s.mismatch, s.visits), nosale_pct: rr(s.no_sell, s.visits), sales: s.sales, return_pct: rr(s.returns, s.sales),
        discount_pct: rr(s.discount, s.gross), expense_pct: rr(s.expense, s.sales), over_limit: s.over_limit, late_pct: rr(s.late, s.present), absent: s.absent, cash_owed: s.cash_owed }))
        .sort((a, b) => b.sales - a.sales);
};

module.exports = { getSrIntegrity, getSrIntegrityRows, evaluateIntegrity, median, RULES, WINDOW_DAYS };
