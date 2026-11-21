// ============================================================
// ইনভেন্টরি ও রিটার্ন স্বাস্থ্য — অ্যাডমিন ড্যাশবোর্ড
//
// স্টক দুই জায়গায় থাকে এবং আলাদা পুল:
//   • গুদাম      = products.stock (SR-কে অর্ডার দিলে এখান থেকে কমে — stock_movements 'out/order')
//   • SR-এর হাতে = sr_stock_ledger-এর Σ(direction × qty) (ম্যানেজার approve করলে order_in)
// তাই মোট স্টক = গুদাম + SR-এর হাতে।
//
// মূল্য দুভাবে: ক্রয়মূল্যে (আসল বিনিয়োগ) ও বিক্রয়মূল্যে (সম্ভাব্য আয়)।
// pure ফাংশনগুলো (DB ছাড়া) আলাদা export — টেস্ট করা যায়।
// ============================================================

const { query } = require('../config/db');

const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b > 0 ? round2((a / b) * 100) : null);

const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const addDays = (dateStr, n) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const monthStart = (dateStr) => dateStr.slice(0, 8) + '01';

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };
const LOSS_REASONS = ['damaged', 'expired'];   // ফেরত আসে না — সরাসরি ক্ষতি (P&L-এর নিয়মের মতোই)
const REASON_LABEL = {
    damaged: 'নষ্ট/ক্ষতিগ্রস্ত', expired: 'মেয়াদোত্তীর্ণ', wrong_item: 'ভুল পণ্য',
    wrong_product: 'ভুল পণ্য', excess: 'অতিরিক্ত', quality: 'মান সমস্যা', other: 'অন্যান্য',
};

// ============================================================
// PURE LOGIC
// ============================================================

/** products + SR-হাতের সারি থেকে স্টক সারাংশ */
const summarizeStock = (warehouse, srRows) => {
    const sr = srRows.reduce((a, r) => ({
        qty: a.qty + num(r.qty), cost_value: a.cost_value + num(r.cost_value), sale_value: a.sale_value + num(r.sale_value),
    }), { qty: 0, cost_value: 0, sale_value: 0 });
    const w = { qty: num(warehouse.qty), cost_value: num(warehouse.cost_value), sale_value: num(warehouse.sale_value) };
    const total = {
        qty: w.qty + sr.qty,
        cost_value: round2(w.cost_value + sr.cost_value),
        sale_value: round2(w.sale_value + sr.sale_value),
    };
    return {
        warehouse: { ...w, cost_value: round2(w.cost_value), sale_value: round2(w.sale_value) },
        sr_hand:   { ...sr, cost_value: round2(sr.cost_value), sale_value: round2(sr.sale_value),
                     sr_count: srRows.length },
        total: { ...total, potential_margin: round2(total.sale_value - total.cost_value),
                 margin_pct: pct(total.sale_value - total.cost_value, total.sale_value) },
    };
};

/** products-এর ফ্ল্যাগ-করা সারি থেকে out/low/dead তালিকা */
const classifyProducts = (rows) => {
    const out  = rows.filter(r => r.is_out).sort((a, b) => num(b.sold) - num(a.sold));
    const low  = rows.filter(r => r.is_low).sort((a, b) => (num(a.stock) / num(a.reorder_point)) - (num(b.stock) / num(b.reorder_point)));
    const dead = rows.filter(r => r.is_dead)
        .map(r => ({ ...r, value: round2(num(r.stock) * num(r.cost)) }))
        .sort((a, b) => b.value - a.value);
    return {
        out_of_stock: { count: out.length, items: out.slice(0, 5).map(r => ({ name: r.name, sold_60d: num(r.sold) })) },
        low_stock:    { count: low.length, items: low.slice(0, 5).map(r => ({ name: r.name, stock: num(r.stock), reorder_point: num(r.reorder_point) })) },
        dead_stock:   {
            count: dead.length,
            cost_value: round2(dead.reduce((s, r) => s + r.value, 0)),
            items: dead.slice(0, 5).map(r => ({ name: r.name, stock: num(r.stock), value: r.value })),
        },
    };
};

/** রিটার্ন সারাংশ: reason-সারি (type, reason, cnt, value, cost) → মোট ও ভাগ */
const summarizeReturns = (reasonRows, { grossSales = 0, pending = {}, customer = {}, replacement = {} } = {}) => {
    const ret = reasonRows.filter(r => r.type !== 'exchange');
    const exc = reasonRows.filter(r => r.type === 'exchange');
    const sum = (arr, k) => arr.reduce((s, r) => s + num(r[k]), 0);

    const byReasonMap = new Map();
    for (const r of ret) {
        const key = r.reason || 'other';
        const cur = byReasonMap.get(key) || { reason: key, value: 0, cost: 0 };
        cur.value += num(r.value); cur.cost += num(r.cost);
        byReasonMap.set(key, cur);
    }
    const by_reason = [...byReasonMap.values()]
        .map(r => ({ reason: r.reason, label: REASON_LABEL[r.reason] || r.reason, value: round2(r.value), is_loss: LOSS_REASONS.includes(r.reason) }))
        .sort((a, b) => b.value - a.value);

    const returnValue = round2(sum(ret, 'value'));
    const lossCost = round2(ret.filter(r => LOSS_REASONS.includes(r.reason)).reduce((s, r) => s + num(r.cost), 0));
    const customerValue = round2(num(customer.value));
    const totalReturned = round2(returnValue + customerValue);

    return {
        sr_returns:       { value: returnValue },
        customer_returns: { value: customerValue, count: parseInt(customer.count) || 0 },
        total_value:      totalReturned,
        return_rate_pct:  pct(totalReturned, grossSales),
        loss_cost:        lossCost,            // নষ্ট/মেয়াদোত্তীর্ণ পণ্যের ক্রয়মূল্য — ফেরত পাওয়ার নয়
        by_reason,
        exchange:         { value: round2(sum(exc, 'value')) },
        replacement:      { value: round2(num(replacement.value)), count: parseInt(replacement.count) || 0 },
        pending:          { count: parseInt(pending.count) || 0, value: round2(num(pending.value)) },
    };
};

/** কোন SR-এর রিটার্ন-হার অস্বাভাবিক */
const flagSrReturns = (rows, { minValue = 500, ratePct = 10 } = {}) =>
    rows.map(r => {
        const sales = num(r.sales), value = num(r.value);
        return { name: r.name, value: round2(value), count: parseInt(r.cnt) || 0, sales: round2(sales), rate_pct: pct(value, sales),
                 flagged: sales > 0 && value >= minValue && (value / sales) * 100 >= ratePct };
    });

const buildAlerts = ({ inventory, returns, srReturns = [], missingCost = 0 }) => {
    const alerts = [];
    if (inventory) {
        const { stock, products, expiry } = inventory;
        if (expiry && expiry.expired.count > 0) {
            alerts.push({ severity: 'danger', code: 'expired_stock',
                message: `${expiry.expired.count}টি ব্যাচের মেয়াদ শেষ — ৳${Math.round(expiry.expired.value)} মূল্যের পণ্য বিক্রির অযোগ্য` });
        }
        if (expiry && expiry.soon.count > 0) {
            alerts.push({ severity: 'warning', code: 'expiring_soon',
                message: `${expiry.soon.count}টি ব্যাচের মেয়াদ ${expiry.soon_days} দিনের মধ্যে শেষ হবে (৳${Math.round(expiry.soon.value)})` });
        }
        if (products.out_of_stock.count > 0) {
            alerts.push({ severity: 'warning', code: 'out_of_stock_demand',
                message: `${products.out_of_stock.count}টি চলতি পণ্যের স্টক শেষ (গত ৬০ দিনে বিক্রি হয়েছে) — বিক্রি হারাচ্ছেন` });
        }
        if (products.low_stock.count > 0) {
            alerts.push({ severity: 'info', code: 'low_stock', message: `${products.low_stock.count}টি পণ্য পুনঃঅর্ডার সীমার নিচে` });
        }
        if (stock.warehouse.cost_value > 0 && products.dead_stock.cost_value / stock.warehouse.cost_value > 0.2) {
            alerts.push({ severity: 'warning', code: 'dead_stock',
                message: `গুদামের ${Math.round((products.dead_stock.cost_value / stock.warehouse.cost_value) * 100)}% মূল্য (৳${Math.round(products.dead_stock.cost_value)}) এমন পণ্যে আটকে যা ৬০ দিনে বিক্রি হয়নি` });
        }
        if (missingCost > 0) {
            alerts.push({ severity: 'warning', code: 'missing_cost',
                message: `${missingCost}টি পণ্যের ক্রয়মূল্য ০ — স্টক মূল্য ও মুনাফা কম/বেশি দেখাতে পারে` });
        }
    }
    if (returns) {
        const r = returns.return_rate_pct;
        if (r !== null && r >= 10) alerts.push({ severity: 'danger', code: 'return_rate_high', message: `রিটার্নের হার ${r}% — বিক্রির তুলনায় অনেক বেশি` });
        else if (r !== null && r >= 5) alerts.push({ severity: 'warning', code: 'return_rate', message: `রিটার্নের হার ${r}% (৫%-এর বেশি)` });
        if (returns.loss_cost > 0) {
            alerts.push({ severity: 'warning', code: 'return_loss',
                message: `নষ্ট/মেয়াদোত্তীর্ণ ফেরতে ৳${Math.round(returns.loss_cost)} ক্ষতি (ফেরত পাওয়ার নয়)` });
        }
        if (returns.pending.count > 0) {
            alerts.push({ severity: 'info', code: 'return_pending', message: `${returns.pending.count}টি রিটার্ন/বদলি অনুরোধ অপেক্ষমাণ (৳${Math.round(returns.pending.value)})` });
        }
    }
    for (const s of srReturns.filter(x => x.flagged).slice(0, 3)) {
        alerts.push({ severity: 'warning', code: 'sr_return_spike',
            message: `${s.name || 'SR'}-এর রিটার্ন-হার ${s.rate_pct}% (৳${Math.round(s.value)}) — যাচাই করুন` });
    }
    return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};

// ============================================================
// মূল ফাংশন
// ============================================================
const EXPIRY_SOON_DAYS = 30;
const DEAD_DAYS = 60;

const getInventoryHealth = async (req) => {
    const tenant = req.tenantId;
    const today = todayBD();
    const from = req.query.from || monthStart(today);
    const to = req.query.to || today;
    const companyWide = !req.teamFilter;     // ম্যানেজার-ভিউতে কোম্পানি-ব্যাপী স্টক দেখানো হয় না
    const soldSince = addDays(today, -DEAD_DAYS);
    const soonTo = addDays(today, EXPIRY_SOON_DAYS);

    const teamJoinRR = req.teamFilter ? 'AND u.manager_id = $4' : '';
    const rParams = req.teamFilter ? [tenant, from, to, req.teamFilter] : [tenant, from, to];

    const [prodAgg, srRows, flagged, batches, reasonRows, pending, customer, repl, srRet] = await Promise.all([
        companyWide ? query(
            `SELECT COALESCE(SUM(GREATEST(stock,0)),0)                                         AS qty,
                    COALESCE(SUM(GREATEST(stock,0) * COALESCE(cost_price,0)),0)                AS cost_value,
                    COALESCE(SUM(GREATEST(stock,0) * COALESCE(price,0)),0)                     AS sale_value,
                    COUNT(*) FILTER (WHERE stock > 0 AND COALESCE(cost_price,0) = 0)           AS missing_cost,
                    COALESCE(SUM(COALESCE(return_stock,0)    * COALESCE(cost_price,0)),0)      AS return_stock_value,
                    COALESCE(SUM(COALESCE(return_stock,0)),0)                                  AS return_stock_qty,
                    COALESCE(SUM(COALESCE(defective_stock,0) * COALESCE(cost_price,0)),0)      AS defective_value,
                    COALESCE(SUM(COALESCE(defective_stock,0)),0)                               AS defective_qty
               FROM products WHERE tenant_id = $1 AND COALESCE(is_active, true)`, [tenant]) : null,

        companyWide ? query(
            `WITH b AS (
                SELECT worker_id, product_id::text AS pid, SUM(direction * qty) AS q
                  FROM sr_stock_ledger WHERE tenant_id = $1
                 GROUP BY worker_id, product_id::text HAVING SUM(direction * qty) > 0)
             SELECT b.worker_id, u.name_bn AS name,
                    SUM(b.q)                              AS qty,
                    SUM(b.q * COALESCE(p.cost_price,0))   AS cost_value,
                    SUM(b.q * COALESCE(p.price,0))        AS sale_value
               FROM b
               JOIN products p ON p.id::text = b.pid AND p.tenant_id = $1
               JOIN users u    ON u.id = b.worker_id
              GROUP BY b.worker_id, u.name_bn
              ORDER BY cost_value DESC`, [tenant]) : null,

        companyWide ? query(
            `WITH sold AS (
                SELECT i->>'product_id' AS pid, SUM(COALESCE((i->>'qty')::numeric,0)) AS qty
                  FROM sales_transactions st
                 CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i
                 WHERE st.tenant_id = $1 AND st.date >= $2
                 GROUP BY 1)
             SELECT * FROM (
                SELECT p.name, p.stock, p.reorder_point, COALESCE(p.cost_price,0) AS cost, COALESCE(s.qty,0) AS sold,
                       (p.stock <= 0 AND COALESCE(s.qty,0) > 0)                                          AS is_out,
                       (p.stock > 0 AND COALESCE(p.reorder_point,0) > 0 AND p.stock <= p.reorder_point) AS is_low,
                       (p.stock > 0 AND s.pid IS NULL)                                                   AS is_dead
                  FROM products p LEFT JOIN sold s ON s.pid = p.id::text
                 WHERE p.tenant_id = $1 AND COALESCE(p.is_active, true)) x
             WHERE is_out OR is_low OR is_dead`, [tenant, soldSince]) : null,

        companyWide ? query(
            `SELECT COUNT(*) FILTER (WHERE expiry_date < $2)                                              AS expired_count,
                    COALESCE(SUM(quantity * COALESCE(unit_cost,0)) FILTER (WHERE expiry_date < $2),0)     AS expired_value,
                    COUNT(*) FILTER (WHERE expiry_date >= $2 AND expiry_date <= $3)                       AS soon_count,
                    COALESCE(SUM(quantity * COALESCE(unit_cost,0)) FILTER (WHERE expiry_date >= $2 AND expiry_date <= $3),0) AS soon_value
               FROM product_batches
              WHERE tenant_id = $1 AND quantity > 0 AND expiry_date IS NOT NULL
                AND status IN ('active','quarantine')`, [tenant, today, soonTo]) : null,

        // রিটার্ন: প্রতিটি আইটেমের নিজস্ব কারণ (না থাকলে রিকোয়েস্টের কারণ); মূল্য = আইটেম subtotal (ভ্যাটসহ,
        // বিক্রির total_amount-এর সাথে তুলনীয়), ক্ষতি = qty × বর্তমান ক্রয়মূল্য
        query(
            `SELECT COALESCE(NULLIF(i->>'reason',''), rr.reason, 'other') AS reason, rr.type,
                    COALESCE(SUM(COALESCE((i->>'subtotal')::numeric,0)),0)                      AS value,
                    COALESCE(SUM(COALESCE((i->>'qty')::numeric,0) * COALESCE(p.cost_price,0)),0) AS cost
               FROM return_requests rr
               JOIN users u ON u.id = rr.sr_id
              CROSS JOIN LATERAL jsonb_array_elements(
                     CASE WHEN jsonb_typeof(rr.items) = 'array' THEN rr.items ELSE '[]'::jsonb END) i
               LEFT JOIN products p ON p.id::text = i->>'product_id' AND p.tenant_id = rr.tenant_id
              WHERE rr.tenant_id = $1 AND rr.status = 'completed'
                AND rr.completed_at::date BETWEEN $2 AND $3 ${teamJoinRR}
              GROUP BY 1, 2`, rParams),

        query(
            `SELECT COUNT(*) AS count, COALESCE(SUM(rr.total_value),0) AS value
               FROM return_requests rr JOIN users u ON u.id = rr.sr_id
              WHERE rr.tenant_id = $1 AND rr.status IN ('pending','approved')
                AND rr.created_at::date BETWEEN $2 AND $3 ${teamJoinRR}`, rParams),

        companyWide ? query(
            `SELECT COUNT(*) AS count, COALESCE(SUM(total_return_value),0) AS value
               FROM customer_return_requests
              WHERE tenant_id = $1 AND status = 'completed' AND type = 'return'
                AND completed_at::date BETWEEN $2 AND $3`, [tenant, from, to]) : null,

        query(
            `SELECT COALESCE(SUM(st.total_amount),0)       AS gross_sales,
                    COALESCE(SUM(st.replacement_value),0)  AS replacement_value,
                    COUNT(*) FILTER (WHERE COALESCE(st.replacement_value,0) > 0) AS replacement_count
               FROM sales_transactions st JOIN users u ON u.id = st.worker_id
              WHERE st.tenant_id = $1 AND st.date BETWEEN $2 AND $3 ${teamJoinRR}`, rParams),

        query(
            `WITH r AS (
                SELECT rr.sr_id, SUM(rr.total_value) AS value, COUNT(*) AS cnt
                  FROM return_requests rr JOIN users u ON u.id = rr.sr_id
                 WHERE rr.tenant_id = $1 AND rr.status = 'completed' AND rr.type = 'return'
                   AND rr.completed_at::date BETWEEN $2 AND $3 ${teamJoinRR}
                 GROUP BY rr.sr_id),
             s AS (
                SELECT worker_id, SUM(total_amount) AS sales FROM sales_transactions
                 WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY worker_id)
             SELECT u.name_bn AS name, r.value, r.cnt, COALESCE(s.sales,0) AS sales
               FROM r JOIN users u ON u.id = r.sr_id LEFT JOIN s ON s.worker_id = r.sr_id
              ORDER BY r.value DESC LIMIT 5`, rParams),
    ]);

    // ── ইনভেন্টরি ──
    let inventory = null;
    let missingCost = 0;
    if (companyWide) {
        const pa = prodAgg.rows[0];
        missingCost = parseInt(pa.missing_cost) || 0;
        const stock = summarizeStock(pa, srRows.rows);
        const products = classifyProducts(flagged.rows);
        const b = batches.rows[0];
        inventory = {
            stock,
            sr_holders: srRows.rows.slice(0, 5).map(r => ({ name: r.name, qty: num(r.qty), cost_value: round2(num(r.cost_value)) })),
            returned_stock:  { qty: num(pa.return_stock_qty), cost_value: round2(num(pa.return_stock_value)) },     // ফেরত এসে জমা
            defective_stock: { qty: num(pa.defective_qty),    cost_value: round2(num(pa.defective_value)) },       // ত্রুটিপূর্ণ
            products,
            expiry: {
                soon_days: EXPIRY_SOON_DAYS,
                expired: { count: parseInt(b.expired_count) || 0, value: round2(num(b.expired_value)) },
                soon:    { count: parseInt(b.soon_count) || 0,    value: round2(num(b.soon_value)) },
            },
        };
    }

    // ── রিটার্ন ──
    const salesRow = repl.rows[0];
    const returns = summarizeReturns(reasonRows.rows, {
        grossSales: num(salesRow.gross_sales),
        pending: pending.rows[0],
        customer: customer ? customer.rows[0] : {},
        replacement: { value: salesRow.replacement_value, count: salesRow.replacement_count },
    });
    const srReturns = flagSrReturns(srRet.rows);

    return {
        period: { from, to },
        inventory,                               // টিম-ভিউতে null
        returns,
        sr_returns: srReturns,
        alerts: buildAlerts({ inventory, returns, srReturns, missingCost }),
    };
};

module.exports = {
    getInventoryHealth,
    // pure — টেস্টের জন্য
    summarizeStock, classifyProducts, summarizeReturns, flagSrReturns, buildAlerts,
};
