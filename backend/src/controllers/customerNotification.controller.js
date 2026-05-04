// backend/src/controllers/customerNotification.controller.js
// ============================================================
// কাস্টমার In-App Notification System
// Facebook-এর মতো — Bell icon + Dashboard Banner
// ============================================================

const { query } = require('../config/db');
const { sendCustomerPush } = require('../services/fcm.service');

// ============================================================
// DB Table (Supabase এ একবার run করুন):
//
// CREATE TABLE IF NOT EXISTS customer_notifications (
//     id          BIGSERIAL PRIMARY KEY,
//     customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
//     title       TEXT NOT NULL,
//     body        TEXT NOT NULL,
//     type        VARCHAR(50) DEFAULT 'general',
//     is_read     BOOLEAN DEFAULT false,
//     created_at  TIMESTAMP DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_cnotif_customer ON customer_notifications(customer_id, created_at DESC);
// ============================================================

// ── Helper: customer_id নাও JWT থেকে ────────────────────────
const getCustomerId = (req) => req.portalUser?.customer_id;

// ============================================================
// GET /api/portal/notifications
// কাস্টমারের সব notification (শেষ ৩০টি)
// ============================================================
const getNotifications = async (req, res) => {
    try {
        const customerId = getCustomerId(req);

        const { rows } = await query(`
            SELECT id, title, body, type, is_read, created_at
            FROM customer_notifications
            WHERE customer_id = $1
            ORDER BY created_at DESC
            LIMIT 30
        `, [customerId]);

        // অপঠিত সংখ্যা
        const unread = rows.filter(n => !n.is_read).length;

        return res.json({ success: true, data: { notifications: rows, unread_count: unread } });

    } catch (error) {
        console.error('❌ getNotifications Error:', error.message);
        return res.status(500).json({ success: false, message: 'Notification আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/portal/notifications/read-all
// সব notification পঠিত হিসেবে mark করো
// ============================================================
const markAllRead = async (req, res) => {
    try {
        const customerId = getCustomerId(req);

        await query(`
            UPDATE customer_notifications
            SET is_read = true
            WHERE customer_id = $1 AND is_read = false
        `, [customerId]);

        return res.json({ success: true, message: 'সব notification পঠিত হিসেবে চিহ্নিত হয়েছে।' });

    } catch (error) {
        console.error('❌ markAllRead Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/portal/notifications/:id/read
// একটি notification পঠিত করো
// ============================================================
const markOneRead = async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const { id } = req.params;

        await query(`
            UPDATE customer_notifications
            SET is_read = true
            WHERE id = $1 AND customer_id = $2
        `, [id, customerId]);

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ markOneRead Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

const saveCustomerFCMToken = async (req, res) => {
    try {
        const customerId = getCustomerId(req);
        const { fcm_token } = req.body;

        if (!fcm_token) {
            return res.status(400).json({ success: false, message: 'FCM token দেওয়া হয়নি।' });
        }

        await query(`
            UPDATE customers
            SET fcm_token = $1, fcm_token_updated_at = NOW()
            WHERE id = $2
        `, [fcm_token, customerId]);

        return res.json({ success: true, message: 'FCM token সেভ হয়েছে।' });

    } catch (error) {
        console.error('❌ saveCustomerFCMToken Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};


// ============================================================
// UPDATED sendCustomerNotification
// In-App DB insert + Web Push (যদি fcm_token থাকে)
// ============================================================
const sendCustomerNotificationFull = async (customerId, { title, body, type = 'general' }) => {
    try {
        // In-App notification
        await query(`
            INSERT INTO customer_notifications (customer_id, title, body, type)
            VALUES ($1, $2, $3, $4)
        `, [customerId, title, body, type]);

        // Web Push — customer এর FCM token আছে কিনা দেখো
        const { rows } = await query(
            `SELECT fcm_token FROM customers WHERE id = $1 AND fcm_token IS NOT NULL`,
            [customerId]
        );
        if (rows.length && rows[0].fcm_token) {
            await sendCustomerPush(rows[0].fcm_token, { title, body, type });
        }
    } catch (e) {
        console.error('[CustomerNotification] Error:', e.message);
    }
};

module.exports = {
    getNotifications,
    markAllRead,
    markOneRead,
    saveCustomerFCMToken,
    sendCustomerNotification: sendCustomerNotificationFull,
};
