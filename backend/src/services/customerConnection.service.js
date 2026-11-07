// ============================================================
// customerConnection.service.js
// company ↔ customer connection ফ্লো-তে ব্যবহৃত শেয়ার্ড লজিক।
//
// ✅ NEW (Phase 2 — কোড অডিট থেকে): connection.controller.js-এ
// ensureCustomerForPerson আগে থেকেই local helper হিসেবে ছিল (staff-side
// accept + QR-scan দুটোই এটা ব্যবহার করত), কিন্তু customerPortalConnection.
// controller.js-এর acceptCompanyRequest ঠিক একই লজিক (find-or-create
// customer row, customer-limit check, ডিফল্ট নামকরণ) আলাদাভাবে ইনলাইন
// কপি-পেস্ট করে রেখেছিল, এমনকি mid-function require সহ। এখন দুই
// controller-ই এখান থেকে import করে — একজায়গায় বাগ ফিক্স হলেই দুই
// ফ্লো-তে (staff accept/QR-scan + customer portal accept) প্রযোজ্য হবে।
//
// REJECT_COOLDOWN_HOURS-ও এখানে তোলা হলো (Phase 1-এ দুই controller-এ
// আলাদাভাবে একই মান বসানো ছিল, sync রাখা ম্যানুয়াল ছিল)।
// ============================================================

const { query } = require('../config/db');
const { generateCustomerCode } = require('./employee.service');
const { assertCustomerLimitAvailable } = require('./tenantLimits.service');

// reject-এর পর কতক্ষণ নতুন connection-request ব্লক থাকবে (স্প্যাম/
// হ্যারাসমেন্ট প্রতিরোধ)। connection.controller.js (staff→customer) ও
// customerPortalConnection.controller.js (customer→company) দুই দিকের
// রিকোয়েস্ট-কুলডাউনেই এই একই মান ব্যবহৃত হয়।
const REJECT_COOLDOWN_HOURS = 24;

// একটা person-tenant জোড়ার জন্য বিদ্যমান customer row খুঁজে দাও, না
// থাকলে person-এর তথ্য দিয়ে নতুন একটা বানাও।
//
// ব্যবহারকারী: staff-side connectViaQrScan/acceptConnection এবং
// customer-portal-side acceptCompanyRequest — তিনটা ফ্লো-ই এই একই
// ফাংশন দিয়ে customer row resolve করে।
//
// createdByUserId: staff যখন accept/QR-scan করে তখন req.user.id (কে
// তৈরি করলো তার audit trail থাকে customers.created_by-তে), কাস্টমার
// নিজে portal থেকে accept করলে null (কোনো staff member জড়িত না, তাই
// created_by NULL থাকে — portal-side-এর আগের ইনলাইন কোডেও এটাই ছিল)।
async function ensureCustomerForPerson(personId, tenantId, createdByUserId = null) {
    const existing = await query(
        `SELECT id FROM customers WHERE person_id = $1 AND tenant_id = $2 LIMIT 1`,
        [personId, tenantId]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    // ✅ নতুন customer row তৈরি হতে যাচ্ছে (existing reuse না) — তাই
    // এখানেই ট্রায়াল/প্ল্যান কাস্টমার সীমা চেক করা হচ্ছে
    await assertCustomerLimitAvailable(tenantId);

    const person = await query(`SELECT * FROM persons WHERE id = $1`, [personId]);
    if (person.rows.length === 0) throw new Error('Person পাওয়া যায়নি।');
    const p = person.rows[0];

    const customerCode = await generateCustomerCode(new Date());
    const created = await query(
        `INSERT INTO customers
            (customer_code, shop_name, owner_name, whatsapp, sms_phone, email,
             created_by, tenant_id, person_id, registration_source, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'connection', true)
         RETURNING id`,
        [
            customerCode,
            p.full_name || 'নতুন কাস্টমার',
            p.full_name || 'নতুন কাস্টমার',
            p.whatsapp || null,
            p.phone || null,
            p.email || null,
            createdByUserId,
            tenantId,
            personId,
        ]
    );
    return created.rows[0].id;
}

// ============================================================
// ✅ NEW: staff (SR/Manager/Admin) নতুন দোকান তৈরি করলে স্বয়ংক্রিয় কানেকশন।
//
// আগে createCustomer শুধু customers রো বানাত — persons/connection রো ছাড়া।
// ফলে চ্যাট/ফিড/ডিসকভারি/পোর্টালের "কানেক্টেড কোম্পানি" তালিকা ওই দোকানের
// জন্য কাজ করত না, আর আলাদাভাবে QR স্ক্যান করতে হতো।
//
// নিয়ম (কাস্টমারের আগের সিদ্ধান্ত কখনো override হয় না):
//   • কোনো সম্পর্ক-রো নেই        → নতুন 'connected' রো (initiated_by='staff_created')
//   • 'connected' আছে              → শুধু customer_id ফাঁকা থাকলে বসাও
//   • 'pending'                    → যেমন আছে তেমন (কাস্টমারের সম্মতি বাকি)
//   • 'blocked'/'disconnected'/'rejected' → যেমন আছে তেমন — কাস্টমার/কোম্পানির
//     নেওয়া সিদ্ধান্ত staff-এর দোকান-তৈরি দিয়ে উল্টে যাবে না
//
// ⚠️ best-effort: customers রো আগেই তৈরি হয়ে গেছে, তাই এখানে কিছু ব্যর্থ
// হলে caller-এর উচিত শুধু লগ করা, মূল customer creation fail না করা।
// Returns: { status: 'connected'|'pending'|'blocked'|'disconnected'|'rejected', created: boolean }
// ============================================================
async function autoConnectStaffCreatedCustomer(customerId, tenantId, createdByUserId = null) {
    // lazy require — portalPerson.service ও এই ফাইলের মধ্যে circular import এড়াতে
    const { ensurePersonForCustomer } = require('./portalPerson.service');
    const personId = await ensurePersonForCustomer(customerId);

    // ইতিমধ্যে যেকোনো সম্পর্ক আছে কিনা (সবচেয়ে সাম্প্রতিকটা)
    const existing = await query(
        `SELECT id, status, customer_id FROM customer_company_connections
         WHERE person_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [personId, tenantId]
    );

    if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.status === 'connected' && !row.customer_id) {
            await query(
                `UPDATE customer_company_connections SET customer_id = $1 WHERE id = $2`,
                [customerId, row.id]
            );
        }
        return { status: row.status, created: false };
    }

    // race-safe: UNIQUE ইনডেক্স নেই, তাই NOT EXISTS দিয়ে ডুপ্লিকেট ঠেকানো
    const inserted = await query(
        `INSERT INTO customer_company_connections
            (person_id, tenant_id, customer_id, status, initiated_by, requested_by_user_id, responded_at)
         SELECT $1, $2, $3, 'connected', 'staff_created', $4, NOW()
         WHERE NOT EXISTS (
             SELECT 1 FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2
         )
         RETURNING id`,
        [personId, tenantId, customerId, createdByUserId]
    );
    return { status: 'connected', created: inserted.rows.length > 0 };
}

module.exports = {
    ensureCustomerForPerson,
    autoConnectStaffCreatedCustomer,
    REJECT_COOLDOWN_HOURS,
};
