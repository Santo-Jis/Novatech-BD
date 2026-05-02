const { query, withTransaction } = require('../config/db');

// ============================================================
// SR STOCK LEDGER — সহায়ক ফাংশন
// অন্য controller থেকে import করে ব্যবহার হবে
// ============================================================

/**
 * Ledger-এ এন্ট্রি করো
 * @param {object} client  - DB transaction client (বা null হলে সরাসরি query)
 * @param {object} entry
 *   worker_id, product_id, product_name,
 *   txn_type   : 'order_in' | 'sale_out' | 'return_out' | 'adjustment'
 *   direction  : +1 (IN) | -1 (OUT)
 *   qty        : সবসময় positive
 *   reference_id, reference_type, note, created_by
 */
const addLedgerEntry = async (clientOrNull, entry) => {
    const sql = `
        INSERT INTO sr_stock_ledger
          (worker_id, product_id, product_name,
           txn_type, direction, qty,
           reference_id, reference_type, note, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `;
    const params = [
        entry.worker_id,
        entry.product_id,
        entry.product_name || null,
        entry.txn_type,
        entry.direction,
        Math.abs(entry.qty),
        entry.reference_id  || null,
        entry.reference_type || null,
        entry.note          || null,
        entry.created_by    || null,
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
        const workerId = req.user.id;

        const result = await query(
            `SELECT
                product_id,
                product_name,
                SUM(qty * direction)            AS in_hand_qty,
                SUM(CASE WHEN direction =  1 THEN qty ELSE 0 END) AS total_in,
                SUM(CASE WHEN direction = -1 THEN qty ELSE 0 END) AS total_out
             FROM sr_stock_ledger
             WHERE worker_id = $1
             GROUP BY product_id, product_name
             HAVING SUM(qty * direction) > 0
             ORDER BY product_name`,
            [workerId]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Get My Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET LEDGER HISTORY — পণ্যের ইতিহাস
// GET /api/ledger/history?worker_id=X&from=2026-01-01&to=2026-05-01&product_id=Y
// Manager/Admin যেকোনো SR এর দেখতে পারবে
// ============================================================
const getLedgerHistory = async (req, res) => {
    try {
        const { worker_id, from, to, product_id } = req.query;

        // Manager শুধু নিজের টিমের SR দেখতে পারবে
        let targetWorkerId = worker_id;
        if (req.user.role === 'worker') {
            targetWorkerId = req.user.id; // নিজেরটা নিজে দেখবে
        }

        const conditions = ['l.worker_id = $1'];
        const params     = [targetWorkerId];
        let   p          = 1;

        if (from) {
            p++;
            conditions.push(`DATE(l.created_at) >= $${p}`);
            params.push(from);
        }
        if (to) {
            p++;
            conditions.push(`DATE(l.created_at) <= $${p}`);
            params.push(to);
        }
        if (product_id) {
            p++;
            conditions.push(`l.product_id = $${p}`);
            params.push(product_id);
        }

        const result = await query(
            `SELECT
                l.id,
                l.created_at,
                l.product_id,
                l.product_name,
                l.txn_type,
                l.direction,
                l.qty,
                l.qty * l.direction          AS net_qty,  -- + হলে IN, - হলে OUT
                l.reference_id,
                l.reference_type,
                l.note,
                u.name_bn                    AS done_by,  -- কে করেছে
                w.name_bn                    AS worker_name
             FROM sr_stock_ledger l
             LEFT JOIN users u ON l.created_by = u.id
             LEFT JOIN users w ON l.worker_id  = w.id
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
            if (row.direction === 1)  summaryMap[row.product_id].total_in  += parseInt(row.qty);
            if (row.direction === -1) summaryMap[row.product_id].total_out += parseInt(row.qty);
        }
        const summary = Object.values(summaryMap).map(s => ({
            ...s,
            in_hand: s.total_in - s.total_out,
        }));

        return res.status(200).json({
            success: true,
            summary,
            data: result.rows,
        });

    } catch (error) {
        console.error('❌ Ledger History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ADMIN ADJUSTMENT — ম্যানুয়াল সংশোধন
// POST /api/ledger/adjust
// ============================================================
const adjustStock = async (req, res) => {
    try {
        const { worker_id, product_id, product_name, qty, direction, note } = req.body;

        if (!worker_id || !product_id || !qty || !direction) {
            return res.status(400).json({ success: false, message: 'সব তথ্য দিন।' });
        }
        if (![1, -1].includes(parseInt(direction))) {
            return res.status(400).json({ success: false, message: 'Direction +1 বা -1 হবে।' });
        }

        await addLedgerEntry(null, {
            worker_id,
            product_id,
            product_name,
            txn_type:      'adjustment',
            direction:     parseInt(direction),
            qty:           Math.abs(parseInt(qty)),
            reference_type: 'manual',
            note:          note || 'Admin সংশোধন',
            created_by:    req.user.id,
        });

        return res.status(200).json({ success: true, message: 'স্টক সংশোধন হয়েছে।' });

    } catch (error) {
        console.error('❌ Adjust Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'সংশোধনে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    addLedgerEntry,
    getMyStock,
    getLedgerHistory,
    adjustStock,
};
