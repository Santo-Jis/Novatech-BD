// backend/src/services/paymentAllocation.service.js
//
// বাকি আদায়কে নির্দিষ্ট ইনভয়েসে (sales_transactions) বরাদ্দ করার একমাত্র জায়গা।
//
// কেন আলাদা টেবিল (payment_allocations)? দেখো migration_payment_allocations.sql —
//   * ইনভয়েসের বাকি = credit_used − SUM(allocations): stored কলাম নয়, সবসময় computed।
//   * collections / credit_payments-এর কোনো কলাম বা credit_payments-এর DB ট্রিগার বদলায়নি;
//     customers.current_credit কমানো আগের মতোই ওই দুই পথের নিজস্ব কাজ।
//
// নিয়ম: FIFO — সবচেয়ে পুরনো বাকি ইনভয়েস আগে শোধ।
//
// ⚠️ Idempotency: একই আদায় (source + payment_id) দ্বিতীয়বার বরাদ্দ হবে না।
// ⚠️ caller-কে অবশ্যই withTransaction()-এর client দিতে হবে (customer row lock + atomic লেখা)।
// ⚠️ বরাদ্দ "best-effort": ব্যর্থ হলে মূল আদায় (current_credit কমানো) আটকায় না — দেখো
//    allocatePaymentSafe। টাকার মূল প্রবাহ ভাঙার চেয়ে ইনভয়েস-লিংক মিস হওয়া কম ক্ষতিকর;
//    মিস হলে লগে ধরা পড়ে এবং migration-এর ব্যাকফিল ফাংশন পরে মিটিয়ে দেয়।

const logger = require('../config/logger');

// টাকা paisa (পূর্ণসংখ্যা)-তে হিসাব — floating-point জমা ভুল এড়াতে
const toPaisa = (v) => Math.round((parseFloat(v) || 0) * 100);
const fromPaisa = (p) => p / 100;

/**
 * Pure FIFO পরিকল্পনা — DB ছোঁয় না, তাই সরাসরি unit-test করা যায়।
 *
 * @param {Array<{sale_id:string, remaining:number|string}>} openInvoices
 *        পুরনো-থেকে-নতুন ক্রমে সাজানো, শুধু remaining > 0 ধরে নেওয়া হয় (না হলে বাদ যায়)
 * @param {number|string} amount আদায়ের পরিমাণ
 * @returns {{ allocations: Array<{sale_id:string, amount:number}>, allocated:number, unallocated:number }}
 */
const planFifoAllocation = (openInvoices, amount) => {
    let left = toPaisa(amount);
    const allocations = [];
    let allocatedPaisa = 0;

    if (left <= 0) return { allocations, allocated: 0, unallocated: 0 };

    for (const inv of openInvoices || []) {
        if (left <= 0) break;
        const rem = toPaisa(inv.remaining);
        if (rem <= 0) continue;
        const take = Math.min(left, rem);
        allocations.push({ sale_id: inv.sale_id, amount: fromPaisa(take) });
        left -= take;
        allocatedPaisa += take;
    }

    return {
        allocations,
        allocated:   fromPaisa(allocatedPaisa),
        // ইনভয়েসে বসানো যায়নি এমন অংশ (পুরনো opening-balance বা ইনভয়েস-বহির্ভূত বাকি) — এরর নয়
        unallocated: fromPaisa(left),
    };
};

/**
 * একটা আদায়কে FIFO-তে ইনভয়েসে বরাদ্দ করে।
 *
 * @param {object} client - withTransaction() থেকে পাওয়া transaction client
 * @param {object} p
 * @param {string} p.tenantId
 * @param {string} p.customerId
 * @param {string} p.paymentId   collections.id অথবা credit_payments.id
 * @param {'collection'|'credit_payment'} p.source
 * @param {number|string} p.amount
 * @returns {Promise<{allocations:Array, allocated:number, unallocated:number, skipped?:boolean}>}
 */
const allocatePaymentFifo = async (client, { tenantId, customerId, paymentId, source, amount }) => {
    if (!['collection', 'credit_payment'].includes(source)) {
        throw new Error(`allocatePaymentFifo: অজানা source "${source}"`);
    }

    // Idempotent — এই আদায় আগেই বরাদ্দ হয়ে থাকলে কিছু করা হবে না
    const already = await client.query(
        `SELECT 1 FROM payment_allocations
         WHERE tenant_id = $1 AND payment_source = $2 AND payment_id = $3
         LIMIT 1`,
        [tenantId, source, paymentId]
    );
    if (already.rows.length > 0) {
        return { allocations: [], allocated: 0, unallocated: 0, skipped: true };
    }

    // একই কাস্টমারের concurrent আদায় serialize — নাহলে দুই আদায় একই "remaining" দেখে
    // একই ইনভয়েস ওভার-অ্যালোকেট করতে পারে।
    await client.query(
        `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [customerId, tenantId]
    );

    const open = await client.query(
        `SELECT st.id AS sale_id,
                st.credit_used - COALESCE(pa.allocated, 0) AS remaining
         FROM sales_transactions st
         LEFT JOIN (
             SELECT sale_id, SUM(amount) AS allocated
             FROM payment_allocations
             WHERE customer_id = $1
             GROUP BY sale_id
         ) pa ON pa.sale_id = st.id
         WHERE st.customer_id    = $1
           AND st.tenant_id      = $2
           AND st.payment_method = 'credit'
           AND st.credit_used    > 0
           AND st.credit_used - COALESCE(pa.allocated, 0) > 0
         ORDER BY st.created_at ASC, st.id ASC`,
        [customerId, tenantId]
    );

    const plan = planFifoAllocation(open.rows, amount);

    for (const a of plan.allocations) {
        await client.query(
            `INSERT INTO payment_allocations
                (tenant_id, customer_id, sale_id, payment_source, payment_id, amount)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (payment_source, payment_id, sale_id) DO NOTHING`,
            [tenantId, customerId, a.sale_id, source, paymentId, a.amount]
        );
    }

    return plan;
};

/**
 * allocatePaymentFifo-কে SAVEPOINT-এর ভেতরে চালায়, যাতে বরাদ্দ ব্যর্থ হলে
 * (যেমন migration এখনো apply হয়নি) পুরো transaction — মানে মূল আদায়/current_credit —
 * rollback না হয়। PostgreSQL-এ একটা statement ফেল করলে transaction aborted হয়ে যায়;
 * savepoint ছাড়া try/catch দিয়ে সেটা সামলানো যায় না।
 *
 * কখনো throw করে না। ব্যর্থ হলে null ফেরত দেয় এবং error লগ করে।
 */
const allocatePaymentSafe = async (client, params) => {
    await client.query('SAVEPOINT payment_alloc');
    try {
        const result = await allocatePaymentFifo(client, params);
        await client.query('RELEASE SAVEPOINT payment_alloc');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK TO SAVEPOINT payment_alloc');
            await client.query('RELEASE SAVEPOINT payment_alloc');
        } catch (rbErr) {
            logger.error(`paymentAllocation → savepoint rollback failed: ${rbErr.message}`);
        }
        logger.error(
            `paymentAllocation → ইনভয়েসে বরাদ্দ ব্যর্থ ` +
            `(source=${params.source} payment=${params.paymentId} customer=${params.customerId}): ${err.message}`
        );
        return null;
    }
};

module.exports = { planFifoAllocation, allocatePaymentFifo, allocatePaymentSafe };
