const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Platform Audit Log — সব platform_staff action এখানে ট্র্যাক হয়।
// Security & Access Doc §৩ অনুযায়ী: state-changing action বাধ্যতামূলক লগ হবে।
// ============================================================

/**
 * একটা audit entry লেখো।
 * @param {object} params
 * @param {string} params.staffId
 * @param {string} params.staffEmail
 * @param {string} params.action       e.g. 'user.unblock', 'ticket.create'
 * @param {string} [params.targetType] e.g. 'user' | 'ticket' | 'tenant'
 * @param {string} [params.targetId]
 * @param {object} [params.details]    আগে/পরের value, reason ইত্যাদি
 * @param {string} [params.ip]
 */
const logPlatformAction = async ({ staffId, staffEmail, action, targetType, targetId, details, ip }) => {
    try {
        await query(
            `INSERT INTO platform_audit_log
                (staff_id, staff_email, action, target_type, target_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [staffId, staffEmail, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, ip || null]
        );
    } catch (err) {
        // Audit log fail হলেও মূল action block করা হবে না (fail-open লগিং, fail-closed action না) —
        // কিন্তু error অবশ্যই লগ করতে হবে যাতে চোখে পড়ে।
        logger.error('❌ platformAudit.logPlatformAction ব্যর্থ:', err.message, { action, targetType, targetId });
    }
};

/**
 * Express middleware ভার্সন — response সফল (2xx) হলেই লগ করবে।
 * ব্যবহার: router.post('/:id/unblock', platformAuth, requireScope('full','support'),
 *              auditLog('user.unblock', 'user'), controllerFn)
 * middleware কে controller-এর *আগে* বসাতে হবে, কিন্তু আসল লগ res.on('finish')-এ হবে
 * যাতে শুধু সফল action-ই লগ হয়।
 */
const auditLog = (action, targetType) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300 && req.platformStaff) {
            const targetId = req.params.id || req.params.userId || req.params.ticketId || null;
            logPlatformAction({
                staffId:    req.platformStaff.id,
                staffEmail: req.platformStaff.email,
                action,
                targetType,
                targetId,
                details: { body: req.body, method: req.method, path: req.originalUrl },
                ip: req.ip,
            });
        }
    });
    next();
};

module.exports = { logPlatformAction, auditLog };
