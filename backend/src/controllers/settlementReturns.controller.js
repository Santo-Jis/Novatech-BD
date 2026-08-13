const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { addDuesLedgerEntry } = require('../services/dues.service');

// ============================================================
// GET /api/settlement-returns/pending
// SR-রা settlement-এ যেসব "ফেরত" claim করেছে কিন্তু warehouse এখনো
// physically receive করেনি — সেই queue।
// Role: manager, supervisor, asm, rsm, admin
// ============================================================
const listPendingReturns = async (req, res) => {
    try {
        const result = await query(
            `SELECT
                srr.id, srr.settlement_id, srr.product_id, srr.product_name,
                srr.qty_claimed, srr.qty_received, srr.status, srr.created_at,
                u.id AS worker_id,
                COALESCE(u.name_bn, u.name_en) AS worker_name,
                u.employee_code
             FROM settlement_return_receipts srr
             JOIN users u ON u.id = srr.worker_id
             WHERE srr.tenant_id = $1
               AND srr.status = 'pending'
             ORDER BY srr.created_at ASC`,
            [req.tenantId]
        );

        return res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ listPendingReturns Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/settlement-returns/:id/receive
// Warehouse/Manager physically গুনে receive confirm করবে।
// শুধু qty_received-টাই products.stock-এ যোগ হবে — SR-এর claim
// (qty_claimed) না। এই একটা কল-ই Phase-2-এর মূল fix:
// আগে settlement-এ "ফেরত" মার্ক করলেই stock বাড়ত না (bug),
// এখন claim শুধু queue বানায়, receive confirm করলেই stock বাড়ে।
// Role: manager, supervisor, asm, rsm, admin
// ============================================================
const receiveReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const { qty_received, note } = req.body;

        const qtyReceived = parseInt(qty_received);
        if (isNaN(qtyReceived) || qtyReceived < 0) {
            return res.status(400).json({ success: false, message: 'সঠিক qty_received দিন।' });
        }

        const existing = await query(
            `SELECT * FROM settlement_return_receipts WHERE id = $1 AND tenant_id = $2`,
            [id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রেকর্ড পাওয়া যায়নি।' });
        }

        const rr = existing.rows[0];
        if (rr.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'এই রেকর্ড আগেই প্রসেস হয়ে গেছে।' });
        }

        const newStatus = qtyReceived === rr.qty_claimed ? 'received' : 'discrepancy';

        const result = await withTransaction(async (client) => {
            const updated = await client.query(
                `UPDATE settlement_return_receipts
                 SET qty_received     = $1,
                     status           = $2::return_receipt_status,
                     received_by      = $3,
                     received_at      = NOW(),
                     discrepancy_note = $4,
                     updated_at       = NOW()
                 WHERE id = $5 AND tenant_id = $6
                 RETURNING *`,
                [qtyReceived, newStatus, req.user.id, note || null, id, req.tenantId]
            );

            // শুধু যা সত্যিই গুনে পাওয়া গেলো, ঠিক ততটাই warehouse stock-এ যোগ হবে
            if (qtyReceived > 0) {
                await client.query(
                    `UPDATE products SET stock = stock + $1, updated_at = NOW()
                     WHERE id = $2 AND tenant_id = $3`,
                    [qtyReceived, rr.product_id, req.tenantId]
                );
            }

            return updated;
        });

        // ⚠️ qtyReceived < qty_claimed (discrepancy) হলে সেই ঘাটতিটা এখানেই
        // dues-এ যোগ হয় না — receive আর charge ইচ্ছাকৃতভাবে আলাদা করা হয়েছে।
        // যে physically গুনছে তার একটা ক্লিকেই charge trigger হওয়া উচিত না;
        // manager আলাদাভাবে resolveDiscrepancy() দিয়ে charge/waive সিদ্ধান্ত নেবে।
        return res.json({
            success: true,
            message: newStatus === 'received'
                ? 'ফেরত গৃহীত হয়েছে, warehouse stock আপডেট হয়েছে।'
                : `আংশিক গৃহীত — claim ছিল ${rr.qty_claimed}, পাওয়া গেছে ${qtyReceived}। Discrepancy হিসেবে flag করা হলো, dues-এর সিদ্ধান্ত এখনো বাকি।`,
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ receiveReturn Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/settlement-returns/discrepancies
// যেসব receive হয়েছে কিন্তু claim ≠ পাওয়া গেছে, আর এখনো charge/waive
// কোনোটাই করা হয়নি — manager-এর সিদ্ধান্তের অপেক্ষায়।
// Role: manager, supervisor, asm, rsm, admin
// ============================================================
const listDiscrepancies = async (req, res) => {
    try {
        const result = await query(
            `SELECT
                srr.id, srr.settlement_id, srr.product_id, srr.product_name,
                srr.qty_claimed, srr.qty_received, srr.price,
                (srr.qty_claimed - srr.qty_received) AS shortfall_qty,
                (srr.qty_claimed - srr.qty_received) * COALESCE(srr.price, 0) AS shortfall_value,
                srr.received_at,
                u.id AS worker_id,
                COALESCE(u.name_bn, u.name_en) AS worker_name,
                u.employee_code
             FROM settlement_return_receipts srr
             JOIN users u ON u.id = srr.worker_id
             WHERE srr.tenant_id = $1
               AND srr.status = 'discrepancy'
               AND srr.resolution IS NULL
             ORDER BY srr.received_at ASC`,
            [req.tenantId]
        );

        return res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ listDiscrepancies Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/settlement-returns/:id/resolve-discrepancy
// body: { action: 'charge' | 'waive', note }
// 'charge' → শর্টফলের মূল্য SR-এর outstanding_dues-এ যোগ হবে (dues_ledger-এ audit থাকবে)
// 'waive'  → কোনো চার্জ হবে না, শুধু সিদ্ধান্তটা রেকর্ড হবে
//
// resolution কলামই idempotency guard — একবার resolve হয়ে গেলে
// দ্বিতীয়বার charge/waive করা যাবে না, তাই দুইবার ভুলে ক্লিক করলেও
// dues দুইবার যোগ হওয়ার সুযোগ নেই।
// Role: manager, supervisor, asm, rsm, admin
// ============================================================
const resolveDiscrepancy = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, note } = req.body;

        if (!['charge', 'waive'].includes(action)) {
            return res.status(400).json({ success: false, message: "action অবশ্যই 'charge' অথবা 'waive' হতে হবে।" });
        }

        const existing = await query(
            `SELECT * FROM settlement_return_receipts WHERE id = $1 AND tenant_id = $2`,
            [id, req.tenantId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রেকর্ড পাওয়া যায়নি।' });
        }

        const rr = existing.rows[0];
        if (rr.status !== 'discrepancy') {
            return res.status(400).json({ success: false, message: 'শুধু discrepancy-status রেকর্ডই resolve করা যায়।' });
        }
        if (rr.resolution) {
            return res.status(400).json({ success: false, message: `এই discrepancy আগেই resolve করা হয়ে গেছে (${rr.resolution})।` });
        }

        const shortfallQty   = rr.qty_claimed - (rr.qty_received || 0);
        const shortfallValue = shortfallQty * parseFloat(rr.price || 0);

        const result = await withTransaction(async (client) => {
            if (action === 'charge' && shortfallValue > 0) {
                await addDuesLedgerEntry(client, {
                    workerId:     rr.worker_id,
                    settlementId: rr.settlement_id,
                    dueType:      'product_shortage',
                    amount:       shortfallValue,
                    note:         note || `Settlement-return discrepancy — ${rr.product_name}: claim ${rr.qty_claimed}, পাওয়া গেছে ${rr.qty_received}`,
                    createdBy:    req.user.id,
                    tenantId:     req.tenantId,
                });
            }

            const updated = await client.query(
                `UPDATE settlement_return_receipts
                 SET resolution      = $1,
                     resolved_by     = $2,
                     resolved_at     = NOW(),
                     resolution_note = $3,
                     updated_at      = NOW()
                 WHERE id = $4 AND tenant_id = $5
                 RETURNING *`,
                [action === 'charge' ? 'charged' : 'waived', req.user.id, note || null, id, req.tenantId]
            );

            return updated;
        });

        return res.json({
            success: true,
            message: action === 'charge'
                ? `৳${shortfallValue.toFixed(0)} SR-এর outstanding_dues-এ যোগ হয়েছে।`
                : 'Discrepancy মওকুফ করা হয়েছে — কোনো চার্জ যোগ হয়নি।',
            data: result.rows[0]
        });
    } catch (error) {
        logger.error('❌ resolveDiscrepancy Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    listPendingReturns,
    receiveReturn,
    listDiscrepancies,
    resolveDiscrepancy,
};
