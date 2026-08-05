// backend/src/controllers/supplierPayment.controller.js
// Payable Ledger — সাপ্লায়ারকে করা পেমেন্ট রেকর্ড ও হিস্ট্রি।
//
// customer.controller.js-এর collectCredit প্যাটার্ন (idempotency_key + FOR UPDATE row-lock +
// withTransaction) থেকে হুবহু ধার নেওয়া। কিন্তু customers.current_credit-এর মতো stored+trigger
// কলাম রাখা হয়নি — এখানে বকেয়া সবসময় freshly কম্পিউট হয় (SUM(counted PO) - SUM(payments))।
//
// কারণ: sales_transactions-এ একটা AFTER INSERT ট্রিগার (update_credit_on_sale) দিয়ে
// current_credit বাড়ানো নিরাপদ, কারণ একটা sale একবারই insert হয়, status বদলায় না।
// কিন্তু purchase_orders-এর multi-status lifecycle আছে (draft→ordered→partial/received/cancelled),
// তাই ঠিক কোন মুহূর্তে "বকেয়া বাড়বে" তা ট্রিগারে সঠিকভাবে ধরা জটিল ও ভুল হওয়ার ঝুঁকি বেশি —
// on-the-fly কম্পিউট সবসময় সঠিক থাকে, PO স্ট্যাটাস যেভাবেই বদলাক না কেন, কোনো কোড না ছুঁয়েই।

const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// একটা সাপ্লায়ারের বর্তমান বকেয়া — parameterized, $1 = supplier_id
const PAYABLE_SQL = `
    COALESCE((SELECT SUM(po.total_amount) FROM purchase_orders po
        WHERE po.supplier_id = $1 AND po.status IN ('ordered','partial','received')), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = $1), 0)
`;

// ============================================================
// PAY SUPPLIER (সাপ্লায়ারকে পেমেন্ট)
// POST /api/suppliers/:id/pay
// body: { amount, payment_method, reference_no, notes, idempotency_key }
// ============================================================
const paySupplier = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const { amount, payment_method, reference_no, notes, idempotency_key } = req.body;

        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
        }

        // idempotency_key — ডাবল সাবমিট/নেটওয়ার্ক রিট্রাইতে ডুপ্লিকেট পেমেন্ট রোধ।
        // Frontend প্রতিটি submit-এ crypto.randomUUID() পাঠাবে (collect-credit-এর মতোই)।
        if (!idempotency_key) {
            return res.status(400).json({ success: false, message: 'idempotency_key প্রয়োজন।' });
        }

        const existing = await query(
            'SELECT id FROM supplier_payments WHERE idempotency_key = $1',
            [idempotency_key]
        );
        if (existing.rows.length > 0) {
            // একই key-তে আগেই payment হয়ে গেছে — duplicate, 200 (idempotent response)
            return res.status(200).json({
                success: true,
                message: `৳${parsedAmount.toLocaleString()} পেমেন্ট সফল। (পূর্বে সম্পন্ন হয়েছিল)`
            });
        }

        let remainingPayable;

        // ─── Transaction: লক + freshly-কম্পিউটেড বকেয়া চেক + INSERT — race condition-মুক্ত ───
        await withTransaction(async (client) => {
            // FOR UPDATE: একই সাপ্লায়ারে concurrent পেমেন্ট serialize করে, যাতে দুটো
            // একসাথে এসে দুটোই "যথেষ্ট বকেয়া আছে" ভেবে পাস না করে যায়
            const sup = await client.query(
                'SELECT id, name FROM suppliers WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [supplierId, req.tenantId]
            );
            if (sup.rows.length === 0) {
                const err = new Error('সাপ্লায়ার পাওয়া যায়নি।');
                err.statusCode = 404;
                throw err;
            }

            // লক নেওয়ার পরেই বকেয়া freshly হিসাব — আগের কোনো পেমেন্ট/PO মিস হবে না
            const payableRes = await client.query(`SELECT ${PAYABLE_SQL} AS payable`, [supplierId]);
            const currentPayable = parseFloat(payableRes.rows[0].payable);

            if (parsedAmount > currentPayable + 1) { // ১ টাকা tolerance — রাউন্ডিং সমস্যা এড়াতে
                const err = new Error(`বকেয়া ৳${currentPayable.toLocaleString()} এর বেশি পেমেন্ট করা যাবে না।`);
                err.statusCode = 400;
                throw err;
            }

            await client.query(
                `INSERT INTO supplier_payments
                    (tenant_id, supplier_id, amount, payment_method, reference_no, notes, recorded_by, idempotency_key)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    req.tenantId, supplierId, parsedAmount,
                    payment_method || 'cash', reference_no || null, notes || null,
                    req.user.id, idempotency_key
                ]
            );

            remainingPayable = Math.max(0, currentPayable - parsedAmount);
        });

        return res.status(200).json({
            success: true,
            message: `৳${parsedAmount.toLocaleString()} পেমেন্ট সফল।`,
            data: { remaining_payable: remainingPayable }
        });

    } catch (error) {
        // transaction-এর ভেতর থেকে throw করা known error (404 / বকেয়ার বেশি)
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        // idempotency_key-তে unique constraint violation — concurrent duplicate request
        if (error.code === '23505' && error.constraint?.includes('idempotency')) {
            return res.status(200).json({ success: true, message: 'পেমেন্ট সফল। (পূর্বে সম্পন্ন হয়েছিল)' });
        }
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'সাপ্লায়ার তথ্য সঠিক নয়।' });
        }
        logger.error('❌ Pay Supplier Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্টে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SUPPLIER PAYMENTS (পেমেন্ট হিস্ট্রি)
// GET /api/suppliers/:id/payments?limit=&offset=
// ============================================================
const getSupplierPayments = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 20, 100);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const result = await query(
            `SELECT sp.*, u.name_bn AS recorded_by_name
             FROM supplier_payments sp
             LEFT JOIN users u ON u.id = sp.recorded_by
             WHERE sp.supplier_id = $1 AND sp.tenant_id = $2
             ORDER BY sp.created_at DESC
             LIMIT $3 OFFSET $4`,
            [supplierId, req.tenantId, limit, offset]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Supplier Payments Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্ট হিস্ট্রি আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { paySupplier, getSupplierPayments };
