// backend/src/controllers/purchaseOrderCost.controller.js
// Landed Cost — একটা PO-র মূল দামের বাইরে অতিরিক্ত খরচ (শিপমেন্ট, কাস্টমস, টেস্টিং,
// অ্যাসেম্বেল ইত্যাদি) ট্র্যাক করে প্রতিটা আইটেমের "প্রকৃত ইউনিট কস্ট" বের করা।
//
// গুরুত্বপূর্ণ ডিজাইন নোট: receivePurchaseOrder()-এর বিদ্যমান weighted-average
// cost_price আপডেট এখানে ছোঁয়া হয়নি (সেটা শুধু raw unit_cost ব্যবহার করে, যেটা
// আগে থেকেই টেস্টেড এবং Payable Ledger/Supplier Mapping এর উপর নির্ভরশীল)।
// এই মডিউল সম্পূর্ণ আলাদা, additive স্তর — applyLandedCost() একটা স্বতন্ত্র,
// সচেতন অ্যাকশন যা সেই weighted-average-এর উপর দিয়ে cost_price ওভাররাইট করে,
// অটোমেটিক না — অ্যাডমিন নিজে ক্লিক করলেই হয়।
//
// বণ্টন (allocation) সবসময় on-the-fly কম্পিউট হয় (Payable Ledger-এর মতোই দর্শন) —
// কোনো stored/synced কলাম নেই, তাই ডেটা কখনো stale হওয়ার ঝুঁকি নেই।

const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

const ALLOWED_COST_TYPES = [
    'freight', 'customs_duty', 'clearing_charge', 'insurance',
    'bank_charge', 'assembly', 'testing', 'packaging', 'transport', 'other'
];
const ALLOWED_CURRENCIES = ['BDT', 'USD', 'EUR', 'CNY', 'INR', 'GBP', 'OTHER'];
const ALLOWED_ALLOCATION_METHODS = ['value', 'quantity', 'equal'];

// ─────────────────────────────────────────────────────────────
// PO-র landed cost breakdown কম্পিউট করে — getLandedCost ও applyLandedCost
// দুটোই এই একই ফাংশন ব্যবহার করে, তাই "যা দেখানো হলো, তাই apply হবে" নিশ্চিত থাকে
// ─────────────────────────────────────────────────────────────
const computeBreakdown = async (poId, tenantId) => {
    const poResult = await query(
        `SELECT id, po_number, status, currency, exchange_rate, cost_allocation_method
         FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
        [poId, tenantId]
    );
    if (poResult.rows.length === 0) return null;
    const po = poResult.rows[0];

    const itemsResult = await query(
        `SELECT poi.id, poi.product_id, poi.quantity_ordered, poi.quantity_received,
                poi.unit_cost, poi.foreign_unit_cost, p.name AS product_name, p.sku
         FROM purchase_order_items poi
         JOIN products p ON p.id = poi.product_id
         WHERE poi.purchase_order_id = $1
         ORDER BY p.name ASC`,
        [poId]
    );

    const costsResult = await query(
        `SELECT id, cost_type, currency, amount, exchange_rate, amount_bdt, notes, created_at
         FROM purchase_order_costs WHERE purchase_order_id = $1 ORDER BY created_at ASC`,
        [poId]
    );

    const totalExtraBdt = costsResult.rows.reduce((sum, c) => sum + parseFloat(c.amount_bdt), 0);

    // প্রকৃত রিসিভড কোয়ান্টিটি থাকলে সেটা, না থাকলে অর্ডারকৃত পরিমাণ (এস্টিমেট হিসেবে)
    const items = itemsResult.rows.map(it => {
        const received = parseInt(it.quantity_received, 10) || 0;
        const ordered  = parseInt(it.quantity_ordered, 10) || 0;
        const qty      = received > 0 ? received : ordered;
        const unitCost = parseFloat(it.unit_cost);
        return { ...it, _qty: qty, _unitCost: unitCost, _value: qty * unitCost };
    });

    const basisOf = (it) => {
        if (po.cost_allocation_method === 'quantity') return it._qty;
        if (po.cost_allocation_method === 'equal')    return 1;
        return it._value; // 'value' — ডিফল্ট, দামি আইটেম বেশি ভাগ পায়
    };
    const basisTotal = items.reduce((sum, it) => sum + basisOf(it), 0);

    const breakdown = items.map(it => {
        const basis   = basisOf(it);
        const share   = basisTotal > 0 ? (basis / basisTotal) * totalExtraBdt : 0;
        const perUnit = it._qty > 0 ? share / it._qty : 0;
        return {
            item_id:             it.id,
            product_id:          it.product_id,
            product_name:        it.product_name,
            sku:                 it.sku,
            quantity:            it._qty,
            unit_cost:           Math.round(it._unitCost * 100) / 100,
            foreign_unit_cost:   it.foreign_unit_cost !== null ? parseFloat(it.foreign_unit_cost) : null,
            allocated_extra_bdt: Math.round(share * 100) / 100,
            extra_per_unit_bdt:  Math.round(perUnit * 100) / 100,
            landed_unit_cost:    Math.round((it._unitCost + perUnit) * 100) / 100,
        };
    });

    return {
        po_number:          po.po_number,
        status:             po.status,
        currency:           po.currency,
        exchange_rate:      parseFloat(po.exchange_rate),
        allocation_method:  po.cost_allocation_method,
        costs:              costsResult.rows,
        total_extra_bdt:    Math.round(totalExtraBdt * 100) / 100,
        items:              breakdown,
    };
};

// ============================================================
// GET /api/purchase-orders/:id/landed-cost
// ============================================================
const getLandedCost = async (req, res) => {
    try {
        const data = await computeBreakdown(req.params.id, req.tenantId);
        if (!data) return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error('❌ Get Landed Cost Error:', error.message);
        return res.status(500).json({ success: false, message: 'ল্যান্ডেড কস্ট হিসাবে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/purchase-orders/:id/costs
// body: { cost_type, currency, amount, exchange_rate, notes }
// ============================================================
const addCost = async (req, res) => {
    try {
        const poId = req.params.id;
        const { cost_type, currency, amount, exchange_rate, notes } = req.body;

        if (!ALLOWED_COST_TYPES.includes(cost_type)) {
            return res.status(400).json({ success: false, message: 'সঠিক খরচের ধরন বাছাই করুন।' });
        }
        const parsedAmount = parseFloat(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
        }
        const cur  = ALLOWED_CURRENCIES.includes(currency) ? currency : 'BDT';
        const rate = cur === 'BDT' ? 1 : parseFloat(exchange_rate);
        if (cur !== 'BDT' && (!rate || rate <= 0)) {
            return res.status(400).json({ success: false, message: 'বিদেশি মুদ্রার জন্য সঠিক এক্সচেঞ্জ রেট দিন।' });
        }

        const poCheck = await query(`SELECT id FROM purchase_orders WHERE id = $1 AND tenant_id = $2`, [poId, req.tenantId]);
        if (poCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        }

        const result = await query(
            `INSERT INTO purchase_order_costs
                (tenant_id, purchase_order_id, cost_type, currency, amount, exchange_rate, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.tenantId, poId, cost_type, cur, parsedAmount, rate, notes || null, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'খরচ যোগ হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Add PO Cost Error:', error.message);
        if (error.code === '23503') return res.status(400).json({ success: false, message: 'তথ্য সঠিক নয়।' });
        if (error.code === '23514') return res.status(400).json({ success: false, message: 'ইনপুট মান সঠিক নয়।' });
        return res.status(500).json({ success: false, message: 'খরচ যোগ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/purchase-orders/:id/costs/:costId
// ============================================================
const deleteCost = async (req, res) => {
    try {
        const result = await query(
            `DELETE FROM purchase_order_costs WHERE id = $1 AND purchase_order_id = $2 AND tenant_id = $3 RETURNING id`,
            [req.params.costId, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'খরচের এন্ট্রি পাওয়া যায়নি।' });
        return res.status(200).json({ success: true, message: 'মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete PO Cost Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/purchase-orders/:id/allocation-method
// body: { method: 'value' | 'quantity' | 'equal' }
// ============================================================
const updateAllocationMethod = async (req, res) => {
    try {
        const { method } = req.body;
        if (!ALLOWED_ALLOCATION_METHODS.includes(method)) {
            return res.status(400).json({ success: false, message: 'সঠিক বণ্টন পদ্ধতি বাছাই করুন।' });
        }
        const result = await query(
            `UPDATE purchase_orders SET cost_allocation_method = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id`,
            [method, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });
        return res.status(200).json({ success: true, message: 'বণ্টন পদ্ধতি আপডেট হয়েছে।' });
    } catch (error) {
        logger.error('❌ Update Allocation Method Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/purchase-orders/:id/apply-landed-cost
// প্রতিটা আইটেমের landed_unit_cost সরাসরি products.cost_price-এ বসিয়ে দেয় —
// receivePurchaseOrder()-এর weighted-average-এর উপর দিয়ে একটা সচেতন override।
// শুধু partial/received PO-তে চলবে (draft/ordered-এ quantity_received এখনো অর্থবহ না)।
// ============================================================
const applyLandedCost = async (req, res) => {
    try {
        const poId = req.params.id;
        const breakdown = await computeBreakdown(poId, req.tenantId);
        if (!breakdown) return res.status(404).json({ success: false, message: 'Purchase Order পাওয়া যায়নি।' });

        if (!['partial', 'received'].includes(breakdown.status)) {
            return res.status(400).json({ success: false, message: 'মাল রিসিভ করার পরেই ল্যান্ডেড কস্ট প্রয়োগ করা যাবে।' });
        }
        if (breakdown.costs.length === 0) {
            return res.status(400).json({ success: false, message: 'কোনো অতিরিক্ত খরচ যোগ করা হয়নি।' });
        }

        const updates = await withTransaction(async (client) => {
            const results = [];
            for (const item of breakdown.items) {
                const productRes = await client.query(
                    `SELECT cost_price FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                    [item.product_id, req.tenantId]
                );
                if (productRes.rows.length === 0) continue; // পণ্য মুছে গেলে বাদ, বাকিগুলো চলবে

                const oldCost = parseFloat(productRes.rows[0].cost_price) || 0;
                await client.query(
                    `UPDATE products SET cost_price = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
                    [item.landed_unit_cost, item.product_id, req.tenantId]
                );
                results.push({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    old_cost_price: oldCost,
                    new_cost_price: item.landed_unit_cost,
                });
            }
            return results;
        });

        return res.status(200).json({
            success: true,
            message: `${updates.length}টি পণ্যের cost price আপডেট হয়েছে।`,
            data: { updated: updates }
        });
    } catch (error) {
        logger.error('❌ Apply Landed Cost Error:', error.message);
        return res.status(500).json({ success: false, message: 'প্রয়োগ করতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getLandedCost, addCost, deleteCost, updateAllocationMethod, applyLandedCost };
