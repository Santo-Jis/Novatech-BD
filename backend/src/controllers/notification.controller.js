// ============================================================
// Notification / Announcement Management Controller
// backend/src/controllers/notification.controller.js
//
// Admin/Manager থেকে staff (role/team/individual) বা customer
// (all/area) টার্গেট করে in-app + push notification পাঠানোর ইঞ্জিন।
//
// Delivery:
//   - Staff audience   → notifications টেবিলে lazy-read (নিজস্ব bell)
//                         + fcm.service.sendPushToMany()
//   - Customer audience → বিদ্যমান customer_notifications ইঞ্জিন reuse
//                         (customerNotification.controller.sendCustomerNotification)
//                         — তাই customer bell/push/email fallback আলাদা
//                         করে বানাতে হয়নি, existing infra ব্যবহার হচ্ছে।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('./customerNotification.controller');

const STAFF_TARGET_TYPES    = ['all_staff', 'role', 'team', 'individual'];
const CUSTOMER_TARGET_TYPES = ['all_customers', 'customer_area'];
const VALID_CATEGORIES      = ['general', 'policy', 'hr', 'attendance', 'order_sales', 'route_delivery'];

// ============================================================
// Internal: টার্গেট থেকে আসল staff user_id লিস্ট বের করা
// ============================================================
const resolveStaffRecipientIds = async (tenantId, targetType, targetValue, sender) => {
    if (targetType === 'all_staff') {
        const { rows } = await query(
            `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active'`,
            [tenantId]
        );
        return rows.map(r => r.id);
    }

    if (targetType === 'role') {
        const role = targetValue?.role;
        if (!role) return [];
        const { rows } = await query(
            `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' AND role = $2`,
            [tenantId, role]
        );
        return rows.map(r => r.id);
    }

    if (targetType === 'team') {
        // manager_id না দিলে, sender নিজে manager হলে নিজের টিম ধরে নাও
        const managerId = targetValue?.manager_id || (sender.role === 'manager' ? sender.id : null);
        if (!managerId) return [];
        const { rows } = await query(
            `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' AND manager_id = $2`,
            [tenantId, managerId]
        );
        return rows.map(r => r.id);
    }

    if (targetType === 'individual') {
        const userIds = Array.isArray(targetValue?.user_ids) ? targetValue.user_ids : [];
        if (!userIds.length) return [];
        const { rows } = await query(
            `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
            [tenantId, userIds]
        );
        return rows.map(r => r.id);
    }

    return [];
};

// ============================================================
// Internal: টার্গেট থেকে আসল customer_id লিস্ট বের করা
// ============================================================
const resolveCustomerRecipientIds = async (tenantId, targetType, targetValue) => {
    if (targetType === 'all_customers') {
        const { rows } = await query(
            `SELECT id FROM customers WHERE tenant_id = $1 AND is_active = true`,
            [tenantId]
        );
        return rows.map(r => r.id);
    }

    if (targetType === 'customer_area') {
        const routeIds = Array.isArray(targetValue?.route_ids) ? targetValue.route_ids : [];
        if (!routeIds.length) return [];
        const { rows } = await query(
            `SELECT id FROM customers WHERE tenant_id = $1 AND is_active = true AND route_id = ANY($2::uuid[])`,
            [tenantId, routeIds]
        );
        return rows.map(r => r.id);
    }

    return [];
};

// ============================================================
// staff bell-এর "আমি কোন কোন নোটিফিকেশনের আওতায় পড়ি" — WHERE clause
// (getMyNotifications ও markAllRead দুটোতেই ব্যবহার হয়)
// ============================================================
const buildStaffVisibilityClause = () => `
    n.tenant_id = $1 AND n.audience = 'staff'
    AND n.is_active = true
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND (
        n.target_type = 'all_staff'
        OR (n.target_type = 'role' AND n.target_value->>'role' = $2)
        OR (n.target_type = 'team' AND n.target_value->>'manager_id' = $3)
        OR (n.target_type = 'individual' AND n.target_value->'user_ids' ? $4::text)
    )
`;

// ============================================================
// CREATE NOTIFICATION (broadcast পাঠানো)
// POST /api/notifications
// ============================================================
const createNotification = async (req, res) => {
    try {
        const {
            title,
            body,
            category    = 'general',
            is_urgent   = false,
            audience,
            target_type,
            target_value,
            expires_in_hours,   // পুরনো notices ফিচারের সাথে parity — ঐচ্ছিক
        } = req.body;

        if (!title?.trim() || !body?.trim()) {
            return res.status(400).json({ success: false, message: 'শিরোনাম ও বার্তা দিন।' });
        }
        if (!['staff', 'customer'].includes(audience)) {
            return res.status(400).json({ success: false, message: 'audience অবশ্যই staff অথবা customer হতে হবে।' });
        }
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, message: 'category সঠিক নয়।' });
        }
        const validTargets = audience === 'staff' ? STAFF_TARGET_TYPES : CUSTOMER_TARGET_TYPES;
        if (!validTargets.includes(target_type)) {
            return res.status(400).json({ success: false, message: `${audience}-এর জন্য target_type সঠিক নয়।` });
        }

        // ১. আগে recipient resolve করো (recipient_count সেভ করার জন্য)
        const recipientIds = audience === 'staff'
            ? await resolveStaffRecipientIds(req.tenantId, target_type, target_value || {}, req.user)
            : await resolveCustomerRecipientIds(req.tenantId, target_type, target_value || {});

        // মেয়াদ হিসাব (পুরনো notices-এর মতোই — expires_in_hours না দিলে/'forever' হলে চিরস্থায়ী)
        let expiresAt = null;
        if (expires_in_hours && expires_in_hours !== 'forever') {
            expiresAt = new Date(Date.now() + parseInt(expires_in_hours, 10) * 60 * 60 * 1000);
        }

        // ২. broadcast রেকর্ড সেভ করো (sent-history/audit-এর জন্য)
        const { rows } = await query(
            `INSERT INTO notifications
                (tenant_id, sender_id, title, body, category, is_urgent, audience, target_type, target_value, recipient_count, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [
                req.tenantId, req.user.id, title.trim(), body.trim(),
                category, !!is_urgent, audience, target_type,
                JSON.stringify(target_value || {}), recipientIds.length, expiresAt,
            ]
        );
        const notification = rows[0];

        // ৩. আসল ডেলিভারি — response ব্লক না করে ব্যাকগ্রাউন্ডে পাঠাও
        if (audience === 'staff') {
            if (recipientIds.length) {
                sendPushToMany(recipientIds, {
                    title,
                    body,
                    type: category,
                    data: { notification_id: String(notification.id) },
                }).catch(e => logger.error('[Notification] staff push error:', e.message));
            }
        } else {
            recipientIds.forEach(customerId => {
                sendCustomerNotification(customerId, { title, body, type: category })
                    .catch(e => logger.error('[Notification] customer push error:', e.message));
            });
        }

        logger.info(`[Notification] ${req.user.role} (${req.user.id}) sent "${title}" to ${recipientIds.length} ${audience} recipient(s)`);

        return res.status(201).json({
            success: true,
            message: `নোটিফিকেশন পাঠানো হয়েছে (${recipientIds.length} জনকে)।`,
            data: notification,
        });
    } catch (error) {
        logger.error('❌ Create Notification Error:', error.message);
        return res.status(500).json({ success: false, message: 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY NOTIFICATIONS (staff bell)
// GET /api/notifications?page=&limit=
// ============================================================
const getMyNotifications = async (req, res) => {
    try {
        const user   = req.user;
        const page   = Math.max(1, parseInt(req.query.page) || 1);
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const visibility = buildStaffVisibilityClause();
        const params = [req.tenantId, user.role, user.manager_id, user.id];

        const countRes = await query(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE nr.notification_id IS NULL)::int AS unread
             FROM notifications n
             LEFT JOIN notification_reads nr
                ON nr.notification_id = n.id AND nr.user_id = $4 AND nr.user_type = 'staff'
             WHERE ${visibility}`,
            params
        );

        const { rows } = await query(
            `SELECT
                n.id, n.title, n.body, n.category, n.is_urgent, n.created_at,
                u.name_bn AS sender_name,
                (nr.notification_id IS NOT NULL) AS is_read
             FROM notifications n
             LEFT JOIN users u ON u.id = n.sender_id
             LEFT JOIN notification_reads nr
                ON nr.notification_id = n.id AND nr.user_id = $4 AND nr.user_type = 'staff'
             WHERE ${visibility}
             ORDER BY n.is_urgent DESC, n.created_at DESC
             LIMIT $5 OFFSET $6`,
            [...params, limit, offset]
        );

        return res.status(200).json({
            success: true,
            data: rows,
            total: countRes.rows[0].total,
            unread: countRes.rows[0].unread,
            page,
            limit,
        });
    } catch (error) {
        logger.error('❌ Get My Notifications Error:', error.message);
        return res.status(500).json({ success: false, message: 'নোটিফিকেশন আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MARK ONE READ
// PATCH /api/notifications/:id/read
// ============================================================
const markRead = async (req, res) => {
    try {
        await query(
            `INSERT INTO notification_reads (notification_id, user_id, user_type)
             VALUES ($1, $2, 'staff')
             ON CONFLICT DO NOTHING`,
            [req.params.id, req.user.id]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error('❌ Mark Read Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MARK ALL READ
// PATCH /api/notifications/read-all
// ============================================================
const markAllRead = async (req, res) => {
    try {
        const user = req.user;
        const visibility = buildStaffVisibilityClause();
        const params = [req.tenantId, user.role, user.manager_id, user.id];

        await query(
            `INSERT INTO notification_reads (notification_id, user_id, user_type)
             SELECT n.id, $4, 'staff'
             FROM notifications n
             WHERE ${visibility}
               AND NOT EXISTS (
                   SELECT 1 FROM notification_reads nr
                   WHERE nr.notification_id = n.id AND nr.user_id = $4 AND nr.user_type = 'staff'
               )`,
            params
        );

        return res.status(200).json({ success: true });
    } catch (error) {
        logger.error('❌ Mark All Read Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SENT HISTORY (Admin সব দেখে, Manager শুধু নিজেরটা)
// GET /api/notifications/sent
// ============================================================
const getSentHistory = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const params  = isAdmin ? [req.tenantId] : [req.tenantId, req.user.id];

        const { rows } = await query(
            `SELECT
                n.*,
                u.name_bn AS sender_name,
                (SELECT COUNT(*)::int FROM notification_reads nr WHERE nr.notification_id = n.id) AS read_count
             FROM notifications n
             LEFT JOIN users u ON u.id = n.sender_id
             WHERE n.tenant_id = $1 ${isAdmin ? '' : 'AND n.sender_id = $2'}
             ORDER BY n.created_at DESC
             LIMIT 100`,
            params
        );

        return res.status(200).json({ success: true, data: rows });
    } catch (error) {
        logger.error('❌ Get Sent History Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// WITHDRAW / SOFT-DELETE (পুরনো notices-এর deleteNotice-এর সাথে parity)
// শুধু যে পাঠিয়েছে সে-ই তুলে নিতে পারবে
// DELETE /api/notifications/:id
// ============================================================
const deleteNotification = async (req, res) => {
    try {
        await query(
            `UPDATE notifications SET is_active = false
             WHERE id = $1 AND sender_id = $2 AND tenant_id = $3`,
            [req.params.id, req.user.id, req.tenantId]
        );
        return res.status(200).json({ success: true, message: 'নোটিফিকেশন তুলে নেওয়া হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Notification Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createNotification,
    getMyNotifications,
    markRead,
    markAllRead,
    getSentHistory,
    deleteNotification,
};
