const { query } = require('../config/db');

// ============================================================
// TENANT LIMITS — কাস্টমার সংখ্যা সীমা (trial/plan অনুযায়ী)
//
// tenants.max_customers কলামটা আগে থেকেই ছিল (onboarding.controller.js
// ট্রায়াল সাইনআপে ভ্যালু সেট করত), কিন্তু কোথাও actual enforce হতো না —
// শুধু একটা তথ্য হিসেবে সেভ থাকত। এখন এই ফাইলটা সেটা enforce করে।
//
// কাস্টমার তৈরি হয় তিন জায়গা থেকে:
//   1. customer.controller.js        → createCustomer (staff সরাসরি যোগ করে)
//   2. connection.controller.js      → ensureCustomerForPerson (QR scan/connection accept)
//   3. customerPortalConnection.controller.js → acceptCompanyRequest
// তিনটাতেই নতুন customer row তৈরির ঠিক আগে assertCustomerLimitAvailable
// কল করা হয় (already-existing customer reuse করার সময় কল করা হয় না,
// কারণ সেটা নতুন স্লট খরচ করে না)।
//
// ⚠️ employee.controller.js-এর assertSeatAvailable-এর মতো এখানে row-level
// FOR UPDATE লক নেই — কাস্টমার লিমিট সিট-বিলিং-এর মতো financially-critical
// না (soft business cap, ২,০০০-এর মতো বড় সংখ্যা), তাই সাধারণ COUNT চেক
// দিয়েই যথেষ্ট। ভবিষ্যতে race condition আসলেই সমস্যা করলে (একসাথে অনেক
// রিকোয়েস্টে exact boundary পার হয়ে যাওয়া), তখন tenants row FOR UPDATE
// লক করে withTransaction-এ নেওয়া যাবে।
// ============================================================

/**
 * tenant-এর max_customers সীমা ছাড়িয়ে গেলে থ্রো করে।
 * কল করার ঠিক আগে actual "নতুন customer row তৈরি হবে" এমন জায়গায় বসাতে
 * হবে (existing customer reuse করার পথে না)।
 *
 * সীমা পার হলে থ্রো করে একটা Error যার { code: 'CUSTOMER_LIMIT_REACHED',
 * used, limit } থাকে — ক্যাচ ব্লকে সেটা ধরে 403 রিটার্ন করতে হবে।
 */
const assertCustomerLimitAvailable = async (tenantId) => {
    const tenantRow = await query(
        `SELECT max_customers FROM tenants WHERE id = $1`,
        [tenantId]
    );
    // Tenant row না পাওয়া গেলে (অস্বাভাবিক অবস্থা) এখানে ব্লক না করে
    // caller-কে আসল INSERT-এ যেতে দাও — foreign key constraint দরকার হলে
    // নিজেই আটকাবে।
    if (tenantRow.rows.length === 0) return;

    const limit = tenantRow.rows[0].max_customers;
    // NULL/undefined মানে সীমাহীন (super admin ম্যানুয়ালি NULL করে দিতে পারবে)
    if (limit === null || limit === undefined) return;

    const usedRow = await query(
        `SELECT COUNT(*)::int AS used FROM customers WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
    );
    const used = usedRow.rows[0]?.used ?? 0;

    if (used >= limit) {
        const err = new Error('CUSTOMER_LIMIT_REACHED');
        err.code  = 'CUSTOMER_LIMIT_REACHED';
        err.used  = used;
        err.limit = limit;
        throw err;
    }
};

module.exports = { assertCustomerLimitAvailable };
