const { withTenantScope } = require('../config/tenantScopedDb');
const logger = require('../config/logger');

// ============================================================
// Commission Ledger — Phase ১ (shadow mode, dual-write)
//
// এই মডিউল commission_ledger টেবিলে append করে — কখনো UPDATE/DELETE করে না।
// এখনো কোনো read path এখান থেকে পড়ে না (cutover Phase ২-এ)। তাই এই লেখাগুলো
// "shadow write" — ব্যর্থ হলেও আসল commission flow-কে কখনো block/break করা
// উচিত না, তাই ডিফল্টভাবে error swallow করে (শুধু log করে)।
// ============================================================

/**
 * একটা ledger entry append করে।
 *
 * @param {object} entry
 * @param {object} [opts]
 * @param {boolean} [opts.swallowErrors=true] — false দিলে এরর throw করবে
 *   (টেস্ট/ম্যানুয়াল ভেরিফিকেশনের জন্য কাজে লাগে; production dual-write-এ
 *   সবসময় true থাকা উচিত)
 */
const appendLedgerEntry = async ({
    tenantId,
    userId,
    entryType,
    commissionType,
    date,
    amount,
    salesAmount = null,
    commissionRate = null,
    slabId = null,
    sourceType = null,
    sourceId = null,
    idempotencyKey = null,
    oldCommissionId = null,
    createdBy = null,
    notes = null,
}, { swallowErrors = true } = {}) => {
    try {
        if (!tenantId || !userId) {
            throw new Error('appendLedgerEntry: tenantId ও userId বাধ্যতামূলক (tenant isolation)');
        }
        if (!['earn', 'adjustment', 'payout', 'reversal'].includes(entryType)) {
            throw new Error(`appendLedgerEntry: অজানা entryType "${entryType}"`);
        }

        const result = await withTenantScope(tenantId, (client) => client.query(
            `INSERT INTO commission_ledger
                (tenant_id, user_id, entry_type, commission_type, date, amount,
                 sales_amount, commission_rate, slab_id, source_type, source_id,
                 idempotency_key, old_commission_id, created_by, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (idempotency_key) DO NOTHING
             RETURNING id`,
            [tenantId, userId, entryType, commissionType, date, amount,
             salesAmount, commissionRate, slabId, sourceType, sourceId,
             idempotencyKey, oldCommissionId, createdBy, notes]
        ));

        return result.rows[0]?.id || null;

    } catch (err) {
        logger.error('❌ commission_ledger write ব্যর্থ (shadow mode — non-fatal):', err.message);
        if (!swallowErrors) throw err;
        return null;
    }
};

/**
 * একটা user-এর একটা date+commissionType-এ এখন পর্যন্ত ledger-এ কত 'earn'
 * জমা হয়েছে — নতুন delta বের করার baseline হিসেবে ব্যবহার হয়।
 *
 * ✅ RLS FIX: tenantId এখন বাধ্যতামূলক, withTenantScope দিয়ে কানেক্ট করে —
 * commission_ledger-এ app_backend role-এর জন্য tenant_id ভিত্তিক policy আছে।
 */
const getEarnedSoFar = async (userId, date, commissionType, tenantId) => {
    if (!tenantId) {
        throw new Error('getEarnedSoFar: tenantId বাধ্যতামূলক (tenant isolation)');
    }
    const result = await withTenantScope(tenantId, (client) => client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM commission_ledger
         WHERE user_id = $1 AND date = $2 AND commission_type = $3 AND entry_type = 'earn'`,
        [userId, date, commissionType]
    ));
    return parseFloat(result.rows[0]?.total) || 0;
};

/**
 * দিনের commission recompute হওয়ার সময় (realtime অথবা নাইটলি job থেকে)
 * delta-ভিত্তিক 'earn' entry লেখে। পুরনো commission table-এর UPSERT/UPDATE-এর
 * ঠিক পরে কল করা উচিত, একই (tenantId, userId, date, newAmount) দিয়ে।
 *
 * delta = newAmount − (এখন পর্যন্ত ledger-এ যা 'earn' হিসেবে জমা আছে)।
 * delta === 0 হলে নতুন row লেখা হয় না (কিছুই বদলায়নি)।
 *
 * এই ফাংশন কখনো throw করে না (swallow করা appendLedgerEntry-র ডিফল্ট আচরণ)।
 */
const recordDailyEarnDelta = async ({
    tenantId,
    userId,
    date,
    newTotalSales,
    newRate,
    newAmount,
    slabId = null,
    sourceType = 'sale',
    oldCommissionId = null,
}) => {
    try {
        const priorTotal = await getEarnedSoFar(userId, date, 'daily', tenantId);
        const delta = Math.round(newAmount - priorTotal);

        if (delta === 0) return null;

        return await appendLedgerEntry({
            tenantId,
            userId,
            entryType: 'earn',
            commissionType: 'daily',
            date,
            amount: delta,
            salesAmount: newTotalSales,
            commissionRate: newRate,
            slabId,
            sourceType,
            oldCommissionId,
            notes: `daily recompute — prior ৳${priorTotal} → new ৳${newAmount} (delta ৳${delta})`,
        });
    } catch (err) {
        // getEarnedSoFar নিজেও ব্যর্থ হতে পারে (যেমন টেবিল এখনো migrate না
        // হলে) — এখানেও swallow করা, যাতে দিনের আসল commission হিসাব কখনো
        // ব্যাহত না হয়।
        logger.error('❌ recordDailyEarnDelta ব্যর্থ (shadow mode — non-fatal):', err.message);
        return null;
    }
};

/**
 * এককালীন (non-recompute) earn entry — যেমন attendance bonus। এখানে
 * idempotencyKey ব্যবহার করা উচিত যাতে একই ঘটনা দুইবার লেখা না হয়।
 */
const recordOneTimeEarn = async ({
    tenantId,
    userId,
    date,
    amount,
    commissionType,
    sourceType,
    sourceId = null,
    idempotencyKey = null,
    oldCommissionId = null,
    notes = null,
}) => appendLedgerEntry({
    tenantId, userId, entryType: 'earn', commissionType, date, amount,
    sourceType, sourceId, idempotencyKey, oldCommissionId, notes,
});

module.exports = {
    appendLedgerEntry,
    getEarnedSoFar,
    recordDailyEarnDelta,
    recordOneTimeEarn,
};
