// backend/src/controllers/purchaseReturn.controller.js
// সাপ্লায়ারকে মাল ফেরত (Purchase Return)।
//
// একটা ফেরতে একসাথে তিনটা জিনিস বদলায় (একই transaction-এ):
//   ১. স্টক: products.stock, warehouse_stock, product_batches + stock_movements 'out' (reference_type='purchase_return')
//   ২. সাপ্লায়ারের বকেয়া: purchase_returns.total_amount দিয়ে কমে (দেখুন supplierPayment.controller-এর PAYABLE_SQL)
//   ৩. অডিট: purchase_returns / purchase_return_items রেকর্ড
//
// ব্যাচ বাছাই: আগে এই PO-র নিজের ব্যাচ (damaged → quarantine → active, মেয়াদ কাছের আগে),
// তাতে না কুলালে বাকিটা FEFO দিয়ে (consumeBatchesFEFO) যাতে ব্যাচের যোগফল আর স্টক মিলে থাকে।

const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { consumeBatchesFEFO } = require('../services/batchFefo.utils');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// ============================================================
// POST /api/purchase-orders/:id/return
// body: { items: [{ product_id, quantity }], reason, note? }
// ============================================================
const createPurchaseReturn = async (req, res) => {
    try {
        const reason = (req.body.reason || '').toString().trim();
        const note   = (req.body.note   || '').toString().trim() || null;
        if (reason.length < 3) {
            return res.status(400).json({ success: false, message: 'ফেরতের কারণ লিখুন (কমপক্ষে ৩ অক্ষর)।' });
        }

        const wanted = new Map();
        for (const it of (Array.isArray(req.body.items) ? req.body.items : [])) {
            const q = parseInt(it.quantity, 10);
            if (!it.product_id || isNaN(q) || q <= 0) continue;
            wanted.set(it.product_id, (wanted.get(it.product_id) || 0) + q);
        }
        if (wanted.size === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি পণ্যের ফেরতের পরিমাণ দিন।' });
        }

        const result = await withTransaction(async (client) => {
            // নম্বর সংঘর্ষ এড়াতে tenant-ভিত্তিক সিরিয়াল লক
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`purchase_return:${req.tenantId}`]);

            const poRes = await client.query(
                `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                [req.params.id, req.tenantId]
            );
            if (poRes.rows.length === 0) throw fail('Purchase Order পাওয়া যায়নি।', 404);
            const po = poRes.rows[0];
            if (!po.supplier_id) throw fail('এই PO-তে সাপ্লায়ার নেই।');
            if (!['partial', 'received'].includes(po.status)) {
                throw fail('শুধু মাল গ্রহণ করা হয়েছে এমন PO থেকে ফেরত দেওয়া যায়।');
            }

            // প্রতি পণ্যের গ্রহণকৃত পরিমাণ, গড় দর, এবং আগে ফেরত দেওয়া পরিমাণ
            const lines = await client.query(
                `SELECT product_id,
                        SUM(quantity_received) AS received,
                        CASE WHEN SUM(quantity_received) > 0
                             THEN SUM(quantity_received * unit_cost) / SUM(quantity_received) ELSE 0 END AS avg_cost
                   FROM purchase_order_items WHERE purchase_order_id = $1 GROUP BY product_id`,
                [po.id]
            );
            const prior = await client.query(
                `SELECT pri.product_id, SUM(pri.quantity) AS returned
                   FROM purchase_return_items pri
                   JOIN purchase_returns pr ON pr.id = pri.return_id
                  WHERE pr.purchase_order_id = $1 GROUP BY pri.product_id`,
                [po.id]
            );
            const lineMap  = new Map(lines.rows.map(r => [r.product_id, r]));
            const priorMap = new Map(prior.rows.map(r => [r.product_id, parseInt(r.returned, 10)]));

            const plan = [];
            let total = 0;
            for (const [productId, qty] of wanted) {
                const line = lineMap.get(productId);
                if (!line) throw fail('একটি পণ্য এই PO-তে পাওয়া যায়নি।');
                const returnable = parseInt(line.received, 10) - (priorMap.get(productId) || 0);
                if (qty > returnable) {
                    throw fail(`এই পণ্যের সর্বোচ্চ ${returnable} পিস ফেরত দেওয়া যায় (গৃহীত − আগের ফেরত)।`);
                }
                const unitCost = parseFloat(line.avg_cost);
                const lineTotal = round2(qty * unitCost);
                plan.push({ productId, qty, unitCost, lineTotal });
                total += lineTotal;
            }
            total = round2(total);

            // স্টকে মাল আছে কিনা — ইতিমধ্যে বিক্রি হয়ে গেলে ফেরত দেওয়া যাবে না
            for (const it of plan) {
                const prod = await client.query(
                    `SELECT name, stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                    [it.productId, req.tenantId]
                );
                if (prod.rows.length === 0) throw fail('পণ্য পাওয়া যায়নি।');
                if (prod.rows[0].stock < it.qty) {
                    throw fail(`${prod.rows[0].name}: স্টকে মাত্র ${prod.rows[0].stock} পিস আছে (বাকিটা সম্ভবত বিক্রি হয়ে গেছে), ${it.qty} পিস ফেরত দেওয়া যাবে না।`);
                }
                if (po.warehouse_id) {
                    const ws = await client.query(
                        `SELECT quantity FROM warehouse_stock WHERE warehouse_id = $1 AND product_id = $2 FOR UPDATE`,
                        [po.warehouse_id, it.productId]
                    );
                    const have = ws.rows[0] ? ws.rows[0].quantity : 0;
                    if (have < it.qty) {
                        throw fail(`${prod.rows[0].name}: এই গুদামে মাত্র ${have} পিস আছে, ${it.qty} পিস ফেরত দেওয়া যাবে না।`);
                    }
                }
            }

            // ফেরত নম্বর: PR-YYYYMM-XXXX
            const now = new Date();
            const prefix = `PR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const cnt = await client.query(
                `SELECT COUNT(*) AS cnt FROM purchase_returns WHERE tenant_id = $1 AND return_number LIKE $2`,
                [req.tenantId, `${prefix}-%`]
            );
            const returnNumber = `${prefix}-${String(parseInt(cnt.rows[0].cnt, 10) + 1).padStart(4, '0')}`;

            const ret = await client.query(
                `INSERT INTO purchase_returns
                    (tenant_id, return_number, purchase_order_id, supplier_id, total_amount, reason, note, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING id, return_number, total_amount`,
                [req.tenantId, returnNumber, po.id, po.supplier_id, total, reason, note, req.user.id]
            );
            const retRow = ret.rows[0];
            const mvNote = `${returnNumber} — সাপ্লায়ারকে ফেরত (${reason})`;

            for (const it of plan) {
                await client.query(
                    `INSERT INTO purchase_return_items (tenant_id, return_id, product_id, quantity, unit_cost, line_total)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [req.tenantId, retRow.id, it.productId, it.qty, it.unitCost, it.lineTotal]
                );

                // ১. এই PO-র নিজস্ব ব্যাচ আগে (ক্ষতিগ্রস্ত/কোয়ারেন্টাইন আগে, তারপর সক্রিয়)
                let remaining = it.qty;
                const batches = await client.query(
                    `SELECT id, quantity FROM product_batches
                      WHERE tenant_id = $1 AND product_id = $2 AND purchase_order_id = $3
                        AND quantity > 0 AND status IN ('damaged','quarantine','active')
                      ORDER BY CASE status WHEN 'damaged' THEN 0 WHEN 'quarantine' THEN 1 ELSE 2 END,
                               (expiry_date IS NULL), expiry_date ASC, created_at ASC
                      FOR UPDATE`,
                    [req.tenantId, it.productId, po.id]
                );
                for (const b of batches.rows) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, parseInt(b.quantity, 10) || 0);
                    if (take <= 0) continue;
                    await client.query(`UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2`, [take, b.id]);
                    await client.query(
                        `INSERT INTO stock_movements
                            (product_id, movement_type, quantity, reference_id, reference_type, note, created_by, tenant_id, batch_id)
                         VALUES ($1,'out',$2,$3,'purchase_return',$4,$5,$6,$7)`,
                        [it.productId, take, retRow.id, mvNote, req.user.id, req.tenantId, b.id]
                    );
                    remaining -= take;
                }

                // ২. বাকিটা অন্য ব্যাচ/ব্যাচবিহীন স্টক থেকে (FEFO) — যাতে ব্যাচ-যোগফল ও স্টক মিলে থাকে
                if (remaining > 0) {
                    await consumeBatchesFEFO(client, {
                        tenantId: req.tenantId, productId: it.productId, qty: remaining,
                        referenceId: retRow.id, referenceType: 'purchase_return',
                        createdBy: req.user.id, note: mvNote,
                        warehouseId: po.warehouse_id || undefined
                    });
                }

                // ৩. সামগ্রিক ও গুদামভিত্তিক স্টক
                await client.query(
                    `UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                    [it.qty, it.productId, req.tenantId]
                );
                if (po.warehouse_id) {
                    await client.query(
                        `UPDATE warehouse_stock SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
                          WHERE warehouse_id = $2 AND product_id = $3`,
                        [it.qty, po.warehouse_id, it.productId]
                    );
                }
            }
            return retRow;
        });

        return res.status(201).json({
            success: true,
            message: `${result.return_number} — ৳${parseFloat(result.total_amount).toLocaleString()} মাল ফেরত রেকর্ড হয়েছে। স্টক ও সাপ্লায়ারের বকেয়া সেই অনুযায়ী কমেছে।`,
            data: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        logger.error('❌ Create Purchase Return Error:', error.message);
        return res.status(500).json({ success: false, message: 'মাল ফেরত রেকর্ড করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/purchase-orders/:id/returns
// পণ্যভিত্তিক (গৃহীত / ফেরত / ফেরতযোগ্য) + আগের ফেরতের তালিকা
// ============================================================
const getPurchaseOrderReturns = async (req, res) => {
    try {
        const po = await query(
            `SELECT id, status FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (po.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }

        const items = await query(
            `SELECT poi.product_id, p.name AS product_name, p.sku, p.unit,
                    SUM(poi.quantity_received) AS received,
                    CASE WHEN SUM(poi.quantity_received) > 0
                         THEN SUM(poi.quantity_received * poi.unit_cost) / SUM(poi.quantity_received) ELSE 0 END AS unit_cost,
                    COALESCE((SELECT SUM(pri.quantity)
                                FROM purchase_return_items pri
                                JOIN purchase_returns pr ON pr.id = pri.return_id
                               WHERE pr.purchase_order_id = poi.purchase_order_id
                                 AND pri.product_id = poi.product_id), 0) AS returned
               FROM purchase_order_items poi
               JOIN products p ON p.id = poi.product_id
              WHERE poi.purchase_order_id = $1
              GROUP BY poi.product_id, p.name, p.sku, p.unit, poi.purchase_order_id
              ORDER BY p.name ASC`,
            [req.params.id]
        );

        const returns = await query(
            `SELECT pr.id, pr.return_number, pr.total_amount, pr.reason, pr.note, pr.created_at,
                    u.name_bn AS created_by_name,
                    (SELECT json_agg(json_build_object('product_name', p.name, 'quantity', pri.quantity, 'unit_cost', pri.unit_cost))
                       FROM purchase_return_items pri JOIN products p ON p.id = pri.product_id
                      WHERE pri.return_id = pr.id) AS items
               FROM purchase_returns pr
               LEFT JOIN users u ON u.id = pr.created_by
              WHERE pr.purchase_order_id = $1 AND pr.tenant_id = $2
              ORDER BY pr.created_at DESC`,
            [req.params.id, req.tenantId]
        );

        const mapped = items.rows.map(r => {
            const received = parseInt(r.received, 10);
            const returned = parseInt(r.returned, 10);
            return {
                product_id: r.product_id, product_name: r.product_name, sku: r.sku, unit: r.unit,
                received, returned, returnable: Math.max(0, received - returned),
                unit_cost: round2(parseFloat(r.unit_cost))
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                can_return: ['partial', 'received'].includes(po.rows[0].status) && mapped.some(i => i.returnable > 0),
                items: mapped,
                returns: returns.rows
            }
        });
    } catch (error) {
        logger.error('❌ Get PO Returns Error:', error.message);
        return res.status(500).json({ success: false, message: 'ফেরতের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { createPurchaseReturn, getPurchaseOrderReturns };
