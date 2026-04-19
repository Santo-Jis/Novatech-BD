const { query, withTransaction } = require('../config/db');
const axios = require('axios');
const { sendOrderNotificationEmail } = require('../services/email.service');

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

        // আজকে কতটি অর্ডার আছে (সর্বোচ্চ ৩টি)
        const today    = new Date().toISOString().split('T')[0];
        const existing = await query(
            `SELECT COUNT(*) AS count FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
               AND status != 'rejected'`,
            [workerId, today]
        );

        const todayCount = parseInt(existing.rows[0].count);
        if (todayCount >= 3) {
            return res.status(400).json({
                success: false,
                message: 'আজকে ইতোমধ্যে ৩টি অর্ডার দেওয়া হয়েছে। আর অর্ডার দেওয়া যাবে না।'
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
            const availableStock = p.stock - (p.reserved_stock || 0);
            const itemQty = item.qty || item.requested_qty || 0;

            if (itemQty > availableStock) {
                return res.status(400).json({
                    success: false,
                    message: `${p.name} এর পর্যাপ্ত স্টক নেই। পাওয়া যাচ্ছে: ${availableStock}`
                });
            }

            // frontend থেকে আসা final price (discount/VAT/tax সহ), না থাকলে DB price
            const finalPrice = Number(item.price) || Number(p.price) || 0;

            orderItems.push({
                product_id:   p.id,
                product_name: p.name,
                requested_qty: itemQty,
                approved_qty:  itemQty,
                price:         finalPrice
            });

            totalAmount += finalPrice * itemQty;
        }

        // Transaction এর মধ্যে সব করো - যেকোনো error হলে rollback
        let orderId;
        await withTransaction(async (client) => {
            // অর্ডার সেভ
            const result = await client.query(
                `INSERT INTO orders (worker_id, items, total_amount, note)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [workerId, JSON.stringify(orderItems), totalAmount, note || null]
            );

            orderId = result.rows[0].id;

            // পণ্য রিজার্ভ করো
            for (const item of orderItems) {
                await client.query(
                    `UPDATE products
                     SET reserved_stock = COALESCE(reserved_stock, 0) + $1, updated_at = NOW()
                     WHERE id = $2`,
                    [item.requested_qty, item.product_id]
                );
            }
        });

        // Manager কে Firebase নোটিফিকেশন (transaction এর বাইরে)
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

        // ============================================================
        // Admin ও Manager কে Email নোটিফিকেশন
        // ============================================================
        try {
            const adminResult = await query(
                `SELECT email, name_bn FROM users
                 WHERE role = 'admin' AND status = 'active'
                   AND email IS NOT NULL AND email != ''`
            );

            let managerName  = null;
            let managerEmail = null;
            if (req.user.manager_id) {
                const managerResult = await query(
                    `SELECT email, name_bn FROM users
                     WHERE id = $1 AND email IS NOT NULL AND email != ''`,
                    [req.user.manager_id]
                );
                if (managerResult.rows.length > 0) {
                    managerEmail = managerResult.rows[0].email;
                    managerName  = managerResult.rows[0].name_bn;
                }
            }

            const adminEmails = adminResult.rows.map(r => r.email);
            const allEmails   = [...new Set([...adminEmails, ...(managerEmail ? [managerEmail] : [])])];

            if (allEmails.length > 0) {
                await sendOrderNotificationEmail(allEmails, {
                    orderId,
                    workerName:  req.user.name_bn || req.user.name,
                    workerCode:  req.user.employee_code || 'N/A',
                    workerPhone: req.user.phone || null,
                    managerName,
                    items:       orderItems,
                    totalAmount,
                    note:        note || null,
                    requestedAt: new Date().toISOString()
                });
                console.log(`📧 Order Email → ${allEmails.join(', ')}`);
            } else {
                console.log('⚠️ কোনো Admin/Manager এর email পাওয়া যায়নি।');
            }
        } catch (emailErr) {
            console.error('⚠️ Order Email Error:', emailErr.message);
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

        // আজকের সব অর্ডার আনো (rejected বাদে)
        const result = await query(
            `SELECT * FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
             ORDER BY requested_at DESC`,
            [req.user.id, today]
        );

        // rejected বাদে কতটি অর্ডার দেওয়া হয়েছে
        const countResult = await query(
            `SELECT COUNT(*) AS count FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
               AND status != 'rejected'`,
            [req.user.id, today]
        );

        const usedCount     = parseInt(countResult.rows[0].count);
        const remainingSlots = Math.max(0, 3 - usedCount);

        return res.status(200).json({
            success: true,
            // সর্বশেষ অর্ডার (backward compatibility)
            data: result.rows[0] || null,
            // সব অর্ডার
            all_orders:      result.rows,
            used_count:      usedCount,
            remaining_slots: remainingSlots,
            can_order_again: remainingSlots > 0
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
        const { items, note }  = req.body;

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

        // items কলাম TEXT হলে parse করো, JSONB হলে already object
        let originalItems = order.rows[0].items;
        if (typeof originalItems === 'string') {
            try { originalItems = JSON.parse(originalItems); } catch { originalItems = []; }
        }
        if (!Array.isArray(originalItems)) originalItems = [];

        // Manager এর approved items অথবা original
        let approvedItems = items || originalItems;
        if (typeof approvedItems === 'string') {
            try { approvedItems = JSON.parse(approvedItems); } catch { approvedItems = originalItems; }
        }
        if (!Array.isArray(approvedItems)) approvedItems = originalItems;

        let totalAmount = 0;

        // প্রতিটি item এ price ও qty নিশ্চিত করো
        const safeItems = approvedItems.map(item => {
            const original    = originalItems.find(o => o.product_id === item.product_id);
            const approvedQty = Math.max(0, parseInt(item.approved_qty)  >= 0 ? parseInt(item.approved_qty)  :
                                            parseInt(item.requested_qty) >= 0 ? parseInt(item.requested_qty) :
                                            parseInt(original?.approved_qty)  >= 0 ? parseInt(original?.approved_qty) :
                                            parseInt(original?.requested_qty) >= 0 ? parseInt(original?.requested_qty) : 0);
            const itemPrice   = parseFloat(item.price) > 0 ? parseFloat(item.price) :
                                parseFloat(original?.price) > 0 ? parseFloat(original?.price) : 0;

            totalAmount += itemPrice * approvedQty;

            return {
                ...item,
                approved_qty: approvedQty,
                requested_qty: parseInt(original?.requested_qty) || approvedQty,
                price: itemPrice
            };
        });

        // NaN guard - DB তে NaN পাঠানো যাবে না
        if (isNaN(totalAmount) || !isFinite(totalAmount)) {
            console.error('⚠️ totalAmount is NaN/Infinity, items:', JSON.stringify(safeItems));
            totalAmount = 0;
        }
        totalAmount = Math.round(totalAmount * 100) / 100; // 2 decimal

        console.log(`✅ Approve Order ${id}: totalAmount=${totalAmount}, items=${safeItems.length}`);

        await withTransaction(async (client) => {
            // reserved_stock আপডেট
            for (const item of safeItems) {
                const original    = originalItems.find(o => o.product_id === item.product_id);
                const origQty     = parseInt(original?.requested_qty) || parseInt(original?.approved_qty) || 0;
                const diff        = origQty - item.approved_qty;

                if (diff !== 0) {
                    await client.query(
                        `UPDATE products
                         SET reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - $1), updated_at = NOW()
                         WHERE id = $2`,
                        [diff, item.product_id]
                    );
                }
            }

            // অর্ডার আপডেট
            await client.query(
                `UPDATE orders
                 SET status       = 'approved',
                     manager_id   = $1,
                     items        = $2,
                     total_amount = $3,
                     approved_at  = NOW(),
                     updated_at   = NOW()
                 WHERE id = $4`,
                [req.user.id, JSON.stringify(safeItems), totalAmount, id]
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
