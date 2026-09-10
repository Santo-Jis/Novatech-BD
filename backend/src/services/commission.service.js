// ============================================================
// Commission Service
// ============================================================

const { query } = require('../config/db');

// বিক্রয়ের পরিমাণ অনুযায়ী commission rate DB থেকে বের করো
const calculateCommissionRate = async (salesAmount) => {
    const result = await query(
        `SELECT rate FROM commission_settings
         WHERE is_active = true
           AND slab_min <= $1
           AND (slab_max IS NULL OR slab_max >= $1)
         ORDER BY slab_min DESC
         LIMIT 1`,
        [salesAmount]
    );
    return parseFloat(result.rows[0]?.rate) || 0;
};

// বিক্রয়ের পরিমাণ অনুযায়ী commission rate ও amount হিসাব করো
const calculateCommission = async (salesAmount) => {
    const rate   = await calculateCommissionRate(salesAmount);
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
 * @returns {Promise<{ rate, amount, totalSales }>}
 */
const updateCommissionRealtime = async (workerId, date) => {
    // আজকের commissionable বিক্রয় (নগদ/replacement + আজ verified হওয়া collection)
    // বাকি/credit অংশ বাদ যায় যতক্ষণ না আদায় হয় — দেখো getDailyCommissionableSales()
    const totalSales = await getDailyCommissionableSales(workerId, date);

    if (totalSales <= 0) {
        return { rate: 0, amount: 0, totalSales: 0 };
    }

    const { rate, amount } = await calculateCommission(totalSales);

    // UPSERT — আগে থাকলে update, না থাকলে insert
    await query(
        `INSERT INTO commission
            (user_id, date, sales_amount, commission_rate, commission_amount, type, paid)
         VALUES ($1, $2, $3, $4, $5, 'daily', false)
         ON CONFLICT (user_id, date, type)
         DO UPDATE SET
            sales_amount      = EXCLUDED.sales_amount,
            commission_rate   = EXCLUDED.commission_rate,
            commission_amount = EXCLUDED.commission_amount`,
        [workerId, date, totalSales, rate, amount]
    );

    return { rate, amount, totalSales };
};

module.exports = { calculateCommission, calculateCommissionRate, getDailyCommissionableSales, updateCommissionRealtime };
