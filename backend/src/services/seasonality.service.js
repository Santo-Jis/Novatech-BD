// ============================================================
// বার্ষিক মৌসুম (Planning ধাপ ৪): বছরের কোন মাসে কোন পণ্য/বিক্রি বেশি চলে
//
// মাসিক বিক্রি সবসময় sales_transactions থেকে হিসাব হয় (আলাদা কিছু সংরক্ষণ করতে হয় না — ডেটা জমলেই বার্ষিক রেকর্ড তৈরি)।
//
//   শুধু "পূর্ণ মাস" ধরা হয়: চলতি মাস বাদ; প্রথম বিক্রির মাস বাদ (যদি মাসের ৫ তারিখের পর শুরু)।
//   মৌসুম-সূচক (index) = সেই ক্যালেন্ডার-মাসের গড় ÷ সব মাসের গড়ের গড়   (১.০ = স্বাভাবিক)
//     কোম্পানি: বিক্রয় টাকায়; পণ্য: পিসে
//     ≥১.২৫ → "বেশি চলে" (peak), ≤০.৭৫ → "কম চলে" (low)
//   নির্ভরযোগ্যতা: কোম্পানির জন্য ১২টি ভিন্ন ক্যালেন্ডার-মাসের ডেটা লাগে (অর্থাৎ পুরো একটি বছর);
//     পণ্যের জন্য কমপক্ষে ৬টি ভিন্ন মাসে বিক্রি। তার আগে কিছু অনুমান করা হয় না।
//   মৌসুম-গুণক (ক্রয় পরামর্শে): আগামী সময়ের সূচক ÷ বিক্রির গতি মাপা জানালার সূচক, ০.৫–২.০-এর মধ্যে সীমিত।
//   ⚠️ ব্যবসা বাড়তে থাকলে পরের মাসগুলো স্বভাবতই বেশি দেখায় — এটা মৌসুম নয়; ২+ বছরের ডেটায় এ ভুল কমে।
// ============================================================

const { query } = require('../config/db');
const { getDataStart } = require('./planning.service');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const pad = (n) => String(n).padStart(2, '0');
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const PEAK = 1.25, LOW = 0.75, COMPANY_MIN_CAL = 12, PRODUCT_MIN_CAL = 6, KEEP_MONTHS = 24;

// ── PURE ──
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const calMonth = (ym) => parseInt(ym.slice(5, 7), 10);       // 1..12

/** পূর্ণ মাসের তালিকা (পুরোনো → নতুন), সর্বোচ্চ KEEP_MONTHS */
const completeMonths = ({ dataStart, today }) => {
    if (!dataStart) return [];
    const cur = today.slice(0, 7);
    let first = dataStart.slice(0, 7);
    if (parseInt(dataStart.slice(8, 10), 10) > 5) first = ymAdd(first, 1);      // আংশিক প্রথম মাস বাদ
    const out = [];
    for (let m = first; m < cur; m = ymAdd(m, 1)) out.push(m);
    return out.slice(-KEEP_MONTHS);
};

/**
 * values: Map(ym → মান), months: বিবেচ্য ym তালিকা (যে মাসে মান নেই = ০)।
 * ফেরত: { index: [১২টি, না থাকলে null], avg: [১২টি], observed: ক্যালেন্ডার-মাসের সংখ্যা, reliable }
 */
const seasonIndex = (values, months, minCal) => {
    const sum = Array(12).fill(0), cnt = Array(12).fill(0);
    for (const ym of months) { const c = calMonth(ym) - 1; sum[c] += num(values.get(ym)); cnt[c]++; }
    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : null));
    const seen = avg.filter(v => v !== null);
    const overall = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
    const reliable = seen.length >= minCal && overall > 0;
    return { avg: avg.map(v => (v === null ? null : round2(v))), observed: seen.length, reliable,
             index: reliable ? avg.map(v => (v === null ? null : round2(v / overall))) : Array(12).fill(null) };
};

const peaks = (index) => index.map((v, i) => ({ v, m: i + 1 })).filter(x => x.v !== null && x.v >= PEAK).sort((a, b) => b.v - a.v).map(x => x.m);
const lows = (index) => index.map((v, i) => ({ v, m: i + 1 })).filter(x => x.v !== null && x.v <= LOW).sort((a, b) => a.v - b.v).map(x => x.m);

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const midDate = (a, b) => addDays(a, Math.round((Date.parse(b) - Date.parse(a)) / 86400000 / 2));

/** ক্রয় পরামর্শের গুণক: আগামী কভার-সময়ের মাসের সূচক ÷ বিক্রির জানালার মাসের সূচক */
const seasonFactor = ({ index, today, coverDays, windowFrom, windowTo }) => {
    if (!index) return 1;
    const target = index[calMonth(addDays(today, Math.round(coverDays / 2)).slice(0, 7)) - 1];
    const recent = index[calMonth(midDate(windowFrom, windowTo).slice(0, 7)) - 1];
    if (!(target > 0) || !(recent > 0)) return 1;
    return Math.min(Math.max(round2(target / recent), 0.5), 2);
};

// ── DB ──
const loadSeasonData = async (tenant, today) => {
    const dataStart = await getDataStart(tenant);
    const months = completeMonths({ dataStart, today });
    const from = months.length ? months[0] + '-01' : today, to = today.slice(0, 7) + '-01';      // চলতি মাস বাদ (< to)
    const [co, pr] = months.length ? await Promise.all([
        query(`SELECT to_char(date,'YYYY-MM') AS ym, SUM(COALESCE(net_amount,total_amount)) AS v FROM sales_transactions
                WHERE tenant_id = $1 AND date >= $2 AND date < $3 GROUP BY 1`, [tenant, from, to]),
        query(`SELECT i->>'product_id' AS pid, to_char(st.date,'YYYY-MM') AS ym, SUM(COALESCE((i->>'qty')::numeric,0)) AS q
                 FROM sales_transactions st
                CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i
                WHERE st.tenant_id = $1 AND st.date >= $2 AND st.date < $3 GROUP BY 1,2`, [tenant, from, to]),
    ]) : [{ rows: [] }, { rows: [] }];

    const companyVals = new Map(co.rows.map(r => [r.ym, num(r.v)]));
    const company = seasonIndex(companyVals, months, COMPANY_MIN_CAL);

    const byProduct = new Map();
    for (const r of pr.rows) { if (!byProduct.has(r.pid)) byProduct.set(r.pid, new Map()); byProduct.get(r.pid).set(r.ym, num(r.q)); }
    const products = new Map();
    for (const [pid, vals] of byProduct) {
        const first = [...vals.keys()].sort()[0];                       // পণ্যের প্রথম বিক্রির মাস থেকে (লঞ্চের আগের ০ ধরা হয় না)
        const mine = months.filter(m => m >= first);
        const idx = seasonIndex(vals, mine, PRODUCT_MIN_CAL);
        products.set(pid, { ...idx, total: round2([...vals.values()].reduce((a, b) => a + b, 0)) });
    }
    const monthly = months.map(ym => ({ ym, revenue: round2(companyVals.get(ym) || 0) }));
    return { dataStart, months, monthly, company, products };
};

/** ক্রয় পরামর্শের জন্য: পণ্য-আইডি → গুণক (পণ্যের নিজস্ব সূচক নির্ভরযোগ্য হলে সেটা, নইলে কোম্পানির; কোনোটাই না থাকলে ১) */
const getSeasonFactors = async (tenant, { today, coverDays, windowFrom, windowTo }) => {
    const d = await loadSeasonData(tenant, today);
    const f = new Map();
    const comp = d.company.reliable ? d.company.index : null;
    const args = { today, coverDays, windowFrom, windowTo };
    const compFactor = seasonFactor({ index: comp, ...args });
    for (const [pid, p] of d.products) f.set(pid, p.reliable ? seasonFactor({ index: p.index, ...args }) : compFactor);
    return { map: f, defaultFactor: compFactor, active: d.company.reliable || [...d.products.values()].some(p => p.reliable) };
};

const getSeasonality = async (req) => {
    if (req.teamFilter) return { restricted: true };
    const tenant = req.tenantId, today = todayBD();
    const d = await loadSeasonData(tenant, today);
    const names = d.products.size ? await query(`SELECT id::text AS id, name FROM products WHERE tenant_id = $1 AND id::text = ANY($2::text[])`, [tenant, [...d.products.keys()]]) : { rows: [] };
    const nm = new Map(names.rows.map(r => [r.id, r.name]));
    const top = [...d.products].filter(([, p]) => p.reliable).sort((a, b) => b[1].total - a[1].total).slice(0, 8)
        .map(([pid, p]) => ({ id: pid, name: nm.get(pid) || '—', total: p.total, peak_months: peaks(p.index).map(m => MONTHS_BN[m - 1]), low_months: lows(p.index).map(m => MONTHS_BN[m - 1]) }));
    const nextIdx = ymAdd(today.slice(0, 7), 1), nextMonth = calMonth(nextIdx);
    const c = d.company;
    return {
        months_observed: d.months.length,
        calendar_months_seen: c.observed,
        reliable: c.reliable,
        progress_pct: Math.min(Math.round((c.observed / COMPANY_MIN_CAL) * 100), 100),
        monthly: d.monthly,
        company_index: c.avg.map((v, i) => ({ month: i + 1, label: MONTHS_BN[i], avg_revenue: v, index: c.index[i] })),
        peak_months: c.reliable ? peaks(c.index).map(m => MONTHS_BN[m - 1]) : [],
        low_months: c.reliable ? lows(c.index).map(m => MONTHS_BN[m - 1]) : [],
        next_month: { label: MONTHS_BN[nextMonth - 1], index: c.reliable ? c.index[nextMonth - 1] : null },
        top_products: top,
        products_with_season: [...d.products.values()].filter(p => p.reliable).length,
        note: c.reliable
            ? 'মৌসুম-সূচক ১.০ = স্বাভাবিক। ব্যবসা বাড়তে থাকলে পরের মাস স্বভাবতই বেশি দেখায় — ২+ বছরের ডেটায় এটা আরও নির্ভুল।'
            : d.months.length === 0
                ? 'এখনো কোনো পূর্ণ মাস শেষ হয়নি। মাস শেষ হলেই মাসিক রেকর্ড জমা শুরু হবে।'
                : `${c.observed}/১২ মাসের ডেটা জমেছে। পুরো বছর (১২টি ভিন্ন মাস) পূর্ণ হলে মৌসুম ধরা পড়বে — এর আগে অনুমান করা হয় না।`,
    };
};

/** বিস্তারিত তালিকা: প্রতিটি পণ্যের ১২ মাসের গড় বিক্রি + মৌসুম */
const getSeasonProductRows = async (tenant, today = todayBD()) => {
    const d = await loadSeasonData(tenant, today);
    if (d.products.size === 0) return [];
    const names = await query(`SELECT id::text AS id, name FROM products WHERE tenant_id = $1 AND id::text = ANY($2::text[])`, [tenant, [...d.products.keys()]]);
    const nm = new Map(names.rows.map(r => [r.id, r.name]));
    return [...d.products].sort((a, b) => b[1].total - a[1].total).map(([pid, p]) => {
        const row = { name: nm.get(pid) || '—', total: p.total, status: p.reliable ? 'মৌসুম ধরা পড়েছে' : `ডেটা কম (${p.observed}/${PRODUCT_MIN_CAL} মাস)`,
                      peak: p.reliable ? peaks(p.index).map(m => MONTHS_BN[m - 1]).join(', ') : '', low: p.reliable ? lows(p.index).map(m => MONTHS_BN[m - 1]).join(', ') : '' };
        p.avg.forEach((v, i) => { row[`m${i + 1}`] = v; });
        return row;
    });
};

module.exports = { getSeasonality, getSeasonFactors, getSeasonProductRows, loadSeasonData, completeMonths, seasonIndex, seasonFactor, peaks, lows, MONTHS_BN, PEAK, LOW };
