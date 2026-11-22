// ============================================================
// ক্রয় পরামর্শ (Planning ধাপ ২): কোন পণ্য কত কিনতে হবে
//
// প্রতিটি সক্রিয় পণ্যের জন্য (বিশ্লেষণ-জানালা planning.service.js-এর একই নিয়মে: ১→২→৩ মাস):
//   গতি (velocity)  = জানালায় বিক্রি ÷ জানালার দিন            (পিস/দিন)
//   হাতে আছে        = গুদামের স্টক + SR-দের হাতের স্টক
//   পথে আছে         = অর্ডার দেওয়া (ordered/partial) PO-এর বাকি পরিমাণ
//   লক্ষ্য স্টক     = গতি × (ডেলিভারি দিন + নিরাপত্তা দিন) × মৌসুম-গুণক
//   কেনা দরকার      = লক্ষ্য − (হাতে আছে + পথে আছে)         (ওপরে রাউন্ড, ০ হলে তালিকায় নেই)
//   জরুরিতা         = স্টক শেষ > ডেলিভারি দিনের আগেই শেষ হবে > নিরাপত্তা-সীমার মধ্যে
// বিক্রি নেই এমন পণ্য কেনার তালিকায় আসে না (আটকে থাকা স্টক আলাদা কার্ডে)।
// ব্যতিক্রম: বিক্রি নেই কিন্তু পুনঃঅর্ডার সীমা সেট করা ও স্টক সীমার নিচে → "সীমার নিচে" হিসেবে সবার শেষে।
// ডেলিভারি/নিরাপত্তা দিন system_settings (purchase_lead_days / purchase_buffer_days), ডিফল্ট ৭ ও ৭।
// ============================================================

const { query } = require('../config/db');
const { analysisWindow, getDataStart } = require('./planning.service');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const DEFAULTS = { lead: 7, buffer: 7 };
const URGENCY_RANK = { out: 0, urgent: 1, soon: 2, reorder: 3 };
const URGENCY_LABEL = { out: 'স্টক শেষ', urgent: 'জরুরি', soon: 'শীঘ্রই', reorder: 'সীমার নিচে' };

// ── PURE ──
const planPurchase = ({ products, sold, srHand, onOrder, windowDays, lead, buffer, seasonFactor = 1 }) => {
    const rows = [];
    for (const p of products) {
        const velocity = windowDays > 0 ? num(sold.get(p.id)) / windowDays : 0;
        const warehouse = Math.max(num(p.stock), 0), sr = Math.max(num(srHand.get(p.id)), 0), incoming = Math.max(num(onOrder.get(p.id)), 0);
        const onhand = warehouse + sr, supply = onhand + incoming;
        const cost = num(p.cost_price), price = num(p.price);
        let need = 0, urgency = null;
        const cover = velocity > 0 ? onhand / velocity : null;

        if (velocity > 0) {
            need = Math.ceil(Math.max(velocity * (lead + buffer) * seasonFactor - supply, 0));
            if (need <= 0) continue;
            urgency = onhand <= 0 ? 'out' : cover < lead ? 'urgent' : 'soon';
        } else if (num(p.reorder_point) > 0 && warehouse <= num(p.reorder_point)) {
            need = Math.ceil(Math.max(num(p.reorder_point) * 2 - supply, 0));
            if (need <= 0) continue;
            urgency = 'reorder';
        } else continue;

        rows.push({
            id: p.id, name: p.name, warehouse, sr_hand: sr, on_order: incoming,
            velocity: round2(velocity), cover_days: cover === null ? null : round2(cover),
            need, unit_cost: cost, cost: round2(need * cost), cost_known: cost > 0,
            margin_pct: price > 0 && cost > 0 ? round2(((price - cost) / price) * 100) : null,
            profit_per_day: round2(velocity * Math.max(price - cost, 0)),
            urgency, urgency_label: URGENCY_LABEL[urgency],
        });
    }
    rows.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.profit_per_day - a.profit_per_day || a.name.localeCompare(b.name));
    return rows;
};

const summarize = (rows) => ({
    count: rows.length,
    total_cost: round2(rows.reduce((s, r) => s + r.cost, 0)),
    urgent_count: rows.filter(r => r.urgency === 'out' || r.urgency === 'urgent').length,
    urgent_cost: round2(rows.filter(r => r.urgency === 'out' || r.urgency === 'urgent').reduce((s, r) => s + r.cost, 0)),
    without_cost: rows.filter(r => !r.cost_known).length,
});

// ── DB ──
const getSettings = async (tenant) => {
    const r = await query(`SELECT key, value FROM system_settings WHERE tenant_id = $1 AND key IN ('purchase_lead_days','purchase_buffer_days')`, [tenant]);
    const m = {}; r.rows.forEach(x => { m[x.key] = parseInt(x.value, 10); });
    const ok = (v, d, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : d);
    return { lead: ok(m.purchase_lead_days, DEFAULTS.lead, 1, 120), buffer: ok(m.purchase_buffer_days, DEFAULTS.buffer, 0, 120) };
};

const getPurchasePlan = async (req) => {
    const tenant = req.tenantId, today = todayBD();
    if (req.teamFilter) return { restricted: true };
    const [dataStart, cfg] = await Promise.all([getDataStart(tenant), getSettings(tenant)]);
    const win = analysisWindow({ today, dataStart });
    if (!win.ready) return { window: win, settings: cfg, rows: [], summary: summarize([]) };

    const [prods, soldR, srR, poR] = await Promise.all([
        query(`SELECT id::text AS id, name, stock, cost_price, price, reorder_point FROM products WHERE tenant_id = $1 AND COALESCE(is_active,true)`, [tenant]),
        query(`SELECT i->>'product_id' AS pid, SUM(COALESCE((i->>'qty')::numeric,0)) AS q
                 FROM sales_transactions st
                CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i
                WHERE st.tenant_id = $1 AND st.date BETWEEN $2 AND $3 GROUP BY 1`, [tenant, win.from, win.to]),
        query(`SELECT pid, SUM(q) AS q FROM (SELECT worker_id, product_id::text AS pid, SUM(direction * qty) AS q FROM sr_stock_ledger
                 WHERE tenant_id = $1 GROUP BY worker_id, product_id::text HAVING SUM(direction * qty) > 0) b GROUP BY pid`, [tenant]),
        query(`SELECT poi.product_id::text AS pid, SUM(GREATEST(poi.quantity_ordered - COALESCE(poi.quantity_received,0), 0)) AS q
                 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                WHERE po.tenant_id = $1 AND po.status IN ('ordered','partial') GROUP BY 1`, [tenant]),
    ]);
    const toMap = (r) => new Map(r.rows.map(x => [x.pid, num(x.q)]));
    const rows = planPurchase({ products: prods.rows, sold: toMap(soldR), srHand: toMap(srR), onOrder: toMap(poR), windowDays: win.window_days, lead: cfg.lead, buffer: cfg.buffer });
    return { window: win, settings: cfg, rows, summary: summarize(rows) };
};

/** ডেলিভারি/নিরাপত্তা দিন সেভ (শুধু অ্যাডমিন) */
const savePurchaseSettings = async (req) => {
    const lead = parseInt(req.body && req.body.lead_days, 10), buffer = parseInt(req.body && req.body.buffer_days, 10);
    if (!Number.isInteger(lead) || lead < 1 || lead > 120 || !Number.isInteger(buffer) || buffer < 0 || buffer > 120) { const e = new Error('invalid'); e.status = 400; throw e; }
    for (const [k, v] of [['purchase_lead_days', lead], ['purchase_buffer_days', buffer]]) {
        await query(`INSERT INTO system_settings (key, value, updated_by, updated_at, tenant_id) VALUES ($1, $2, $3, NOW(), $4)
                     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [k, String(v), req.user && req.user.id, req.tenantId]);
    }
    return { lead, buffer };
};

module.exports = { getPurchasePlan, savePurchaseSettings, planPurchase, summarize, URGENCY_LABEL, DEFAULTS };
