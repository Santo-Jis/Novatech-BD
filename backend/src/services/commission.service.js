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
const calculateCommissionRate = async (salesAmount, tenantId) => {
    if (!tenantId) {
        throw new Error('calculateCommissionRate: tenantId is required (tenant isolation)');
    }
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
const calculateCommission = async (salesAmount, tenantId) => {
    const rate   = await calculateCommissionRate(salesAmount, tenantId);
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
 *   - payment_method = 'credit'                → বাদ (০), যতদিন না আদায় হয়
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
            `SELECT COALESCE(SUM(total_amount) FILTER (WHERE payment_method != 'credit'), 0) AS cash_sales
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

    const { rate, amount } = await calculateCommission(totalSales, tenantId);

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

module.exports = { calculateCommission, calculateCommissionRate, getDailyCommissionableSales, updateCommissionRealtime };
