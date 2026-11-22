// ============================================================
// স্বাস্থ্য-কার্ডের "বিস্তারিত" তালিকা
// কার্ডের প্রতিটি সংখ্যা/সতর্কতা ক্লিক করলে পুরো তালিকা (শীর্ষ ৫ নয়) দেখা যায়।
//
//   GET /api/reports/health-detail/:type?from=&to=
//   রেসপন্স: { title, note?, columns:[{key,label,type}], rows:[...], truncated }
//   কলামের type: text | money | num | date | pct
//
// প্রতিটি type-এর সংখ্যা কার্ডের সারাংশের সাথে একই ভিত্তিতে হিসাব করা (একই শর্ত)।
// 'company' স্কোপের তালিকা ম্যানেজারের টিম-ভিউতে দেওয়া হয় না (কোম্পানি-ব্যাপী ডেটা)।
// ============================================================

const { query } = require('../config/db');
const { ageDues, daysBetween } = require('./opsHealth.service');
const { forecastNextMonth, monthShift } = require('./financeHealth.service');
const { getPurchasePlan } = require('./purchasePlan.service');

const LIMIT = 500;
const num = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const hourBD = () => parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).format(new Date()), 10) % 24;
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monthStart = (d) => d.slice(0, 8) + '01';

const C = {
    text:  (key, label) => ({ key, label, type: 'text' }),
    money: (key, label) => ({ key, label, type: 'money' }),
    num:   (key, label) => ({ key, label, type: 'num' }),
    date:  (key, label) => ({ key, label, type: 'date' }),
    pct:   (key, label) => ({ key, label, type: 'pct' }),
};

const REASON_LABEL = {
    damaged: 'নষ্ট/ক্ষতিগ্রস্ত', expired: 'মেয়াদোত্তীর্ণ', wrong_item: 'ভুল পণ্য', wrong_product: 'ভুল পণ্য',
    excess: 'অতিরিক্ত', quality: 'মান সমস্যা', other: 'অন্যান্য',
};
const STATUS_LABEL = { pending: 'অপেক্ষমাণ', submitted: 'জমা দেওয়া, যাচাই বাকি', approved: 'অনুমোদিত', verified: 'যাচাইকৃত', rejected: 'বাতিল', completed: 'সম্পন্ন' };

// ── sold CTE: প্রতিটি পণ্যের ৬০/৩৬৫ দিনের বিক্রি ও শেষ বিক্রির তারিখ ──
const SOLD_CTE = `
    sold AS (
        SELECT i->>'product_id' AS pid,
               SUM(COALESCE((i->>'qty')::numeric,0)) FILTER (WHERE st.date >= $2) AS q60,
               MAX(st.date) AS last_sale
          FROM sales_transactions st
         CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(st.items) = 'array' THEN st.items ELSE '[]'::jsonb END) i
         WHERE st.tenant_id = $1 AND st.date >= $3
         GROUP BY 1)`;

const productFlagQuery = (where, select, order) => (ctx) => query(
    `WITH ${SOLD_CTE}
     SELECT ${select}
       FROM products p LEFT JOIN sold s ON s.pid = p.id::text
      WHERE p.tenant_id = $1 AND COALESCE(p.is_active, true) AND ${where}
      ORDER BY ${order} LIMIT ${LIMIT + 1}`,
    [ctx.tenant, addDays(ctx.today, -60), addDays(ctx.today, -365)]);

// ── রিটার্ন-আইটেম কুয়েরি (completed) ──
const returnItemsQuery = (ctx, lossOnly) => query(
    `SELECT to_char(rr.completed_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS date,
            u.name_bn AS sr, cu.shop_name AS customer, rr.type,
            COALESCE(NULLIF(i->>'reason',''), rr.reason, 'other') AS reason,
            p.name AS product,
            COALESCE((i->>'qty')::numeric,0) AS qty,
            COALESCE((i->>'subtotal')::numeric,0) AS value,
            COALESCE((i->>'qty')::numeric,0) * COALESCE(p.cost_price,0) AS cost
       FROM return_requests rr
       JOIN users u ON u.id = rr.sr_id
       LEFT JOIN customers cu ON cu.id = rr.customer_id
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(rr.items) = 'array' THEN rr.items ELSE '[]'::jsonb END) i
       LEFT JOIN products p ON p.id::text = i->>'product_id' AND p.tenant_id = rr.tenant_id
      WHERE rr.tenant_id = $1 AND rr.status = 'completed' AND rr.completed_at::date BETWEEN $2 AND $3
        ${lossOnly ? `AND COALESCE(NULLIF(i->>'reason',''), rr.reason, 'other') IN ('damaged','expired')` : ''} ${ctx.tc}
      ORDER BY rr.completed_at DESC LIMIT ${LIMIT + 1}`,
    ctx.p([ctx.tenant, ctx.from, ctx.to]));

const mapReason = (rows) => rows.map(r => ({ ...r, reason: REASON_LABEL[r.reason] || r.reason, type: r.type === 'exchange' ? 'বদলি' : 'ফেরত' }));

// ============================================================
// টাইপ রেজিস্ট্রি
// ============================================================
const TYPES = {
    // ─────────── স্টক (শুধু কোম্পানি-ব্যাপী) ───────────
    stock_all: {
        scope: 'company', title: 'গুদামের সব পণ্যের স্টক মূল্য', note: 'ক্রয়মূল্যে বেশি থেকে কম ক্রমে। ঋণাত্মক স্টক মূল্যে ধরা হয় না।',
        columns: [C.text('name', 'পণ্য'), C.num('stock', 'স্টক'), C.money('cost', 'ক্রয়মূল্য'), C.money('price', 'বিক্রয়মূল্য'), C.money('cost_value', 'ক্রয়মূল্যে মোট'), C.money('sale_value', 'বিক্রয়মূল্যে মোট')],
        run: (ctx) => query(
            `SELECT p.name, p.stock, COALESCE(p.cost_price,0) AS cost, COALESCE(p.price,0) AS price,
                    GREATEST(p.stock,0) * COALESCE(p.cost_price,0) AS cost_value,
                    GREATEST(p.stock,0) * COALESCE(p.price,0)      AS sale_value
               FROM products p WHERE p.tenant_id = $1 AND COALESCE(p.is_active,true)
              ORDER BY cost_value DESC, p.name LIMIT ${LIMIT + 1}`, [ctx.tenant]).then(r => r.rows),
    },
    stock_nocost: {
        scope: 'company', title: 'ক্রয়মূল্য ০ — স্টক আছে এমন পণ্য', note: 'এদের ক্রয়মূল্য দিন, নইলে স্টক মূল্য ও মুনাফা ভুল দেখাবে।',
        columns: [C.text('name', 'পণ্য'), C.num('stock', 'স্টক'), C.money('price', 'বিক্রয়মূল্য')],
        run: (ctx) => query(
            `SELECT name, stock, COALESCE(price,0) AS price FROM products
              WHERE tenant_id = $1 AND COALESCE(is_active,true) AND stock > 0 AND COALESCE(cost_price,0) = 0
              ORDER BY stock * COALESCE(price,0) DESC LIMIT ${LIMIT + 1}`, [ctx.tenant]).then(r => r.rows),
    },
    stock_out: {
        scope: 'company', title: 'স্টক শেষ, কিন্তু চলছে', note: 'স্টক ০ বা কম, অথচ গত ৬০ দিনে বিক্রি হয়েছে — বিক্রি হারানোর ঝুঁকি।',
        columns: [C.text('name', 'পণ্য'), C.num('stock', 'স্টক'), C.num('sold60', '৬০ দিনে বিক্রি'), C.date('last_sale', 'শেষ বিক্রি'), C.num('reorder_point', 'পুনঃঅর্ডার সীমা')],
        run: (ctx) => productFlagQuery('p.stock <= 0 AND COALESCE(s.q60,0) > 0',
            `p.name, p.stock, COALESCE(s.q60,0) AS sold60, to_char(s.last_sale,'YYYY-MM-DD') AS last_sale, p.reorder_point`, 'COALESCE(s.q60,0) DESC')(ctx).then(r => r.rows),
    },
    stock_low: {
        scope: 'company', title: 'পুনঃঅর্ডার দরকার', note: 'স্টক পুনঃঅর্ডার সীমার সমান বা নিচে। বেশি ঘাটতি আগে।',
        columns: [C.text('name', 'পণ্য'), C.num('stock', 'স্টক'), C.num('reorder_point', 'সীমা'), C.num('shortage', 'ঘাটতি'), C.num('sold60', '৬০ দিনে বিক্রি')],
        run: (ctx) => productFlagQuery('p.stock > 0 AND COALESCE(p.reorder_point,0) > 0 AND p.stock <= p.reorder_point',
            `p.name, p.stock, p.reorder_point, (p.reorder_point - p.stock) AS shortage, COALESCE(s.q60,0) AS sold60`, '(p.reorder_point - p.stock) DESC')(ctx).then(r => r.rows),
    },
    stock_dead: {
        scope: 'company', title: '৬০ দিনে বিক্রি হয়নি — আটকে থাকা স্টক', note: 'ক্রয়মূল্যে আটকে থাকা টাকা বেশি থেকে কম ক্রমে। "শেষ বিক্রি" ফাঁকা মানে গত ১ বছরে বিক্রি নেই।',
        columns: [C.text('name', 'পণ্য'), C.num('stock', 'স্টক'), C.money('cost', 'ক্রয়মূল্য'), C.money('value', 'আটকে থাকা টাকা'), C.date('last_sale', 'শেষ বিক্রি')],
        run: (ctx) => productFlagQuery('p.stock > 0 AND COALESCE(s.q60,0) = 0',
            `p.name, p.stock, COALESCE(p.cost_price,0) AS cost, p.stock * COALESCE(p.cost_price,0) AS value, to_char(s.last_sale,'YYYY-MM-DD') AS last_sale`, 'value DESC, p.name')(ctx).then(r => r.rows),
    },
    stock_returned: {
        scope: 'company', title: 'ফেরত স্টক (ফেরত এসে জমা)', columns: [C.text('name', 'পণ্য'), C.num('qty', 'পরিমাণ'), C.money('cost_value', 'ক্রয়মূল্যে')],
        run: (ctx) => query(`SELECT name, return_stock AS qty, return_stock * COALESCE(cost_price,0) AS cost_value FROM products
                              WHERE tenant_id = $1 AND COALESCE(return_stock,0) > 0 ORDER BY cost_value DESC LIMIT ${LIMIT + 1}`, [ctx.tenant]).then(r => r.rows),
    },
    stock_defective: {
        scope: 'company', title: 'ত্রুটিপূর্ণ স্টক', columns: [C.text('name', 'পণ্য'), C.num('qty', 'পরিমাণ'), C.money('cost_value', 'ক্রয়মূল্যে')],
        run: (ctx) => query(`SELECT name, defective_stock AS qty, defective_stock * COALESCE(cost_price,0) AS cost_value FROM products
                              WHERE tenant_id = $1 AND COALESCE(defective_stock,0) > 0 ORDER BY cost_value DESC LIMIT ${LIMIT + 1}`, [ctx.tenant]).then(r => r.rows),
    },
    stock_sr: {
        scope: 'company', title: 'SR-দের হাতে থাকা স্টক', note: 'SR-এর লেজার (অর্ডার গ্রহণ − বিক্রি − ফেরত) অনুযায়ী, শুধু ধনাত্মক ব্যালেন্স।',
        columns: [C.text('sr', 'SR'), C.text('product', 'পণ্য'), C.num('qty', 'পরিমাণ'), C.money('cost_value', 'ক্রয়মূল্যে'), C.money('sale_value', 'বিক্রয়মূল্যে')],
        run: (ctx) => query(
            `WITH b AS (SELECT worker_id, product_id::text AS pid, SUM(direction * qty) AS q
                          FROM sr_stock_ledger WHERE tenant_id = $1
                         GROUP BY worker_id, product_id::text HAVING SUM(direction * qty) > 0)
             SELECT u.name_bn AS sr, p.name AS product, b.q AS qty,
                    b.q * COALESCE(p.cost_price,0) AS cost_value, b.q * COALESCE(p.price,0) AS sale_value
               FROM b JOIN products p ON p.id::text = b.pid AND p.tenant_id = $1 JOIN users u ON u.id = b.worker_id
              ORDER BY cost_value DESC LIMIT ${LIMIT + 1}`, [ctx.tenant]).then(r => r.rows),
    },

    purchase_plan: {
        scope: 'company', title: 'ক্রয় পরামর্শ — কোন পণ্য কত কিনতে হবে', note: 'গতি = জানালায় বিক্রি ÷ দিন। লক্ষ্য = গতি × (ডেলিভারি + নিরাপত্তা দিন)। হাতে = গুদাম + SR; পথে = অর্ডার দেওয়া PO। জরুরি আগে, তারপর বেশি মুনাফার পণ্য।',
        columns: [C.text('name', 'পণ্য'), C.text('urgency_label', 'অবস্থা'), C.num('warehouse', 'গুদামে'), C.num('sr_hand', 'SR-এর হাতে'), C.num('on_order', 'পথে'), C.num('velocity', 'গতি/দিন'),
                  C.num('cover_days', 'চলবে (দিন)'), C.num('need', 'কিনুন'), C.money('cost', 'আনুমানিক খরচ'), C.pct('margin_pct', 'মার্জিন')],
        run: async (ctx) => (await getPurchasePlan({ tenantId: ctx.tenant, teamFilter: null })).rows,
    },

    // ─────────── বকেয়া ও আদায় ───────────
    dues: {
        scope: 'company', title: 'দোকান অনুযায়ী বকেয়া', note: 'বয়স = বিক্রির তারিখ থেকে আজ (পুরোনো আদায় আগে কাটা ধরে)। "বয়স অজানা" = কোনো ইনভয়েসের সাথে মেলে না এমন বকেয়া।',
        columns: [C.text('name', 'দোকান'), C.money('due', 'মোট বকেয়া'), C.money('limit', 'ক্রেডিট সীমা'), C.pct('used_pct', 'সীমার %'),
                  C.money('d0_30', '০–৩০ দিন'), C.money('d31_60', '৩১–৬০'), C.money('d61_90', '৬১–৯০'), C.money('d90p', '৯০+'), C.money('unexplained', 'বয়স অজানা'), C.num('oldest_days', 'সবচেয়ে পুরোনো (দিন)')],
        run: async (ctx) => {
            const [custs, invs] = await Promise.all([
                query(`SELECT id, shop_name, current_credit, credit_limit FROM customers
                        WHERE tenant_id = $1 AND is_active IS NOT FALSE AND current_credit > 0`, [ctx.tenant]),
                query(`SELECT st.customer_id, to_char(st.date,'YYYY-MM-DD') AS date,
                              GREATEST(st.credit_used - COALESCE(pa.allocated,0), 0) AS remaining
                         FROM sales_transactions st
                         LEFT JOIN (SELECT sale_id, SUM(amount) AS allocated FROM payment_allocations WHERE tenant_id = $1 GROUP BY sale_id) pa ON pa.sale_id = st.id
                        WHERE st.tenant_id = $1 AND st.credit_used > 0 AND st.credit_used - COALESCE(pa.allocated,0) > 0
                          AND st.customer_id IN (SELECT id FROM customers WHERE tenant_id = $1 AND current_credit > 0)`, [ctx.tenant]),
            ]);
            const aged = ageDues(custs.rows, invs.rows, ctx.today, true);
            return aged.rows.map(r => ({ ...r, used_pct: r.limit > 0 ? round2((r.due / r.limit) * 100) : null }))
                            .sort((a, b) => b.due - a.due);
        },
    },
    transit: {
        scope: 'team', title: 'SR-এর হাতে আদায় — জমা/যাচাই হয়নি', note: 'প্রতিটি আদায়ের আলাদা সারি। পুরোনো আগে।',
        columns: [C.date('date', 'আদায়ের তারিখ'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.money('amount', 'পরিমাণ'), C.text('mode', 'মাধ্যম'), C.text('status', 'অবস্থা'), C.num('age', 'বয়স (দিন)')],
        run: (ctx) => query(
            `SELECT to_char(c.created_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS date, u.name_bn AS sr, cu.shop_name AS customer,
                    c.amount, c.payment_mode AS mode, c.status
               FROM collections c JOIN users u ON u.id = c.sr_id LEFT JOIN customers cu ON cu.id = c.customer_id
              WHERE c.tenant_id = $1 AND c.status IN ('pending','submitted') ${ctx.tc}
              ORDER BY c.created_at LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant]))
            .then(r => r.rows.map(x => ({ ...x, status: STATUS_LABEL[x.status] || x.status, age: Math.max(daysBetween(x.date, ctx.today), 0) }))),
    },
    collections_today: {
        scope: 'team', title: 'আজকের আদায় (কালেকশন)', note: 'বাতিল হওয়াগুলো বাদ।',
        columns: [C.text('time', 'সময়'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.money('amount', 'পরিমাণ'), C.text('mode', 'মাধ্যম'), C.text('status', 'অবস্থা')],
        run: (ctx) => query(
            `SELECT to_char(c.created_at AT TIME ZONE 'Asia/Dhaka','HH24:MI') AS time, u.name_bn AS sr, cu.shop_name AS customer,
                    c.amount, c.payment_mode AS mode, c.status
               FROM collections c JOIN users u ON u.id = c.sr_id LEFT JOIN customers cu ON cu.id = c.customer_id
              WHERE c.tenant_id = $1 AND c.status <> 'rejected'
                AND (c.created_at AT TIME ZONE 'Asia/Dhaka')::date = '${ctx.today}' ${ctx.tc}
              ORDER BY c.created_at DESC LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant]))
            .then(r => r.rows.map(x => ({ ...x, status: STATUS_LABEL[x.status] || x.status }))),
    },
    sr_dues: {
        scope: 'team', title: 'SR-এর কাছে কোম্পানির পাওনা', note: 'ঘাটতি/নগদ গরমিল থেকে জমা হওয়া।',
        columns: [C.text('sr', 'SR'), C.money('cash_dues', 'নগদ পাওনা'), C.money('outstanding_dues', 'অন্যান্য পাওনা'), C.money('total', 'মোট')],
        run: (ctx) => query(
            `SELECT u.name_bn AS sr, COALESCE(u.cash_dues,0) AS cash_dues, COALESCE(u.outstanding_dues,0) AS outstanding_dues,
                    COALESCE(u.cash_dues,0) + COALESCE(u.outstanding_dues,0) AS total
               FROM users u WHERE u.tenant_id = $1 AND u.role = 'worker' ${ctx.tc}
                AND COALESCE(u.cash_dues,0) + COALESCE(u.outstanding_dues,0) > 0
              ORDER BY total DESC LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant])).then(r => r.rows),
    },

    // ─────────── SR পারফরম্যান্স ───────────
    sr_today: {
        scope: 'team', title: 'সব SR — আজকের অবস্থা ও মাসিক টার্গেট', note: 'টার্গেট অর্জন = এ মাসের নিট বিক্রি ÷ মাসিক টার্গেট।',
        columns: [C.text('name', 'SR'), C.text('status', 'আজ'), C.num('visits', 'ভিজিট'), C.money('sales_today', 'আজ বিক্রি'), C.money('sales_mtd', 'এ মাসে বিক্রি'), C.money('target', 'মাসিক টার্গেট'), C.pct('achieved_pct', 'অর্জন')],
        run: async (ctx) => {
            const hour = hourBD(), mStart = monthStart(ctx.today);
            const [w, att, leave, vis, st, sm] = await Promise.all([
                query(`SELECT u.id, u.name_bn AS name, COALESCE(u.monthly_target,0) AS target FROM users u
                        WHERE u.tenant_id = $1 AND u.role = 'worker' AND u.status = 'active' ${ctx.tc} ORDER BY u.name_bn`, ctx.p([ctx.tenant])),
                query(`SELECT a.user_id, a.status::text AS status FROM attendance a JOIN users u ON u.id = a.user_id
                        WHERE a.tenant_id = $1 AND a.date = '${ctx.today}' ${ctx.tc}`, ctx.p([ctx.tenant])),
                query(`SELECT l.user_id FROM leave_requests l JOIN users u ON u.id = l.user_id
                        WHERE l.tenant_id = $1 AND l.status = 'approved' AND '${ctx.today}' BETWEEN l.start_date AND l.end_date ${ctx.tc}`, ctx.p([ctx.tenant])),
                query(`SELECT v.worker_id, COUNT(*) AS n FROM visits v JOIN users u ON u.id = v.worker_id
                        WHERE v.tenant_id = $1 AND v.visit_date = '${ctx.today}' ${ctx.tc} GROUP BY v.worker_id`, ctx.p([ctx.tenant])),
                query(`SELECT st.worker_id, SUM(COALESCE(st.net_amount, st.total_amount)) AS a FROM sales_transactions st JOIN users u ON u.id = st.worker_id
                        WHERE st.tenant_id = $1 AND st.date = '${ctx.today}' ${ctx.tc} GROUP BY st.worker_id`, ctx.p([ctx.tenant])),
                query(`SELECT st.worker_id, SUM(COALESCE(st.net_amount, st.total_amount)) AS a FROM sales_transactions st JOIN users u ON u.id = st.worker_id
                        WHERE st.tenant_id = $1 AND st.date BETWEEN '${mStart}' AND '${ctx.today}' ${ctx.tc} GROUP BY st.worker_id`, ctx.p([ctx.tenant])),
            ]);
            const A = new Map(att.rows.map(r => [r.user_id, r.status])), L = new Set(leave.rows.map(r => r.user_id));
            const V = new Map(vis.rows.map(r => [r.worker_id, parseInt(r.n)])), T = new Map(st.rows.map(r => [r.worker_id, num(r.a)])), M = new Map(sm.rows.map(r => [r.worker_id, num(r.a)]));
            return w.rows.map(r => {
                const s = A.get(r.id);
                const status = L.has(r.id) || s === 'leave' ? 'ছুটিতে' : s === 'late' ? 'দেরিতে এসেছেন' : s === 'present' ? 'উপস্থিত' : hour >= 10 ? 'অনুপস্থিত' : 'এখনো আসেননি';
                const target = num(r.target), mtd = M.get(r.id) || 0;
                return { name: r.name, status, visits: V.get(r.id) || 0, sales_today: T.get(r.id) || 0, sales_mtd: round2(mtd), target, achieved_pct: target > 0 ? round2((mtd / target) * 100) : null };
            });
        },
    },
    commissions_unpaid: {
        scope: 'team', title: 'কমিশন পরিশোধ বাকি', columns: [C.text('sr', 'SR'), C.text('period', 'মাস'), C.money('commission_amount', 'কমিশন'), C.money('net_payable', 'প্রদেয়')],
        run: (ctx) => query(
            `SELECT u.name_bn AS sr, m.year || '-' || LPAD(m.month::text,2,'0') AS period, m.commission_amount, COALESCE(m.net_payable, m.commission_amount) AS net_payable
               FROM monthly_commissions m JOIN users u ON u.id = m.worker_id
              WHERE m.tenant_id = $1 AND NOT m.paid ${ctx.tc} ORDER BY m.year DESC, m.month DESC LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant])).then(r => r.rows),
    },

    // ─────────── রিটার্ন / রিপ্লেসমেন্ট ───────────
    returns: {
        scope: 'team', title: 'রিটার্ন/বদলি — আইটেম ধরে (সম্পন্ন)', note: 'ভ্যাটসহ মূল্য (বিক্রির মোটের সাথে তুলনীয়)।',
        columns: [C.date('date', 'তারিখ'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.text('type', 'ধরন'), C.text('reason', 'কারণ'), C.text('product', 'পণ্য'), C.num('qty', 'পরিমাণ'), C.money('value', 'মূল্য')],
        run: (ctx) => returnItemsQuery(ctx, false).then(r => mapReason(r.rows)),
    },
    returns_loss: {
        scope: 'team', title: 'নষ্ট/মেয়াদোত্তীর্ণ ফেরত — ক্ষতি', note: 'এগুলো ফেরত পাওয়ার নয়, ক্রয়মূল্যই সরাসরি ক্ষতি।',
        columns: [C.date('date', 'তারিখ'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.text('reason', 'কারণ'), C.text('product', 'পণ্য'), C.num('qty', 'পরিমাণ'), C.money('cost', 'ক্ষতি (ক্রয়মূল্যে)')],
        run: (ctx) => returnItemsQuery(ctx, true).then(r => mapReason(r.rows)),
    },
    returns_pending: {
        scope: 'team', title: 'অপেক্ষমাণ রিটার্ন/বদলি অনুরোধ', columns: [C.date('date', 'অনুরোধের তারিখ'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.text('type', 'ধরন'), C.text('status', 'অবস্থা'), C.money('value', 'মূল্য')],
        run: (ctx) => query(
            `SELECT to_char(rr.created_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS date, u.name_bn AS sr, cu.shop_name AS customer, rr.type, rr.status, rr.total_value AS value
               FROM return_requests rr JOIN users u ON u.id = rr.sr_id LEFT JOIN customers cu ON cu.id = rr.customer_id
              WHERE rr.tenant_id = $1 AND rr.status IN ('pending','approved') AND rr.created_at::date BETWEEN $2 AND $3 ${ctx.tc}
              ORDER BY rr.created_at LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant, ctx.from, ctx.to]))
            .then(r => r.rows.map(x => ({ ...x, type: x.type === 'exchange' ? 'বদলি' : 'ফেরত', status: STATUS_LABEL[x.status] || x.status }))),
    },
    replacement: {
        scope: 'team', title: 'রিপ্লেসমেন্ট (বদলি) দেওয়া বিক্রি', columns: [C.date('date', 'তারিখ'), C.text('invoice', 'ইনভয়েস'), C.text('sr', 'SR'), C.text('customer', 'দোকান'), C.money('value', 'বদলির মূল্য')],
        run: (ctx) => query(
            `SELECT to_char(st.date,'YYYY-MM-DD') AS date, st.invoice_number AS invoice, u.name_bn AS sr, cu.shop_name AS customer, st.replacement_value AS value
               FROM sales_transactions st JOIN users u ON u.id = st.worker_id LEFT JOIN customers cu ON cu.id = st.customer_id
              WHERE st.tenant_id = $1 AND st.date BETWEEN $2 AND $3 AND COALESCE(st.replacement_value,0) > 0 ${ctx.tc}
              ORDER BY st.date DESC LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant, ctx.from, ctx.to])).then(r => r.rows),
    },

    // ─────────── খরচ ও নগদ ───────────
    pending_expense_reports: {
        scope: 'team', title: 'অনুমোদনের অপেক্ষায় SR খরচ', note: '০ টাকার রিপোর্ট বাদ।',
        columns: [C.date('date', 'তারিখ'), C.text('sr', 'SR'), C.money('transport', 'যাতায়াত'), C.money('food', 'খাবার'), C.money('misc', 'অন্যান্য'), C.money('total', 'মোট'), C.text('over', 'সীমা ছাড়া?'), C.text('reason', 'কারণ')],
        run: (ctx) => query(
            `SELECT to_char(er.report_date,'YYYY-MM-DD') AS date, u.name_bn AS sr, er.transport_cost AS transport, er.food_cost AS food, er.misc_cost AS misc,
                    er.total_amount AS total, CASE WHEN er.over_limit THEN 'হ্যাঁ' ELSE '' END AS over, er.over_limit_reason AS reason
               FROM expense_reports er JOIN users u ON u.id = er.worker_id
              WHERE er.tenant_id = $1 AND er.status = 'pending' AND er.total_amount > 0 AND er.report_date BETWEEN $2 AND $3 ${ctx.tc}
              ORDER BY er.report_date LIMIT ${LIMIT + 1}`, ctx.p([ctx.tenant, ctx.from, ctx.to])).then(r => r.rows),
    },
    expense_list: {
        scope: 'company', title: 'খরচের তালিকা', note: 'কোম্পানির খরচ, অনুমোদিত SR খরচ, নির্দিষ্ট মাসিক ও অগ্রিম কিস্তি — সব `expenses` টেবিল থেকে।',
        columns: [C.date('date', 'তারিখ'), C.text('type', 'খাত'), C.money('amount', 'পরিমাণ'), C.text('paid_to', 'কাকে'), C.text('source', 'উৎস'), C.text('note', 'নোট')],
        run: (ctx) => query(
            `SELECT to_char(date,'YYYY-MM-DD') AS date, expense_type AS type, amount, paid_to, source, note FROM expenses
              WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date DESC, created_at DESC LIMIT ${LIMIT + 1}`, [ctx.tenant, ctx.from, ctx.to])
            .then(r => r.rows.map(x => ({ ...x, source: { manual: 'হাতে যোগ', recurring: 'নির্দিষ্ট মাসিক', prepaid: 'অগ্রিম কিস্তি', sr_expense: 'SR খরচ' }[x.source] || x.source || '' }))),
    },
    expense_budget: {
        scope: 'company', title: 'চলতি মাসের বাজেট বনাম আসল খরচ', note: 'চলতি মাসের (পুরো মাস) হিসাব। বাজেট না থাকলে "—"।',
        columns: [C.text('name', 'খাত'), C.money('budget', 'বাজেট'), C.money('actual', 'আসল খরচ'), C.pct('pct', 'ব্যবহার'), C.money('remaining', 'বাকি')],
        run: async (ctx) => {
            const cur = monthShift(ctx.today, 0);
            const [cats, budgets, actuals] = await Promise.all([
                query(`SELECT id, name FROM expense_categories WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order, name`, [ctx.tenant]),
                query(`SELECT category_id, month, amount FROM expense_budgets WHERE tenant_id = $1 AND (month IS NULL OR month = $2)`, [ctx.tenant, cur.start]),
                query(`SELECT expense_type, COALESCE(SUM(amount),0) AS amount FROM expenses WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY expense_type`, [ctx.tenant, cur.start, cur.end]),
            ]);
            const A = new Map(actuals.rows.map(r => [r.expense_type, num(r.amount)]));
            return cats.rows.map(c => {
                const hit = budgets.rows.find(b => b.category_id === c.id && b.month) || budgets.rows.find(b => b.category_id === c.id && !b.month);
                const budget = hit ? num(hit.amount) : null, actual = A.get(c.name) || 0;
                return { name: c.name, budget, actual, pct: budget > 0 ? round2((actual / budget) * 100) : null, remaining: budget !== null ? round2(budget - actual) : null };
            }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
        },
    },
    cash_daily: {
        scope: 'company', title: 'দিন ধরে নগদ প্রবাহ', note: 'আদায় = নগদ বিক্রি + যাচাইকৃত কালেকশন। খরচ = দেওয়া খরচ + বেতন।',
        columns: [C.date('date', 'তারিখ'), C.money('cash_sales', 'নগদ বিক্রি'), C.money('collections', 'কালেকশন'), C.money('expenses', 'খরচ'), C.money('salary', 'বেতন'), C.money('net', 'নিট')],
        run: (ctx) => query(
            `WITH d AS (SELECT date AS dt, SUM(cash_received) AS v FROM sales_transactions WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY 1),
                  c AS (SELECT (created_at AT TIME ZONE 'Asia/Dhaka')::date AS dt, SUM(amount) AS v FROM collections
                         WHERE tenant_id = $1 AND status NOT IN ('pending','submitted','rejected')
                           AND (created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN $2 AND $3 GROUP BY 1),
                  e AS (SELECT date AS dt, SUM(amount) AS v FROM expenses WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY 1),
                  s AS (SELECT paid_at::date AS dt, SUM(net_payable) AS v FROM salary_payments WHERE tenant_id = $1 AND status = 'paid' AND paid_at::date BETWEEN $2 AND $3 GROUP BY 1),
                  k AS (SELECT dt FROM d UNION SELECT dt FROM c UNION SELECT dt FROM e UNION SELECT dt FROM s)
             SELECT to_char(k.dt,'YYYY-MM-DD') AS date, COALESCE(d.v,0) AS cash_sales, COALESCE(c.v,0) AS collections, COALESCE(e.v,0) AS expenses, COALESCE(s.v,0) AS salary,
                    COALESCE(d.v,0) + COALESCE(c.v,0) - COALESCE(e.v,0) - COALESCE(s.v,0) AS net
               FROM k LEFT JOIN d USING (dt) LEFT JOIN c USING (dt) LEFT JOIN e USING (dt) LEFT JOIN s USING (dt)
              ORDER BY k.dt DESC LIMIT ${LIMIT + 1}`, [ctx.tenant, ctx.from, ctx.to]).then(r => r.rows),
    },
    forecast: {
        scope: 'company', title: 'পরের মাসের আনুমানিক খরচ — উপাদান', note: 'পরিবর্তনশীল = গত ৩ পূর্ণ মাসের গড় (নির্দিষ্ট মাসিক ও অগ্রিম কিস্তি বাদে)।',
        columns: [C.text('kind', 'ধরন'), C.text('name', 'খাত/বিবরণ'), C.money('amount', 'পরের মাসে')],
        run: async (ctx) => {
            const next = monthShift(ctx.today, 1), threeAgo = monthShift(ctx.today, -3).start, lastEnd = monthShift(ctx.today, -1).end;
            const [vm, rec, pre] = await Promise.all([
                query(`SELECT COALESCE(SUM(amount),0) AS amount FROM expenses
                        WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 AND COALESCE(source,'manual') NOT IN ('recurring','prepaid')
                        GROUP BY date_trunc('month', date)`, [ctx.tenant, threeAgo, lastEnd]),
                query(`SELECT expense_type, paid_to, amount FROM recurring_expenses
                        WHERE tenant_id = $1 AND is_active = true AND start_date <= $3 AND (end_date IS NULL OR end_date >= $2) ORDER BY amount DESC`, [ctx.tenant, next.start, next.end]),
                query(`SELECT expense_type, paid_to, total_amount, months, start_month FROM prepaid_expenses WHERE tenant_id = $1`, [ctx.tenant]),
            ]);
            const f = forecastNextMonth({ variableByMonth: vm.rows.map(r => num(r.amount)), recurringActive: rec.rows, prepaid: pre.rows, nextMonthStart: next.start });
            const rows = [{ kind: 'পরিবর্তনশীল', name: `গত ${f.basis_months} মাসের গড়`, amount: f.variable_avg }];
            rec.rows.forEach(r => rows.push({ kind: 'নির্দিষ্ট মাসিক', name: [r.expense_type, r.paid_to].filter(Boolean).join(' — '), amount: num(r.amount) }));
            const [ny, nm] = next.start.split('-').map(Number), nextIdx = ny * 12 + (nm - 1);
            pre.rows.forEach(r => {
                const [sy, sm] = String(r.start_month).slice(0, 7).split('-').map(Number), si = sy * 12 + (sm - 1);
                if (nextIdx >= si && nextIdx < si + Number(r.months)) rows.push({ kind: 'অগ্রিম কিস্তি', name: [r.expense_type, r.paid_to].filter(Boolean).join(' — '), amount: round2(num(r.total_amount) / Number(r.months)) });
            });
            rows.push({ kind: 'মোট', name: '', amount: f.total });
            return rows;
        },
    },
};

// ── সতর্কতার code → বিস্তারিত type (ফ্রন্টএন্ডও একই ম্যাপ ব্যবহার করে) ──
const ALERT_DETAIL = {
    budget_exceeded: 'expense_budget', budget_80: 'expense_budget', pending_sr_expense: 'pending_expense_reports',
    profit_without_cash: 'cash_daily', missing_cost: 'stock_nocost', expired_stock: null, expiring_soon: null,
    out_of_stock_demand: 'stock_out', low_stock: 'stock_low', dead_stock: 'stock_dead',
    return_rate_high: 'returns', return_rate: 'returns', return_loss: 'returns_loss', return_pending: 'returns_pending', sr_return_spike: 'returns',
    overdue_heavy: 'dues', overdue: 'dues', unexplained_due: 'dues', over_limit: 'dues', near_limit: 'dues',
    collections_in_transit: 'transit', sr_owes: 'sr_dues',
    sr_absent: 'sr_today', sr_zero_visit: 'sr_today', sr_zero_sales: 'sr_today', sr_behind_target: 'sr_today', commission_unpaid: 'commissions_unpaid',
};

// ============================================================
const getHealthDetail = async (req, type) => {
    const def = TYPES[type];
    if (!def) { const e = new Error('unknown type'); e.status = 404; throw e; }
    const team = !!req.teamFilter;
    const today = todayBD();
    const ctx = {
        tenant: req.tenantId, today,
        from: req.query.from || monthStart(today), to: req.query.to || today,
        // টিম-ভিউ: ম্যানেজারের নিজের SR-দের সারি। `$N` = base প্যারামিটার সংখ্যা + ১ (PARAM_COUNT), শেষ প্যারামিটার = manager id
        tc: team ? `AND u.manager_id = $${PARAM_COUNT[type] || 2}` : '',
        p: (base) => (team ? [...base, req.teamFilter] : base),
    };

    if (team && def.scope === 'company') {
        return { type, title: def.title, note: 'এই তালিকা শুধু অ্যাডমিন/অ্যাকাউন্ট্যান্ট দেখতে পারেন (কোম্পানি-ব্যাপী তথ্য)।', columns: def.columns, rows: [], truncated: false };
    }
    const rows = await def.run(ctx);
    const truncated = rows.length > LIMIT;
    return { type, title: def.title, note: def.note || null, columns: def.columns, rows: truncated ? rows.slice(0, LIMIT) : rows, truncated, limit: LIMIT };
};

// টিম-ক্লজ `$N`: base প্যারামিটার সংখ্যা + ১ (শুধু tenant → ২; tenant+from+to → ৪)
const PARAM_COUNT = {
    transit: 2, collections_today: 2, sr_dues: 2, sr_today: 2, commissions_unpaid: 2,
    returns: 4, returns_loss: 4, returns_pending: 4, replacement: 4, pending_expense_reports: 4,
};

module.exports = { getHealthDetail, TYPES, ALERT_DETAIL, PARAM_COUNT };
