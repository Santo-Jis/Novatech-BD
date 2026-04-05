const { query, withTransaction } = require('../config/db');
const axios = require('axios');

// Firebase নোটিফিকেশন
const firebaseNotify = async (path, data) => {
    try {
        const url = process.env.FIREBASE_DATABASE_URL;
        if (!url) return;
        await axios.post(`${url}/${path}.json`, {
            ...data,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('⚠️ Firebase Error:', err.message);
    }
};

// ============================================================
// CREATE SETTLEMENT
// POST /api/settlements
// SR দিন শেষে হিসাব জমা দেবে
// ============================================================

const createSettlement = async (req, res) => {
    try {
        const workerId = req.user.id;
        const today    = new Date().toISOString().split('T')[0];

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

        // আজকের অর্ডার নাও
        const order = await query(
            `SELECT id, items, total_amount FROM orders
             WHERE worker_id = $1 AND DATE(requested_at) = $2 AND status = 'approved'
             ORDER BY requested_at DESC LIMIT 1`,
            [workerId, today]
        );

        // আজকের বিক্রয় ডাটা
        const salesData = await query(
            `SELECT
                COALESCE(SUM(total_amount), 0)        AS total_sales,
                COALESCE(SUM(cash_received), 0)       AS cash_collected,
                COALESCE(SUM(credit_used), 0)         AS credit_given,
                COALESCE(SUM(replacement_value), 0)   AS replacement_value,
                COALESCE(SUM(credit_balance_used), 0) AS old_credit_collected,
                json_agg(items)                        AS all_items
             FROM sales_transactions
             WHERE worker_id = $1 AND date = $2`,
            [workerId, today]
        );

        const sales = salesData.rows[0];

        // SR এর submitted items (ফেরত পরিমাণ)
        const { returned_items, shortage_note } = req.body;

        // অর্ডারের পণ্য অনুযায়ী হিসাব
        const orderItems  = order.rows[0]?.items || [];
        const itemsReport = [];
        let   totalShortageValue = 0;

        for (const orderItem of orderItems) {
            // এই পণ্যের মোট বিক্রয়
            const soldQty = await query(
                `SELECT COALESCE(SUM(
                    (item->>'qty')::int
                ), 0) AS qty
                 FROM sales_transactions,
                      jsonb_array_elements(items) AS item
                 WHERE worker_id = $1
                   AND date = $2
                   AND item->>'product_id' = $3`,
                [workerId, today, orderItem.product_id]
            );

            // রিপ্লেসমেন্টে ফেরত আসা
            const replacedQty = await query(
                `SELECT COALESCE(SUM(
                    (item->>'qty')::int
                ), 0) AS qty
                 FROM sales_transactions,
                      jsonb_array_elements(replacement_items) AS item
                 WHERE worker_id = $1
                   AND date = $2
                   AND item->>'product_id' = $3`,
                [workerId, today, orderItem.product_id]
            );

            const takenQty       = orderItem.approved_qty || orderItem.requested_qty;
            const soldQtyVal     = parseInt(soldQty.rows[0].qty);
            const replacedQtyVal = parseInt(replacedQty.rows[0].qty);

            // SR জানাচ্ছে কত ফেরত দিচ্ছে
            const returnedItem  = returned_items?.find(r => r.product_id === orderItem.product_id);
            const returnedQty   = returnedItem?.qty || 0;

            // ঘাটতি হিসাব
            // নেওয়া = বিক্রি + রিপ্লেসমেন্ট আউট + ফেরত + ঘাটতি
            const accountedFor  = soldQtyVal + returnedQty;
            const shortageQty   = Math.max(0, takenQty - accountedFor - replacedQtyVal);
            const shortageValue = shortageQty * orderItem.price;
            totalShortageValue += shortageValue;

            itemsReport.push({
                product_id:       orderItem.product_id,
                name:             orderItem.product_name,
                taken_qty:        takenQty,
                sold_qty:         soldQtyVal,
                replacement_qty:  replacedQtyVal,
                returned_qty:     returnedQty,
                shortage_qty:     shortageQty,
                shortage_value:   shortageValue,
                price:            orderItem.price
            });
        }

        // Settlement সেভ
        const result = await query(
            `INSERT INTO daily_settlements
             (worker_id, order_id, settlement_date,
              items_taken, total_sales_amount,
              cash_collected, credit_given,
              old_credit_collected, replacement_value,
              shortage_qty_value, shortage_note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                workerId,
                order.rows[0]?.id || null,
                today,
                JSON.stringify(itemsReport),
                sales.total_sales,
                sales.cash_collected,
                sales.credit_given,
                sales.old_credit_collected,
                sales.replacement_value,
                totalShortageValue,
                shortage_note || null
            ]
        );

        // Manager কে Firebase নোটিফিকেশন
        if (req.user.manager_id) {
            await firebaseNotify(
                `notifications/${req.user.manager_id}/settlements`,
                {
                    settlementId:   result.rows[0].id,
                    workerName:     req.user.name_bn,
                    totalSales:     sales.total_sales,
                    shortageValue:  totalShortageValue,
                    hasShortage:    totalShortageValue > 0,
                    message: totalShortageValue > 0
                        ? `⚠️ ${req.user.name_bn} এর হিসাবে ৳${totalShortageValue} ঘাটতি আছে।`
                        : `✅ ${req.user.name_bn} হিসাব জমা দিয়েছে।`
                }
            );
        }

        return res.status(201).json({
            success: true,
            message: 'হিসাব জমা দেওয়া হয়েছে। Manager এর অনুমোদনের অপেক্ষায়।',
            data: {
                settlement_id:      result.rows[0].id,
                items:              itemsReport,
                total_shortage:     totalShortageValue,
                total_sales:        sales.total_sales,
                cash_collected:     sales.cash_collected
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
        const currentYear     = year  || new Date().getFullYear();
        const currentMonth    = month || new Date().getMonth() + 1;

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

        // Manager শুধু নিজের টিম
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
// Manager "হিসাব বুঝে পেয়েছি" দেবে
// ============================================================

const approveSettlement = async (req, res) => {
    try {
        const { id }         = req.params;
        const { note }       = req.body;

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

        await withTransaction(async (client) => {
            // Settlement অনুমোদন
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

            // Attendance এ settlement_approved = true
            await client.query(
                `UPDATE attendance
                 SET settlement_approved = true, updated_at = NOW()
                 WHERE user_id = $1 AND date = $2`,
                [settlement.rows[0].worker_id, settlement.rows[0].settlement_date]
            );
        });

        // SR কে Firebase নোটিফিকেশন
        await firebaseNotify(
            `notifications/${settlement.rows[0].worker_id}/settlement`,
            {
                settlementId: id,
                status:       'approved',
                message:      '✅ Manager হিসাব অনুমোদন করেছেন। এখন চেক-আউট করুন।'
            }
        );

        return res.status(200).json({
            success: true,
            message: 'হিসাব অনুমোদন সফল। SR এখন চেক-আউট করতে পারবে।'
        });

    } catch (error) {
        console.error('❌ Approve Settlement Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DISPUTE SETTLEMENT
// PUT /api/settlements/:id/dispute
// ঘাটতি চিহ্নিত করা
// ============================================================

const disputeSettlement = async (req, res) => {
    try {
        const { id }              = req.params;
        const { shortage_value, note } = req.body;

        const settlement = await query(
            'SELECT * FROM daily_settlements WHERE id = $1',
            [id]
        );

        if (settlement.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'হিসাব পাওয়া যায়নি।' });
        }

        const finalShortage = shortage_value || settlement.rows[0].shortage_qty_value;

        await withTransaction(async (client) => {
            // Settlement disputed করো
            await client.query(
                `UPDATE daily_settlements
                 SET status           = 'disputed',
                     manager_id       = $1,
                     manager_note     = $2,
                     shortage_qty_value = $3,
                     updated_at       = NOW()
                 WHERE id = $4`,
                [req.user.id, note || null, finalShortage, id]
            );

            // SR এর outstanding_dues বাড়াও (trigger করবে কিন্তু নিজেও করি)
            await client.query(
                `UPDATE users
                 SET outstanding_dues = outstanding_dues + $1, updated_at = NOW()
                 WHERE id = $2`,
                [finalShortage, settlement.rows[0].worker_id]
            );
        });

        // SR কে Firebase নোটিফিকেশন
        await firebaseNotify(
            `notifications/${settlement.rows[0].worker_id}/settlement`,
            {
                settlementId:  id,
                status:        'disputed',
                shortageValue: finalShortage,
                message: `⚠️ হিসাবে ৳${finalShortage} ঘাটতি পাওয়া গেছে। পরিশোধ করুন।`
            }
        );

        return res.status(200).json({
            success: true,
            message: `ঘাটতি চিহ্নিত করা হয়েছে। ৳${finalShortage} SR এর বকেয়ায় যোগ হয়েছে।`
        });

    } catch (error) {
        console.error('❌ Dispute Settlement Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PAY SHORTAGE
// POST /api/settlements/:id/pay-shortage
// ঘাটতি পরিশোধ রেকর্ড
// ============================================================

const payShortage = async (req, res) => {
    try {
        const { id }             = req.params;
        const { amount, payment_method, note } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'সঠিক পরিমাণ দিন।'
            });
        }

        const settlement = await query(
            'SELECT worker_id FROM daily_settlements WHERE id = $1',
            [id]
        );

        if (settlement.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'হিসাব পাওয়া যায়নি।' });
        }

        // shortage_payments এ সেভ (trigger অটো outstanding_dues কমাবে)
        await query(
            `INSERT INTO shortage_payments
             (worker_id, settlement_id, amount, payment_method, note, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                settlement.rows[0].worker_id,
                id, amount,
                payment_method || 'cash_paid',
                note || null,
                req.user.id
            ]
        );

        // বকেয়া শেষ হলে settlement approved করো
        const worker = await query(
            'SELECT outstanding_dues FROM users WHERE id = $1',
            [settlement.rows[0].worker_id]
        );

        if (parseFloat(worker.rows[0].outstanding_dues) <= 0) {
            await query(
                `UPDATE daily_settlements
                 SET status = 'approved', approved_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [id]
            );

            // Attendance settlement_approved = true
            const settlementData = await query(
                'SELECT settlement_date FROM daily_settlements WHERE id = $1',
                [id]
            );

            await query(
                `UPDATE attendance
                 SET settlement_approved = true, updated_at = NOW()
                 WHERE user_id = $1 AND date = $2`,
                [settlement.rows[0].worker_id, settlementData.rows[0].settlement_date]
            );

            // SR কে নোটিফিকেশন
            await firebaseNotify(
                `notifications/${settlement.rows[0].worker_id}/settlement`,
                {
                    settlementId: id,
                    status:       'approved',
                    message:      '✅ ঘাটতি পরিশোধ সম্পন্ন। এখন চেক-আউট করুন।'
                }
            );
        }

        return res.status(200).json({
            success: true,
            message: `৳${amount} পরিশোধ রেকর্ড হয়েছে।`
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
        const today    = new Date().toISOString().split('T')[0];
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

        // ঘাটতি পরিশোধের ইতিহাস
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
                settlement:       result.rows[0],
                shortage_payments: shortagePayments.rows
            }
        });

    } catch (error) {
        console.error('❌ Settlement Detail Error:', error.message);
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
    getSettlementDetail
};
