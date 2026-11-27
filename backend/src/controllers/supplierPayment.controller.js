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

// PO-র বাকি = total_amount − SUM(allocations)
const PO_PAID_SQL = `COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.purchase_order_id = po.id), 0)`;
const COUNTED_STATUS = `('ordered','partial','received')`;

// পেমেন্ট বরাদ্দ: নির্দিষ্ট PO দিলে সেখানে, না দিলে পুরনো PO থেকে শুরু করে (FIFO)।
// অবশ্যই withTransaction-এর ভেতরে, সাপ্লায়ার row-lock নেওয়ার পরে কল করতে হবে।
const allocatePayment = async (client, { tenantId, supplierId, paymentId, amount, purchaseOrderId }) => {
    let left = amount;
    const pos = await client.query(
        `SELECT po.id, po.total_amount, ${PO_PAID_SQL} AS paid
         FROM purchase_orders po
         WHERE po.supplier_id = $1 AND po.tenant_id = $2 AND po.status IN ${COUNTED_STATUS}
           ${purchaseOrderId ? 'AND po.id = $3' : ''}
         ORDER BY po.order_date ASC, po.created_at ASC`,
        purchaseOrderId ? [supplierId, tenantId, purchaseOrderId] : [supplierId, tenantId]
    );
    for (const po of pos.rows) {
        if (left <= 0) break;
        const due = parseFloat(po.total_amount) - parseFloat(po.paid);
        if (due <= 0) continue;
        const take = Math.min(left, due);
        await client.query(
            `INSERT INTO supplier_payment_allocations (tenant_id, payment_id, purchase_order_id, amount)
             VALUES ($1,$2,$3,$4)`,
            [tenantId, paymentId, po.id, take]
        );
        left = Math.round((left - take) * 100) / 100;
    }
    // left > 0 মানে বরাদ্দের বাইরে অগ্রিম/অতিরিক্ত — সাপ্লায়ার-লেভেলেই থাকবে
    return left;
};

// ============================================================
// PAY SUPPLIER (সাপ্লায়ারকে পেমেন্ট)
// POST /api/suppliers/:id/pay
// body: { amount, payment_method, reference_no, notes, idempotency_key }
// ============================================================
const paySupplier = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const { amount, payment_method, reference_no, notes, idempotency_key, purchase_order_id } = req.body;

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

            // নির্দিষ্ট PO-র জন্য পেমেন্ট হলে তার বাকির বেশি দেওয়া যাবে না
            if (purchase_order_id) {
                const poRes = await client.query(
                    `SELECT po.po_number, po.total_amount, ${PO_PAID_SQL} AS paid
                     FROM purchase_orders po
                     WHERE po.id = $1 AND po.supplier_id = $2 AND po.tenant_id = $3
                       AND po.status IN ${COUNTED_STATUS}`,
                    [purchase_order_id, supplierId, req.tenantId]
                );
                if (poRes.rows.length === 0) {
                    const err = new Error('এই PO-তে পেমেন্ট করা যাবে না (অর্ডার করা হয়নি বা বাতিল)।');
                    err.statusCode = 400;
                    throw err;
                }
                const poDue = parseFloat(poRes.rows[0].total_amount) - parseFloat(poRes.rows[0].paid);
                if (parsedAmount > poDue + 1) {
                    const err = new Error(`${poRes.rows[0].po_number}-এর বাকি ৳${poDue.toLocaleString()} এর বেশি পেমেন্ট করা যাবে না।`);
                    err.statusCode = 400;
                    throw err;
                }
            }

            const payIns = await client.query(
                `INSERT INTO supplier_payments
                    (tenant_id, supplier_id, amount, payment_method, reference_no, notes, recorded_by, idempotency_key)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING id`,
                [
                    req.tenantId, supplierId, parsedAmount,
                    payment_method || 'cash', reference_no || null, notes || null,
                    req.user.id, idempotency_key
                ]
            );

            await allocatePayment(client, {
                tenantId: req.tenantId, supplierId, paymentId: payIns.rows[0].id,
                amount: parsedAmount, purchaseOrderId: purchase_order_id || null
            });

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
            `SELECT sp.*, u.name_bn AS recorded_by_name,
                    (SELECT STRING_AGG(po.po_number, ', ' ORDER BY po.po_number)
                       FROM supplier_payment_allocations a
                       JOIN purchase_orders po ON po.id = a.purchase_order_id
                      WHERE a.payment_id = sp.id) AS po_numbers
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

// ============================================================
// PO-ভিত্তিক সারসংক্ষেপ + পেমেন্ট হিস্ট্রি
// GET /api/purchase-orders/:id/payments
// ============================================================
const getPurchaseOrderPayments = async (req, res) => {
    try {
        const poRes = await query(
            `SELECT po.id, po.po_number, po.status, po.supplier_id, po.total_amount, ${PO_PAID_SQL} AS paid_amount
             FROM purchase_orders po
             WHERE po.id = $1 AND po.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (poRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        const po = poRes.rows[0];

        const pays = await query(
            `SELECT sp.id, a.amount, sp.payment_method, sp.reference_no, sp.notes, sp.created_at,
                    u.name_bn AS recorded_by_name
             FROM supplier_payment_allocations a
             JOIN supplier_payments sp ON sp.id = a.payment_id
             LEFT JOIN users u ON u.id = sp.recorded_by
             WHERE a.purchase_order_id = $1 AND a.tenant_id = $2
             ORDER BY sp.created_at DESC`,
            [req.params.id, req.tenantId]
        );

        const total = parseFloat(po.total_amount);
        const paid  = parseFloat(po.paid_amount);
        const payable = ['ordered','partial','received'].includes(po.status);
        return res.status(200).json({
            success: true,
            data: {
                po_number: po.po_number,
                supplier_id: po.supplier_id,
                total_amount: total,
                paid_amount: paid,
                due_amount: payable ? Math.max(0, total - paid) : 0,
                can_pay: payable && total - paid > 0,
                payments: pays.rows
            }
        });
    } catch (error) {
        logger.error('❌ Get PO Payments Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্ট তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PO থেকে সরাসরি পেমেন্ট — সাপ্লায়ার-পেমেন্টের একই লজিক, PO বরাদ্দসহ
// POST /api/purchase-orders/:id/pay   body: { amount, payment_method, reference_no, notes, idempotency_key }
// ============================================================
const payPurchaseOrder = async (req, res) => {
    try {
        const poRes = await query(
            'SELECT supplier_id FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );
        if (poRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }
        req.body.purchase_order_id = req.params.id;
        req.params.id = poRes.rows[0].supplier_id;
        return paySupplier(req, res);
    } catch (error) {
        logger.error('❌ Pay PO Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্টে সমস্যা হয়েছে।' });
    }
};

module.exports = { paySupplier, getSupplierPayments, getPurchaseOrderPayments, payPurchaseOrder };
