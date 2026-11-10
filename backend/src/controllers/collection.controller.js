// backend/src/controllers/collection.controller.js
// বাকি আদায় (Collection) — SR কাস্টমারের কাছ থেকে টাকা সংগ্রহ করলে
// এখানে রেকর্ড হয়।
//
// Flow (✅ নতুন):
//   SR আদায় এন্ট্রি দেয় → সাথে সাথে customer.current_credit কমে, ইনভয়েসে বরাদ্দ হয়,
//   কাস্টমার নোটিফিকেশন পায় (status: pending, balance_applied = true)
//       ↓
//   Settlement submit হলে auto: submitted
//       ↓
//   Admin/accountant settlement-এ টাকা মিলিয়ে verify করে: verified
//                                   + SR-এর commission-এ যোগ হয়
//   ভুল/টাকা না মিললে reject: বাকি ও ইনভয়েস-বরাদ্দ আবার আগের অবস্থায় ফেরে (reversal)
//
// পুরনো (migration-এর আগের) pending/submitted এন্ট্রির balance_applied = false —
// সেগুলো verify-এর সময় আগের মতোই বাকি কমাবে, যাতে দুবার কাটা না যায়।
//
// ✅ FIX: বাকি বিক্রয়ের commission বিক্রির দিন হয় না (দেখো commission.service.js
//   ::getDailyCommissionableSales) — verify এখানেই সেই "আদায়" মুহূর্ত, তাই
//   verify হওয়ার সাথে সাথেই আজকের commission recompute করে সেই টাকা যোগ করা হয়।
// ─────────────────────────────────────────────────────────────

const { query, withTransaction }   = require('../config/db');
const multer                       = require('multer');
const sharp                        = require('sharp');
const { uploadToStorage }          = require('../config/firebase'); // existing upload helper
const { updateCommissionRealtime } = require('../services/commission.service');
const { firebaseNotify }           = require('../services/firebase.notify');
const { allocatePaymentSafe, parseSaleIds, assertSaleIdsBelongToCustomer } = require('../services/paymentAllocation.service');
const { sendCustomerNotification } = require('./customerNotification.controller');
const { sendCollectionReceipt, buildReceiptNo, saveReceiptSnapshotSafe } = require('../services/collectionReceipt.service');
const { denyWorkerOutsideTeam }    = require('../services/teamAccess.service');

// ✅ FIX: UTC নয়, BD local date — commission.service.js/sales.controller.js-এর
// getBDToday()-এর সাথে মিলবে (রাত ১২টা-ভোর ৬টা BD সময়ে UTC date এক দিন পিছিয়ে থাকে)
const getBDToday = () => {
    const bdOffset = 6 * 60 * 60 * 1000;
    return new Date(Date.now() + bdOffset).toISOString().split('T')[0];
};

// ── Multer (memory) ───────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────
// createCollection — POST /api/collections
// ─────────────────────────────────────────────────────────────
const createCollection = async (req, res) => {
    try {
        const sr_id = req.user.id;

        const {
            customer_id,
            amount,
            payment_mode  = 'cash',   // cash | cheque | bkash | nagad
            cheque_bank,
            cheque_no,
            cheque_date,
            note,
            latitude,
            longitude,
            idempotency_key,          // ✅ নতুন: double-tap / network retry-তে duplicate আটকাতে
        } = req.body;

        // ── Validation ────────────────────────────────────────
        if (!customer_id)                     return res.status(400).json({ message: 'customer_id দিন' });
        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount <= 0)
            return res.status(400).json({ message: 'সঠিক পরিমাণ দিন' });

        if (!['cash', 'cheque', 'bkash', 'nagad'].includes(payment_mode))
            return res.status(400).json({ message: 'সঠিক payment_mode দিন' });

        if (payment_mode === 'cheque' && (!cheque_bank || !cheque_no || !cheque_date))
            return res.status(400).json({ message: 'চেকের বিস্তারিত (ব্যাংক, নম্বর, তারিখ) দিন' });

        // ── ✅ Idempotency: একই key-তে আগে এন্ট্রি হয়ে থাকলে আবার বানাবো না ──
        // key ঐচ্ছিক রাখা হয়েছে যাতে পুরনো অ্যাপ ভার্সন ভেঙে না যায়;
        // নতুন অ্যাপ প্রতিটি submit-এ crypto.randomUUID() পাঠাবে।
        if (idempotency_key) {
            const dup = await query(
                `SELECT id, amount FROM collections
                 WHERE idempotency_key = $1 AND tenant_id = $2`,
                [idempotency_key, req.tenantId]
            );
            if (dup.rows.length > 0) {
                return res.status(200).json({
                    message: `৳${parseFloat(dup.rows[0].amount).toLocaleString()} বাকি আদায় রেকর্ড হয়েছে (পূর্বে সম্পন্ন হয়েছিল)`,
                    data:    dup.rows[0],
                    duplicate: true,
                });
            }
        }

        // ── কাস্টমার আছে কিনা ─────────────────────────────────
        const custResult = await query(
            `SELECT c.id, c.shop_name
             FROM customers c
             WHERE c.id = $1
             AND c.tenant_id = $2`,
            [customer_id, req.tenantId]
        );
        if (custResult.rows.length === 0)
            return res.status(404).json({ message: 'কাস্টমার পাওয়া যায়নি' });

        // ── customer_assignments.worker_id দিয়ে SR ↔ Customer চেক ───
        if (req.user.role === 'worker') {
            const assignCheck = await query(
                `SELECT 1
                 FROM customer_assignments
                 WHERE customer_id = $1
                   AND worker_id   = $2
                   AND is_active   = true
             AND tenant_id = $3
             LIMIT 1`,
                [customer_id, sr_id, req.tenantId]
            );
            if (assignCheck.rows.length === 0)
                return res.status(403).json({ message: 'এই কাস্টমারে আপনার অ্যাক্সেস নেই' });
        }

        // ── Receipt photo upload ──────────────────────────────
        let receiptPhotoUrl = null;
        if (req.file) {
            try {
                // compress to max 1280px
                const compressed = await sharp(req.file.buffer)
                    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 82 })
                    .toBuffer();

                const path = `collections/${sr_id}/${Date.now()}_receipt.jpg`;
                receiptPhotoUrl = await uploadToStorage(compressed, path, 'image/jpeg');
            } catch (uploadErr) {
                console.error('Collection photo upload failed:', uploadErr);
                // ছবি না উঠলেও collection block করা হবে না
            }
        }

        // ── ঐচ্ছিক: SR-এর বেছে নেওয়া ইনভয়েস ───────────────────
        const targetSaleIds = await assertSaleIdsBelongToCustomer(query, {
            saleIds:    parseSaleIds(req.body.sale_ids),
            customerId: customer_id,
            tenantId:   req.tenantId,
        });

        // ─── Transaction: lock → check → INSERT → বাকি কমানো → ইনভয়েসে বরাদ্দ ───
        // ✅ আদায় রেকর্ড হওয়ার মুহূর্তেই কাস্টমারের বাকি কমে — admin verify-এর অপেক্ষায়
        // নয়। এতে অ্যাপ রিফ্রেশ করলেও পুরনো বাকি ফেরত আসে না, আর একই বাকি থেকে
        // বারবার আদায় (double entry) সম্ভব নয়: FOR UPDATE lock + কমে যাওয়া
        // current_credit-এর বিপরীতে চেক।
        // Admin/accountant-এর verify এখন শুধু settlement-এ টাকা মেলানোর নিশ্চিতকরণ।
        let collection;
        let remainingCredit;
        let previousDue = null;
        let allocations = [];

        await withTransaction(async (client) => {
            const cust = await client.query(
                `SELECT current_credit FROM customers
                 WHERE id = $1 AND tenant_id = $2
                 FOR UPDATE`,
                [customer_id, req.tenantId]
            );
            if (cust.rows.length === 0) {
                const err = new Error('কাস্টমার পাওয়া যায়নি');
                err.statusCode = 404;
                throw err;
            }

            const currentDue = parseFloat(cust.rows[0].current_credit || 0);

            // পরিমাণ বকেয়ার চেয়ে বেশি হতে পারবে না (১ টাকা tolerance)
            if (parsedAmount > currentDue + 1) {
                const err = new Error(`বকেয়া ৳${currentDue.toLocaleString()} এর বেশি নেওয়া যাবে না`);
                err.statusCode = 400;
                throw err;
            }

            const insertResult = await client.query(
                `INSERT INTO collections (sr_id, customer_id, amount, payment_mode,
                    cheque_bank, cheque_no, cheque_date,
                    receipt_photo_url, note, latitude, longitude,
                    status, created_at, tenant_id,
                    idempotency_key, balance_applied${targetSaleIds.length ? ', target_sale_ids' : ''}) VALUES
                   ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW(), $12,
                    $13, true${targetSaleIds.length ? ', $14' : ''})
                 RETURNING *`,
                [
                    sr_id,
                    customer_id,
                    parsedAmount,
                    payment_mode,
                    cheque_bank  || null,
                    cheque_no    || null,
                    cheque_date  || null,
                    receiptPhotoUrl,
                    note         || null,
                    latitude     ? parseFloat(latitude)  : null,
                    longitude    ? parseFloat(longitude) : null,
                    req.tenantId,
                    idempotency_key || null,
                    ...(targetSaleIds.length ? [targetSaleIds] : []),
                ]
            );
            collection = insertResult.rows[0];

            // বাকি কমাও (minimum 0)
            const upd = await client.query(
                `UPDATE customers
                 SET current_credit = GREATEST(0, current_credit - $1),
                     updated_at     = NOW()
                 WHERE id = $2 AND tenant_id = $3
                 RETURNING current_credit`,
                [parsedAmount, customer_id, req.tenantId]
            );
            remainingCredit = parseFloat(upd.rows[0].current_credit || 0);

            // কোন ইনভয়েসের বাকি শোধ হলো (FIFO বা SR-এর বাছাই)। best-effort (SAVEPOINT)।
            previousDue = currentDue;
            await saveReceiptSnapshotSafe(client, {
                table: 'collections', id: collection.id, tenantId: req.tenantId,
                dueBefore: currentDue, dueAfter: remainingCredit,
            });
            const allocPlan = await allocatePaymentSafe(client, {
                tenantId:         req.tenantId,
                customerId:       customer_id,
                paymentId:        collection.id,
                source:           'collection',
                amount:           parsedAmount,
                preferredSaleIds: targetSaleIds.length ? targetSaleIds : undefined,
            });
            allocations = allocPlan?.allocations || [];
        });

        // ✅ কাস্টমারকে পেমেন্ট নোটিফিকেশন (transaction-এর বাইরে, ব্যর্থ হলে আদায় আটকায় না)
        const isDeferred = payment_mode === 'cheque';
        sendCustomerNotification(customer_id, {
            title: isDeferred ? '🧾 চেক গ্রহণ করা হয়েছে' : '💳 পেমেন্ট নিশ্চিত হয়েছে',
            body:  `আপনার ৳${parsedAmount.toLocaleString('bn-BD')} ${isDeferred ? 'চেক' : 'পেমেন্ট'} গ্রহণ করা হয়েছে। ` +
                   `বর্তমান বাকি: ৳${remainingCredit.toLocaleString('bn-BD')}`,
            type:  'payment_received',
        }).catch(e => console.error('[Collection] Notification error:', e.message));

        // ✅ কাস্টমারকে রসিদ (PDF) — WhatsApp, না হলে ইমেইল। fire-and-forget, ব্যর্থ হলে আদায় আটকায় না।
        sendCollectionReceipt({
            tenantId:     req.tenantId,
            customerId:   customer_id,
            paymentId:    collection.id,
            amount:       parsedAmount,
            paymentMode:  payment_mode,
            previousDue,
            remainingDue: remainingCredit,
            allocations,
            collector:    req.user,
            createdAt:    collection.created_at,
        }).catch(e => console.error('[Collection] Receipt error:', e.message));

        return res.status(201).json({
            message: `৳${parsedAmount.toLocaleString()} বাকি আদায় রেকর্ড হয়েছে`,
            data:    collection,
            remaining_credit: remainingCredit,
            receipt_no: buildReceiptNo(collection.id, collection.created_at),
        });

    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
        // concurrent duplicate (একই idempotency_key) — unique index ধরেছে
        if (err.code === '23505' && String(err.constraint || '').includes('idempotency')) {
            return res.status(200).json({
                message:   'এই আদায় আগেই রেকর্ড হয়েছে',
                duplicate: true,
            });
        }
        console.error('createCollection error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা। আবার চেষ্টা করুন।' });
    }
};

// ─────────────────────────────────────────────────────────────
// getMyCollections — GET /api/collections/my?date=YYYY-MM-DD
// SR এর নিজের collection list
// ─────────────────────────────────────────────────────────────
const getMyCollections = async (req, res) => {
    try {
        const sr_id = req.user.id;
        const date  = req.query.date || new Date().toISOString().split('T')[0];

        const result = await query(
            `SELECT
               col.*,
               c.shop_name,
               c.owner_name
             FROM collections col
             JOIN customers   c ON c.id = col.customer_id
             WHERE col.sr_id = $1
               AND col.created_at::date = $2
             AND col.tenant_id = $3
             ORDER BY col.created_at DESC`,
            [sr_id, date, req.tenantId]
        );

        // সারাংশ
        const rows         = result.rows;
        const totalAmount  = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
        const totalCount   = rows.length;

        return res.json({
            data: rows,
            summary: {
                total_amount: totalAmount,
                total_count:  totalCount,
                date,
            },
        });

    } catch (err) {
        console.error('getMyCollections error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা' });
    }
};

// ─────────────────────────────────────────────────────────────
// getCustomerCollections — GET /api/collections/customer/:customerId
// একটি কাস্টমারের সব collection history
// ─────────────────────────────────────────────────────────────
const getCustomerCollections = async (req, res) => {
    try {
        const { customerId } = req.params;

        // SR: শুধু নিজের ম্যানেজারের টিমের কাস্টমারের collection history
        if (await denyWorkerOutsideTeam(req, res, customerId)) return;

        const limit          = parseInt(req.query.limit) || 20;
        const offset         = parseInt(req.query.offset) || 0;

        const result = await query(
            `SELECT
               col.*,
               e.name_bn  AS sr_name,
               e.employee_code
             FROM collections col
             JOIN employees   e ON e.id = col.sr_id
             WHERE col.customer_id = $1
             AND col.tenant_id = $4
             ORDER BY col.created_at DESC
             LIMIT $2 OFFSET $3`,
            [customerId, limit, offset, req.tenantId]
        );

        return res.json({ data: result.rows });

    } catch (err) {
        console.error('getCustomerCollections error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা' });
    }
};

// ─────────────────────────────────────────────────────────────
// verifyCollection — PATCH /api/collections/:id/verify
// Admin/Accountant collection verify করলে customer.current_credit কমে
// ─────────────────────────────────────────────────────────────
const verifyCollection = async (req, res) => {
    try {
        const { id }   = req.params;
        const adminId  = req.user.id;
        const { action, reject_reason } = req.body; // action: 'verify' | 'reject'

        if (!['verify', 'reject'].includes(action))
            return res.status(400).json({ message: "action 'verify' বা 'reject' হতে হবে" });

        // ── Collection আছে কিনা চেক ──────────────────────────
        const colResult = await query(
            `SELECT * FROM collections WHERE id = $1 AND status = 'submitted'
             AND tenant_id = $2`,
            [id, req.tenantId]
        );
        if (colResult.rows.length === 0)
            return res.status(404).json({ message: 'Collection পাওয়া যায়নি বা submitted নয়' });

        const col = colResult.rows[0];

        if (action === 'reject') {
            await withTransaction(async (client) => {
                await client.query(
                    `UPDATE collections
                     SET status = 'rejected', reject_reason = $2, verified_by = $3, verified_at = NOW()
                     WHERE id = $1`,
                    [id, reject_reason || null, adminId]
                );

                // ✅ আদায়ের সময়ই বাকি কমে গিয়ে থাকলে এখন ফেরত দাও (reversal) —
                // কাস্টমারের খাতা আবার আগের অবস্থায়, আর ইনভয়েস-বরাদ্দও মুছে যায়।
                if (col.balance_applied) {
                    await client.query(
                        `UPDATE customers
                         SET current_credit = current_credit + $1,
                             updated_at     = NOW()
                         WHERE id = $2 AND tenant_id = $3`,
                        [parseFloat(col.amount), col.customer_id, req.tenantId]
                    );
                    await client.query(
                        `DELETE FROM payment_allocations
                         WHERE payment_source = 'collection'
                           AND payment_id     = $1
                           AND tenant_id      = $2`,
                        [id, req.tenantId]
                    );
                }
            });
            return res.json({
                message: col.balance_applied
                    ? 'Collection বাতিল করা হয়েছে এবং কাস্টমারের বাকি আগের অবস্থায় ফেরানো হয়েছে'
                    : 'Collection বাতিল করা হয়েছে',
            });
        }

        // ── verify: customer.current_credit কমাও (transaction) ─
        await withTransaction(async (client) => {
            // collection status update
            await client.query(
                `UPDATE collections
                 SET status = 'verified', verified_by = $2, verified_at = NOW()
                 WHERE id = $1`,
                [id, adminId]
            );

            // ✅ নতুন এন্ট্রিতে (balance_applied = true) বাকি আদায়ের সময়ই কমে গেছে —
            // এখানে আবার কমালে দুবার কাটা পড়ত। শুধু পুরনো (false) এন্ট্রির জন্য আগের আচরণ।
            if (!col.balance_applied) {
                await client.query(
                    `UPDATE customers
                     SET current_credit = GREATEST(0, current_credit - $1),
                         updated_at     = NOW()
                     WHERE id = $2
                 AND tenant_id = $3`,
                    [parseFloat(col.amount), col.customer_id, req.tenantId]
                );

                await allocatePaymentSafe(client, {
                    tenantId:   req.tenantId,
                    customerId: col.customer_id,
                    paymentId:  col.id,
                    source:     'collection',
                    amount:     col.amount,
                    preferredSaleIds: col.target_sale_ids || undefined,
                });
            }
        });

        // ✅ FIX: বাকি আদায় হলো — এই টাকা এখন commission-যোগ্য।
        // Main response-কে block করবে না (fail করলেও verify সফলই থাকবে,
        // রাত ১২টার commission.job.js reconciliation করে দেবে) — sales.controller.js-এর
        // post-sale commission update-এর মতোই non-blocking pattern।
        setImmediate(async () => {
            try {
                const bdToday = getBDToday();
                const { rate, amount, totalSales } = await updateCommissionRealtime(col.sr_id, bdToday, req.tenantId);
                await firebaseNotify(`live/commission/${col.sr_id}`, {
                    date: bdToday, totalSales, rate, amount,
                    reason: 'collection_verified',
                });
            } catch (commErr) {
                console.error('verifyCollection → commission update failed:', commErr.message);
            }
        });

        return res.json({ message: `৳${parseFloat(col.amount).toLocaleString()} আদায় verified হয়েছে` });

    } catch (err) {
        console.error('verifyCollection error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা' });
    }
};

// ─────────────────────────────────────────────────────────────
// submitCollectionsWithSettlement — internal helper
// Settlement submit হলে সেই দিনের pending collections → submitted
// settlement.controller.js থেকে call করতে হবে
// ─────────────────────────────────────────────────────────────
const submitCollectionsWithSettlement = async (client, sr_id, settlement_id, date) => {
    await client.query(
        `UPDATE collections
         SET status = 'submitted', settlement_id = $3
         WHERE sr_id = $1
           AND created_at::date = $2::date
           AND status = 'pending'`,
        [sr_id, date, settlement_id]
    );
};

// ─────────────────────────────────────────────────────────────
// getSettlementCollectionSummary — GET /api/collections/settlement-summary
// Settlement screen-এ আজকের collection total দেখাতে
// ─────────────────────────────────────────────────────────────
const getSettlementCollectionSummary = async (req, res) => {
    try {
        const sr_id = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        const result = await query(
            `SELECT
               COUNT(*)::int                     AS count,
               COALESCE(SUM(amount), 0)::numeric AS total_cash,
               COALESCE(
                 SUM(CASE WHEN payment_mode = 'cash'   THEN amount ELSE 0 END), 0
               )::numeric AS cash_amount,
               COALESCE(
                 SUM(CASE WHEN payment_mode != 'cash'  THEN amount ELSE 0 END), 0
               )::numeric AS non_cash_amount,
               JSON_AGG(JSON_BUILD_OBJECT(
                 'id',           col.id,
                 'shop_name',    c.shop_name,
                 'amount',       col.amount,
                 'payment_mode', col.payment_mode
               ) ORDER BY col.created_at DESC) AS items
             FROM collections col
             JOIN customers c ON c.id = col.customer_id
             WHERE col.sr_id = $1
               AND col.created_at::date = $2
               AND col.status IN ('pending', 'submitted')
             AND col.tenant_id = $3`,
            [sr_id, today, req.tenantId]
        );

        return res.json({ data: result.rows[0] });

    } catch (err) {
        console.error('getSettlementCollectionSummary error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা' });
    }
};


// ============================================================
// POST /api/collections/:source/:id/resend-receipt
//   source = 'collection' (collections টেবিল) | 'credit_payment' (পুরনো credit_payments)
//
// কাস্টমারকে বাকি-আদায়ের রসিদ (PDF) আবার পাঠায় — WhatsApp, না হলে ইমেইল।
// রসিদ নম্বর একই থাকে (id থেকে নির্ধারিত)। আদায়ের সময়ের বাকি দেখায় (স্ন্যাপশট থাকলে);
// পুরনো আদায়ে স্ন্যাপশট নেই → "বর্তমান বাকি" দেখায়।
// অ্যাক্সেস: worker (টিমের কাস্টমার), manager (নিজের রুটের), admin/accountant (পুরো tenant)।
// স্প্যাম ঠেকাতে একই আদায়ের রসিদ ৩০ সেকেন্ডে একবারই।
// ============================================================
const UUID_RE_LOCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESEND_COOLDOWN_MS = 30 * 1000;
const lastResend = new Map();   // key → timestamp (একক instance-এ যথেষ্ট; ব্যর্থ হলে শুধু সুরক্ষা কমে)

const resendReceipt = async (req, res) => {
    try {
        const { source, id } = req.params;
        if (!['collection', 'credit_payment'].includes(source) || !UUID_RE_LOCAL.test(String(id))) {
            return res.status(400).json({ success: false, message: 'অনুরোধ সঠিক নয়।' });
        }

        const isCol = source === 'collection';
        const rowRes = await query(
            isCol
                ? `SELECT id, customer_id, amount, payment_mode, status, created_at,
                          sr_id AS collector_id, due_before, due_after
                     FROM collections WHERE id = $1 AND tenant_id = $2`
                : `SELECT id, customer_id, amount, 'cash' AS payment_mode, NULL AS status, created_at,
                          COALESCE(collected_by, worker_id) AS collector_id, due_before, due_after
                     FROM credit_payments WHERE id = $1 AND tenant_id = $2`,
            [id, req.tenantId]
        ).catch(async (e) => {
            // migration_receipt_snapshot.sql না চললে স্ন্যাপশট ছাড়াই চলুক
            if (!/due_before|due_after/.test(e.message)) throw e;
            return query(
                isCol
                    ? `SELECT id, customer_id, amount, payment_mode, status, created_at, sr_id AS collector_id,
                              NULL::numeric AS due_before, NULL::numeric AS due_after
                         FROM collections WHERE id = $1 AND tenant_id = $2`
                    : `SELECT id, customer_id, amount, 'cash' AS payment_mode, NULL AS status, created_at,
                              COALESCE(collected_by, worker_id) AS collector_id,
                              NULL::numeric AS due_before, NULL::numeric AS due_after
                         FROM credit_payments WHERE id = $1 AND tenant_id = $2`,
                [id, req.tenantId]
            );
        });

        const pay = rowRes.rows[0];
        if (!pay) return res.status(404).json({ success: false, message: 'আদায়ের রেকর্ড পাওয়া যায়নি।' });
        if (pay.status === 'rejected') {
            return res.status(400).json({ success: false, message: 'বাতিল হওয়া আদায়ের রসিদ পাঠানো যায় না।' });
        }

        // ── অ্যাক্সেস ──
        if (req.user.role === 'worker') {
            if (await denyWorkerOutsideTeam(req, res, pay.customer_id)) return;
        } else if (req.user.role === 'manager') {
            const ok = await query(
                `SELECT 1 FROM customers c JOIN routes r ON r.id = c.route_id
                  WHERE c.id = $1 AND c.tenant_id = $2 AND r.manager_id = $3`,
                [pay.customer_id, req.tenantId, req.user.id]
            );
            if (ok.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার রুটে নেই।' });
            }
        }

        // ── cooldown ──
        const key = `${req.tenantId}:${source}:${id}`;
        const now = Date.now();
        if (now - (lastResend.get(key) || 0) < RESEND_COOLDOWN_MS) {
            return res.status(429).json({ success: false, message: 'রসিদ এইমাত্র পাঠানো হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' });
        }

        // ── রসিদের উপাদান ──
        const hasSnapshot = pay.due_after !== null && pay.due_after !== undefined;
        let remainingDue = hasSnapshot ? parseFloat(pay.due_after) : null;
        if (remainingDue === null) {
            const c = await query('SELECT current_credit FROM customers WHERE id = $1 AND tenant_id = $2',
                [pay.customer_id, req.tenantId]);
            remainingDue = parseFloat(c.rows[0]?.current_credit) || 0;
        }

        const alloc = await query(
            `SELECT sale_id FROM payment_allocations
              WHERE payment_source = $1 AND payment_id = $2 AND tenant_id = $3`,
            [source, id, req.tenantId]
        );
        const collector = pay.collector_id
            ? (await query('SELECT name_bn, employee_code FROM users WHERE id = $1', [pay.collector_id])).rows[0]
            : null;

        const result = await sendCollectionReceipt({
            tenantId:     req.tenantId,
            customerId:   pay.customer_id,
            paymentId:    pay.id,
            amount:       pay.amount,
            paymentMode:  pay.payment_mode || 'cash',
            previousDue:  pay.due_before !== null && pay.due_before !== undefined ? parseFloat(pay.due_before) : null,
            remainingDue,
            remainingIsCurrent: !hasSnapshot,
            allocations:  alloc.rows,
            collector,
            createdAt:    pay.created_at,
        });

        if (result.success) {
            lastResend.set(key, now);
            if (lastResend.size > 5000) lastResend.clear();   // মেমরি সীমিত রাখতে
            const via = result.channel === 'whatsapp' ? 'WhatsApp-এ' : 'ইমেইলে';
            return res.json({ success: true, message: `রসিদ ${via} পাঠানো হয়েছে।`, channel: result.channel, receipt_no: result.receiptNo });
        }
        if (result.reason === 'no_contact') {
            return res.status(422).json({ success: false, message: 'কাস্টমারের WhatsApp নম্বর বা ইমেইল নেই — রসিদ পাঠানো যায়নি।' });
        }
        if (result.reason === 'customer_not_found') {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        return res.status(502).json({ success: false, message: 'রসিদ পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।' });
    } catch (err) {
        console.error('[resendReceipt]', err);
        return res.status(500).json({ success: false, message: 'রসিদ পাঠাতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    resendReceipt,
    upload,                          // multer middleware (routes-এ ব্যবহার)
    createCollection,
    getMyCollections,
    getCustomerCollections,
    verifyCollection,
    getSettlementCollectionSummary,
    submitCollectionsWithSettlement, // settlement.controller.js থেকে import করে ব্যবহার
};
