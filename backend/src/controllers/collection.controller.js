// backend/src/controllers/collection.controller.js
// বাকি আদায় (Collection) — SR কাস্টমারের কাছ থেকে টাকা সংগ্রহ করলে
// এখানে রেকর্ড হয়।
//
// Flow:
//   SR জমা দেয় (status: pending)
//       ↓
//   Settlement submit হলে auto: submitted
//       ↓
//   Admin verify করলে: verified  ← এখানে customer.current_credit কমে
//
// কেন verified-এ current_credit কমে?
//   SR ভুল এন্ট্রি বা fraud ঠেকাতে admin-verify ছাড়া customer balance
//   পরিবর্তন হওয়া উচিত নয়।
//   Frontend-এ "optimistic" কমানো হয় শুধু local display-এর জন্য।
// ─────────────────────────────────────────────────────────────

const { query, withTransaction } = require('../config/db');
const multer                     = require('multer');
const sharp                      = require('sharp');
const { uploadToStorage }        = require('../config/firebase'); // existing upload helper

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

        // ── ✅ FIX: sr_id বাদ — customers এ sr_id column নেই ──
        const custResult = await query(
            `SELECT c.id, c.shop_name, c.current_credit
             FROM customers c
             WHERE c.id = $1`,
            [customer_id]
        );
        if (custResult.rows.length === 0)
            return res.status(404).json({ message: 'কাস্টমার পাওয়া যায়নি' });

        const cust = custResult.rows[0];

        // ── ✅ FIX: customer_assignments.worker_id দিয়ে চেক ───
        // customers.sr_id নেই — customer_assignments table এ
        // worker_id দিয়ে SR ↔ Customer relation আছে
        if (req.user.role === 'worker') {
            const assignCheck = await query(
                `SELECT 1
                 FROM customer_assignments
                 WHERE customer_id = $1
                   AND worker_id   = $2
                   AND is_active   = true
                 LIMIT 1`,
                [customer_id, sr_id]
            );
            if (assignCheck.rows.length === 0)
                return res.status(403).json({ message: 'এই কাস্টমারে আপনার অ্যাক্সেস নেই' });
        }

        // পরিমাণ বকেয়ার চেয়ে বেশি হতে পারবে না (১ টাকা tolerance)
        const currentDue = parseFloat(cust.current_credit || 0);
        if (parsedAmount > currentDue + 1)
            return res.status(400).json({
                message: `বকেয়া ৳${currentDue.toLocaleString()} এর বেশি নেওয়া যাবে না`,
            });

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

        // ── Insert collection record ──────────────────────────
        const insertResult = await query(
            `INSERT INTO collections
               (sr_id, customer_id, amount, payment_mode,
                cheque_bank, cheque_no, cheque_date,
                receipt_photo_url, note, latitude, longitude,
                status, created_at)
             VALUES
               ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW())
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
            ]
        );

        const collection = insertResult.rows[0];

        return res.status(201).json({
            message: `৳${parsedAmount.toLocaleString()} বাকি আদায় রেকর্ড হয়েছে`,
            data:    collection,
        });

    } catch (err) {
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
             ORDER BY col.created_at DESC`,
            [sr_id, date]
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
             ORDER BY col.created_at DESC
             LIMIT $2 OFFSET $3`,
            [customerId, limit, offset]
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
            `SELECT * FROM collections WHERE id = $1 AND status = 'submitted'`,
            [id]
        );
        if (colResult.rows.length === 0)
            return res.status(404).json({ message: 'Collection পাওয়া যায়নি বা submitted নয়' });

        const col = colResult.rows[0];

        if (action === 'reject') {
            await query(
                `UPDATE collections
                 SET status = 'rejected', reject_reason = $2, verified_by = $3, verified_at = NOW()
                 WHERE id = $1`,
                [id, reject_reason || null, adminId]
            );
            return res.json({ message: 'Collection বাতিল করা হয়েছে' });
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

            // customer.current_credit কমাও (minimum 0)
            await client.query(
                `UPDATE customers
                 SET current_credit = GREATEST(0, current_credit - $1),
                     updated_at     = NOW()
                 WHERE id = $2`,
                [parseFloat(col.amount), col.customer_id]
            );
        });

        return res.json({ message: `৳${parseFloat(col.amount).toLocaleString()} বাকি verified এবং কাস্টমারের খাতা থেকে বাদ হয়েছে` });

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
                 'id',           id,
                 'shop_name',    c.shop_name,
                 'amount',       col.amount,
                 'payment_mode', col.payment_mode
               ) ORDER BY col.created_at DESC) AS items
             FROM collections col
             JOIN customers c ON c.id = col.customer_id
             WHERE col.sr_id = $1
               AND col.created_at::date = $2
               AND col.status IN ('pending', 'submitted')`,
            [sr_id, today]
        );

        return res.json({ data: result.rows[0] });

    } catch (err) {
        console.error('getSettlementCollectionSummary error:', err);
        return res.status(500).json({ message: 'সার্ভার সমস্যা' });
    }
};

module.exports = {
    upload,                          // multer middleware (routes-এ ব্যবহার)
    createCollection,
    getMyCollections,
    getCustomerCollections,
    verifyCollection,
    getSettlementCollectionSummary,
    submitCollectionsWithSettlement, // settlement.controller.js থেকে import করে ব্যবহার
};
