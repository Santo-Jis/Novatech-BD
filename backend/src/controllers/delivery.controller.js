const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { sendPushNotification, sendPushToMany } = require('../services/fcm.service');
const { firebaseNotify } = require('../services/firebase.notify');

// ============================================================
// GET /api/deliveries — সব deliveries (Manager/Admin)
// ============================================================

const getAllDeliveries = async (req, res) => {
    try {
        const { status, date } = req.query;
        const managerId = req.user.id;
        const role      = req.user.role;

        let sql = `
            SELECT d.*,
                   c.shop_name, c.owner_name,
                   u.name_bn AS assigned_to_name, u.phone AS assigned_to_phone,
                   ab.name_bn AS assigned_by_name
            FROM deliveries d
            JOIN customers c ON c.id = d.customer_id
            JOIN users u     ON u.id = d.assigned_to
            LEFT JOIN users ab ON ab.id = d.assigned_by
            WHERE 1=1
        `;
        const params = [];
        let idx = 1;

        if (role === 'manager') {
            sql += ` AND u.manager_id = $${idx++}`;
            params.push(managerId);
        }
        if (status) { sql += ` AND d.status = $${idx++}`; params.push(status); }
        if (date)   { sql += ` AND DATE(d.created_at) = $${idx++}`; params.push(date); }
        sql += ` ORDER BY d.created_at DESC LIMIT 100`;

        const result = await query(sql, params);
        return res.json({ success: true, data: result.rows });

    } catch (err) {
        logger.error('[Delivery] getAllDeliveries error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/deliveries/assign — Delivery assign (Manager/Admin)
// ============================================================

const assignDelivery = async (req, res) => {
    try {
        const assignedBy = req.user.id;
        const { order_id, customer_id, assigned_to, items, notes, total_amount } = req.body;

        if (!customer_id || !assigned_to) {
            return res.status(400).json({ success: false, message: 'customer ও delivery person দিন।' });
        }

        const result = await query(
            `INSERT INTO deliveries (order_id, customer_id, assigned_to, assigned_by, items, total_amount, notes, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7, $8) RETURNING *`,
            [order_id || null, customer_id, assigned_to, assignedBy,
             JSON.stringify(items || []), total_amount || 0, notes || null, req.tenantId]
        );

        const delivery = result.rows[0];

        // Delivery person-কে notify করো
        await sendPushNotification(assigned_to, {
            title: '📦 নতুন ডেলিভারি টাস্ক',
            body : 'আপনাকে একটি ডেলিভারি assign করা হয়েছে।',
            type : 'delivery',
        });
        await firebaseNotify(assigned_to, {
            title: '📦 নতুন ডেলিভারি টাস্ক',
            body : 'আপনাকে একটি ডেলিভারি assign করা হয়েছে।',
            type : 'delivery',
        });

        return res.status(201).json({ success: true, data: delivery, message: 'Delivery assign হয়েছে।' });

    } catch (err) {
        logger.error('[Delivery] assignDelivery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/deliveries/my-tasks — Delivery person-এর tasks
// ============================================================

const getMyTasks = async (req, res) => {
    try {
        const workerId = req.user.id;
        const result   = await query(
            `SELECT d.*,
                    c.shop_name, c.owner_name,
                    ST_X(c.location::geometry) AS lng,
                    ST_Y(c.location::geometry) AS lat
             FROM deliveries d
             JOIN customers c ON c.id = d.customer_id
             WHERE d.assigned_to = $1
               AND d.status NOT IN ('delivered','failed')
             AND d.tenant_id = $2
             ORDER BY d.created_at DESC`,
            [workerId,
                req.tenantId]
        );
        return res.json({ success: true, data: result.rows });

    } catch (err) {
        logger.error('[Delivery] getMyTasks error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/deliveries/:id/start — Delivery শুরু
// ============================================================

const startDelivery = async (req, res) => {
    try {
        const { id }   = req.params;
        const workerId = req.user.id;

        const result = await query(
            `UPDATE deliveries SET status='in_transit', started_at=NOW()
             WHERE id=$1 AND assigned_to=$2 AND status='pending'
             RETURNING *`,
            [id, workerId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Delivery পাওয়া যায়নি।' });
        }

        return res.json({ success: true, data: result.rows[0], message: 'ডেলিভারি শুরু হয়েছে।' });

    } catch (err) {
        logger.error('[Delivery] startDelivery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/deliveries/:id/arrive — দোকানে পৌঁছলাম (GPS + Photo)
// ============================================================

const arriveDelivery = async (req, res) => {
    try {
        const { id }                      = req.params;
        const workerId                    = req.user.id;
        const { latitude, longitude, photo_url } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'GPS location দিন।' });
        }

        // OTP তৈরি করো (optional confirmation)
        const otp        = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60000); // ১০ মিনিট

        const result = await query(
            `UPDATE deliveries
             SET status='arrived', arrived_at=NOW(),
                 delivery_location=ST_SetSRID(ST_MakePoint($3,$4),4326),
                 delivery_photo=$5,
                 confirm_otp=$6, confirm_otp_expires=$7
             WHERE id=$1 AND assigned_to=$2 AND status='in_transit'
             RETURNING *`,
            [id, workerId, longitude, latitude, photo_url || null, otp, otpExpires]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Delivery পাওয়া যায়নি।' });
        }

        return res.json({ success: true, data: result.rows[0], otp, message: 'দোকানে পৌঁছানো confirmed।' });

    } catch (err) {
        logger.error('[Delivery] arriveDelivery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/deliveries/:id/complete — Delivery সম্পন্ন
// ============================================================

const completeDelivery = async (req, res) => {
    try {
        const { id }     = req.params;
        const workerId   = req.user.id;
        const { customer_otp, photo_url } = req.body;

        // Delivery আনো
        const delRes = await query(`SELECT * FROM deliveries WHERE id=$1 AND assigned_to=$2`, [id, workerId]);
        if (!delRes.rows.length) {
            return res.status(404).json({ success: false, message: 'পাওয়া যায়নি।' });
        }

        const delivery = delRes.rows[0];

        // OTP verify (যদি থাকে)
        if (delivery.confirm_otp && customer_otp) {
            if (delivery.confirm_otp !== customer_otp) {
                return res.status(400).json({ success: false, message: 'OTP ভুল।' });
            }
            if (new Date() > new Date(delivery.confirm_otp_expires)) {
                return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ।' });
            }
        }

        await withTransaction(async (client) => {
            // delivery complete করো
            await client.query(
                `UPDATE deliveries
                 SET status='delivered', delivered_at=NOW(),
                     customer_confirmed=true,
                     delivery_photo=COALESCE($2, delivery_photo)
                 WHERE id=$1`,
                [id, photo_url || null]
            );
        });

        // Manager-কে notify
        const managerRes = await query(`SELECT manager_id FROM users WHERE id=$1`, [workerId]);
        if (managerRes.rows[0]?.manager_id) {
            await sendPushNotification(managerRes.rows[0].manager_id, {
                title: '✅ ডেলিভারি সম্পন্ন',
                body : `${delivery.customer_id} দোকানে ডেলিভারি সফলভাবে হয়েছে।`,
                type : 'delivery_complete',
            });
        }

        return res.json({ success: true, message: 'ডেলিভারি সম্পন্ন হয়েছে। ✅' });

    } catch (err) {
        logger.error('[Delivery] completeDelivery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/deliveries/:id/fail — Delivery ব্যর্থ
// ============================================================

const failDelivery = async (req, res) => {
    try {
        const { id }     = req.params;
        const workerId   = req.user.id;
        const { reason, reschedule_date } = req.body;

        const result = await query(
            `UPDATE deliveries
             SET status='failed', failure_reason=$2, reschedule_date=$3
             WHERE id=$1 AND assigned_to=$4
             RETURNING *`,
            [id, reason || null, reschedule_date || null, workerId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'পাওয়া যায়নি।' });
        }

        return res.json({ success: true, data: result.rows[0], message: 'Delivery failed হিসেবে mark হয়েছে।' });

    } catch (err) {
        logger.error('[Delivery] failDelivery error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/deliveries/customer/:customer_id — Customer-এর deliveries
// ============================================================

const getCustomerDeliveries = async (req, res) => {
    try {
        const { customer_id } = req.params;
        const result = await query(
            `SELECT d.id, d.status, d.items, d.total_amount,
                    d.started_at, d.arrived_at, d.delivered_at,
                    u.name_bn AS delivery_person
             FROM deliveries d
             LEFT JOIN users u ON u.id = d.assigned_to
             WHERE d.customer_id = $1
             ORDER BY d.created_at DESC
             LIMIT 10`,
            [customer_id]
        );
        return res.json({ success: true, data: result.rows });

    } catch (err) {
        logger.error('[Delivery] getCustomerDeliveries error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getAllDeliveries, assignDelivery, getMyTasks,
    startDelivery, arriveDelivery, completeDelivery,
    failDelivery, getCustomerDeliveries,
};
