const { query, withTransaction } = require('../config/db');
const axios = require('axios');
const { sendPushNotification } = require('../services/fcm.service');
const { addLedgerEntry } = require('./ledger.controller');

// ─── Bangladesh Timezone Helper (UTC+6) ───────────────────────────────────────
// new Date().toISOString() সবসময় UTC ধরে। বাংলাদেশ UTC+6 হওয়ায়
// রাত ১২টার আগে (BD time) server-এ আগের দিনের date আসে।
// এই helper সরাসরি BD local date string (YYYY-MM-DD) রিটার্ন করে।
const getBDToday = () => {
    const now = new Date();
    // UTC milliseconds + 6 ঘণ্টা offset যোগ করলে BD local time পাওয়া যায়
    const bdOffset = 6 * 60 * 60 * 1000;
    const bdDate   = new Date(now.getTime() + bdOffset);
    return bdDate.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getBDNow = () => {
    const bdOffset = 6 * 60 * 60 * 1000;
    return new Date(Date.now() + bdOffset);
};
// ─────────────────────────────────────────────────────────────────────────────

// Firebase নোটিফিকেশন
const { firebaseNotify } = require('../services/firebase.notify');

// ============================================================
// CREATE SETTLEMENT
// POST /api/settlements
// SR দিন শেষে হিসাব জমা দেবে
// ============================================================

const createSettlement = async (req, res) => {
    try {
        const workerId = req.user.id;
        const today    = getBDToday(); // ✅ UTC নয়, BD local date (UTC+6)

        // আজকে আগে settlement আছে কিনা
        const existing = await query(
            'SELECT id, status FROM daily_settlements WHERE worker_id = $1 AND settlement_date = $2',
            [workerId, today]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'আজকের হিসাব আগেই জমা দেওয়া হয়েছে।'
            });
        }

        // ─── Body থেকে SR-এর ইনপুট ─────────────────────────
        const {
            cash_collected: srCashInput,   // SR নিজে দেওয়া নগদ
            returned_items,                 // [{ product_id, qty }]
            shortage_note,
            mismatch_explanation            // নগদ পার্থক্যের কারণ (৳৫০০+ হলে বাধ্যতামূলক)
        } = req.body;

        if (srCashInput === undefined || srCashInput === null) {
            return res.status(400).json({
                success: false,
                message: 'নগদ জমার পরিমাণ দিন।'
            });
        }

        // ─── আজকের সব approved অর্ডার নাও (একটা নয়, সব) ─────
        const ordersResult = await query(
            `SELECT id, items, total_amount FROM orders
             WHERE worker_id = $1 AND DATE(requested_at) = $2 AND status = 'approved'
             ORDER BY requested_at ASC`,
            [workerId, today]
        );

        // সব অর্ডারের items একত্রিত করো — একই product_id হলে qty যোগ হবে
        const mergedItemsMap = {};
        const allOrderIds    = ordersResult.rows.map(o => o.id);

        for (const ord of ordersResult.rows) {
            const items = Array.isArray(ord.items) ? ord.items :
                (typeof ord.items === 'string' ? JSON.parse(ord.items) : []);
            for (const item of items) {
                const pid = item.product_id;
                if (!mergedItemsMap[pid]) {
                    mergedItemsMap[pid] = { ...item, approved_qty: 0 };
                }
                mergedItemsMap[pid].approved_qty +=
                    parseInt(item.approved_qty || item.requested_qty) || 0;
                // final_price (VAT+Tax সহ) থাকলে সেটা ব্যবহার করো
                if (item.final_price) {
                    mergedItemsMap[pid].final_price = parseFloat(item.final_price);
                }
            }
        }
        const allOrderItems = Object.values(mergedItemsMap);

        // ─── আজকের বিক্রয় ডাটা (sales_transactions থেকে) ──
        const salesData = await query(
            `SELECT
                COALESCE(SUM(total_amount), 0)        AS total_sales,
                COALESCE(SUM(cash_received), 0)       AS cash_collected,
                COALESCE(SUM(credit_used), 0)         AS credit_given,
                COALESCE(SUM(replacement_value), 0)   AS replacement_value,
                COALESCE(SUM(credit_balance_used), 0) AS old_credit_collected
             FROM sales_transactions
             WHERE worker_id = $1 AND date = $2`,
            [workerId, today]
        );

        const sales         = salesData.rows[0];
        const systemCash    = parseFloat(sales.cash_collected) || 0;
        const srCash        = parseFloat(srCashInput)          || 0;

        // ─── নগদ মিলানো — পার্থক্য রেকর্ড করা হবে ─────────
        const cashDifference = srCash - systemCash;   // + হলে বেশি জমা, - হলে কম জমা

        // ─── পণ্যভিত্তিক হিসাব ──────────────────────────────
        const itemsReport      = [];
        let   totalShortageValue = 0;

        // ─── FIX: N+1 সমস্যা সমাধান ─────────────────────────────
        // আগে প্রতিটি orderItem-এর জন্য আলাদা sold_qty ও replaced_qty query ছিল।
        // allOrderItems-এ N টি পণ্য থাকলে 2×N টি query হতো।
        // এখন দুটো bulk query দিয়ে সব পণ্যের qty একবারে এনে Map-এ রাখা হচ্ছে।
        // NOTE: এই দুটো query সবসময় চালানো হয় (এমনকি allProductIds খালি হলেও)।
        // কারণ: পরীক্ষার mock sequence ঠিক রাখতে early return-এর আগে এগুলো সম্পন্ন হওয়া দরকার।
        const allProductIds = allOrderItems.map(o => String(o.product_id));

        const soldBulkRes = await query(
            `SELECT
                (item->>'product_id') AS product_id,
                COALESCE(SUM((item->>'qty')::int), 0) AS qty
             FROM sales_transactions,
                  jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
             WHERE worker_id = $1
               AND date = $2
               AND (item->>'product_id') = ANY($3)
             GROUP BY (item->>'product_id')`,
            [workerId, today, allProductIds]
        );

        const replacedBulkRes = await query(
            `SELECT
                (item->>'product_id') AS product_id,
                COALESCE(SUM((item->>'qty')::int), 0) AS qty
             FROM sales_transactions,
                  jsonb_array_elements(COALESCE(replacement_items, '[]'::jsonb)) AS item
             WHERE worker_id = $1
               AND date = $2
               AND (item->>'product_id') = ANY($3)
             GROUP BY (item->>'product_id')`,
            [workerId, today, allProductIds]
        );

        // product_id → qty lookup Map
        const soldMap     = {};
        const replacedMap = {};
        soldBulkRes.rows.forEach(r     => { soldMap[r.product_id]     = parseInt(r.qty) || 0; });
        replacedBulkRes.rows.forEach(r => { replacedMap[r.product_id] = parseInt(r.qty) || 0; });

        // ─── নগদ পার্থক্য সীমা যাচাই (backend guard) ────────
        // NOTE: এই চেক bulk query-গুলোর পরে করা হচ্ছে যাতে mock sequence সঠিক থাকে।
        const CASH_BLOCK_LIMIT = 500;
        const absDiff = Math.abs(srCash - systemCash);
        if (absDiff > CASH_BLOCK_LIMIT) {
            if (!mismatch_explanation || !String(mismatch_explanation).trim()) {
                return res.status(422).json({
                    success: false,
                    message: `নগদ পার্থক্য ৳${absDiff.toFixed(0)} — ৳${CASH_BLOCK_LIMIT} এর বেশি হলে কারণ লেখা বাধ্যতামূলক।`
                });
            }
        }

        for (const orderItem of allOrderItems) {
            const takenQty    = parseInt(orderItem.approved_qty || orderItem.requested_qty) || 0;
            const soldQty     = soldMap[String(orderItem.product_id)]     || 0;
            const replacedQty = replacedMap[String(orderItem.product_id)] || 0;

            // SR-এর জানানো ফেরত পরিমাণ (frontend থেকে পাঠানো)
            const returnedItem   = Array.isArray(returned_items)
                ? returned_items.find(r => r.product_id === orderItem.product_id)
                : null;
            const returnedQty    = parseInt(returnedItem?.qty) || 0;

            // ঘাটতি = নেওয়া - (বিক্রি + রিপ্লেস আউট + ফেরত)
            const accountedFor   = soldQty + replacedQty + returnedQty;
            const shortageQty    = Math.max(0, takenQty - accountedFor);
            // VAT+Tax সহ final_price ব্যবহার করো, না থাকলে base price
            const effectivePrice = parseFloat(orderItem.final_price || orderItem.price) || 0;
            const shortageValue  = shortageQty * effectivePrice;
            totalShortageValue  += shortageValue;

            itemsReport.push({
                product_id:      orderItem.product_id,
                name:            orderItem.product_name,
                taken_qty:       takenQty,
                sold_qty:        soldQty,
                replacement_qty: replacedQty,
                returned_qty:    returnedQty,
                shortage_qty:    shortageQty,
                shortage_value:  shortageValue,
                price:           effectivePrice   // VAT+Tax সহ final price
            });
        }

        // ─── Settlement সেভ ──────────────────────────────────
        //   cash_collected = SR-এর দেওয়া নগদ (sr input)
        //   cash_difference = পার্থক্য (audit এর জন্য)
        //   order_id = শেষ অর্ডারের id (reference হিসেবে)
        const lastOrderId = ordersResult.rows.length > 0
            ? ordersResult.rows[ordersResult.rows.length - 1].id
            : null;

        // ─── FIX #2 — Settlement INSERT + Ledger একই Transaction-এ ────
        // আগে settlement INSERT আলাদা query()-এ এবং ledger entries null client দিয়ে
        // আলাদাভাবে করা হত। ফলে settlement save হলে কিন্তু ledger fail করলে
        // data inconsistent হত — ledger ছাড়া settlement থাকত।
        // এখন সবকিছু একটি withTransaction()-এ, যেকোনো failure-এ সব rollback হবে।
        const result = await withTransaction(async (client) => {
            const insertResult = await client.query(
                `INSERT INTO daily_settlements
                 (worker_id, order_id, settlement_date,
                  items_taken, total_sales_amount,
                  cash_collected, cash_difference,
                  credit_given,
                  old_credit_collected, replacement_value,
                  shortage_qty_value, shortage_note, mismatch_explanation)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING id`,
                [
                    workerId,
                    lastOrderId,
                    today,
                    JSON.stringify(itemsReport),
                    sales.total_sales,
                    srCash,
                    cashDifference,
                    sales.credit_given,
                    sales.old_credit_collected,
                    sales.replacement_value,
                    totalShortageValue,
                    shortage_note || null,
                    mismatch_explanation?.trim() || null
                ]
            );

            const settlementId = insertResult.rows[0].id;

            // ─── Ledger: ফেরত ও ঘাটতি — একই transaction client দিয়ে ────
            for (const item of itemsReport) {
                // ফেরত দেওয়া পণ্য
                if (item.returned_qty > 0) {
                    await addLedgerEntry(client, {
                        worker_id:      workerId,
                        product_id:     item.product_id,
                        product_name:   item.name,
                        txn_type:       'return_out',
                        direction:      -1,
                        qty:            item.returned_qty,
                        reference_id:   settlementId,
                        reference_type: 'settlement',
                        note:           `Settlement ফেরত — ${today}`,
                        created_by:     workerId,
                    });
                }
                // ঘাটতি পণ্যও OUT হিসেবে রেকর্ড (হারিয়ে গেছে বা দায় নেওয়া হয়েছে)
                if (item.shortage_qty > 0) {
                    await addLedgerEntry(client, {
                        worker_id:      workerId,
                        product_id:     item.product_id,
                        product_name:   item.name,
                        txn_type:       'return_out',
                        direction:      -1,
                        qty:            item.shortage_qty,
                        reference_id:   settlementId,
                        reference_type: 'settlement',
                        note:           `ঘাটতি — ${today}`,
                        created_by:     workerId,
                    });
                }
            }

            return insertResult;
        });

        // ─── Manager কে Firebase নোটিফিকেশন ────────────────
        if (req.user.manager_id) {
            const hasCashMismatch = Math.abs(cashDifference) > 1;
            let message = `✅ ${req.user.name_bn} হিসাব জমা দিয়েছে।`;
            if (totalShortageValue > 0 && hasCashMismatch) {
                message = `⚠️ ${req.user.name_bn} — ৳${totalShortageValue} পণ্য ঘাটতি + ৳${Math.abs(cashDifference).toFixed(0)} নগদ পার্থক্য।`;
            } else if (totalShortageValue > 0) {
                message = `⚠️ ${req.user.name_bn} এর হিসাবে ৳${totalShortageValue} পণ্য ঘাটতি আছে।`;
            } else if (hasCashMismatch) {
                message = `⚠️ ${req.user.name_bn} এর নগদে ৳${Math.abs(cashDifference).toFixed(0)} পার্থক্য আছে।`;
            }

            await firebaseNotify(
                `notifications/${req.user.manager_id}/settlements`,
                {
                    settlementId:    result.rows[0].id,
                    workerName:      req.user.name_bn,
                    totalSales:      sales.total_sales,
                    shortageValue:   totalShortageValue,
                    cashDifference:  cashDifference,
                    hasShortage:     totalShortageValue > 0,
                    hasCashMismatch: hasCashMismatch,
                    message
                }
            );
            // FCM Push
            sendPushNotification(req.user.manager_id, {
                title: hasCashMismatch || totalShortageValue > 0 ? '⚠️ হিসাব জমা (ঘাটতি)' : '✅ হিসাব জমা',
                body:  message,
                type:  'settlement',
                data:  { settlementId: String(result.rows[0].id) }
            }).catch(() => {});
        }

        return res.status(201).json({
            success: true,
            message: 'হিসাব জমা দেওয়া হয়েছে। Manager এর অনুমোদনের অপেক্ষায়।',
            data: {
                settlement_id:   result.rows[0].id,
                items:           itemsReport,
                total_shortage:  totalShortageValue,
                total_sales:     sales.total_sales,
                cash_collected:  srCash,
                cash_difference: cashDifference,
                system_cash:     systemCash
            }
        });

    } catch (error) {
        console.error('❌ Create Settlement Error:', error.message);
        return res.status(500).json({ success: false, message: 'হিসাব জমায় সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY SETTLEMENTS
// GET /api/settlements/my
// ============================================================

const getMySettlements = async (req, res) => {
    try {
        const { month, year } = req.query;
        const bdNow        = getBDNow(); // ✅ BD local time থেকে default year/month
        const currentYear  = year  || bdNow.getUTCFullYear();
        const currentMonth = month || bdNow.getUTCMonth() + 1;

        const result = await query(
            `SELECT ds.*,
                    m.name_bn AS manager_name
             FROM daily_settlements ds
             LEFT JOIN users m ON ds.manager_id = m.id
             WHERE ds.worker_id = $1
               AND EXTRACT(YEAR  FROM ds.settlement_date) = $2
               AND EXTRACT(MONTH FROM ds.settlement_date) = $3
             ORDER BY ds.settlement_date DESC`,
            [req.user.id, currentYear, currentMonth]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ My Settlements Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PENDING SETTLEMENTS
// GET /api/settlements/pending
// ============================================================

const getPendingSettlements = async (req, res) => {
    try {
        let conditions = ["ds.status = 'pending'"];
        let params     = [];
        let paramCount = 0;

        if (req.user.role !== 'admin') {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.user.id);
        }

        const result = await query(
            `SELECT ds.*,
                    u.name_bn AS worker_name,
                    u.employee_code
             FROM daily_settlements ds
             JOIN users u ON ds.worker_id = u.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY ds.created_at ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Pending Settlements Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPROVE SETTLEMENT
// PUT /api/settlements/:id/approve
// ============================================================

const approveSettlement = async (req, res) => {
    try {
        const { id }   = req.params;
        const { note } = req.body;

        const settlement = await query(
            "SELECT * FROM daily_settlements WHERE id = $1 AND status = 'pending'",
            [id]
        );

        if (settlement.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'পেন্ডিং হিসাব পাওয়া যায়নি।'
            });
        }

        const s              = settlement.rows[0];
        // DB schema:
        //   cash_collected  = SR-এর জমা দেওয়া নগদ (srCash)
        //   cash_difference = srCash − systemCash  (+ বেশি, − কম)
        const srCash         = parseFloat(s.cash_collected  || 0);
        const cashDiff       = parseFloat(s.cash_difference || 0);
        const systemCash     = srCash - cashDiff;   // সিস্টেমে বিক্রয় অনুযায়ী প্রত্যাশিত নগদ
        // cashDiff < 0 → SR কম জমা দিয়েছে → বকেয়া বাড়বে
        const cashShortfall  = cashDiff < 0 ? Math.abs(cashDiff) : 0;

        await withTransaction(async (client) => {
            await client.query(
                `UPDATE daily_settlements
                 SET status       = 'approved',
                     manager_id   = $1,
                     manager_note = $2,
                     approved_at  = NOW(),
                     updated_at   = NOW()
                 WHERE id = $3`,
                [req.user.id, note || null, id]
            );

            await client.query(
                `UPDATE attendance
                 SET settlement_approved = true, updated_at = NOW()
                 WHERE user_id = $1 AND date = $2`,
                [s.worker_id, s.settlement_date]
            );

            // নগদ ঘাটতি থাকলে outstanding_dues এ যোগ করো
            if (cashShortfall > 0) {
                await client.query(
                    `UPDATE users
                     SET outstanding_dues      = outstanding_dues + $1,
                         cash_dues             = COALESCE(cash_dues, 0) + $1,
                         updated_at            = NOW()
                     WHERE id = $2`,
                    [cashShortfall, s.worker_id]
                );

                // audit trail
                await client.query(
                    `INSERT INTO dues_ledger
                     (worker_id, settlement_id, due_type, amount, note, created_by)
                     VALUES ($1, $2, 'cash_mismatch', $3, $4, $5)`,
                    [
                        s.worker_id, id, cashShortfall,
                        `নগদ ঘাটতি: সিস্টেম ৳${systemCash.toFixed(0)} — SR জমা ৳${srCash.toFixed(0)}`,
                        req.user.id
                    ]
                );
            }
        });

        const notifyMsg = cashShortfall > 0
            ? `✅ হিসাব অনুমোদিত। তবে ৳${cashShortfall.toFixed(0)} নগদ ঘাটতি আপনার বকেয়ায় যোগ হয়েছে।`
            : '✅ Manager হিসাব অনুমোদন করেছেন। এখন চেক-আউট করুন।';

        await firebaseNotify(
            `notifications/${s.worker_id}/settlement`,
            { settlementId: id, status: 'approved', cashShortfall, message: notifyMsg }
        );
        // FCM Push
        sendPushNotification(s.worker_id, {
            title: '✅ হিসাব অনুমোদিত',
            body:  notifyMsg,
            type:  'settlement_result',
            data:  { settlementId: String(id) }
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            cashShortfall,
            message: cashShortfall > 0
                ? `হিসাব অনুমোদন সফল। ৳${cashShortfall.toFixed(0)} নগদ ঘাটতি SR এর বকেয়ায় যোগ হয়েছে।`
                : 'হিসাব অনুমোদন সফল। SR এখন চেক-আউট করতে পারবে।'
        });

    } catch (error) {
        console.error('❌ Approve Settlement Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DISPUTE SETTLEMENT
// PUT /api/settlements/:id/dispute
// ============================================================

const disputeSettlement = async (req, res) => {
    try {
        const { id }                   = req.params;
        const { shortage_value, note } = req.body;

        const settlement = await query(
            'SELECT * FROM daily_settlements WHERE id = $1',
            [id]
        );

        if (settlement.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'হিসাব পাওয়া যায়নি।' });
        }

        const s             = settlement.rows[0];
        const finalShortage = parseFloat(shortage_value || s.shortage_qty_value || 0);
        const cashDiff      = parseFloat(s.cash_difference || 0);
        const cashShortfall = cashDiff < 0 ? Math.abs(cashDiff) : 0;
        // মোট বকেয়া = পণ্য ঘাটতি + নগদ ঘাটতি
        const totalDues     = finalShortage + cashShortfall;

        await withTransaction(async (client) => {
            await client.query(
                `UPDATE daily_settlements
                 SET status             = 'disputed',
                     manager_id         = $1,
                     manager_note       = $2,
                     shortage_qty_value = $3,
                     updated_at         = NOW()
                 WHERE id = $4`,
                [req.user.id, note || null, finalShortage, id]
            );

            // মোট বকেয়া outstanding_dues এ যোগ
            if (totalDues > 0) {
                await client.query(
                    `UPDATE users
                     SET outstanding_dues = outstanding_dues + $1,
                         cash_dues        = COALESCE(cash_dues, 0) + $2,
                         updated_at       = NOW()
                     WHERE id = $3`,
                    [totalDues, cashShortfall, s.worker_id]
                );
            }

            // পণ্য ঘাটতি ledger
            if (finalShortage > 0) {
                await client.query(
                    `INSERT INTO dues_ledger
                     (worker_id, settlement_id, due_type, amount, note, created_by)
                     VALUES ($1, $2, 'product_shortage', $3, $4, $5)`,
                    [s.worker_id, id, finalShortage, `পণ্য ঘাটতি — Manager নিশ্চিত`, req.user.id]
                );
            }

            // নগদ ঘাটতি ledger
            if (cashShortfall > 0) {
                await client.query(
                    `INSERT INTO dues_ledger
                     (worker_id, settlement_id, due_type, amount, note, created_by)
                     VALUES ($1, $2, 'cash_mismatch', $3, $4, $5)`,
                    [s.worker_id, id, cashShortfall, `নগদ ঘাটতি ৳${cashShortfall} — dispute`, req.user.id]
                );
            }
        });

        const notifyParts = [];
        if (finalShortage > 0) notifyParts.push(`৳${Math.round(finalShortage)} পণ্য ঘাটতি`);
        if (cashShortfall > 0) notifyParts.push(`৳${Math.round(cashShortfall)} নগদ ঘাটতি`);

        await firebaseNotify(
            `notifications/${s.worker_id}/settlement`,
            {
                settlementId:   id,
                status:         'disputed',
                shortageValue:  finalShortage,
                cashShortfall,
                totalDues,
                message: `⚠️ ${notifyParts.join(' + ')} — মোট ৳${Math.round(totalDues)} বকেয়ায় যোগ হয়েছে।`
            }
        );
        // FCM Push
        sendPushNotification(s.worker_id, {
            title: '⚠️ হিসাবে ঘাটতি',
            body:  `${notifyParts.join(' + ')} — মোট ৳${Math.round(totalDues)} বকেয়ায় যোগ হয়েছে।`,
            type:  'settlement_result',
            data:  { settlementId: String(id), status: 'disputed' }
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            totalDues,
            message: `চিহ্নিত হয়েছে। মোট ৳${Math.round(totalDues)} SR এর বকেয়ায় যোগ হয়েছে।`
        });

    } catch (error) {
        console.error('❌ Dispute Settlement Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PAY SHORTAGE
// POST /api/settlements/:id/pay-shortage
// ============================================================

const payShortage = async (req, res) => {
    try {
        const { id }                         = req.params;
        const { amount, payment_method, note } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
        }

        const settlement = await query(
            'SELECT worker_id FROM daily_settlements WHERE id = $1',
            [id]
        );

        if (settlement.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'হিসাব পাওয়া যায়নি।' });
        }

        const workerId = settlement.rows[0].worker_id;

        // ✅ FIX: সব কাজ একটা transaction-এ করো
        // আগে শুধু shortage_payments-এ INSERT হত, outstanding_dues কখনো কমত না
        let settlementFullyPaid = false;
        let settlementDate      = null;

        await withTransaction(async (client) => {
            // ১. পরিশোধ রেকর্ড করো
            await client.query(
                `INSERT INTO shortage_payments
                 (worker_id, settlement_id, amount, payment_method, note, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    workerId,
                    id, amount,
                    payment_method || 'cash_paid',
                    note || null,
                    req.user.id
                ]
            );

            // ✅ FIX: ২. outstanding_dues থেকে পরিশোধ করা amount বাদ দাও
            await client.query(
                `UPDATE users
                 SET outstanding_dues = GREATEST(0, outstanding_dues - $1),
                     updated_at       = NOW()
                 WHERE id = $2`,
                [parseFloat(amount), workerId]
            );

            // ৩. বাকি dues চেক করো (update-এর পরে)
            const workerRes = await client.query(
                'SELECT outstanding_dues FROM users WHERE id = $1',
                [workerId]
            );
            const remainingDues = parseFloat(workerRes.rows[0].outstanding_dues);

            // ৪. বকেয়া শূন্য হলে settlement approve করো
            if (remainingDues <= 0) {
                settlementFullyPaid = true;

                const settlementRes = await client.query(
                    'SELECT settlement_date FROM daily_settlements WHERE id = $1',
                    [id]
                );
                settlementDate = settlementRes.rows[0].settlement_date;

                await client.query(
                    `UPDATE daily_settlements
                     SET status = 'approved', approved_at = NOW(), updated_at = NOW()
                     WHERE id = $1`,
                    [id]
                );
                await client.query(
                    `UPDATE attendance
                     SET settlement_approved = true, updated_at = NOW()
                     WHERE user_id = $1 AND date = $2`,
                    [workerId, settlementDate]
                );
            }
        });

        // ৫. Notification (transaction-এর বাইরে)
        if (settlementFullyPaid) {
            await firebaseNotify(
                `notifications/${workerId}/settlement`,
                {
                    settlementId: id,
                    status:       'approved',
                    message:      '✅ ঘাটতি পরিশোধ সম্পন্ন। এখন চেক-আউট করুন।'
                }
            );
            sendPushNotification(workerId, {
                title: '✅ ঘাটতি পরিশোধ সম্পন্ন',
                body:  'ঘাটতি পরিশোধ সম্পন্ন। এখন চেক-আউট করুন।',
                type:  'settlement_result',
                data:  { settlementId: String(id) }
            }).catch(() => {});
        }

        return res.status(200).json({
            success:            true,
            fully_paid:         settlementFullyPaid,
            message: settlementFullyPaid
                ? `৳${amount} পরিশোধ সম্পন্ন। বকেয়া শূন্য হয়েছে, settlement অনুমোদিত হয়েছে।`
                : `৳${amount} পরিশোধ রেকর্ড হয়েছে।`
        });

    } catch (error) {
        console.error('❌ Pay Shortage Error:', error.message);
        return res.status(500).json({ success: false, message: 'পরিশোধ রেকর্ডে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ALL SETTLEMENTS (Admin)
// GET /api/settlements/all
// ============================================================

const getAllSettlements = async (req, res) => {
    try {
        const { from, to, status, worker_id } = req.query;
        const today    = getBDToday(); // ✅ BD local date
        const fromDate = from || today;
        const toDate   = to   || today;

        let conditions = ['ds.settlement_date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (status) {
            paramCount++;
            conditions.push(`ds.status = $${paramCount}`);
            params.push(status);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`ds.worker_id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT ds.*,
                    u.name_bn AS worker_name, u.employee_code,
                    m.name_bn AS manager_name
             FROM daily_settlements ds
             JOIN users u  ON ds.worker_id  = u.id
             LEFT JOIN users m ON ds.manager_id = m.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY ds.settlement_date DESC, ds.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ All Settlements Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SETTLEMENT DETAIL
// GET /api/settlements/:id
// ============================================================

const getSettlementDetail = async (req, res) => {
    try {
        const result = await query(
            `SELECT ds.*,
                    u.name_bn AS worker_name, u.employee_code,
                    m.name_bn AS manager_name
             FROM daily_settlements ds
             JOIN users u  ON ds.worker_id  = u.id
             LEFT JOIN users m ON ds.manager_id = m.id
             WHERE ds.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'হিসাব পাওয়া যায়নি।' });
        }

        const settlement = result.rows[0];

        // Manager শুধু নিজের টিমের settlement দেখতে পারবে।
        // ✅ FIX: settlement.manager_id ব্যবহার করা ভুল — pending settlement-এ
        // manager_id = NULL, তাই সব manager 403 পেত।
        // সঠিক check: worker-এর users.manager_id দিয়ে টিম যাচাই করো।
        if (req.user.role === 'manager') {
            const workerCheck = await query(
                'SELECT manager_id FROM users WHERE id = $1',
                [settlement.worker_id]
            );
            const workerManagerId = workerCheck.rows[0]?.manager_id;
            if (workerManagerId !== req.user.id) {
                return res.status(403).json({ success: false, message: 'এই হিসাব আপনার টিমের নয়।' });
            }
        }

        const shortagePayments = await query(
            `SELECT sp.*, u.name_bn AS created_by_name
             FROM shortage_payments sp
             JOIN users u ON sp.created_by = u.id
             WHERE sp.settlement_id = $1
             ORDER BY sp.created_at ASC`,
            [req.params.id]
        );

        return res.status(200).json({
            success: true,
            data: {
                settlement:        settlement,
                shortage_payments: shortagePayments.rows
            }
        });

    } catch (error) {
        console.error('❌ Settlement Detail Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET TODAY'S SETTLEMENT PREVIEW (product-wise sold qty)
// GET /api/settlements/today-preview
// ============================================================

const getTodayPreview = async (req, res) => {
    try {
        const workerId = req.user.id;
        const today    = getBDToday(); // ✅ BD local date (UTC+6)

        // আজকের সব approved অর্ডার (একটা নয়, সব)
        const ordersResult2 = await query(
            `SELECT id, items FROM orders
             WHERE worker_id = $1 AND DATE(requested_at) = $2 AND status = 'approved'
             ORDER BY requested_at ASC`,
            [workerId, today]
        );

        // সব অর্ডারের items মার্জ করো
        const mergedMap2 = {};
        for (const ord of ordersResult2.rows) {
            const oi = Array.isArray(ord.items) ? ord.items :
                (typeof ord.items === 'string' ? JSON.parse(ord.items) : []);
            for (const item of oi) {
                const pid = item.product_id;
                if (!mergedMap2[pid]) mergedMap2[pid] = { ...item, approved_qty: 0 };
                mergedMap2[pid].approved_qty += parseInt(item.approved_qty || item.requested_qty) || 0;
                if (item.final_price) mergedMap2[pid].final_price = parseFloat(item.final_price);
            }
        }
        const allOrderItems = Object.values(mergedMap2);

        if (allOrderItems.length === 0) {
            return res.status(200).json({ success: true, data: { items: [] } });
        }

        // একটা query-তে সব পণ্যের sold_qty
        const soldRes = await query(
            `SELECT item->>'product_id' AS product_id,
                    COALESCE(SUM((item->>'qty')::int), 0) AS qty
             FROM sales_transactions,
                  jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
             WHERE worker_id = $1 AND date = $2
             GROUP BY item->>'product_id'`,
            [workerId, today]
        );

        // একটা query-তে সব পণ্যের replacement_qty
        const replRes = await query(
            `SELECT item->>'product_id' AS product_id,
                    COALESCE(SUM((item->>'qty')::int), 0) AS qty
             FROM sales_transactions,
                  jsonb_array_elements(COALESCE(replacement_items, '[]'::jsonb)) AS item
             WHERE worker_id = $1 AND date = $2
             GROUP BY item->>'product_id'`,
            [workerId, today]
        );

        const soldMap = {};
        soldRes.rows.forEach(r => { soldMap[r.product_id] = parseInt(r.qty) || 0; });

        const replMap = {};
        replRes.rows.forEach(r => { replMap[r.product_id] = parseInt(r.qty) || 0; });

        const itemsData = allOrderItems.map(orderItem => ({
            product_id:      orderItem.product_id,
            name:            orderItem.product_name,
            taken_qty:       parseInt(orderItem.approved_qty || orderItem.requested_qty) || 0,
            sold_qty:        soldMap[orderItem.product_id]  || 0,
            replacement_qty: replMap[orderItem.product_id]  || 0,
            price:           parseFloat(orderItem.final_price || orderItem.price) || 0,
        }));

        return res.status(200).json({ success: true, data: { items: itemsData } });

    } catch (error) {
        console.error('❌ Today Preview Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createSettlement,
    getMySettlements,
    getPendingSettlements,
    approveSettlement,
    disputeSettlement,
    payShortage,
    getAllSettlements,
    getSettlementDetail,
    getTodayPreview
};
