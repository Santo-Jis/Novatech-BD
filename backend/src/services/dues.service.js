const logger = require('../config/logger');

/**
 * outstanding_dues / cash_dues বাড়ানোর জন্য একমাত্র জায়গা এইটা।
 *
 * আগে এই একই কাজ (dues_ledger-এ insert + users.outstanding_dues update)
 * settlement.controller.js-এর ৪টা আলাদা জায়গায় হাতে কপি করা ছিল
 * (approveSettlement-এ ২ বার, disputeSettlement-এ ২ বার) — একটা DB
 * trigger-ও একই কাজ আলাদাভাবে করত (এখন সরানো হয়েছে, migration_fix_settlement_dues_trigger.sql দ্রষ্টব্য)।
 * এই ডুপ্লিকেশনই আসল bug-এর কারণ ছিল। এখন থেকে dues বাড়াতে হলে
 * এই একটা ফাংশনই কল করতে হবে — settlement approve/dispute হোক, বা
 * settlement-return discrepancy charge হোক, বা ভবিষ্যতে অন্য যেকোনো কারণে।
 *
 * ⚠️ Idempotency এই ফাংশনের দায়িত্ব না — কে কবে dues charge করেছে সেটা
 * caller-কেই (একটা resolution/status কলামের মতো কিছু দিয়ে) নিশ্চিত করতে হবে,
 * আগে এই ফাংশন কল করার আগে।
 *
 * @param {object} client - withTransaction() থেকে পাওয়া transaction client
 * @param {object} params
 * @param {string} params.workerId
 * @param {string|null} [params.settlementId]
 * @param {string} params.dueType - 'product_shortage' | 'cash_mismatch' | ইত্যাদি
 * @param {number} params.amount - outstanding_dues-এ যোগ হবে এই পরিমাণ
 * @param {number} [params.cashAmount=0] - এর মধ্যে যতটুকু cash_dues হিসেবেও গণ্য
 * @param {string} [params.note]
 * @param {string} params.createdBy
 * @param {string} params.tenantId
 * @returns {object|null} নতুন dues_ledger row, অথবা null যদি amount <= 0 হয়
 */
const addDuesLedgerEntry = async (client, {
    workerId,
    settlementId = null,
    dueType,
    amount,
    cashAmount = 0,
    note,
    createdBy,
    tenantId,
}) => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return null;

    const inserted = await client.query(
        `INSERT INTO dues_ledger
            (worker_id, settlement_id, due_type, amount, note, created_by, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [workerId, settlementId, dueType, amt, note || null, createdBy, tenantId]
    );

    await client.query(
        `UPDATE users
         SET outstanding_dues = outstanding_dues + $1,
             cash_dues        = COALESCE(cash_dues, 0) + $2,
             updated_at       = NOW()
         WHERE id = $3
           AND tenant_id = $4`,
        [amt, parseFloat(cashAmount) || 0, workerId, tenantId]
    );

    logger.info(`💰 dues_ledger: worker=${workerId} type=${dueType} amount=${amt} settlement=${settlementId || '-'}`);
    return inserted.rows[0];
};

module.exports = { addDuesLedgerEntry };
