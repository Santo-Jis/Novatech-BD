// backend/src/services/settlementCash.service.js
//
// SR-এর "সিস্টেম হিসাব" (প্রত্যাশিত নগদ জমা) বের করার একমাত্র জায়গা।
// settlement.controller.js (createSettlement + আজকের প্রিভিউ) ও collection.controller.js
// (settlement-summary) — তিনটাই এখান থেকে নেয়, যাতে স্ক্রিনে যা দেখায় আর জমার সময় সার্ভার
// যা মেলায় তা সবসময় একই থাকে।
//
// প্রত্যাশিত নগদ = ক) বিক্রির নগদ  +  খ) বাকি আদায়ের নগদ (collections, mode = cash)
//                  +  গ) পুরনো পথের আদায় (credit_payments)
//
// ✅ জমা-না-দেওয়া দিনের হিসাব জমে থাকে (carry-over):
//   হিসাবের সময়সীমা = (SR-এর সর্বশেষ settlement জমার মুহূর্ত, আজ] — অর্থাৎ সর্বশেষ
//   জমার পরে যা কিছু ঘটেছে। SR কয়েক দিন হিসাব না দিলে সব দিনের নগদ একসাথে পরের
//   settlement-এ আসে। আগে কখনো জমা না দিয়ে থাকলে শুরু থেকে সব।
//   • বিক্রি ও credit_payments: created_at > সর্বশেষ জমার সময়, তারিখ <= আজ।
//     (তারিখ নয়, সময় — নইলে জমা দেওয়ার পরে একই দিনে করা বিক্রি/আদায় কোনো
//     settlement-এ না গিয়ে হারিয়ে যেত।)
//   • collections: status = 'pending' (এখনো কোনো settlement-এ জমা হয়নি) ও তারিখ <= আজ —
//     তাই জমার পরে একই দিনে নেওয়া আদায়ও হারায় না, পরের জমায় আসে
//
// কী ধরা হয় না (ইচ্ছাকৃত — SR-এর হাতে নগদ আসেনি):
//   • credit_used           — বাকি বিক্রি
//   • credit_balance_used   — কাস্টমারের অগ্রিম ব্যালেন্স থেকে কাটা (ডিসকাউন্টের মতো)
//   • replacement_value     — রিপ্লেসমেন্ট/রিটার্ন পণ্যের মূল্য। এটা বিক্রির net_amount থেকে
//                             আগেই বাদ গেছে, তাই cash_received নিজেই কমে এসেছে। আলাদা করে
//                             বাদ দিলে দুইবার কাটা পড়ত।
//   • credit_balance_added  — রিপ্লেসমেন্ট বিলের চেয়ে বেশি হলে কাস্টমারের অগ্রিম; নগদ নয়
//   • cheque / bkash / nagad আদায় — আলাদা দেখানো হয়, কিন্তু SR-এর হাতের নগদে ধরা হয় না
//   • rejected আদায়         — বাতিল
//
// ⚠️ তারিখ সবসময় BD (Asia/Dhaka)। আগে `created_at::date` ছিল, যা DB session timezone
//    (UTC) ধরে — রাত ১২টা–ভোর ৬টার আদায় আগের দিনে পড়ে যেত।

const { query: defaultQuery } = require('../config/db');

const BD_TZ = 'Asia/Dhaka';
const num = (v) => parseFloat(v) || 0;

/**
 * @param {object}  p
 * @param {string}  p.workerId
 * @param {string}  p.tenantId
 * @param {string}  p.date      BD তারিখ (YYYY-MM-DD)
 * @param {object} [p.db]       transaction client (না দিলে সাধারণ query)
 */
const NO_LOWER_BOUND = '1900-01-01T00:00:00Z';

/**
 * SR-এর সর্বশেষ জমা দেওয়া settlement (আজ বা তার আগের তারিখের)।
 * @returns {{date: string, at: Date|string}|null}
 */
const getLastSettlement = async ({ workerId, tenantId, date, db }) => {
    const run = db ? (sql, params) => db.query(sql, params) : defaultQuery;
    const r = await run(
        `SELECT TO_CHAR(settlement_date, 'YYYY-MM-DD') AS last_date,
                created_at                              AS last_at
           FROM daily_settlements
          WHERE worker_id = $1 AND tenant_id = $2 AND settlement_date <= $3::date
          ORDER BY created_at DESC
          LIMIT 1`,
        [workerId, tenantId, date]
    );
    const row = r.rows[0];
    return row?.last_date ? { date: row.last_date, at: row.last_at } : null;
};

/**
 * @param {object}  p
 * @param {string}  p.workerId
 * @param {string}  p.tenantId
 * @param {string}  p.date      BD তারিখ (YYYY-MM-DD) — সময়সীমার শেষ (আজ)
 * @param {object} [p.db]       transaction client (না দিলে সাধারণ query)
 */
const getTodayCashBreakdown = async ({ workerId, tenantId, date, db }) => {
    const run = db ? (sql, params) => db.query(sql, params) : defaultQuery;

    // সময়সীমার শুরু (এই মুহূর্ত বাদ) = সর্বশেষ জমার সময়
    const last       = await getLastSettlement({ workerId, tenantId, date, db });
    const windowFrom = last ? last.date : null;
    const from       = last ? last.at   : NO_LOWER_BOUND;

    // ক) বিক্রি
    const salesRes = await run(
        `SELECT
            COALESCE(SUM(total_amount), 0)        AS total_sales,
            COALESCE(SUM(cash_received), 0)       AS sales_cash,
            COALESCE(SUM(credit_used), 0)         AS credit_given,
            COALESCE(SUM(replacement_value), 0)   AS replacement_value,
            COALESCE(SUM(credit_balance_used), 0) AS old_credit_collected
         FROM sales_transactions
         WHERE worker_id = $1 AND tenant_id = $3
           AND created_at > $4::timestamptz AND date <= $2::date`,
        [workerId, date, tenantId, from]
    );

    // খ) বাকি আদায় — এখনো জমা-না-হওয়া (pending) সব, তারিখ <= আজ
    //    বিক্রির সাথে বিলের বেশি নেওয়া টাকাও এখানেই আসে (balance_applied = true)
    const colRes = await run(
        `SELECT
            COUNT(*)::int AS count,
            COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'cash'), 0)  AS cash_amount,
            COALESCE(SUM(amount) FILTER (WHERE payment_mode <> 'cash'), 0) AS non_cash_amount,
            COUNT(*) FILTER (WHERE payment_mode = 'cash')::int             AS cash_count
         FROM collections
         WHERE sr_id = $1 AND tenant_id = $3
           AND (created_at AT TIME ZONE '${BD_TZ}')::date <= $2::date
           AND status = 'pending'`,
        [workerId, date, tenantId]
    );

    // গ) পুরনো পথ — POST /customers/:id/collect-credit এখনও credit_payments-এ লেখে
    const cpRes = await run(
        `SELECT
            COUNT(*)::int                  AS count,
            COALESCE(SUM(amount), 0)       AS cash_amount
         FROM credit_payments
         WHERE COALESCE(collected_by, worker_id) = $1 AND tenant_id = $3
           AND created_at > $4::timestamptz
           AND (created_at AT TIME ZONE '${BD_TZ}')::date <= $2::date
           AND (payment_method IS NULL OR payment_method = 'cash')`,
        [workerId, date, tenantId, from]
    );

    // ঘ) আগের দিনগুলোর নগদ (আজ বাদে) — দিনভিত্তিক, স্ক্রিনে "জমা বাকি" দেখাতে
    const carryRes = await run(
        `SELECT TO_CHAR(d, 'YYYY-MM-DD') AS day, SUM(amt) AS cash
           FROM (
                SELECT date AS d, SUM(cash_received) AS amt
                  FROM sales_transactions
                 WHERE worker_id = $1 AND tenant_id = $3
                   AND created_at > $4::timestamptz AND date < $2::date
                 GROUP BY date
                UNION ALL
                SELECT (created_at AT TIME ZONE '${BD_TZ}')::date, SUM(amount)
                  FROM collections
                 WHERE sr_id = $1 AND tenant_id = $3 AND status = 'pending' AND payment_mode = 'cash'
                   AND (created_at AT TIME ZONE '${BD_TZ}')::date < $2::date
                 GROUP BY 1
                UNION ALL
                SELECT (created_at AT TIME ZONE '${BD_TZ}')::date, SUM(amount)
                  FROM credit_payments
                 WHERE COALESCE(collected_by, worker_id) = $1 AND tenant_id = $3
                   AND (payment_method IS NULL OR payment_method = 'cash')
                   AND created_at > $4::timestamptz
                   AND (created_at AT TIME ZONE '${BD_TZ}')::date < $2::date
                 GROUP BY 1
           ) x
          GROUP BY d
         HAVING SUM(amt) <> 0
          ORDER BY d`,
        [workerId, date, tenantId, from]
    );

    const s  = salesRes.rows[0];
    const c  = colRes.rows[0];
    const cp = cpRes.rows[0];

    const salesCash      = num(s.sales_cash);
    const dueCashCollect = num(c.cash_amount);
    const creditPayCash  = num(cp.cash_amount);
    const systemCash     = Math.round((salesCash + dueCashCollect + creditPayCash) * 100) / 100;

    const carriedDays = (carryRes.rows || []).map(r => ({ date: r.day, cash: num(r.cash) }));
    const carriedCash = Math.round(carriedDays.reduce((a, r) => a + r.cash, 0) * 100) / 100;

    return {
        // হিসাবের সময়সীমা: window_from (বাদ) → window_to (ধরে)
        window_from:          windowFrom,   // সর্বশেষ জমার তারিখ; null = কখনো জমা দেয়নি
        window_from_at:       last ? last.at : null, // সর্বশেষ জমার সঠিক সময় (সময়সীমার আসল শুরু)
        window_to:            date,

        // বিক্রির সারাংশ (পুরো সময়সীমা)
        total_sales:          num(s.total_sales),
        credit_given:         num(s.credit_given),
        replacement_value:    num(s.replacement_value),
        old_credit_collected: num(s.old_credit_collected),

        // নগদের উৎস (পুরো সময়সীমা)
        sales_cash:           salesCash,
        due_collected_cash:   Math.round((dueCashCollect + creditPayCash) * 100) / 100,
        collections_cash:     dueCashCollect,
        credit_payments_cash: creditPayCash,
        due_collected_count:  (c.cash_count || 0) + (cp.count || 0),

        // হাতের নগদে নেই — শুধু তথ্য
        non_cash_collected:   num(c.non_cash_amount),

        // আগের দিন থেকে জমে থাকা অংশ
        carried_cash:         carriedCash,
        carried_days:         carriedDays,
        today_cash:           Math.round((systemCash - carriedCash) * 100) / 100,

        // চূড়ান্ত
        system_cash:          systemCash,
    };
};


/**
 * পণ্যের প্রবাহ (stock statement) — সর্বশেষ জমার পর থেকে এখন পর্যন্ত, মূল্যসহ।
 *
 *   আগের হাতে ছিল + নেওয়া + (রিপ্লেস/রিটার্নে কাস্টমার থেকে পাওয়া) − বিক্রি − (ফেরত/ঘাটতি) = এখন হাতে
 *
 * মূল্য = SR-এর সর্বশেষ approved অর্ডারের দাম (settlement-এর ঘাটতি যে দামে ধরা হয় সেটাই);
 * অর্ডারে না থাকলে পণ্যের বর্তমান বিক্রয়মূল্য। শুধু দেখানোর জন্য — হিসাবে প্রভাব নেই।
 */
const getStockSummary = async ({ workerId, tenantId, fromAt, db }) => {
    const run  = db ? (sql, params) => db.query(sql, params) : defaultQuery;
    const from = fromAt || NO_LOWER_BOUND;

    const led = await run(
        `SELECT product_id,
                SUM(qty * direction)                                                        AS in_hand,
                COALESCE(SUM(qty * direction) FILTER (WHERE created_at > $2::timestamptz), 0) AS net_window,
                COALESCE(SUM(qty) FILTER (WHERE created_at > $2::timestamptz AND txn_type = 'order_in'
                                           AND COALESCE(reference_type, '') IN ('order', 'manual')), 0) AS taken,
                COALESCE(SUM(qty) FILTER (WHERE created_at > $2::timestamptz AND txn_type = 'order_in'
                                           AND COALESCE(reference_type, '') NOT IN ('order', 'manual')), 0) AS customer_in,
                COALESCE(SUM(qty) FILTER (WHERE created_at > $2::timestamptz AND txn_type = 'sale_out'), 0) AS sold
           FROM sr_stock_ledger
          WHERE worker_id = $1::uuid
          GROUP BY product_id`,
        [workerId, from]
    );

    const rows = led.rows.filter(r =>
        num(r.in_hand) !== 0 || num(r.net_window) !== 0 || num(r.taken) !== 0 ||
        num(r.customer_in) !== 0 || num(r.sold) !== 0);

    const empty = { qty: 0, value: 0 };
    if (rows.length === 0) {
        return { opening: empty, taken: empty, customer_in: empty, sold: empty, out: empty, in_hand: empty };
    }

    const ids = rows.map(r => String(r.product_id));

    // দাম: সর্বশেষ approved order → না থাকলে products.price
    const orderPrice = await run(
        `SELECT DISTINCT ON ((item->>'product_id')::uuid)
                (item->>'product_id')::uuid AS product_id,
                COALESCE((item->>'final_price')::numeric, (item->>'price')::numeric, 0) AS price
           FROM orders o,
                jsonb_array_elements(CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                                          THEN o.items::jsonb ELSE '[]'::jsonb END) AS item
          WHERE o.worker_id = $1::uuid AND o.status = 'approved' AND o.tenant_id = $3
            AND (item->>'product_id')::uuid = ANY($2::uuid[])
          ORDER BY (item->>'product_id')::uuid, o.approved_at DESC`,
        [workerId, ids, tenantId]
    );
    const prodPrice = await run(
        `SELECT id, price FROM products WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
        [ids, tenantId]
    );
    const price = {};
    prodPrice.rows.forEach(r => { price[String(r.id)] = num(r.price); });
    orderPrice.rows.forEach(r => { if (num(r.price) > 0) price[String(r.product_id)] = num(r.price); });

    const acc = { opening: { ...empty }, taken: { ...empty }, customer_in: { ...empty },
                  sold: { ...empty }, out: { ...empty }, in_hand: { ...empty } };
    const add = (k, qty, p) => { acc[k].qty += qty; acc[k].value += qty * p; };

    for (const r of rows) {
        const p        = price[String(r.product_id)] || 0;
        const inHand   = num(r.in_hand);
        const net      = num(r.net_window);
        const taken    = num(r.taken);
        const custIn   = num(r.customer_in);
        const sold     = num(r.sold);
        const opening  = inHand - net;
        // ফেরত/ঘাটতি/অন্য সব বাদ = নেওয়া + কাস্টমার-পাওয়া − বিক্রি − নেট (যাতে হিসাব সবসময় মেলে)
        const out      = taken + custIn - sold - net;
        add('opening', opening, p); add('taken', taken, p); add('customer_in', custIn, p);
        add('sold', sold, p);       add('out', out, p);     add('in_hand', inHand, p);
    }
    for (const k of Object.keys(acc)) acc[k].value = Math.round(acc[k].value * 100) / 100;
    return acc;
};

module.exports = { getTodayCashBreakdown, getLastSettlement, getStockSummary, BD_TZ };
