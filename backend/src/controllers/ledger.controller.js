const { query, withTransaction } = require('../config/db');

// ============================================================
// SR STOCK LEDGER
// worker_id = UUID (users.id)
// product_id = INT (products.id)
// ============================================================

const addLedgerEntry = async (clientOrNull, entry) => {
    const sql = `
        INSERT INTO sr_stock_ledger
          (worker_id, product_id, product_name,
           txn_type, direction, qty,
           reference_id, reference_type, note, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `;
    const params = [
        entry.worker_id,                  // UUID
        entry.product_id,                 // INT
        entry.product_name || null,
        entry.txn_type,
        entry.direction,
        Math.abs(parseInt(entry.qty)),
        entry.reference_id   || null,     // INT
        entry.reference_type || null,
        entry.note           || null,
        entry.created_by     || null,     // UUID
    ];

    if (clientOrNull) {
        await clientOrNull.query(sql, params);
    } else {
        await query(sql, params);
    }
};

// ============================================================
// GET SR STOCK — হাতে এখন কত
// GET /api/ledger/stock
// ============================================================
const getMyStock = async (req, res) => {
    try {
        const workerId = req.user.id; // UUID — সরাসরি পাস করো

        const result = await query(
            `SELECT
                product_id,
                product_name,
                SUM(qty * direction)                              AS in_hand_qty,
                SUM(CASE WHEN direction =  1 THEN qty ELSE 0 END) AS total_in,
                SUM(CASE WHEN direction = -1 AND txn_type = 'sale_out'
                         THEN qty ELSE 0 END)                     AS total_sold,
                SUM(CASE WHEN direction = -1 AND txn_type = 'return_out'
                         THEN qty ELSE 0 END)                     AS total_returned
             FROM sr_stock_ledger
             WHERE worker_id = $1::uuid
             GROUP BY product_id, product_name
             HAVING SUM(qty * direction) > 0
             ORDER BY product_name`,
            [workerId]
        );

        // দাম orders থেকে নাও
        const items = await Promise.all(result.rows.map(async row => {
            const priceRes = await query(
                `SELECT (item->>'price')::numeric AS price
                 FROM orders o,
                      jsonb_array_elements(
                          CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                               THEN o.items::jsonb ELSE '[]'::jsonb END
                      ) AS item
                 WHERE o.worker_id = $1::uuid
                   AND (item->>'product_id')::uuid = $2
                   AND o.status = 'approved'
                 ORDER BY o.approved_at DESC
                 LIMIT 1`,
                [workerId, row.product_id]
            );
            const price    = parseFloat(priceRes.rows[0]?.price || 0);
            const inHand   = parseInt(row.in_hand_qty)  || 0;
            const totalIn  = parseInt(row.total_in)      || 0;
            const sold     = parseInt(row.total_sold)    || 0;

            return {
                product_id:   row.product_id,
                product_name: row.product_name || 'অজানা পণ্য',
                price,
                total_in_qty:  totalIn,
                sold_qty:      sold,
                in_hand_qty:   inHand,
                sell_percent:  totalIn > 0 ? Math.round((sold / totalIn) * 100) : 0,
            };
        }));

        const totalInHand  = items.reduce((s, i) => s + i.in_hand_qty, 0);
        const totalSold    = items.reduce((s, i) => s + i.sold_qty, 0);
        const totalHandAmt = items.reduce((s, i) => s + i.in_hand_qty * i.price, 0);
        const totalSoldAmt = items.reduce((s, i) => s + i.sold_qty    * i.price, 0);

        return res.status(200).json({
            success:   true,
            has_stock: items.length > 0,
            summary: {
                total_in_hand:  totalInHand,
                total_sold:     totalSold,
                in_hand_amount: totalHandAmt,
                sold_amount:    totalSoldAmt,
            },
            items,
        });

    } catch (error) {
        console.error('❌ Get My Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET LEDGER HISTORY
// GET /api/ledger/history?worker_id=UUID&from=...&to=...
// ============================================================
const getLedgerHistory = async (req, res) => {
    try {
        const { worker_id, from, to, product_id } = req.query;

        let targetWorkerId = worker_id;
        if (req.user.role === 'worker') {
            targetWorkerId = req.user.id;
        }

        if (!targetWorkerId) {
            return res.status(400).json({ success: false, message: 'worker_id আবশ্যক।' });
        }

        const conditions = ['l.worker_id = $1::uuid'];
        const params     = [targetWorkerId];
        let   p          = 1;

        if (from) { p++; conditions.push(`DATE(l.created_at) >= $${p}`); params.push(from); }
        if (to)   { p++; conditions.push(`DATE(l.created_at) <= $${p}`); params.push(to); }
        if (product_id) { p++; conditions.push(`l.product_id = $${p}`); params.push(parseInt(product_id)); }

        const result = await query(
            `SELECT
                l.id,
                l.created_at,
                l.product_id,
                l.product_name,
                l.txn_type,
                l.direction,
                l.qty,
                l.qty * l.direction AS net_qty,
                l.reference_id,
                l.reference_type,
                l.note,
                u.name_bn           AS done_by,
                w.name_bn           AS worker_name
             FROM sr_stock_ledger l
             LEFT JOIN users u ON l.created_by  = u.id
             LEFT JOIN users w ON l.worker_id   = w.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY l.created_at DESC
             LIMIT 500`,
            params
        );

        // পণ্যভিত্তিক সারসংক্ষেপ
        const summaryMap = {};
        for (const row of result.rows) {
            if (!summaryMap[row.product_id]) {
                summaryMap[row.product_id] = {
                    product_id:   row.product_id,
                    product_name: row.product_name,
                    total_in:  0,
                    total_out: 0,
                };
            }
            if (parseInt(row.direction) ===  1) summaryMap[row.product_id].total_in  += parseInt(row.qty);
            if (parseInt(row.direction) === -1) summaryMap[row.product_id].total_out += parseInt(row.qty);
        }
        const summary = Object.values(summaryMap).map(s => ({
            ...s,
            in_hand: s.total_in - s.total_out,
        }));

        return res.status(200).json({ success: true, summary, data: result.rows });

    } catch (error) {
        console.error('❌ Ledger History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ADMIN ADJUSTMENT
// POST /api/ledger/adjust
// ============================================================
const adjustStock = async (req, res) => {
    try {
        const { worker_id, product_id, product_name, qty, direction, note } = req.body;

        if (!worker_id || !product_id || !qty || !direction) {
            return res.status(400).json({ success: false, message: 'সব তথ্য দিন।' });
        }

        await addLedgerEntry(null, {
            worker_id,                    // UUID string
            product_id:    parseInt(product_id),
            product_name,
            txn_type:      'adjustment',
            direction:     parseInt(direction),
            qty:           Math.abs(parseInt(qty)),
            reference_type: 'manual',
            note:          note || 'Admin সংশোধন',
            created_by:    req.user.id,   // UUID
        });

        return res.status(200).json({ success: true, message: 'স্টক সংশোধন হয়েছে।' });

    } catch (error) {
        console.error('❌ Adjust Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'সংশোধনে সমস্যা হয়েছে।' });
    }
};

module.exports = { addLedgerEntry, getMyStock, getLedgerHistory, adjustStock };
