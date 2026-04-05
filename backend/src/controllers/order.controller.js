const { query, withTransaction } = require('../config/db');
const axios = require('axios');

// ============================================================
// Firebase নোটিফিকেশন Helper
// ============================================================

const firebaseNotify = async (path, data) => {
    try {
        const firebaseUrl = process.env.FIREBASE_DATABASE_URL;
        if (!firebaseUrl) return;
        await axios.post(`${firebaseUrl}/${path}.json`, {
            ...data,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('⚠️ Firebase Notify Error:', err.message);
    }
};

// ============================================================
// CREATE ORDER
// POST /api/orders
// SR সকালে পণ্য নেওয়ার আবেদন
// ============================================================

const createOrder = async (req, res) => {
    try {
        const { items, note } = req.body;
        const workerId        = req.user.id;

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কমপক্ষে একটি পণ্য সিলেক্ট করুন।'
            });
        }

        // আজকে আগে অর্ডার আছে কিনা
        const today    = new Date().toISOString().split('T')[0];
        const existing = await query(
            `SELECT id FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
               AND status != 'rejected'`,
            [workerId, today]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'আজকে ইতোমধ্যে অর্ডার দেওয়া হয়েছে।'
            });
        }

        // পণ্যের দাম যাচাই ও মোট হিসাব
        let totalAmount  = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await query(
                'SELECT id, name, price, stock, reserved_stock FROM products WHERE id = $1 AND is_active = true',
                [item.product_id]
            );

            if (product.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `পণ্য পাওয়া যায়নি: ${item.product_id}`
                });
            }

            const p             = product.rows[0];
            const availableStock = p.stock - p.reserved_stock;

            if (item.qty > availableStock) {
                return res.status(400).json({
                    success: false,
                    message: `${p.name} এর পর্যাপ্ত স্টক নেই। পাওয়া যাচ্ছে: ${availableStock}`
                });
            }

            orderItems.push({
                product_id:   p.id,
                product_name: p.name,
                requested_qty: item.qty,
                approved_qty:  item.qty, // Manager পরিবর্তন করতে পারবে
                price:         p.price
            });

            totalAmount += p.price * item.qty;
        }

        // অর্ডার সেভ
        const result = await query(
            `INSERT INTO orders (worker_id, items, total_amount, note)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [workerId, JSON.stringify(orderItems), totalAmount, note || null]
        );

        const orderId = result.rows[0].id;

        // পণ্য রিজার্ভ করো
        for (const item of orderItems) {
            await query(
                `UPDATE products
                 SET reserved_stock = reserved_stock + $1, updated_at = NOW()
                 WHERE id = $2`,
                [item.requested_qty, item.product_id]
            );
        }

        // Manager কে Firebase নোটিফিকেশন
        if (req.user.manager_id) {
            await firebaseNotify(
                `notifications/${req.user.manager_id}/orders`,
                {
                    orderId,
                    workerName: req.user.name_bn,
                    totalAmount,
                    message:   `📦 ${req.user.name_bn} অর্ডার দিয়েছে। মোট: ৳${totalAmount}`
                }
            );
        }

        return res.status(201).json({
            success: true,
            message: 'অর্ডার পাঠানো হয়েছে। Manager এর অনুমোদনের অপেক্ষায়।',
            data: { order_id: orderId, total_amount: totalAmount }
        });

    } catch (error) {
        console.error('❌ Create Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'অর্ডার তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY ORDERS
// GET /api/orders/my
// ============================================================

const getMyOrders = async (req, res) => {
    try {
        const result = await query(
            `SELECT o.*, m.name_bn AS manager_name
             FROM orders o
             LEFT JOIN users m ON o.manager_id = m.id
             WHERE o.worker_id = $1
             ORDER BY o.requested_at DESC
             LIMIT 30`,
            [req.user.id]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ My Orders Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET TODAY ORDER
// GET /api/orders/today
// ============================================================

const getTodayOrder = async (req, res) => {
    try {
        const today  = new Date().toISOString().split('T')[0];
        const result = await query(
            `SELECT * FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
             ORDER BY requested_at DESC
             LIMIT 1`,
            [req.user.id, today]
        );

        return res.status(200).json({
            success: true,
            data: result.rows[0] || null
        });

    } catch (error) {
        console.error('❌ Today Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PENDING ORDERS
// GET /api/orders/pending
// ============================================================

const getPendingOrders = async (req, res) => {
    try {
        let conditions = ["o.status = 'pending'"];
        let params     = [];
        let paramCount = 0;

        // Manager শুধু নিজের টিমের অর্ডার
        if (req.user.role !== 'admin') {
            paramCount++;
            conditions.push(`w.manager_id = $${paramCount}`);
            params.push(req.user.id);
        }

        const result = await query(
            `SELECT o.*, w.name_bn AS worker_name, w.employee_code
             FROM orders o
             JOIN users w ON o.worker_id = w.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY o.requested_at ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Pending Orders Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPROVE ORDER
// PUT /api/orders/:id/approve
// Manager পরিমাণ কমাতে/বাড়াতে পারবে
// ============================================================

const approveOrder = async (req, res) => {
    try {
        const { id }           = req.params;
        const { items, note }  = req.body; // Manager approved items

        const order = await query(
            "SELECT * FROM orders WHERE id = $1 AND status = 'pending'",
            [id]
        );

        if (order.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'পেন্ডিং অর্ডার পাওয়া যায়নি।'
            });
        }

        const originalItems = order.rows[0].items;

        // Manager এর approved items (পরিমাণ পরিবর্তন)
        const approvedItems = items || originalItems;
        let totalAmount     = 0;

        await withTransaction(async (client) => {
            // রিজার্ভ আপডেট
            for (const item of approvedItems) {
                const original = originalItems.find(o => o.product_id === item.product_id);
                const diff     = (original?.requested_qty || 0) - (item.approved_qty || item.requested_qty);

                // রিজার্ভ ঠিক করো
                if (diff !== 0) {
                    await client.query(
                        `UPDATE products
                         SET reserved_stock = reserved_stock - $1, updated_at = NOW()
                         WHERE id = $2`,
                        [diff, item.product_id]
                    );
                }

                item.approved_qty = item.approved_qty || item.requested_qty;
                totalAmount += item.price * item.approved_qty;
            }

            // অর্ডার আপডেট
            await client.query(
                `UPDATE orders
                 SET status      = 'approved',
                     manager_id  = $1,
                     items       = $2,
                     total_amount = $3,
                     approved_at = NOW(),
                     updated_at  = NOW()
                 WHERE id = $4`,
                [req.user.id, JSON.stringify(approvedItems), totalAmount, id]
            );
        });

        // SR কে Firebase নোটিফিকেশন
        await firebaseNotify(
            `notifications/${order.rows[0].worker_id}/approvals`,
            {
                orderId:  id,
                status:   'approved',
                message: '✅ আপনার অর্ডার অনুমোদিত হয়েছে। মাল নিন এবং রুটে বের হন।'
            }
        );

        return res.status(200).json({
            success: true,
            message: 'অর্ডার অনুমোদন সফল।',
            data: { total_amount: totalAmount }
        });

    } catch (error) {
        console.error('❌ Approve Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REJECT ORDER
// PUT /api/orders/:id/reject
// ============================================================

const rejectOrder = async (req, res) => {
    try {
        const { id }     = req.params;
        const { reason } = req.body;

        const order = await query(
            "SELECT * FROM orders WHERE id = $1 AND status = 'pending'",
            [id]
        );

        if (order.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'অর্ডার পাওয়া যায়নি।' });
        }

        // রিজার্ভ মুক্ত করো
        for (const item of order.rows[0].items) {
            await query(
                `UPDATE products
                 SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = NOW()
                 WHERE id = $2`,
                [item.requested_qty, item.product_id]
            );
        }

        await query(
            `UPDATE orders
             SET status = 'rejected', reject_reason = $1,
                 manager_id = $2, updated_at = NOW()
             WHERE id = $3`,
            [reason || null, req.user.id, id]
        );

        // SR কে নোটিফিকেশন
        await firebaseNotify(
            `notifications/${order.rows[0].worker_id}/approvals`,
            {
                orderId: id,
                status:  'rejected',
                reason,
                message: `❌ আপনার অর্ডার বাতিল হয়েছে। কারণ: ${reason || 'উল্লেখ নেই'}`
            }
        );

        return res.status(200).json({ success: true, message: 'অর্ডার বাতিল করা হয়েছে।' });

    } catch (error) {
        console.error('❌ Reject Order Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিলে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createOrder,
    getMyOrders,
    getTodayOrder,
    getPendingOrders,
    approveOrder,
    rejectOrder
};
