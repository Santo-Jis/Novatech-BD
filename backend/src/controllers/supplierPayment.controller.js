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

// বকেয়া = গৃহীত মালের মূল্য (quantity_received × unit_cost) − সাপ্লায়ারকে মাল ফেরত − সক্রিয় (বাতিল নয়) পেমেন্ট।
// মাল আসার আগে শুধু "অর্ডার করা" PO বকেয়া হয় না।
const PAYABLE_SQL = `
    COALESCE((SELECT SUM(poi.quantity_received * poi.unit_cost)
                FROM purchase_order_items poi
                JOIN purchase_orders po ON po.id = poi.purchase_order_id
               WHERE po.supplier_id = $1 AND po.status IN ('ordered','partial','received')), 0)
  - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr
                JOIN purchase_orders po ON po.id = pr.purchase_order_id
               WHERE pr.supplier_id = $1 AND po.status IN ('ordered','partial','received')), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp
               WHERE sp.supplier_id = $1 AND sp.voided_at IS NULL), 0)
`;

// অগ্রিম সহ সর্বোচ্চ পেমেন্ট সীমা = অর্ডার করা PO-র মোট − সক্রিয় পেমেন্ট
const PAY_CAP_SQL = `
    COALESCE((SELECT SUM(po.total_amount) FROM purchase_orders po
               WHERE po.supplier_id = $1 AND po.status IN ('ordered','partial','received')), 0)
  - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr
                JOIN purchase_orders po ON po.id = pr.purchase_order_id
               WHERE pr.supplier_id = $1 AND po.status IN ('ordered','partial','received')), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp
               WHERE sp.supplier_id = $1 AND sp.voided_at IS NULL), 0)
`;

// PO-র বাকি = total_amount − SUM(allocations)
const PO_PAID_SQL = `COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.purchase_order_id = po.id), 0)`;
const COUNTED_STATUS = `('ordered','partial','received')`;
// এই PO থেকে সাপ্লায়ারকে ফেরত দেওয়া মালের মূল্য
const PO_RET_SQL = `COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.purchase_order_id = po.id), 0)`;

// পেমেন্ট বরাদ্দ: নির্দিষ্ট PO দিলে সেখানে, না দিলে পুরনো PO থেকে শুরু করে (FIFO)।
// অবশ্যই withTransaction-এর ভেতরে, সাপ্লায়ার row-lock নেওয়ার পরে কল করতে হবে।
const allocatePayment = async (client, { tenantId, supplierId, paymentId, amount, purchaseOrderId }) => {
    let left = amount;
    const pos = await client.query(
        `SELECT po.id, po.total_amount, ${PO_PAID_SQL} AS paid, ${PO_RET_SQL} AS returned
         FROM purchase_orders po
         WHERE po.supplier_id = $1 AND po.tenant_id = $2 AND po.status IN ${COUNTED_STATUS}
           ${purchaseOrderId ? 'AND po.id = $3' : ''}
         ORDER BY po.order_date ASC, po.created_at ASC`,
        purchaseOrderId ? [supplierId, tenantId, purchaseOrderId] : [supplierId, tenantId]
    );
    for (const po of pos.rows) {
        if (left <= 0) break;
        const due = parseFloat(po.total_amount) - parseFloat(po.returned) - parseFloat(po.paid);
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
            const payableRes = await client.query(
                `SELECT ${PAYABLE_SQL} AS payable, ${PAY_CAP_SQL} AS cap`, [supplierId]);
            const currentPayable = parseFloat(payableRes.rows[0].payable);
            const payCap         = parseFloat(payableRes.rows[0].cap);

            // মাল আসার আগে অগ্রিম দেওয়া যায়, তবে অর্ডার করা PO-র মোট মূল্যের বেশি নয়
            if (parsedAmount > payCap + 1) { // ১ টাকা tolerance — রাউন্ডিং সমস্যা এড়াতে
                const err = new Error(`অর্ডার মূল্যের বাকি ৳${Math.max(0, payCap).toLocaleString()} এর বেশি পেমেন্ট করা যাবে না।`);
                err.statusCode = 400;
                throw err;
            }

            // নির্দিষ্ট PO-র জন্য পেমেন্ট হলে তার বাকির বেশি দেওয়া যাবে না
            if (purchase_order_id) {
                const poRes = await client.query(
                    `SELECT po.po_number, po.total_amount, ${PO_PAID_SQL} AS paid, ${PO_RET_SQL} AS returned
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
                const poDue = parseFloat(poRes.rows[0].total_amount) - parseFloat(poRes.rows[0].returned) - parseFloat(poRes.rows[0].paid);
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
            `SELECT sp.*, u.name_bn AS recorded_by_name, vu.name_bn AS voided_by_name,
                    (SELECT STRING_AGG(po.po_number, ', ' ORDER BY po.po_number)
                       FROM supplier_payment_allocations a
                       JOIN purchase_orders po ON po.id = a.purchase_order_id
                      WHERE a.payment_id = sp.id) AS po_numbers
             FROM supplier_payments sp
             LEFT JOIN users u  ON u.id  = sp.recorded_by
             LEFT JOIN users vu ON vu.id = sp.voided_by
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
// SUPPLIER LEDGER STATEMENT (সাপ্লায়ার লেজার)
// GET /api/suppliers/:id/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
// দেনা (+) = গৃহীত মালের মূল্য (stock_movements-এর গ্রহণের তারিখে),
// পরিশোধ (−) = সক্রিয় পেমেন্ট। ব্যালেন্স ধনাত্মক = আমরা দেব, ঋণাত্মক = অগ্রিম।
// ============================================================
const PAYMENT_LABELS = { cash: 'ক্যাশ', bank_transfer: 'ব্যাংক', cheque: 'চেক', bkash: 'বিকাশ', nagad: 'নগদ', other: 'অন্যান্য' };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const getSupplierLedger = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const sup = await query(
            'SELECT id, name, phone FROM suppliers WHERE id = $1 AND tenant_id = $2',
            [supplierId, req.tenantId]
        );
        if (sup.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সাপ্লায়ার পাওয়া যায়নি।' });
        }
        const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
        const from = isDate(req.query.from) ? req.query.from : null;
        const to   = isDate(req.query.to)   ? req.query.to   : null;

        const [rec, pay, cur, rets] = await Promise.all([
            query(
                `SELECT po.po_number, po.supplier_invoice_no,
                        to_char((sm.created_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS d,
                        MIN(sm.created_at) AS ts,
                        SUM(sm.quantity * poi.unit_cost) AS amount
                   FROM stock_movements sm
                   JOIN purchase_orders po
                     ON po.id = sm.reference_id AND po.tenant_id = $2 AND po.supplier_id = $1
                    AND po.status IN ('ordered','partial','received')
                   JOIN purchase_order_items poi
                     ON poi.purchase_order_id = po.id AND poi.product_id = sm.product_id
                  WHERE sm.reference_type = 'purchase' AND sm.movement_type = 'in' AND sm.tenant_id = $2
                  GROUP BY po.id, po.po_number, po.supplier_invoice_no, d`,
                [supplierId, req.tenantId]
            ),
            query(
                `SELECT sp.id, sp.amount, sp.payment_method, sp.reference_no, sp.created_at AS ts,
                        to_char((sp.created_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS d,
                        (SELECT STRING_AGG(po.po_number, ', ' ORDER BY po.po_number)
                           FROM supplier_payment_allocations a
                           JOIN purchase_orders po ON po.id = a.purchase_order_id
                          WHERE a.payment_id = sp.id) AS po_numbers
                   FROM supplier_payments sp
                  WHERE sp.supplier_id = $1 AND sp.tenant_id = $2 AND sp.voided_at IS NULL`,
                [supplierId, req.tenantId]
            ),
            query(`SELECT ${PAYABLE_SQL} AS payable`, [supplierId]),
            query(
                `SELECT pr.return_number, pr.total_amount, pr.reason, pr.created_at AS ts, po.po_number,
                        to_char((pr.created_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS d
                   FROM purchase_returns pr
                   JOIN purchase_orders po ON po.id = pr.purchase_order_id
                  WHERE pr.supplier_id = $1 AND pr.tenant_id = $2
                    AND po.status IN ('ordered','partial','received')`,
                [supplierId, req.tenantId]
            ),
        ]);

        const entries = [];
        rec.rows.forEach(r => entries.push({
            date: r.d, ts: r.ts, rank: 0, type: 'receipt', ref: r.po_number,
            description: `মাল গ্রহণ${r.supplier_invoice_no ? ` · চালান ${r.supplier_invoice_no}` : ''}`,
            debit: round2(parseFloat(r.amount)), credit: 0
        }));
        pay.rows.forEach(r => entries.push({
            date: r.d, ts: r.ts, rank: 2, type: 'payment', ref: r.po_numbers || '',
            description: `পেমেন্ট · ${PAYMENT_LABELS[r.payment_method] || r.payment_method}${r.reference_no ? ` · ${r.reference_no}` : ''}`,
            debit: 0, credit: round2(parseFloat(r.amount))
        }));

        rets.rows.forEach(r => entries.push({
            date: r.d, ts: r.ts, rank: 1, type: 'return', ref: `${r.return_number} · ${r.po_number}`,
            description: `মাল ফেরত · ${r.reason}`,
            debit: 0, credit: round2(parseFloat(r.total_amount))
        }));

        // গ্রহণের লগ ও আসল বকেয়ার ফর্মুলার মধ্যে ফারাক থাকলে (পুরনো/ম্যানুয়াল ডেটা) আলাদা সমন্বয় লাইন
        const computed = entries.reduce((a, e) => a + e.debit - e.credit, 0);
        const diff = round2(parseFloat(cur.rows[0].payable) - computed);
        if (Math.abs(diff) > 0.5) {
            const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
            entries.push({
                date: today, ts: new Date(), rank: 1, type: 'adjustment', ref: '',
                description: 'অন্যান্য সমন্বয় (স্টক লগে নেই এমন গ্রহণ/পুরনো ডেটা)',
                debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0
            });
        }

        entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.rank - b.rank) || (new Date(a.ts) - new Date(b.ts))));

        let opening = 0;
        const inRange = [];
        for (const e of entries) {
            if (from && e.date < from) { opening += e.debit - e.credit; continue; }
            if (to && e.date > to) continue;
            inRange.push(e);
        }
        let bal = round2(opening);
        const rows = inRange.map(e => {
            bal = round2(bal + e.debit - e.credit);
            return { date: e.date, type: e.type, ref: e.ref, description: e.description, debit: e.debit, credit: e.credit, balance: bal };
        });

        return res.status(200).json({
            success: true,
            data: {
                supplier: sup.rows[0],
                from, to,
                opening_balance: round2(opening),
                total_debit:  round2(rows.reduce((a, r) => a + r.debit, 0)),
                total_credit: round2(rows.reduce((a, r) => a + r.credit, 0)),
                closing_balance: bal,
                current_payable: round2(parseFloat(cur.rows[0].payable)),
                entries: rows
            }
        });
    } catch (error) {
        logger.error('❌ Supplier Ledger Error:', error.message);
        return res.status(500).json({ success: false, message: 'লেজার আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// VOID SUPPLIER PAYMENT (ভুল পেমেন্ট বাতিল)
// POST /api/suppliers/payments/:paymentId/void   body: { reason }
// রেকর্ড থাকে (audit), বকেয়ার হিসাব ও PO-বরাদ্দ থেকে বাদ যায়।
// ============================================================
const voidSupplierPayment = async (req, res) => {
    try {
        const reason = (req.body.reason || '').trim();
        if (reason.length < 3) {
            return res.status(400).json({ success: false, message: 'বাতিলের কারণ লিখুন (কমপক্ষে ৩ অক্ষর)।' });
        }

        let amount;
        await withTransaction(async (client) => {
            const pay = await client.query(
                `SELECT id, supplier_id, amount, voided_at FROM supplier_payments
                 WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                [req.params.paymentId, req.tenantId]
            );
            if (pay.rows.length === 0) {
                const err = new Error('পেমেন্ট পাওয়া যায়নি।'); err.statusCode = 404; throw err;
            }
            if (pay.rows[0].voided_at) {
                const err = new Error('এই পেমেন্ট আগেই বাতিল করা হয়েছে।'); err.statusCode = 400; throw err;
            }
            amount = parseFloat(pay.rows[0].amount);

            await client.query(
                `UPDATE supplier_payments
                    SET voided_at = NOW(), voided_by = $1, void_reason = $2
                  WHERE id = $3`,
                [req.user.id, reason, req.params.paymentId]
            );
            await client.query(
                `DELETE FROM supplier_payment_allocations WHERE payment_id = $1 AND tenant_id = $2`,
                [req.params.paymentId, req.tenantId]
            );
        });

        return res.status(200).json({ success: true, message: `৳${amount.toLocaleString()} পেমেন্ট বাতিল করা হয়েছে।` });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('❌ Void Supplier Payment Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্ট বাতিলে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PO-ভিত্তিক সারসংক্ষেপ + পেমেন্ট হিস্ট্রি
// GET /api/purchase-orders/:id/payments
// ============================================================
const getPurchaseOrderPayments = async (req, res) => {
    try {
        const poRes = await query(
            `SELECT po.id, po.po_number, po.status, po.supplier_id, po.total_amount, ${PO_PAID_SQL} AS paid_amount,
                    COALESCE((SELECT SUM(poi.quantity_received * poi.unit_cost)
                                FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id), 0) AS received_amount,
                    ${PO_RET_SQL} AS returned_amount
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

        const total    = parseFloat(po.total_amount);
        const paid     = parseFloat(po.paid_amount);
        const returned = parseFloat(po.returned_amount);
        const received = parseFloat(po.received_amount) - returned;   // ফেরত বাদে গৃহীত মূল্য
        const payable  = ['ordered','partial','received'].includes(po.status);
        const payLimit = payable ? Math.max(0, total - returned - paid) : 0;
        return res.status(200).json({
            success: true,
            data: {
                po_number: po.po_number,
                supplier_id: po.supplier_id,
                total_amount: total,
                paid_amount: paid,
                received_amount: received,                       // গৃহীত মালের মূল্য (ফেরত বাদে)
                returned_amount: returned,                       // সাপ্লায়ারকে ফেরত দেওয়া মালের মূল্য
                due_amount: payable ? Math.max(0, received - paid) : 0,   // এখন দেয় (গৃহীত − পেইড)
                advance_amount: payable ? Math.max(0, paid - received) : 0, // মাল আসার আগে দেওয়া অগ্রিম
                pay_limit: payLimit,                             // সর্বোচ্চ আরও কত দেওয়া যাবে
                can_pay: payLimit > 0,
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

module.exports = { paySupplier, getSupplierPayments, getPurchaseOrderPayments, payPurchaseOrder, voidSupplierPayment, getSupplierLedger };
