// ============================================================
// সাপ্লাইয়ারের পাওনা (Payables): আপনি কাকে কত দেবেন, কত দিনের পুরোনো, কবে দেওয়ার কথা
//
// বকেয়ার সংজ্ঞা অ্যাপের বিদ্যমান হিসাবের (supplier.controller.js) সাথে একই:
//   বকেয়া = অর্ডার দেওয়া PO-র মোট (status ordered/partial/received) − সাপ্লাইয়ারকে দেওয়া সব পেমেন্ট
// বয়স: পেমেন্ট সবচেয়ে পুরোনো PO আগে কাটে (FIFO); বাকি অংশ PO-র অর্ডার-তারিখ থেকে বয়স ধরে।
// দেওয়ার মেয়াদ: সাপ্লাইয়ারের payment_terms লেখা থেকে দিন বের করা হয় ("Net 30", "৩০ দিন"); "cash/নগদ" = ০ দিন;
//   না পড়া গেলে মেয়াদ অজানা — শুধু বয়স দেখানো হয়, "মেয়াদ পেরিয়েছে" বলা হয় না।
// ⚠️ কোম্পানির দেনা, তাই টিম-ভিউতে (ম্যানেজার) দেখানো হয় না।
// ============================================================

const { query } = require('../config/db');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const money = (n) => `৳${Math.round(num(n)).toLocaleString('bn-BD')}`;
const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };
const BUCKETS = [
    { key: 'd0_30', label: '০–৩০ দিন', max: 30 }, { key: 'd31_60', label: '৩১–৬০ দিন', max: 60 },
    { key: 'd61_90', label: '৬১–৯০ দিন', max: 90 }, { key: 'd90p', label: '৯০+ দিন', max: Infinity },
];

// ── PURE ──
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** "Net 30" / "৩০ দিন" / "cash" → দিন (সংখ্যা), না পড়া গেলে null */
const parseTermsDays = (text) => {
    if (!text) return null;
    const t = String(text).replace(/[০-৯]/g, d => BN_DIGITS.indexOf(d));
    const m = t.match(/(\d{1,3})/);
    if (m) return parseInt(m[1], 10);
    return /cash|নগদ|advance|অগ্রিম|cod/i.test(t) ? 0 : null;
};

/** একজন সাপ্লাইয়ার: পেমেন্ট FIFO-তে PO-তে বসিয়ে বাকি অংশের বয়স */
const agePayable = ({ pos, paid, termsDays, today }) => {
    const sorted = [...pos].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let pool = num(paid);
    const open = [];
    for (const p of sorted) {
        const amt = num(p.amount), covered = Math.min(amt, pool);
        pool -= covered;
        const remaining = round2(amt - covered);
        if (remaining > 0) {
            const age = Math.max(daysBetween(p.date, today), 0);
            const due = termsDays !== null ? addDays(p.date, termsDays) : null;
            open.push({ id: p.id, po_number: p.po_number, date: p.date, amount: amt, remaining, age_days: age, due_date: due,
                        days_overdue: due ? Math.max(daysBetween(due, today), 0) : null, overdue: due ? due < today : false });
        }
    }
    const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    for (const o of open) b[BUCKETS.find(x => o.age_days <= x.max).key] += o.remaining;
    const total = round2(open.reduce((s, o) => s + o.remaining, 0));
    return {
        open, total, advance: round2(pool), buckets: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round2(v)])),
        overdue_amount: round2(open.filter(o => o.overdue).reduce((s, o) => s + o.remaining, 0)),
        due_soon_amount: round2(open.filter(o => o.due_date && !o.overdue && daysBetween(today, o.due_date) <= 7).reduce((s, o) => s + o.remaining, 0)),
        oldest_days: open.length ? Math.max(...open.map(o => o.age_days)) : 0,
    };
};

const buildAlerts = ({ totals, receivable, suppliers }) => {
    const a = [];
    if (totals.overdue > 0) a.push({ severity: 'danger', code: 'payable_overdue', message: `সাপ্লাইয়ারের ${money(totals.overdue)} দেওয়ার মেয়াদ পেরিয়ে গেছে (${totals.overdue_suppliers} জনের)` });
    if (totals.due_soon > 0) a.push({ severity: 'warning', code: 'payable_due_soon', message: `আগামী ৭ দিনে সাপ্লাইয়ারকে ${money(totals.due_soon)} দিতে হবে` });
    if (totals.over_90 > 0) a.push({ severity: 'warning', code: 'payable_old', message: `৯০ দিনের বেশি পুরোনো সাপ্লাইয়ার বকেয়া ${money(totals.over_90)}` });
    if (totals.total > 0 && receivable > 0 && receivable < totals.total) a.push({ severity: 'info', code: 'payable_gt_receivable', message: `কাস্টমারের কাছে পাওনা (${money(receivable)}) সাপ্লাইয়ারের দেনার (${money(totals.total)}) চেয়ে কম — নগদ আদায় বাড়ান` });
    const adv = suppliers.filter(s => s.advance > 0);
    if (adv.length) a.push({ severity: 'info', code: 'supplier_advance', message: `${adv.length} জন সাপ্লাইয়ারকে অগ্রিম/বেশি দেওয়া আছে (মোট ${money(adv.reduce((s, x) => s + x.advance, 0))})` });
    return a.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
};

// ── DB ──
const loadPayables = async (tenant, today) => {
    const [sup, pos, pay] = await Promise.all([
        query(`SELECT id, name, payment_terms, is_active FROM suppliers WHERE tenant_id = $1`, [tenant]),
        // amount = গৃহীত মালের মূল্য (মাল আসার আগে শুধু অর্ডার করা PO বকেয়া নয়)
        query(`SELECT po.id, po.supplier_id, po.po_number, to_char(po.order_date,'YYYY-MM-DD') AS date,
                      COALESCE((SELECT SUM(poi.quantity_received * poi.unit_cost) FROM purchase_order_items poi
                                 WHERE poi.purchase_order_id = po.id), 0) AS amount
                 FROM purchase_orders po
                WHERE po.tenant_id = $1 AND po.status IN ('ordered','partial','received') AND po.supplier_id IS NOT NULL`, [tenant]),
        query(`SELECT supplier_id, COALESCE(SUM(amount),0) AS paid,
                      COALESCE(SUM(amount) FILTER (WHERE created_at >= (($2::date - 30) AT TIME ZONE 'Asia/Dhaka')),0) AS paid_30d
                 FROM supplier_payments WHERE tenant_id = $1 AND voided_at IS NULL GROUP BY supplier_id`, [tenant, today]),
    ]);
    const posBy = new Map(), payBy = new Map(pay.rows.map(r => [r.supplier_id, r]));
    pos.rows.forEach(p => { if (!posBy.has(p.supplier_id)) posBy.set(p.supplier_id, []); posBy.get(p.supplier_id).push(p); });
    const suppliers = [];
    for (const s of sup.rows) {
        const list = posBy.get(s.id) || [], p = payBy.get(s.id);
        if (!list.length && !p) continue;
        const terms = parseTermsDays(s.payment_terms);
        const aged = agePayable({ pos: list, paid: p ? num(p.paid) : 0, termsDays: terms, today });
        suppliers.push({ id: s.id, name: s.name, terms: s.payment_terms || '', terms_days: terms, paid_30d: p ? round2(num(p.paid_30d)) : 0, ...aged });
    }
    return suppliers;
};

const getPayablesHealth = async (req) => {
    if (req.teamFilter) return { restricted: true };
    const tenant = req.tenantId, today = todayBD();
    const [suppliers, rec] = await Promise.all([
        loadPayables(tenant, today),
        query(`SELECT COALESCE(SUM(current_credit),0) AS v FROM customers WHERE tenant_id = $1 AND is_active IS NOT FALSE AND current_credit > 0`, [tenant]),
    ]);
    const owing = suppliers.filter(s => s.total > 0);
    const sum = (k) => round2(owing.reduce((a, s) => a + s[k], 0));
    const buckets = BUCKETS.map(b => ({ key: b.key, label: b.label, amount: round2(owing.reduce((a, s) => a + s.buckets[b.key], 0)) }));
    const totals = { total: sum('total'), overdue: sum('overdue_amount'), due_soon: sum('due_soon_amount'), over_90: buckets[3].amount,
                     overdue_suppliers: owing.filter(s => s.overdue_amount > 0).length, supplier_count: owing.length,
                     paid_30d: round2(suppliers.reduce((a, s) => a + s.paid_30d, 0)), terms_unknown: owing.filter(s => s.terms_days === null).length };
    const receivable = num(rec.rows[0].v);
    return {
        totals, buckets, receivable, net_position: round2(receivable - totals.total),
        top: owing.sort((a, b) => b.total - a.total).slice(0, 5).map(s => ({ id: s.id, name: s.name, total: s.total, overdue: s.overdue_amount, oldest_days: s.oldest_days })),
        alerts: buildAlerts({ totals, receivable, suppliers }),
    };
};

/** বিস্তারিত (healthDetail): সাপ্লাইয়ার অনুযায়ী ও PO অনুযায়ী সারি */
const getPayableRows = async (tenant, today = todayBD()) => {
    const suppliers = await loadPayables(tenant, today);
    return suppliers.filter(s => s.total > 0 || s.advance > 0).sort((a, b) => b.total - a.total).map(s => ({
        name: s.name, terms: s.terms || '—', total: s.total, d0_30: s.buckets.d0_30, d31_60: s.buckets.d31_60, d61_90: s.buckets.d61_90, d90p: s.buckets.d90p,
        overdue: s.overdue_amount, advance: s.advance, oldest_days: s.oldest_days, paid_30d: s.paid_30d,
    }));
};
const getPayablePoRows = async (tenant, today = todayBD()) => {
    const sup = await loadPayables(tenant, today), rows = [];
    for (const s of sup) for (const o of s.open) rows.push({ supplier: s.name, po_number: o.po_number, date: o.date, amount: o.amount, remaining: o.remaining, age_days: o.age_days,
        due_date: o.due_date || '—', status: o.due_date ? (o.overdue ? `মেয়াদ পেরিয়েছে (${o.days_overdue} দিন)` : 'মেয়াদের মধ্যে') : 'মেয়াদ অজানা' });
    return rows.sort((a, b) => b.age_days - a.age_days);
};

module.exports = { getPayablesHealth, getPayableRows, getPayablePoRows, parseTermsDays, agePayable, buildAlerts, BUCKETS };
