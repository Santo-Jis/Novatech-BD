// ============================================================
// Commission Service
// ============================================================

const { query } = require('../config/db');
const { withTenantScope } = require('../config/tenantScopedDb');
const { recordDailyEarnDelta } = require('./commissionLedger.service');

// বিক্রয়ের পরিমাণ অনুযায়ী commission rate DB থেকে বের করো
//
// ✅ P0 FIX: আগে এই ফাংশন কোনো tenant_id ছাড়াই commission_settings-এ query
// করত। tenantId প্যারামিটার যোগ করে সেই application-level bug ঠিক হয়েছিল।
//
// ✅ RLS FIX: কিন্তু application-level ফিল্টার নির্ভর করে কেউ ভুল না করার
// উপর — ঠিক এই ক্লাসের bug আবার হতে পারতো। এখন withTenantScope() দিয়ে
// একটা RLS-protected role (app_backend, NOBYPASSRLS) দিয়ে কানেক্ট করা হয়,
// আর commission_settings-এ tenant_id ভিত্তিক policy আছে। মানে এখন এমনকি
// WHERE ক্লজ থেকে tenant_id ফিল্টার ভুলে বাদ পড়লেও, ডেটাবেস নিজেই অন্য
// tenant-এর row লুকিয়ে ফেলবে — code review-এর ভরসায় থাকতে হয় না।
// ─── SR ভিত্তিক নিজস্ব কমিশন রেট ───────────────────────────
// users.commission_rate_override: NULL = কোম্পানির স্ল্যাব, সংখ্যা = এই SR-এর নির্দিষ্ট %।
// (০ বৈধ — মানে এই SR কমিশন পাবে না।) tenant_id দিয়ে ফিল্টার করা, তাই অন্য
// কোম্পানির user-এর রেট কখনো পড়া হবে না।
//
// মাইগ্রেশন (migration_per_sr_commission_rate.sql) চালানোর আগেই কোড ডিপ্লয় হয়ে গেলে
// কলামটা থাকবে না (Postgres 42703) — তখন কমিশন যেন থেমে না যায়, তাই null ধরে
// আগের মতো স্ল্যাবে ফিরে যাই।
const getWorkerRateOverride = async (workerId, tenantId) => {
    if (!workerId || !tenantId) return null;
    try {
        const r = await query(
            `SELECT commission_rate_override FROM users WHERE id = $1 AND tenant_id = $2`,
            [workerId, tenantId]
        );
        const v = r.rows[0]?.commission_rate_override;
        if (v === null || v === undefined) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
    } catch (err) {
        if (err.code !== '42703') {
            require('../config/logger').error('❌ getWorkerRateOverride:', err.message);
        }
        return null;
    }
};

const calculateCommissionRate = async (salesAmount, tenantId, workerId = null) => {
    if (!tenantId) {
        throw new Error('calculateCommissionRate: tenantId is required (tenant isolation)');
    }
    // এই SR-এর নিজস্ব রেট থাকলে সেটাই — স্ল্যাব দেখা হয় না
    const override = await getWorkerRateOverride(workerId, tenantId);
    if (override !== null) return override;

    const result = await withTenantScope(tenantId, (client) => client.query(
        `SELECT rate FROM commission_settings
         WHERE is_active = true
           AND tenant_id = $2
           AND slab_min <= $1
           AND (slab_max IS NULL OR slab_max >= $1)
         ORDER BY slab_min DESC
         LIMIT 1`,
        [salesAmount, tenantId]
    ));
    return parseFloat(result.rows[0]?.rate) || 0;
};

// বিক্রয়ের পরিমাণ অনুযায়ী commission rate ও amount হিসাব করো
const calculateCommission = async (salesAmount, tenantId, workerId = null) => {
    const rate   = await calculateCommissionRate(salesAmount, tenantId, workerId);
    const amount = Math.round((salesAmount * rate) / 100);
    return { rate, amount };
};

/**
 * ✅ FIX: বাকি (credit) বিক্রয়ের উপর commission হবে না যতক্ষণ না তা আদায় হয়।
 *
 * আগে দৈনিক commission হিসাব হতো sales_transactions-এর পুরো total_amount
 * দিয়ে — payment_method 'credit' হলেও। ফলে এখনো আদায় না হওয়া বাকি টাকার
 * উপরেও SR কমিশন পেয়ে যেত। এই ফাংশন সেই "commissionable" অংশটুকু বের করে:
 *
 *   - payment_method = 'cash' / 'replacement'  → সাথে সাথে commissionable
 *   - payment_method = 'credit'                → শুধু cash_received অংশ (আংশিক পেমেন্টে
 *                                                 নগদ নেওয়া টাকা); বাকি অংশ বাদ, যতদিন না আদায় হয়
 *   - সেদিন যে collection admin verify করেছে   → সেদিনের commissionable-এ যোগ
 *     (pending/submitted অবস্থায় ধরা হয় না — collection.controller.js-এর
 *      একই ফ্রড-প্রুফ নিয়ম: admin verify ছাড়া টাকা "আদায় হয়েছে" ধরা হয় না,
 *      নইলে ভুয়া/ভুল এন্ট্রি দিয়ে commission gaming করা যেত)
 *   - সেদিন credit_payments-এ যা জমা হয়েছে      → সেদিনও commissionable-এ যোগ
 *     (Supabase স্কিমা যাচাই করে ধরা পড়েছে: বাকি আদায়ের **দ্বিতীয় একটা পথ**
 *      আছে — customer.controller.js::collectCredit, worker/manager/
 *      supervisor/admin সরাসরি call করতে পারে, verification ছাড়াই
 *      trg_credit_payment ট্রিগার সাথে সাথে current_credit কমায়। যেহেতু এই
 *      পথটার নিজেরই কোনো verify-gate নেই, কমিশনও সাথে সাথেই ধরা হয় — শুধু
 *      role='worker' হলে, admin/manager নিজে collect করলে commission না)
 *
 * অর্থাৎ "বাকিতে বিক্রি হলো" দিনটায় commission হয় না, কিন্তু "বাকি আদায় হলো"
 * দিনটায় (যেকোনো পথে) পুরো আদায়-করা টাকা সেদিনের commissionable sales হিসেবে যোগ হয়।
 *
 * @param {string} workerId
 * @param {string} date — YYYY-MM-DD (BD local date)
 * @returns {Promise<number>} commissionable sales amount
 */
const getDailyCommissionableSales = async (workerId, date) => {
    const [salesRes, collectionRes, creditPaymentRes] = await Promise.all([
        query(
            // 'credit' sale-এ শুধু নগদ-পাওয়া অংশ (cash_received) commissionable — আংশিক
            // পেমেন্টে (যেমন ৫০০০-এর মধ্যে ৪৫০০ নগদ) শুধু ৪৫০০-এর উপর commission।
            // বাকি অংশ আদায় হলে নিচের credit_payments/collections পথে যোগ হয়।
            `SELECT COALESCE(SUM(
                        CASE WHEN payment_method = 'credit' THEN COALESCE(cash_received, 0)
                             ELSE total_amount END
                    ), 0) AS cash_sales
             FROM sales_transactions
             WHERE worker_id = $1 AND date = $2`,
            [workerId, date]
        ),
        query(
            `SELECT COALESCE(SUM(amount), 0) AS collected
             FROM collections
             WHERE sr_id = $1
               AND status = 'verified'
               AND (verified_at AT TIME ZONE 'UTC' + INTERVAL '6 hours')::date = $2::date`,
            [workerId, date]
        ),
        query(
            `SELECT COALESCE(SUM(amount), 0) AS collected
             FROM credit_payments
             WHERE worker_id = $1
               AND (created_at AT TIME ZONE 'UTC' + INTERVAL '6 hours')::date = $2::date`,
            [workerId, date]
        )
    ]);

    const cashSales        = parseFloat(salesRes.rows[0]?.cash_sales) || 0;
    const viaCollections   = parseFloat(collectionRes.rows[0]?.collected) || 0;
    const viaCreditPayment = parseFloat(creditPaymentRes.rows[0]?.collected) || 0;

    return cashSales + viaCollections + viaCreditPayment;
};

/**
 * ✅ REAL-TIME: প্রতিটি sale/collection-verify-এর পরে SR-এর আজকের commission তাৎক্ষণিক আপডেট।
 *
 * কেন দরকার:
 *  - আগে শুধু রাত ১২টায় commission হিসাব হতো
 *  - SR সারাদিন জানত না কত commission হলো
 *  - এখন প্রতিটি sale-এর পরেই DB আপডেট + Firebase push
 *
 * @param {string} workerId
 * @param {string} date  — YYYY-MM-DD (BD timezone)
 * @param {string} tenantId — ✅ P0 FIX: tenant-aware rate lookup-এর জন্য বাধ্যতামূলক
 * @returns {Promise<{ rate, amount, totalSales }>}
 */
const updateCommissionRealtime = async (workerId, date, tenantId) => {
    // আজকের commissionable বিক্রয় (নগদ/replacement + আজ verified হওয়া collection)
    // বাকি/credit অংশ বাদ যায় যতক্ষণ না আদায় হয় — দেখো getDailyCommissionableSales()
    const totalSales = await getDailyCommissionableSales(workerId, date);

    if (totalSales <= 0) {
        return { rate: 0, amount: 0, totalSales: 0 };
    }

    const { rate, amount } = await calculateCommission(totalSales, tenantId, workerId);

    // UPSERT — আগে থাকলে update, না থাকলে insert।
    // ✅ P0 FIX (Bug #4): "DO UPDATE ... WHERE commission.paid = false" —
    // এই দিনের commission যদি ইতিমধ্যে paid=true মার্ক হয়ে গিয়ে থাকে (মাঝ-মাসে
    // payCommission দিয়ে), তাহলে দেরিতে আসা sale/collection এই UPSERT-এ আর
    // sales_amount/commission_amount বদলাবে না — paid_at/payment_reference যা
    // দেখাচ্ছিল, commission_amount ঠিক সেটার সাথেই মিলে থাকবে। Postgres-এর
    // conditional "DO UPDATE ... WHERE" এখানে conflicting row-কে reference
    // করে, তাই condition false হলে insert-ও হয় না, update-ও হয় না — নীরবে skip।
    //
    // ✅ RLS FIX: withTenantScope দিয়ে — commission টেবিলে app_backend
    // role-এর জন্য policy আছে (user_id অবশ্যই এই tenant-এর কোনো user-এর
    // হতে হবে), তাই ভুল workerId পাস হলেও DB নিজেই আটকাবে।
    await withTenantScope(tenantId, (client) => client.query(
        `INSERT INTO commission
            (user_id, date, sales_amount, commission_rate, commission_amount, type, paid)
         VALUES ($1, $2, $3, $4, $5, 'daily', false)
         ON CONFLICT (user_id, date, type)
         DO UPDATE SET
            sales_amount      = EXCLUDED.sales_amount,
            commission_rate   = EXCLUDED.commission_rate,
            commission_amount = EXCLUDED.commission_amount
         WHERE commission.paid = false`,
        [workerId, date, totalSales, rate, amount]
    ));

    // ✅ Phase ১ — shadow-mode dual-write। পুরনো commission টেবিলের UPSERT
    // উপরে যা-ই ঘটুক (update হোক, skip হোক কারণ paid=true), ledger নিজের
    // আগের entry-গুলো থেকে delta বের করে independently, তাই paid হয়ে যাওয়া
    // দিনেও দেরিতে আসা sale-এর কমিশন এখানে "এখনো owed" হিসেবে ধরা পড়ে —
    // পুরনো টেবিলে এটা সম্ভব ছিল না। ব্যর্থ হলে swallow হয়, আসল রেসপন্স/
    // আচরণ অক্ষুণ্ণ থাকে (দেখো commissionLedger.service.js)।
    await recordDailyEarnDelta({
        tenantId, userId: workerId, date,
        newTotalSales: totalSales, newRate: rate, newAmount: amount,
        sourceType: 'sale',
    });

    return { rate, amount, totalSales };
};

// ============================================================
// প্রতিটি বিক্রি/আদায় থেকে কত কমিশন এসেছে — দিনভিত্তিক ব্রেকডাউন
// ============================================================
//
// কমিশন DB-তে দিনের মোট commissionable বিক্রয়ের উপর একটাই রেটে জমা হয়
// (দেখো getDailyCommissionableSales / updateCommissionRealtime)। এই ফাংশন
// সেই একই উৎসগুলো (sales_transactions, verified collections, credit_payments)
// আলাদা আলাদা সারিতে ভেঙে দেখায় এবং প্রতিটির অংশে দিনের রেট প্রয়োগ করে।
// কোনো ডেটা লেখে না, কোনো নতুন টেবিল/কলাম লাগে না।
//
// ⚠️ স্ল্যাব দিনের মোট বিক্রয়ে নির্ধারিত হয়, তাই দিন শেষ না হওয়া পর্যন্ত রেট
// বাড়তে পারে এবং আগের বিক্রির কমিশনও বাড়বে (SR-এর নিজস্ব স্থির রেট থাকলে
// বাড়ে না)। এজন্য আজকের মানগুলো "এখনকার রেট অনুযায়ী" — `rate_mode` দেখো।
//
// রাউন্ডিং: দিনের মোট কমিশন একবারই Math.round হয় (calculateCommission)।
// সারিগুলো যোগ করলে যেন হুবহু সেই মোট মেলে, তাই "largest remainder"
// পদ্ধতিতে পূর্ণ টাকায় ভাগ করা হয়।

const _num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const allocateByLargestRemainder = (amounts, rate, target) => {
    const EPS    = 1e-9;
    const raw    = amounts.map(a => (a * rate) / 100);
    const floors = raw.map(r => Math.floor(r + EPS));
    let remaining = target - floors.reduce((a, b) => a + b, 0);
    if (remaining <= 0) return floors;

    const order = raw
        .map((r, i) => ({ i, frac: r - floors[i] }))
        .filter(x => amounts[x.i] > 0)
        .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

    for (const { i } of order) {
        if (remaining <= 0) break;
        floors[i] += 1;
        remaining -= 1;
    }
    return floors;
};

const getDailyCommissionBreakdown = async (workerId, date, tenantId) => {
    if (!workerId || !date || !tenantId) {
        throw new Error('getDailyCommissionBreakdown: workerId, date, tenantId required');
    }

    const [salesRes, collRes, cpRes, storedRes] = await Promise.all([
        query(
            `SELECT st.id, st.invoice_number, st.payment_method, st.total_amount,
                    st.net_amount, st.cash_received, st.created_at AS at, c.shop_name
             FROM sales_transactions st
             LEFT JOIN customers c ON c.id = st.customer_id AND c.tenant_id = $3
             WHERE st.worker_id = $1 AND st.date = $2
             ORDER BY st.created_at ASC`,
            [workerId, date, tenantId]
        ),
        query(
            `SELECT co.id, co.amount, co.payment_mode, co.verified_at AS at, c.shop_name
             FROM collections co
             LEFT JOIN customers c ON c.id = co.customer_id AND c.tenant_id = $3
             WHERE co.sr_id = $1
               AND co.status = 'verified'
               AND (co.verified_at AT TIME ZONE 'UTC' + INTERVAL '6 hours')::date = $2::date
             ORDER BY co.verified_at ASC`,
            [workerId, date, tenantId]
        ),
        query(
            `SELECT cp.id, cp.amount, cp.payment_method, cp.created_at AS at, c.shop_name
             FROM credit_payments cp
             LEFT JOIN customers c ON c.id = cp.customer_id AND c.tenant_id = $3
             WHERE cp.worker_id = $1
               AND (cp.created_at AT TIME ZONE 'UTC' + INTERVAL '6 hours')::date = $2::date
             ORDER BY cp.created_at ASC`,
            [workerId, date, tenantId]
        ),
        query(
            `SELECT sales_amount, commission_rate, commission_amount, paid
             FROM commission
             WHERE user_id = $1 AND date = $2 AND type = 'daily'`,
            [workerId, date]
        ),
    ]);

    // ── সারি তৈরি — commissionable নিয়ম getDailyCommissionableSales-এর সাথে হুবহু এক ──
    const entries = [];

    for (const r of salesRes.rows) {
        const isCredit = r.payment_method === 'credit';
        const cash     = _num(r.cash_received);
        entries.push({
            kind:           'sale',
            id:             r.id,
            ref:            r.invoice_number,
            customer:       r.shop_name || null,
            at:             r.at,
            amount:         _num(r.net_amount) || _num(r.total_amount),
            commissionable: isCredit ? cash : _num(r.total_amount),
            // cash = পুরো নগদ, replacement = রিপ্লেসমেন্ট, partial = আংশিক নগদ, due = পুরো বাকি
            status:         r.payment_method === 'replacement' ? 'replacement'
                          : !isCredit ? 'cash' : (cash > 0 ? 'partial' : 'due'),
        });
    }
    for (const r of collRes.rows) {
        entries.push({
            kind: 'collection', id: r.id, ref: null, customer: r.shop_name || null,
            at: r.at, amount: _num(r.amount), commissionable: _num(r.amount),
            status: 'collected',
        });
    }
    for (const r of cpRes.rows) {
        entries.push({
            kind: 'credit_payment', id: r.id, ref: null, customer: r.shop_name || null,
            at: r.at, amount: _num(r.amount), commissionable: _num(r.amount),
            status: 'collected',
        });
    }
    entries.sort((a, b) => new Date(a.at) - new Date(b.at));

    const totalSales = entries.reduce((s, e) => s + e.commissionable, 0);
    const customRate = await getWorkerRateOverride(workerId, tenantId);
    const stored     = storedRes.rows[0] || null;
    const paid       = !!stored?.paid;

    // ── রেট ও দিনের মোট কমিশন ──
    // পরিশোধিত দিনে DB-তে জমা রেটই চূড়ান্ত; অন্যথায় এখনকার হিসাব।
    let rate = 0, total = 0;
    if (totalSales > 0) {
        if (paid) {
            rate  = _num(stored.commission_rate);
            total = Math.round((totalSales * rate) / 100);
        } else {
            const c = await calculateCommission(totalSales, tenantId, workerId);
            rate  = c.rate;
            total = c.amount;
        }
    }

    const shares = allocateByLargestRemainder(entries.map(e => e.commissionable), rate, total);
    entries.forEach((e, i) => { e.commission = totalSales > 0 ? shares[i] : 0; });

    // পরিশোধের পরে আসা বিক্রি থাকলে DB-র দিনের অংক আর এই যোগফল না-ও মিলতে পারে
    const mismatch = !!(stored && paid &&
        Math.abs(_num(stored.sales_amount) - totalSales) > 0.5);

    return {
        date,
        rate,
        rate_mode:        customRate !== null ? 'custom' : 'slab',
        total_sales:      totalSales,
        total_commission: total,
        paid,
        mismatch,
        stored: stored ? {
            sales_amount:      _num(stored.sales_amount),
            commission_amount: _num(stored.commission_amount),
        } : null,
        entries,
    };
};

// কয়েকটা sale-এর কমিশন একসাথে: { [saleId]: { commission, rate, rate_mode } }
// ইনভয়েস তালিকায় ব্যাজ দেখানোর জন্য। এক দিনের জন্য একবারই হিসাব হয়;
// ভারী রেঞ্জে লোড কমাতে সর্বোচ্চ `maxDates`টি দিন ধরা হয় (সবচেয়ে নতুন আগে)।
const getSaleCommissionMap = async (workerId, dates, tenantId, maxDates = 10) => {
    // pg DATE কলাম JS Date হিসেবে আসে (সার্ভারের লোকাল মধ্যরাত) — লোকাল getter দিয়ে YYYY-MM-DD করি
    const ymd = (d) => {
        if (d instanceof Date) {
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${d.getFullYear()}-${m}-${day}`;
        }
        return String(d).slice(0, 10);
    };
    const uniq = [...new Set((dates || []).map(ymd))]
        .sort().reverse().slice(0, maxDates);
    const out = {};
    const results = await Promise.all(uniq.map(async (d) => {
        try { return await getDailyCommissionBreakdown(workerId, d, tenantId); }
        catch { return null; }
    }));
    for (const day of results) {
        if (!day) continue;
        for (const e of day.entries) {
            if (e.kind !== 'sale') continue;
            out[e.id] = { commission: e.commission, rate: day.rate, rate_mode: day.rate_mode, status: e.status };
        }
    }
    return out;
};

module.exports = {
    calculateCommission, calculateCommissionRate, getWorkerRateOverride,
    getDailyCommissionableSales, updateCommissionRealtime,
    getDailyCommissionBreakdown, getSaleCommissionMap,
};
