// ============================================================
// Commission Service
// আগে commission.controller.js-এ ছিল এবং
// commission.job.js সেখান থেকে import করত —
// job → controller import architecture-এর দিক থেকে ঠিক নয়।
// এখন shared service-এ রাখা হয়েছে।
// Controller ও Job উভয়ই এখান থেকে import করবে।
// ============================================================

const { query } = require('../config/db');

/**
 * বিক্রয়ের পরিমাণ অনুযায়ী commission rate DB থেকে বের করো।
 * @param {number} salesAmount
 * @returns {Promise<number>} rate (%)
 */
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
    // PostgreSQL NUMERIC/DECIMAL type string হিসেবে আসে ("5.00")।
    // parseFloat() দিয়ে JS number-এ convert করো।
    return parseFloat(result.rows[0]?.rate) || 0;
};

/**
 * বিক্রয়ের পরিমাণ অনুযায়ী commission rate ও amount হিসাব করো।
 * @param {number} salesAmount
 * @returns {Promise<{ rate: number, amount: number }>}
 */
const calculateCommission = async (salesAmount) => {
    const rate   = await calculateCommissionRate(salesAmount);
    const amount = Math.round((salesAmount * rate) / 100);
    return { rate, amount };
};

module.exports = { calculateCommission, calculateCommissionRate };
