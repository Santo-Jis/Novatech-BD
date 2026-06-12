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
 * ✅ REAL-TIME: প্রতিটি sale-এর পরে SR-এর আজকের commission তাৎক্ষণিক আপডেট।
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
    // আজকের সব বিক্রয়ের মোট (এই sale সহ)
    const salesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
         FROM sales_transactions
         WHERE worker_id = $1 AND date = $2`,
        [workerId, date]
    );
    const totalSales = parseFloat(salesRes.rows[0].total_sales) || 0;

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

module.exports = { calculateCommission, calculateCommissionRate, updateCommissionRealtime };
