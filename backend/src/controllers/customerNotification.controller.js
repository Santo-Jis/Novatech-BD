// backend/src/controllers/customerNotification.controller.js
// ============================================================
// কাস্টমার In-App Notification System
// Facebook-এর মতো — Bell icon + Dashboard Banner
// ============================================================

const { query } = require('../config/db');
const { sendCustomerPush } = require('../services/fcm.service');
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// ── Email Transporter (Brevo SMTP) ──────────────────────────
// FCM push fail হলে বা FCM token না থাকলে email fallback
const emailEnabled = process.env.EMAIL_ENABLED === 'true';
const transporter  = emailEnabled ? nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
}) : null;

// notification type → emoji map (email subject-এ ব্যবহার)
const TYPE_EMOJI = {
    payment_received:     '💳',
    new_invoice:          '🧾',
    order_request:        '📦',
    credit_reminder:      '⚠️',
    general:              '🔔',
};

/**
 * sendFallbackEmail — FCM fail হলে বা token না থাকলে email পাঠাও
 * কাস্টমারের email না থাকলে silently skip করো
 */
const sendFallbackEmail = async (customerId, { title, body, type }) => {
    if (!emailEnabled || !transporter) return;
    try {
        const { rows } = await query(
            `SELECT email, owner_name, shop_name FROM customers WHERE id = $1 AND email IS NOT NULL AND email != ''`,
            [customerId]
        );
        if (!rows.length) return; // email নেই — skip

        const emoji   = TYPE_EMOJI[type] || '🔔';
        const toName  = rows[0].owner_name || rows[0].shop_name || 'কাস্টমার';

        await transporter.sendMail({
            from:    process.env.EMAIL_FROM,
            to:      rows[0].email,
            subject: `${emoji} ${title}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
                    <div style="background:linear-gradient(135deg,#6366f1,#7c3aed);padding:20px 24px">
                        <h2 style="color:#fff;margin:0;font-size:18px">${emoji} ${title}</h2>
                    </div>
                    <div style="padding:20px 24px;background:#fff">
                        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
                            প্রিয় ${toName},
                        </p>
                        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">
                            ${body}
                        </p>
                        <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px">
                            <p style="color:#6b7280;font-size:12px;margin:0">
                                NovaTech BD • স্বয়ংক্রিয় বার্তা — উত্তর দেওয়ার দরকার নেই
                            </p>
                        </div>
                    </div>
                </div>
            `,
        });
        logger.info(`📧 Email fallback sent → ${rows[0].email} (type: ${type})`);
    } catch (e) {
        logger.error('[EmailFallback] Error:', e.message);
    }
};

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
// GET /api/portal/notifications?page=1&limit=20
// কাস্টমারের notification — Cursor-based Pagination সহ
//
// Query Params:
//   page  — page নম্বর (default: 1, minimum: 1)
//   limit — প্রতি পাতায় কতটি (default: 20, max: 50)
//
// Response:
//   notifications  — এই পাতার notification গুলো
//   unread_count   — মোট অপঠিত (শুধু DB COUNT — array filter নয়)
//   pagination     — { page, limit, total, total_pages, has_next, has_prev }
// ============================================================
const getNotifications = async (req, res) => {
    try {
        const customerId = getCustomerId(req);

        // Pagination params — parse ও sanitize
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        // মোট notification count ও unread count — একটি query-তে
        const countRes = await query(`
            SELECT
                COUNT(*)                                    AS total,
                COUNT(*) FILTER (WHERE is_read = false)    AS unread
            FROM customer_notifications
            WHERE customer_id = $1
        `, [customerId]);

        const total       = parseInt(countRes.rows[0].total);
        const unreadCount = parseInt(countRes.rows[0].unread);
        const totalPages  = Math.ceil(total / limit);

        // Paginated notification list
        const { rows } = await query(`
            SELECT id, title, body, type, is_read, created_at
            FROM customer_notifications
            WHERE customer_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [customerId, limit, offset]);

        return res.json({
            success: true,
            data: {
                notifications: rows,
                unread_count:  unreadCount,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next:    page < totalPages,
                    has_prev:    page > 1,
                },
            },
        });

    } catch (error) {
        logger.error('❌ getNotifications Error:', error.message);
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
        logger.error('❌ markAllRead Error:', error.message);
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
        logger.error('❌ markOneRead Error:', error.message);
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
        logger.error('❌ saveCustomerFCMToken Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};


// ============================================================
// UPDATED sendCustomerNotification
// In-App DB insert + Web Push (যদি fcm_token থাকে)
// ============================================================
const sendCustomerNotificationFull = async (customerId, { title, body, type = 'general' }) => {
    try {
        // ১. In-App notification (সবসময়)
        await query(`
            INSERT INTO customer_notifications (customer_id, title, body, type)
            VALUES ($1, $2, $3, $4)
        `, [customerId, title, body, type]);

        // ২. Web Push চেষ্টা করো
        const { rows } = await query(
            `SELECT fcm_token, email FROM customers WHERE id = $1`,
            [customerId]
        );

        const customer    = rows[0] || {};
        let   pushSuccess = false;

        if (customer.fcm_token) {
            try {
                await sendCustomerPush(customer.fcm_token, { title, body, type });
                pushSuccess = true;
            } catch (pushErr) {
                logger.warn(`[CustomerNotification] FCM failed (type: ${type}):`, pushErr.message);
            }
        }

        // ৩. FCM fail বা token না থাকলে Email fallback
        if (!pushSuccess) {
            await sendFallbackEmail(customerId, { title, body, type });
        }

    } catch (e) {
        logger.error('[CustomerNotification] Error:', e.message);
    }
};

module.exports = {
    getNotifications,
    markAllRead,
    markOneRead,
    saveCustomerFCMToken,
    sendCustomerNotification: sendCustomerNotificationFull,
};
