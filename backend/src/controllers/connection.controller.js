// ============================================================
// CONNECTION CONTROLLER — Company ↔ Customer Multi-Company Network
// Base: /api/connections   (staff/company side — req.user, req.tenantId)
//
// Phase 1: person identity + connection request/accept/reject/disconnect
// এই ফাইলটা নতুন — কোনো বিদ্যমান ফাইল স্পর্শ করা হয়নি।
// ============================================================

const { query }   = require('../config/db');
const logger      = require('../config/logger');
const { ensureCustomerForPerson, REJECT_COOLDOWN_HOURS } = require('../services/customerConnection.service');
const { computePaymentReliabilityScore } = require('../services/paymentReliability.service'); // ✅ NEW (Phase 5)
const { sendPortalWhatsAppMessage } = require('../services/portalWhatsapp.service');

// ✅ REFACTOR (Phase 2): ensureCustomerForPerson ও REJECT_COOLDOWN_HOURS
// আগে এখানে local ছিল — customerPortalConnection.controller.js একই
// লজিক ইনলাইন কপি করে রেখেছিল। এখন services/customerConnection.
// service.js থেকে শেয়ার্ডভাবে import হয়, দুই controller-ই একই সোর্স।

// ============================================================
// ✅ NEW (Phase 4 — কোড অডিট): WhatsApp নোটিফিকেশন হেলপার
//
// ⚠️ সংশোধনী: Phase 0/3-এ আমি ধরে নিয়েছিলাম "sendCustomerNotification"
// (customerNotification.controller.js) WhatsApp পাঠায় — যাচাই করে
// দেখলাম সেটা ভুল ছিল। ওটা আসলে in-app bell + FCM push + email fallback
// (কোনো WhatsApp না)। আসল WhatsApp mechanism হলো portalWhatsapp.
// service.js (Baileys গেটওয়ে) — cust.whatsapp-এ OTP/security alert
// পাঠাতে আগে থেকেই ব্যবহৃত হয়। এখানে সেটাই connection event-এর জন্য
// reuse করা হচ্ছে।
//
// শুধু staff-side action-গুলোতে (এই ফাইল) হুক করা হয়েছে, কারণ এই
// ফাইলের action-গুলোর টার্গেট (person) কে WhatsApp পাঠানো সোজা —
// persons.phone/whatsapp সরাসরি আছে। customerPortalConnection.
// controller.js-এর action-গুলোর টার্গেট staff (company side), যেখানে
// নোটিফিকেশনের সঠিক জায়গা হলো বিদ্যমান staff in-app bell (notification.
// controller.js), কিন্তু সেই টেবিলের sender_id কলাম NOT NULL FK →
// users(id) — কোনো "system" sender concept নেই (migration_notification_
// module.sql দেখুন), তাই এই phase-এ সেটা হুক করা হয়নি (নিচে module.exports-
// এর ঠিক উপরে বিস্তারিত নোট)। fire-and-forget — WhatsApp পাঠানো ব্যর্থ
// হলেও কখনো মূল request fail করে না।
// ============================================================
async function notifyPersonAboutConnectionEvent(personId, tenantId, messageBuilder) {
    try {
        const [personRes, tenantRes] = await Promise.all([
            query(`SELECT whatsapp, phone FROM persons WHERE id = $1`, [personId]),
            query(`SELECT company_name, company_name_bn FROM tenants WHERE id = $1`, [tenantId]),
        ]);
        const person = personRes.rows[0];
        const tenant = tenantRes.rows[0];
        if (!person) return;

        const targetPhone = person.whatsapp || person.phone;
        if (!targetPhone) return;

        const companyLabel = (tenant && (tenant.company_name_bn || tenant.company_name)) || 'একটি কোম্পানি';
        await sendPortalWhatsAppMessage(targetPhone, messageBuilder(companyLabel), 'connection_event');
    } catch (err) {
        logger.warn('⚠️ connection WhatsApp notify ব্যর্থ:', err.message);
    }
}

// ============================================================
// GET /api/connections/search-persons?q=...
// ফোন/হোয়াটসঅ্যাপ/ইমেইল/QR-কোড/নাম দিয়ে গ্লোবাল person সার্চ
//
// ✅ FIX (Phase 1 — প্রাইভেসি লিক): আগে discoverable=false হলেও ফোন/
// হোয়াটসঅ্যাপ/নাম ম্যাচ করলেই ফোন/হোয়াটসঅ্যাপ/ইমেইল সরাসরি ফেরত দিত —
// discovery.controller.js-এর getDiscoveryShops-এ যে মাস্কিং যত্ন করে করা
// হয়েছে (contact info hide করা connect না হওয়া পর্যন্ত), এখানে করা
// ছিল না। এখন discoverable=false ব্যক্তিরা fuzzy (phone/whatsapp/email/
// name) ম্যাচ থেকে বাদ পড়বে, যদি না ইতিমধ্যে এই tenant-এর সাথে pending/
// connected সম্পর্ক থাকে। qr_code এক্সাক্ট ম্যাচ discoverable-নির্বিশেষে
// কাজ করবে — QR স্ট্রিং হাতে থাকা মানে সামনাসামনি সাক্ষাতের সমতুল্য
// বিশ্বাস (connectViaQrScan-এর একই ট্রাস্ট-লেভেল)।
//
// ✅ FIX (Phase 3): blocked সম্পর্ক থাকলে qr_code exact match-সহ সবকিছু
// override করে সার্চ থেকে বাদ পড়ে — block মানেই সম্পর্ক পুরোপুরি বন্ধ,
// এমনকি সামনাসামনি QR স্ক্যান করেও আর reconnect করা যাবে না।
// ============================================================
const searchPersons = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 3) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে ৩ অক্ষর লিখুন।' });
        }

        const result = await query(
            `SELECT p.id, p.full_name, p.phone, p.whatsapp, p.email, p.qr_code,
                    ccc.status AS existing_status
             FROM persons p
             LEFT JOIN customer_company_connections ccc
                    ON ccc.person_id = p.id AND ccc.tenant_id = $2
                    AND ccc.status IN ('pending','connected','blocked')
             WHERE ccc.status IS DISTINCT FROM 'blocked'
               AND (
                     p.qr_code = $3
                     OR (
                          (p.phone ILIKE $1 OR p.whatsapp ILIKE $1 OR p.email ILIKE $1 OR p.full_name ILIKE $1)
                          AND (p.discoverable = true OR ccc.status IN ('pending','connected'))
                        )
                   )
             LIMIT 20`,
            [`%${q}%`, req.tenantId, q]
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ searchPersons error:', err.message);
        res.status(500).json({ success: false, message: 'সার্চ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/request   { person_id }
// কোম্পানি → কাস্টমার রিকোয়েস্ট (Accept লাগবে)
//
// ✅ FIX (Phase 1 — cooldown): আগে reject করার পরও সাথে সাথেই আবার
// রিকোয়েস্ট পাঠানো যেত (dup-check শুধু pending/connected দেখত, rejected
// বাদ ছিল)। এখন rejected হওয়ার পর REJECT_COOLDOWN_HOURS সময় নতুন
// রিকোয়েস্ট ব্লক থাকবে।
//
// ✅ FIX (Phase 3 — blocked): blocked সম্পর্ক থাকলে cooldown-এর মতো
// সময়সীমা নেই — staff নিজে unblock না করা পর্যন্ত স্থায়ীভাবে বন্ধ থাকে।
// ============================================================
const sendConnectionRequest = async (req, res) => {
    try {
        const { person_id } = req.body;
        if (!person_id) {
            return res.status(400).json({ success: false, message: 'person_id দিন।' });
        }

        const dup = await query(
            `SELECT id, status, responded_at, created_at FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2
               AND (
                     status IN ('pending','connected','blocked')
                     OR (status = 'rejected' AND COALESCE(responded_at, created_at) > NOW() - make_interval(hours => $3))
                   )
             ORDER BY created_at DESC
             LIMIT 1`,
            [person_id, req.tenantId, REJECT_COOLDOWN_HOURS]
        );
        if (dup.rows.length > 0) {
            const existing = dup.rows[0];
            if (existing.status === 'blocked') {
                return res.status(403).json({
                    success: false,
                    message: 'এই কাস্টমারের সাথে সংযোগ ব্লক করা আছে। রিকোয়েস্ট পাঠানোর আগে unblock করুন।',
                });
            }
            if (existing.status === 'rejected') {
                return res.status(429).json({
                    success: false,
                    message: `এই কাস্টমার সম্প্রতি রিকোয়েস্ট প্রত্যাখ্যান করেছেন। ${REJECT_COOLDOWN_HOURS} ঘণ্টা পর আবার চেষ্টা করুন।`,
                });
            }
            return res.status(409).json({
                success: false,
                message: existing.status === 'connected'
                    ? 'ইতিমধ্যে সংযুক্ত।'
                    : 'রিকোয়েস্ট আগে থেকেই পাঠানো আছে।',
            });
        }

        const created = await query(
            `INSERT INTO customer_company_connections
                (person_id, tenant_id, status, initiated_by, requested_by_user_id)
             VALUES ($1, $2, 'pending', 'company_search', $3)
             RETURNING *`,
            [person_id, req.tenantId, req.user.id]
        );

        // ✅ NEW (Phase 4): fire-and-forget — response block করে না
        notifyPersonAboutConnectionEvent(person_id, req.tenantId, (companyLabel) =>
            `🔗 *${companyLabel}* আপনাকে সংযোগের অনুরোধ পাঠিয়েছে।\nপোর্টালে গিয়ে গ্রহণ বা প্রত্যাখ্যান করুন।`
        );

        res.status(201).json({ success: true, data: created.rows[0] });
    } catch (err) {
        logger.error('❌ sendConnectionRequest error:', err.message);
        res.status(500).json({ success: false, message: 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/qr-scan   { qr_code }
// SR সামনাসামনি স্ক্যান করলে — সাথে সাথে connect (approval লাগবে না)
// ============================================================
const connectViaQrScan = async (req, res) => {
    try {
        const { qr_code } = req.body;
        if (!qr_code) {
            return res.status(400).json({ success: false, message: 'qr_code দিন।' });
        }

        const person = await query(`SELECT id FROM persons WHERE qr_code = $1`, [qr_code]);
        if (person.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'এই QR কোড দিয়ে কোনো কাস্টমার পাওয়া যায়নি।' });
        }
        const personId = person.rows[0].id;

        // আগে থেকে connected/pending/blocked থাকলে সেই অনুযায়ী হ্যান্ডল করো
        const existing = await query(
            `SELECT * FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2
               AND status IN ('pending','connected','blocked')`,
            [personId, req.tenantId]
        );
        if (existing.rows.length > 0 && existing.rows[0].status === 'connected') {
            return res.json({ success: true, message: 'ইতিমধ্যে সংযুক্ত।', data: existing.rows[0] });
        }
        // ✅ FIX (Phase 3): blocked থাকলে QR স্ক্যান দিয়েও reconnect করা
        // যাবে না — QR-এর "সামনাসামনি সাক্ষাত" ট্রাস্ট block-কে override
        // করে না, block-ই সবচেয়ে শক্তিশালী স্ট্যাটাস।
        if (existing.rows.length > 0 && existing.rows[0].status === 'blocked') {
            return res.status(403).json({ success: false, message: 'এই কাস্টমারের সাথে সংযোগ ব্লক করা আছে।' });
        }

        const customerId = await ensureCustomerForPerson(personId, req.tenantId, req.user.id);

        let connectionRow;
        if (existing.rows.length > 0) {
            const updated = await query(
                `UPDATE customer_company_connections
                 SET status = 'connected', customer_id = $2, responded_at = NOW()
                 WHERE id = $1 RETURNING *`,
                [existing.rows[0].id, customerId]
            );
            connectionRow = updated.rows[0];
        } else {
            const created = await query(
                `INSERT INTO customer_company_connections
                    (person_id, tenant_id, customer_id, status, initiated_by, requested_by_user_id, responded_at)
                 VALUES ($1, $2, $3, 'connected', 'qr_scan', $4, NOW())
                 RETURNING *`,
                [personId, req.tenantId, customerId, req.user.id]
            );
            connectionRow = created.rows[0];
        }

        res.status(201).json({ success: true, message: 'সংযুক্ত হয়েছে!', data: connectionRow });
    } catch (err) {
        if (err.code === 'CUSTOMER_LIMIT_REACHED') {
            return res.status(403).json({
                success: false,
                code: 'CUSTOMER_LIMIT_REACHED',
                message: `কাস্টমার সীমা (${err.used}/${err.limit}) শেষ হয়ে গেছে। নতুন কাস্টমার যোগ করতে হলে প্ল্যান আপগ্রেড করতে হবে।`,
                data: { used: err.used, limit: err.limit }
            });
        }
        logger.error('❌ connectViaQrScan error:', err.message);
        res.status(500).json({ success: false, message: 'QR স্ক্যান করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/connections/persons/:personId/reliability-score
// ✅ NEW (Phase 5 — কোড অডিট): "পেমেন্ট রিলায়েবিলিটি স্কোর" — staff একটা
// pending রিকোয়েস্ট accept করার আগে, বা যেকোনো person-এর ইতিহাস দেখতে
// চাইলে, এই এন্ডপয়েন্ট থেকে খুঁজে দেখতে পারে (formula/সীমাবদ্ধতা:
// services/paymentReliability.service.js-এর হেডার কমেন্টে বিস্তারিত)।
// tenant-নির্বিশেষে (person-এর সব কানেক্টেড সম্পর্ক জুড়ে) — এটাই এর
// আসল ভ্যালু: "এই কাস্টমার অন্য কোম্পানিগুলোর সাথে কেমন করেছে" এখনো
// কানেক্ট না হওয়া কোম্পানিও দেখতে পারবে, নতুন রিকোয়েস্ট বিবেচনা করার সময়।
// ============================================================
const getPersonReliabilityScore = async (req, res) => {
    try {
        const { personId } = req.params;
        const result = await computePaymentReliabilityScore(personId);
        if (result === null) {
            return res.json({
                success: true,
                data: { score: null, message: 'পর্যাপ্ত ডেটা নেই (কোনো connected সম্পর্ক পাওয়া যায়নি)।' },
            });
        }
        res.json({ success: true, data: result });
    } catch (err) {
        logger.error('❌ getPersonReliabilityScore error:', err.message);
        res.status(500).json({ success: false, message: 'স্কোর হিসাব করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/connections?status=pending|connected|rejected|disconnected|blocked
// এই tenant-এর সব connection লিস্ট (Phase 3: blocked-ও এখন valid ফিল্টার,
// কোড পরিবর্তন লাগেনি — status জেনেরিকভাবে যেকোনো ভ্যালু accept করে)
// ============================================================
const listConnections = async (req, res) => {
    try {
        const { status } = req.query;
        const params = [req.tenantId];
        let where = 'ccc.tenant_id = $1';
        if (status) {
            params.push(status);
            where += ` AND ccc.status = $${params.length}`;
        }

        const result = await query(
            `SELECT ccc.*, p.full_name, p.phone, p.whatsapp, p.email,
                    c.shop_name, c.customer_code
             FROM customer_company_connections ccc
             JOIN persons p ON p.id = ccc.person_id
             LEFT JOIN customers c ON c.id = ccc.customer_id
             WHERE ${where}
             ORDER BY ccc.created_at DESC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ listConnections error:', err.message);
        res.status(500).json({ success: false, message: 'লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/accept   (কাস্টমারের পাঠানো রিকোয়েস্ট)
// ============================================================
const acceptConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const conn = await query(
            `SELECT * FROM customer_company_connections WHERE id = $1 AND tenant_id = $2 AND status = 'pending'`,
            [id, req.tenantId]
        );
        if (conn.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const customerId = await ensureCustomerForPerson(conn.rows[0].person_id, req.tenantId, req.user.id);

        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'connected', customer_id = $2, responded_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id, customerId]
        );

        // ✅ NEW (Phase 4): fire-and-forget
        notifyPersonAboutConnectionEvent(conn.rows[0].person_id, req.tenantId, (companyLabel) =>
            `✅ *${companyLabel}* আপনার সংযোগের অনুরোধ গ্রহণ করেছে।\nএখন থেকে আপনি তাদের সাথে লেনদেন করতে পারবেন।`
        );

        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        if (err.code === 'CUSTOMER_LIMIT_REACHED') {
            return res.status(403).json({
                success: false,
                code: 'CUSTOMER_LIMIT_REACHED',
                message: `কাস্টমার সীমা (${err.used}/${err.limit}) শেষ হয়ে গেছে। নতুন কাস্টমার যোগ করতে হলে প্ল্যান আপগ্রেড করতে হবে।`,
                data: { used: err.used, limit: err.limit }
            });
        }
        logger.error('❌ acceptConnection error:', err.message);
        res.status(500).json({ success: false, message: 'Accept করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/reject
// ============================================================
const rejectConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'rejected', responded_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        // ✅ NEW (Phase 4): fire-and-forget
        notifyPersonAboutConnectionEvent(updated.rows[0].person_id, req.tenantId, (companyLabel) =>
            `আপনার পাঠানো সংযোগের অনুরোধটি *${companyLabel}* গ্রহণ করেনি।`
        );

        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ rejectConnection error:', err.message);
        res.status(500).json({ success: false, message: 'Reject করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/disconnect
// ============================================================
const disconnectConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'disconnected', disconnected_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'connected'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সংযোগ পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ disconnectConnection error:', err.message);
        res.status(500).json({ success: false, message: 'বিচ্ছিন্ন করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/block
// ✅ NEW (Phase 3): reject/disconnect-এর পরও কাস্টমার আবার রিকোয়েস্ট
// পাঠাতে পারে (rejected-এ ২৪ ঘণ্টা cooldown মাত্র, disconnected-এ কোনো
// বাধাই নেই)। block করলে সেটা স্থায়ীভাবে বন্ধ থাকে যতক্ষণ না company
// নিজে unblock করে — কোনো cooldown expiry নেই। যেকোনো non-blocked
// status থেকেই block করা যায় (pending থেকেও — reject না করেই সরাসরি
// block করা যায়, একটাই একশন)।
// ============================================================
const blockConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'blocked', blocked_at = NOW(), blocked_by = 'company'
             WHERE id = $1 AND tenant_id = $2 AND status != 'blocked'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সংযোগ পাওয়া যায়নি (অথবা আগে থেকেই ব্লক করা)।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ blockConnection error:', err.message);
        res.status(500).json({ success: false, message: 'ব্লক করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/unblock
// ✅ NEW (Phase 3): শুধু company নিজে যা ব্লক করেছে (blocked_by='company')
// তা-ই unblock করতে পারে — কাস্টমার নিজে পোর্টাল থেকে company-এর করা
// ব্লক তুলতে পারবে না (এবং উল্টোটাও না, দেখুন customerPortalConnection.
// controller.js: unblockCompanyConnection)। এই দিক-নির্দিষ্টতা ইচ্ছাকৃত —
// নইলে একজন block করা কাস্টমার নিজেই নিজেকে unblock করে দিতে পারত।
// unblock করলে status 'disconnected'-এ ফিরে যায় (নতুন করে রিকোয়েস্ট
// পাঠানো/গ্রহণ করা সম্ভব, কিন্তু connected অবস্থায় ফিরতে নতুন accept লাগবে)।
// ============================================================
const unblockConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'disconnected', blocked_at = NULL, blocked_by = NULL, disconnected_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'blocked' AND blocked_by = 'company'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'company-এর ব্লক করা সংযোগ পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ unblockConnection error:', err.message);
        res.status(500).json({ success: false, message: 'আনব্লক করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    searchPersons,
    sendConnectionRequest,
    connectViaQrScan,
    listConnections,
    getPersonReliabilityScore,
    acceptConnection,
    rejectConnection,
    disconnectConnection,
    blockConnection,
    unblockConnection,
};
