const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { exportBatchesExcel } = require('./report.exports');

// ============================================================
// GET BATCHES
// GET /api/batches?product_id=&expiring_within_days=&status=all|expiring|expired&search=
// status: 'expiring' → expiry_date এখন থেকে N দিনের মধ্যে (ডিফল্ট 30)
//         'expired'  → expiry_date অতীতে
//         'all'      → (ডিফল্ট) স্টক আছে এমন সব ব্যাচ, expiry অনুযায়ী সাজানো (FEFO অর্ডার)
// ============================================================
const getBatches = async (req, res) => {
    try {
        const {
            product_id,
            status = 'all',
            expiring_within_days = 30,
            search,
            batch_status, // ✅ Phase ২: 'quarantine,damaged' এর মতো কমা-সেপারেটেড লাইফসাইকেল ফিল্টার
            warehouse_id  // ✅ মাল্টি-ওয়্যারহাউজ ধাপ ৩
        } = req.query;

        const conditions = [`b.tenant_id = $1`, `b.quantity > 0`];
        const params      = [req.tenantId];
        let paramCount    = 1;

        if (product_id) {
            paramCount++;
            conditions.push(`b.product_id = $${paramCount}`);
            params.push(product_id);
        }

        if (warehouse_id) {
            paramCount++;
            conditions.push(`b.warehouse_id = $${paramCount}`);
            params.push(warehouse_id);
        }

        if (search) {
            paramCount++;
            conditions.push(`(p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount} OR b.batch_number ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        if (status === 'expiring') {
            paramCount++;
            conditions.push(`b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + $${paramCount}::int`);
            params.push(parseInt(expiring_within_days, 10) || 30);
        } else if (status === 'expired') {
            conditions.push(`b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE`);
        }

        if (batch_status) {
            paramCount++;
            conditions.push(`b.status = ANY($${paramCount}::text[])`);
            params.push(batch_status.split(',').map(s => s.trim()).filter(Boolean));
        }

        const result = await query(
            `SELECT b.*, p.name AS product_name, p.sku, p.unit, p.cost_price,
                    s.name AS supplier_name, po.po_number, wh.name AS warehouse_name,
                    ROUND(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0), 2) AS stock_value,
                    CASE
                        WHEN b.expiry_date IS NULL THEN NULL
                        ELSE (b.expiry_date - CURRENT_DATE)
                    END AS days_to_expiry
             FROM product_batches b
             JOIN products p             ON p.id  = b.product_id
             LEFT JOIN suppliers s        ON s.id  = b.supplier_id
             LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
             LEFT JOIN warehouses wh      ON wh.id = b.warehouse_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY (b.expiry_date IS NULL), b.expiry_date ASC, b.created_at ASC`,
            params
        );

        // ── Excel এক্সপোর্ট (?export=excel) ──
        if (req.query.export === 'excel') {
            return exportBatchesExcel(res, result.rows, status);
        }

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Batches Error:', error.message);
        return res.status(500).json({ success: false, message: 'ব্যাচের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET EXPIRY সামারি (ড্যাশবোর্ড/অ্যালার্ট-এর জন্য)
// GET /api/batches/summary
// ============================================================
const getBatchSummary = async (req, res) => {
    try {
        const { warehouse_id } = req.query; // ✅ মাল্টি-ওয়্যারহাউজ ধাপ ৩ — ঐচ্ছিক

        const conditions = [`b.tenant_id = $1`, `b.quantity > 0`];
        const params      = [req.tenantId];
        if (warehouse_id) {
            conditions.push(`b.warehouse_id = $${params.length + 1}`);
            params.push(warehouse_id);
        }

        const result = await query(
            `SELECT
                COUNT(*) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE)                                AS expired_count,
                COUNT(*) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + 30) AS expiring_soon_count,
                COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE), 0)               AS expired_qty,
                COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + 30), 0) AS expiring_soon_qty,
                -- ✅ Phase ১: টাকার অঙ্কে (unit_cost/cost_price ভিত্তিক) ঝুঁকির পরিমাণ
                COALESCE(ROUND(SUM(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0)) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE), 2), 0) AS expired_value,
                COALESCE(ROUND(SUM(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0)) FILTER (WHERE b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + 30), 2), 0) AS expiring_soon_value,
                COALESCE(ROUND(SUM(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0)), 2), 0) AS total_batch_value,
                -- ✅ Phase ২: quarantine/damaged (সমস্যাযুক্ত) ব্যাচ
                COUNT(*) FILTER (WHERE b.status IN ('quarantine', 'damaged'))                                                        AS issues_count,
                COALESCE(ROUND(SUM(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0)) FILTER (WHERE b.status IN ('quarantine', 'damaged')), 2), 0) AS issues_value
             FROM product_batches b
             JOIN products p ON p.id = b.product_id
             WHERE ${conditions.join(' AND ')}`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Get Batch Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'সারাংশ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ব্যাচ ডিটেইল + মুভমেন্ট হিস্ট্রি (ডিটেইল ড্রয়ারের জন্য — Phase ১)
// GET /api/batches/:id/movements
// stock_movements.batch_id দিয়ে ট্রেস করে — এই ব্যাচ থেকে কবে/কোথায়
// কতটুকু স্টক গিয়েছে (PO রিসিভ থেকে ইন, অর্ডার অ্যাপ্রুভ থেকে আউট ইত্যাদি)
// ============================================================
const getBatchMovements = async (req, res) => {
    try {
        const { id } = req.params;

        const batchResult = await query(
            `SELECT b.*, p.name AS product_name, p.sku, p.unit, p.cost_price,
                    s.name AS supplier_name, po.po_number, wh.name AS warehouse_name,
                    ROUND(b.quantity * COALESCE(b.unit_cost, p.cost_price, 0), 2) AS stock_value
             FROM product_batches b
             JOIN products p             ON p.id  = b.product_id
             LEFT JOIN suppliers s        ON s.id  = b.supplier_id
             LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
             LEFT JOIN warehouses wh      ON wh.id = b.warehouse_id
             WHERE b.id = $1 AND b.tenant_id = $2`,
            [id, req.tenantId]
        );

        if (batchResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ব্যাচ পাওয়া যায়নি।' });
        }

        const movementsResult = await query(
            `SELECT sm.id, sm.movement_type, sm.quantity, sm.reference_id, sm.reference_type,
                    sm.note, sm.created_at, u.name_bn AS created_by_name
             FROM stock_movements sm
             LEFT JOIN users u ON u.id = sm.created_by
             WHERE sm.batch_id = $1 AND sm.tenant_id = $2
             ORDER BY sm.created_at DESC`,
            [id, req.tenantId]
        );

        // ✅ Phase ২: স্ট্যাটাস পরিবর্তন/রাইট-অফের audit history
        const adjustmentsResult = await query(
            `SELECT ba.id, ba.action, ba.quantity_before, ba.quantity_after, ba.quantity_adjusted,
                    ba.value_impact, ba.reason, ba.created_at, u.name_bn AS created_by_name
             FROM batch_adjustments ba
             LEFT JOIN users u ON u.id = ba.created_by
             WHERE ba.batch_id = $1 AND ba.tenant_id = $2
             ORDER BY ba.created_at DESC`,
            [id, req.tenantId]
        );

        return res.status(200).json({
            success: true,
            data: {
                batch: batchResult.rows[0],
                movements: movementsResult.rows,
                adjustments: adjustmentsResult.rows
            }
        });
    } catch (error) {
        logger.error('❌ Get Batch Movements Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুভমেন্ট হিস্ট্রি আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH ব্যাচ স্ট্যাটাস বদলানো (Phase ২ — ব্যাচ লাইফসাইকেল)
// PATCH /api/batches/:id/status
// body: { action: 'quarantine'|'damaged'|'written_off'|'returned_to_supplier'|'reactivated', reason }
//
// - quarantine/damaged/reactivated → শুধু স্ট্যাটাস বদলায়, quantity অক্ষত থাকে
//   (quarantine/damaged ব্যাচ FEFO থেকে বাদ পড়ে, কিন্তু ফিজিক্যাল স্টক গণনায় থাকে)
// - written_off/returned_to_supplier → পুরো ব্যাচের quantity শূন্য করে দেয়,
//   products.stock থেকেও বিয়োগ করে, stock_movements-এ 'out' এন্ট্রি লেখে
// - written_off অতিরিক্তভাবে expenses টেবিলে একটা লস এন্ট্রি তৈরি করে
//   (এটা P&L রিপোর্টে (GET /api/reports/pl) স্বয়ংক্রিয়ভাবে যোগ হয়ে যাবে)
// ============================================================
const VALID_ACTIONS = ['quarantine', 'damaged', 'written_off', 'returned_to_supplier', 'reactivated'];
const ACTION_TO_STATUS = {
    quarantine:            'quarantine',
    damaged:                'damaged',
    written_off:            'written_off',
    returned_to_supplier:  'returned_to_supplier',
    reactivated:            'active'
};

const updateBatchStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body;

        if (!VALID_ACTIONS.includes(action)) {
            return res.status(400).json({ success: false, message: 'সঠিক action দিন।' });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'কারণ উল্লেখ করা বাধ্যতামূলক।' });
        }

        const batchRes = await query(
            `SELECT b.*, p.name AS product_name, p.cost_price
             FROM product_batches b
             JOIN products p ON p.id = b.product_id
             WHERE b.id = $1 AND b.tenant_id = $2`,
            [id, req.tenantId]
        );

        if (batchRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ব্যাচ পাওয়া যায়নি।' });
        }
        const batch = batchRes.rows[0];

        if (action === 'reactivated' && !['quarantine', 'damaged'].includes(batch.status)) {
            return res.status(400).json({ success: false, message: 'শুধু কোয়ারেন্টাইন/ক্ষতিগ্রস্ত ব্যাচ সক্রিয় করা যাবে।' });
        }
        if (['quarantine', 'damaged'].includes(action) && batch.status !== 'active') {
            return res.status(400).json({ success: false, message: 'শুধু সক্রিয় ব্যাচের অবস্থা বদলানো যাবে।' });
        }
        if (['written_off', 'returned_to_supplier'].includes(action) && !['active', 'quarantine', 'damaged'].includes(batch.status)) {
            return res.status(400).json({ success: false, message: 'এই ব্যাচ ইতিমধ্যে চূড়ান্ত অবস্থায় আছে।' });
        }

        const newStatus     = ACTION_TO_STATUS[action];
        const unitCost       = parseFloat(batch.unit_cost || batch.cost_price || 0);
        const isRemoval       = ['written_off', 'returned_to_supplier'].includes(action);
        const quantityBefore = parseInt(batch.quantity, 10) || 0;
        const quantityAdjusted = isRemoval ? quantityBefore : 0;
        const quantityAfter    = isRemoval ? 0 : quantityBefore;
        const valueImpact       = Math.round(quantityAdjusted * unitCost * 100) / 100;

        const outcome = await withTransaction(async (client) => {
            // ব্যাচ আপডেট
            await client.query(
                `UPDATE product_batches SET quantity = $1, status = $2 WHERE id = $3`,
                [quantityAfter, newStatus, id]
            );

            let expenseId = null;

            if (isRemoval && quantityAdjusted > 0) {
                // প্রোডাক্টের সামগ্রিক স্টক থেকেও বিয়োগ (নেগেটিভ না হয় সেই নিশ্চয়তাসহ)
                await client.query(
                    `UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                    [quantityAdjusted, batch.product_id, req.tenantId]
                );

                // ✅ per-warehouse স্টক: এই ব্যাচ যে গুদামে ছিল, সেই গুদামের
                // warehouse_stock থেকেও সমান পরিমাণ বাদ যাবে (products.stock-এর সাথে সিঙ্ক)
                if (batch.warehouse_id) {
                    await client.query(
                        `INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, quantity, updated_at)
                         VALUES ($1, $2, $3, 0, NOW())
                         ON CONFLICT (warehouse_id, product_id)
                         DO UPDATE SET quantity = GREATEST(0, warehouse_stock.quantity - $4), updated_at = NOW()`,
                        [req.tenantId, batch.warehouse_id, batch.product_id, quantityAdjusted]
                    );
                }

                // audit — stock_movements
                await client.query(
                    `INSERT INTO stock_movements
                        (product_id, movement_type, quantity, reference_type, note, created_by, tenant_id, batch_id)
                     VALUES ($1, 'out', $2, 'adjustment', $3, $4, $5, $6)`,
                    [
                        batch.product_id, quantityAdjusted,
                        `${action === 'written_off' ? 'ব্যাচ রাইট-অফ' : 'সাপ্লায়ারকে ফেরত'} — ${reason}`,
                        req.user.id, req.tenantId, id
                    ]
                );

                // শুধু write-off আসল আর্থিক ক্ষতি হিসেবে expenses-এ যোগ হবে
                // (সাপ্লায়ারকে ফেরত সাধারণত ক্রেডিট/রিপ্লেসমেন্টে সমাধান হয়, তাই সরাসরি লস নয়)
                if (action === 'written_off' && valueImpact > 0) {
                    const expenseRes = await client.query(
                        `INSERT INTO expenses (user_id, expense_type, amount, date, note, created_by, tenant_id)
                         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
                         RETURNING id`,
                        [
                            req.user.id, 'ব্যাচ রাইট-অফ (মেয়াদোত্তীর্ণ/ক্ষতিগ্রস্ত স্টক)', valueImpact,
                            `${batch.product_name} — ব্যাচ ${batch.batch_number || '—'} — ${reason}`,
                            req.user.id, req.tenantId
                        ]
                    );
                    expenseId = expenseRes.rows[0].id;
                }
            }

            // audit — batch_adjustments
            const adjRes = await client.query(
                `INSERT INTO batch_adjustments
                    (tenant_id, batch_id, action, quantity_before, quantity_after, quantity_adjusted, value_impact, reason, expense_id, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [req.tenantId, id, action, quantityBefore, quantityAfter, quantityAdjusted, valueImpact, reason, expenseId, req.user.id]
            );

            return adjRes.rows[0];
        });

        return res.status(200).json({
            success: true,
            message: 'ব্যাচের অবস্থা সফলভাবে আপডেট হয়েছে।',
            data: outcome
        });
    } catch (error) {
        logger.error('❌ Update Batch Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'ব্যাচের অবস্থা আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET রিকল রিপোর্ট (Phase ৩)
// GET /api/batches/:id/recall
// এই ব্যাচ থেকে কোন কোন SR/worker-এর কাছে (কোন অর্ডারের মাধ্যমে) স্টক গেছে।
//
// সীমাবদ্ধতা (স্বচ্ছভাবে জানানো জরুরি): sale_items-এ batch_id ট্র্যাক করা হয় না,
// তাই এটা "কোন দোকান/কাস্টমারের কাছে গেছে" পর্যন্ত যায় না — শুধু "কোন SR-এর কাছে
// ওয়্যারহাউজ থেকে ইস্যু হয়েছে" পর্যন্ত ট্রেস করে। এর বেশি ট্রেসেবিলিটির জন্য
// sale_items-এ batch_id যোগ করে বিক্রয়ের সময় batch attribute করা লাগবে।
// ============================================================
const getBatchRecall = async (req, res) => {
    try {
        const { id } = req.params;

        const batchRes = await query(
            `SELECT b.*, p.name AS product_name, p.sku
             FROM product_batches b
             JOIN products p ON p.id = b.product_id
             WHERE b.id = $1 AND b.tenant_id = $2`,
            [id, req.tenantId]
        );
        if (batchRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ব্যাচ পাওয়া যায়নি।' });
        }

        const distRes = await query(
            `SELECT sm.reference_id AS order_id, sm.quantity, sm.created_at,
                    u.id AS worker_id, u.name_bn AS worker_name, u.employee_code,
                    o.status AS order_status
             FROM stock_movements sm
             JOIN orders o ON o.id = sm.reference_id
             JOIN users u  ON u.id = o.worker_id
             WHERE sm.batch_id = $1 AND sm.tenant_id = $2
               AND sm.reference_type = 'order' AND sm.movement_type = 'out'
             ORDER BY sm.created_at DESC`,
            [id, req.tenantId]
        );

        const byWorker = {};
        distRes.rows.forEach(r => {
            if (!byWorker[r.worker_id]) {
                byWorker[r.worker_id] = {
                    worker_id: r.worker_id,
                    worker_name: r.worker_name,
                    employee_code: r.employee_code,
                    total_qty: 0,
                    orders: []
                };
            }
            const qty = parseInt(r.quantity, 10) || 0;
            byWorker[r.worker_id].total_qty += qty;
            byWorker[r.worker_id].orders.push({
                order_id: r.order_id,
                quantity: qty,
                date: r.created_at,
                order_status: r.order_status
            });
        });

        return res.status(200).json({
            success: true,
            data: {
                batch: batchRes.rows[0],
                distributed_to: Object.values(byWorker).sort((a, b) => b.total_qty - a.total_qty),
                total_distributed: distRes.rows.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0)
            }
        });
    } catch (error) {
        logger.error('❌ Get Batch Recall Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিকল রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET লস ট্রেন্ড + ব্যাচ-ট্র্যাকিং কভারেজ (Phase ৩)
// GET /api/batches/analytics?months=6
//
// ১. written_off value/qty — মাস অনুযায়ী ট্রেন্ড (batch_adjustments থেকে)
// ২. "কভারেজ %" — stock-out এর কত অংশ ব্যাচ-ট্র্যাকড ছিল বনাম আনট্র্যাকড
//    (batch_id IS NULL মানে PO রিসিভের সময় ব্যাচ নং/মেয়াদ দেওয়া হয়নি)
//    এটা "FEFO কমপ্লায়েন্স" এর honest proxy — যেহেতু আমাদের consumeBatchesFEFO
//    সবসময় ট্র্যাকড ব্যাচ থেকে নিকটতম মেয়াদই আগে বের করে (কোড-লেভেলে guaranteed),
//    আসল ঝুঁকিটা হলো কতটা স্টক আদৌ ট্র্যাক হচ্ছে না।
// ============================================================
const getBatchAnalytics = async (req, res) => {
    try {
        const months = Math.min(parseInt(req.query.months, 10) || 6, 24);

        const lossResult = await query(
            `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                    COALESCE(SUM(value_impact), 0)      AS written_off_value,
                    COALESCE(SUM(quantity_adjusted), 0)  AS written_off_qty,
                    COUNT(*)                              AS written_off_count
             FROM batch_adjustments
             WHERE tenant_id = $1 AND action = 'written_off'
               AND created_at >= date_trunc('month', CURRENT_DATE) - ($2 || ' months')::interval
             GROUP BY 1`,
            [req.tenantId, months]
        );

        const coverageResult = await query(
            `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                    COALESCE(SUM(quantity) FILTER (WHERE batch_id IS NOT NULL), 0) AS tracked_qty,
                    COALESCE(SUM(quantity) FILTER (WHERE batch_id IS NULL), 0)     AS untracked_qty
             FROM stock_movements
             WHERE tenant_id = $1 AND movement_type = 'out' AND reference_type = 'order'
               AND created_at >= date_trunc('month', CURRENT_DATE) - ($2 || ' months')::interval
             GROUP BY 1`,
            [req.tenantId, months]
        );

        // ডেটা না থাকা মাসেও ০ দেখানোর জন্য সম্পূর্ণ মাসের তালিকা বানানো
        const monthList = [];
        const now = new Date();
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        const lossMap = {};
        lossResult.rows.forEach(r => { lossMap[r.month] = r; });
        const coverageMap = {};
        coverageResult.rows.forEach(r => { coverageMap[r.month] = r; });

        const trend = monthList.map(m => {
            const loss = lossMap[m] || { written_off_value: 0, written_off_qty: 0, written_off_count: 0 };
            const cov  = coverageMap[m] || { tracked_qty: 0, untracked_qty: 0 };
            const trackedQty   = parseFloat(cov.tracked_qty) || 0;
            const untrackedQty = parseFloat(cov.untracked_qty) || 0;
            const totalQty     = trackedQty + untrackedQty;
            return {
                month:              m,
                written_off_value:  parseFloat(loss.written_off_value) || 0,
                written_off_qty:    parseInt(loss.written_off_qty, 10) || 0,
                written_off_count:  parseInt(loss.written_off_count, 10) || 0,
                tracked_qty:        trackedQty,
                untracked_qty:      untrackedQty,
                coverage_pct:       totalQty > 0 ? Math.round((trackedQty / totalQty) * 1000) / 10 : null
            };
        });

        const totalWrittenOffValue = trend.reduce((s, t) => s + t.written_off_value, 0);
        const totalTracked         = trend.reduce((s, t) => s + t.tracked_qty, 0);
        const totalUntracked       = trend.reduce((s, t) => s + t.untracked_qty, 0);
        const overallCoverage      = (totalTracked + totalUntracked) > 0
            ? Math.round((totalTracked / (totalTracked + totalUntracked)) * 1000) / 10
            : null;

        return res.status(200).json({
            success: true,
            data: {
                months,
                trend,
                summary: {
                    total_written_off_value: Math.round(totalWrittenOffValue * 100) / 100,
                    overall_coverage_pct:      overallCoverage
                }
            }
        });
    } catch (error) {
        logger.error('❌ Get Batch Analytics Error:', error.message);
        return res.status(500).json({ success: false, message: 'অ্যানালিটিক্স আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getBatches,
    getBatchSummary,
    getBatchMovements,
    updateBatchStatus,
    getBatchRecall,
    getBatchAnalytics
};
