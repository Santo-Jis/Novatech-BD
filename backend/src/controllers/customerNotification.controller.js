// backend/src/controllers/customerNotification.controller.js
// ============================================================
// কাস্টমার In-App Notification System
// Facebook-এর মতো — Bell icon + Dashboard Banner
// ============================================================

const { query } = require('../config/db');
const logger = require('../config/logger');
const { dispatch } = require('../services/notification.service');

// ✅ REFACTOR (Notification Platform Phase 1): এই ফাইলে আগে (Phase 0-এ)
// TYPE_EMOJI, TYPE_TO_PREF_CATEGORY, sendFallbackEmail, getChannelAllowance,
// আর sendCustomerNotificationFull-এর পুরো sending logic ছিল। এখন সবই
// services/notification.service.js-এ centralize করা হয়েছে (dispatch() +
// processNotificationEvent()) — এই ফাইল এখন শুধু HTTP-facing read
// endpoint (getNotifications/markRead) রাখে, plus sendCustomerNotification-এর
// একটা thin wrapper (নিচে, একই exported নাম/signature — যে ৯টা ফাইল এটা
// import করে তাদের একটাও বদলাতে হয়নি)।

// ============================================================
// DB Table: customer_notifications
// ✅ FIX (Phase 0): এই comment-এ লেখা স্কিমা বাস্তবে যা INSERT হয় তার
// সাথে মিলছিল না (tenant_id কলাম বাদ ছিল, অথচ এই ফাইলেই নিচে tenant_id
// সহ INSERT হয়) — আর কোনো migration file-ও repo-তে ছিল না। এখন দুটোই
// ঠিক করা হলো: আসল schema দেখুন repo root-এর
// migration_notification_delivery_logs.sql-এ (email_logs, sms_logs-ও
// একসাথে আছে, একই কারণে migration-hীন ছিল)।
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
// sendCustomerNotification — Notification Platform Phase 1
//
// আগে (Phase 0) এই ফাংশনেই সরাসরি in-app insert + push + email-fallback
// সব লজিক ছিল। এখন এটা শুধু services/notification.service.js-এর
// dispatch()-কে কল করে — আসল কাজ (recipient resolve, preference check,
// channel attempt, delivery log, queue-or-sync) ওখানে centralize করা।
//
// Signature অপরিবর্তিত: sendCustomerNotification(customerId, {title, body, type})
// — এই ৯টা ফাইল এটা import করে, একটাও বদলাতে হয়নি (grep করে verify করা):
// notification.controller.js, sales.controller.js, customer.controller.js,
// customerPortal.controller.js, creditReminder.controller.js,
// customerRequests.controller.js, connection.controller.js (কমেন্টে),
// jobs/notificationSchedule.job.js, jobs/creditReminder.job.js।
// ============================================================
const sendCustomerNotification = async (customerId, { title, body, type = 'general' }) => {
    try {
        await dispatch({
            eventType: type,
            recipientType: 'customer',
            recipientId: customerId,
            data: { title, body },
        });
    } catch (e) {
        // fire-and-forget কনভেনশন বজায় রাখা হলো — কোনো caller-ই এই
        // ফাংশনের ব্যর্থতায় মূল request fail করাতে চায় না।
        logger.error('[CustomerNotification] sendCustomerNotification ব্যর্থ:', e.message);
    }
};

module.exports = {
    getNotifications,
    markAllRead,
    markOneRead,
    saveCustomerFCMToken,
    sendCustomerNotification,
};
