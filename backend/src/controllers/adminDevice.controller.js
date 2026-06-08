const logger = require('../config/logger');
// ============================================================
// DEVICE MANAGEMENT CONTROLLER (Admin + Manager)
//
// Access rules:
//   admin   → সব customer-এর device দেখত ও manage করতে পারবে
//   manager → শুধু নিজের route-এর customer-দের device manage করতে পারবে
//
// Route চেক pattern (customer.controller.js থেকে অনুসরণ):
//   manager হলে → routes WHERE manager_id = req.user.id তে
//                  থাকা customer-রাই শুধু accessible
// ============================================================

const { query } = require('../config/db');

// UUID validation helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id) => UUID_REGEX.test(id);

// ── Manager route filter helper ──────────────────────────────
// manager হলে তার route_id list বের করে WHERE clause বানায়
// admin হলে null → no filter
const buildManagerRouteFilter = async (user, params) => {
    if (user.role === 'admin') return { clause: '', params };

    // manager/supervisor → শুধু নিজের route-এর customer
    const routeResult = await query(
        'SELECT id FROM routes WHERE manager_id = $1',
        [user.id]
    );

    if (routeResult.rows.length === 0) {
        return { clause: 'AND 1=0', params }; // কোনো route নেই → empty result
    }

    const routeIds = routeResult.rows.map(r => r.id);
    params.push(routeIds);
    return { clause: `AND c.route_id = ANY($${params.length})`, params };
};

// ── Customer ownership verify (single customer) ──────────────
// admin → সব customer OK
// manager → customer তার route-এ আছে কিনা যাচাই
const verifyCustomerAccess = async (user, customerId) => {
    if (user.role === 'admin') return true;

    const result = await query(
        `SELECT c.id
         FROM customers c
         JOIN routes r ON r.id = c.route_id
         WHERE c.id = $1
           AND r.manager_id = $2`,
        [customerId, user.id]
    );
    return result.rows.length > 0;
};

// ============================================================
// 1. GET ALL PORTAL ACTIVITY (Admin: সব, Manager: নিজের route)
// GET /api/admin/portal-devices   (admin)
// GET /api/manager/portal-devices (manager)
// ============================================================
const getPortalOverview = async (req, res) => {
    try {
        const page       = Math.max(1, parseInt(req.query.page)  || 1);
        const limit      = Math.min(100, parseInt(req.query.limit) || 30);
        const offset     = (page - 1) * limit;
        const search     = (req.query.search || '').trim();
        const hasDevices = req.query.has_devices || '';

        let params  = [];
        const filters = ['c.is_active = true'];

        if (search) {
            params.push(`%${search}%`);
            const n = params.length;
            filters.push(`(c.shop_name ILIKE $${n} OR c.owner_name ILIKE $${n} OR c.customer_code ILIKE $${n})`);
        }

        if (hasDevices === 'yes') {
            filters.push(`(SELECT COUNT(*) FROM customer_portal_devices cpd WHERE cpd.customer_id = c.id AND cpd.is_active = true) > 0`);
        } else if (hasDevices === 'no') {
            filters.push(`(SELECT COUNT(*) FROM customer_portal_devices cpd WHERE cpd.customer_id = c.id AND cpd.is_active = true) = 0`);
        }

        // Manager route filter
        const { clause, params: updatedParams } = await buildManagerRouteFilter(req.user, params);
        params = updatedParams;
        if (clause) filters.push(clause.replace(/^AND /, ''));

        const whereClause = 'WHERE ' + filters.join(' AND ');

        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

        const result = await query(
            `SELECT
                 c.id, c.customer_code, c.shop_name, c.owner_name,
                 c.whatsapp, c.email,
                 r.name                   AS route_name,
                 cpt.bound_email          AS portal_email,
                 cpt.last_login,
                 cpt.expires_at           AS link_expires_at,
                 cpt.token_version,
                 (SELECT COUNT(*) FROM customer_portal_devices cpd
                  WHERE cpd.customer_id = c.id AND cpd.is_active = true)::int  AS active_device_count,
                 (SELECT COUNT(*) FROM customer_portal_devices cpd
                  WHERE cpd.customer_id = c.id)::int                           AS total_device_count,
                 (SELECT MAX(cpd.last_used_at)
                  FROM customer_portal_devices cpd
                  WHERE cpd.customer_id = c.id AND cpd.is_active = true)       AS last_device_used_at,
                 (SELECT cpd.device_label
                  FROM customer_portal_devices cpd
                  WHERE cpd.customer_id = c.id AND cpd.is_active = true
                  ORDER BY cpd.last_used_at DESC NULLS LAST LIMIT 1)           AS last_active_device,
                 COUNT(*) OVER()          AS total_count
             FROM customers c
             LEFT JOIN routes r ON r.id = c.route_id
             LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
             ${whereClause}
             ORDER BY cpt.last_login DESC NULLS LAST, c.shop_name ASC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );

        const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.ceil(total / limit);
        const rows       = result.rows.map(({ total_count, ...rest }) => rest);

        return res.status(200).json({
            success: true,
            data:    rows,
            caller_role: req.user.role,
            pagination: { page, limit, total, totalPages },
        });

    } catch (error) {
        logger.error('❌ Portal Overview Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. GET DEVICES OF A CUSTOMER
// GET /api/admin/portal-devices/:customerId
// GET /api/manager/portal-devices/:customerId
// Manager → নিজের route-এর customer হতে হবে
// ============================================================
const getCustomerDevices = async (req, res) => {
    try {
        const { customerId } = req.params;

        if (!isValidUUID(customerId)) {
            return res.status(400).json({ success: false, message: 'অবৈধ customer ID।' });
        }

        // Access check
        const hasAccess = await verifyCustomerAccess(req.user, customerId);
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'এই কাস্টমার আপনার রুটে নেই।'
            });
        }

        const [customerResult, devicesResult] = await Promise.all([
            query(
                `SELECT c.id, c.customer_code, c.shop_name, c.owner_name,
                        c.whatsapp, c.email, c.is_active,
                        r.name               AS route_name,
                        cpt.bound_email      AS portal_email,
                        cpt.last_login,
                        cpt.expires_at       AS link_expires_at,
                        cpt.token_version,
                        cpt.created_at       AS link_sent_at
                 FROM customers c
                 LEFT JOIN routes r ON r.id = c.route_id
                 LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
                 WHERE c.id = $1`,
                [customerId]
            ),
            query(
                `SELECT id, device_hash, device_label, google_email,
                        is_active, added_at, last_used_at
                 FROM customer_portal_devices
                 WHERE customer_id = $1
                 ORDER BY added_at DESC`,
                [customerId]
            ),
        ]);

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const customer = customerResult.rows[0];
        const devices  = devicesResult.rows;

        return res.status(200).json({
            success: true,
            data: {
                customer,
                devices,
                summary: {
                    total:    devices.length,
                    active:   devices.filter(d => d.is_active).length,
                    inactive: devices.filter(d => !d.is_active).length,
                },
            },
        });

    } catch (error) {
        logger.error('❌ Get Customer Devices Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. REVOKE A SINGLE DEVICE
// DELETE /api/admin/portal-devices/:customerId/:deviceId
// DELETE /api/manager/portal-devices/:customerId/:deviceId
// ============================================================
const revokeDevice = async (req, res) => {
    try {
        const { customerId, deviceId } = req.params;

        if (!isValidUUID(customerId) || !isValidUUID(deviceId)) {
            return res.status(400).json({ success: false, message: 'অবৈধ ID ফরম্যাট।' });
        }

        const hasAccess = await verifyCustomerAccess(req.user, customerId);
        if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার রুটে নেই।' });
        }

        const result = await query(
            `UPDATE customer_portal_devices
             SET is_active = false
             WHERE id = $1 AND customer_id = $2
             RETURNING id, device_label, google_email`,
            [deviceId, customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Device পাওয়া যায়নি।' });
        }

        const { device_label, google_email } = result.rows[0];

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'REVOKE_PORTAL_DEVICE', 'customer_portal_devices', $2, $3)`,
            [req.user.id, deviceId, JSON.stringify({ device_label, google_email, customer_id: customerId, by_role: req.user.role })]
        ).catch(() => {});

        return res.status(200).json({
            success: true,
            message: `"${device_label}" revoke করা হয়েছে।`,
            data: result.rows[0],
        });

    } catch (error) {
        logger.error('❌ Revoke Device Error:', error.message);
        return res.status(500).json({ success: false, message: 'Revoke করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 4. REVOKE ALL DEVICES
// DELETE /api/admin/portal-devices/:customerId
// DELETE /api/manager/portal-devices/:customerId
// body: { also_revoke_link: true } → JWT-ও invalid (admin only)
// Manager: also_revoke_link অনুমতি নেই — শুধু device revoke
// ============================================================
const revokeAllDevices = async (req, res) => {
    try {
        const { customerId }  = req.params;
        // also_revoke_link শুধু admin করতে পারবে
        const alsoRevokeLink  = req.user.role === 'admin' && req.body?.also_revoke_link === true;

        if (!isValidUUID(customerId)) {
            return res.status(400).json({ success: false, message: 'অবৈধ customer ID।' });
        }

        const hasAccess = await verifyCustomerAccess(req.user, customerId);
        if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার রুটে নেই।' });
        }

        const deviceResult = await query(
            `UPDATE customer_portal_devices
             SET is_active = false
             WHERE customer_id = $1 AND is_active = true
             RETURNING id`,
            [customerId]
        );

        let linkRevoked = false;

        if (alsoRevokeLink) {
            await query(
                `UPDATE customer_portal_tokens
                 SET token_version = token_version + 1,
                     bound_email   = NULL,
                     last_login    = NULL,
                     google_email  = NULL
                 WHERE customer_id = $1`,
                [customerId]
            );
            linkRevoked = true;

            try {
                const { invalidatePortalAuthCache } = require('../routes/customerPortal.routes');
                invalidatePortalAuthCache(customerId);
            } catch { /* silent */ }
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'REVOKE_ALL_PORTAL_DEVICES', 'customer_portal_devices', $2, $3)`,
            [req.user.id, customerId, JSON.stringify({
                revoked_count: deviceResult.rows.length,
                also_revoke_link: alsoRevokeLink,
                by_role: req.user.role,
            })]
        ).catch(() => {});

        return res.status(200).json({
            success:       true,
            message:       `${deviceResult.rows.length}টি device revoke করা হয়েছে।${alsoRevokeLink ? ' Portal link-ও বাতিল হয়েছে।' : ''}`,
            revoked_count: deviceResult.rows.length,
            link_revoked:  linkRevoked,
        });

    } catch (error) {
        logger.error('❌ Revoke All Devices Error:', error.message);
        return res.status(500).json({ success: false, message: 'Revoke করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 5. RESTORE DEVICE (Admin only — manager restore করতে পারবে না)
// PATCH /api/admin/portal-devices/:customerId/:deviceId/restore
// ============================================================
const restoreDevice = async (req, res) => {
    try {
        const { customerId, deviceId } = req.params;

        if (!isValidUUID(customerId) || !isValidUUID(deviceId)) {
            return res.status(400).json({ success: false, message: 'অবৈধ ID ফরম্যাট।' });
        }

        // Restore → admin only (manager revoke করতে পারে, undo admin করবে)
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Device restore করার অনুমতি শুধু Admin-এর আছে।'
            });
        }

        const result = await query(
            `UPDATE customer_portal_devices
             SET is_active = true
             WHERE id = $1 AND customer_id = $2
             RETURNING id, device_label, google_email`,
            [deviceId, customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Device পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'RESTORE_PORTAL_DEVICE', 'customer_portal_devices', $2, $3)`,
            [req.user.id, deviceId, JSON.stringify({ customer_id: customerId })]
        ).catch(() => {});

        return res.status(200).json({
            success: true,
            message: `"${result.rows[0].device_label}" পুনরায় সক্রিয় করা হয়েছে।`,
            data:    result.rows[0],
        });

    } catch (error) {
        logger.error('❌ Restore Device Error:', error.message);
        return res.status(500).json({ success: false, message: 'পুনরায় সক্রিয় করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 6. PORTAL STATS
// GET /api/admin/portal-devices/stats  → সব customer (admin)
// GET /api/manager/portal-devices/stats → শুধু নিজের route (manager)
// ============================================================
const getPortalStats = async (req, res) => {
    try {
        let routeFilter = '';
        let routeParams = [];

        if (req.user.role !== 'admin') {
            const routeResult = await query(
                'SELECT id FROM routes WHERE manager_id = $1',
                [req.user.id]
            );
            const routeIds = routeResult.rows.map(r => r.id);
            if (routeIds.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: {
                        overview: { total_portal_customers:0, customers_with_active_device:0, total_active_devices:0, active_last_7_days:0, active_last_30_days:0 },
                        recent_logins: [],
                        device_distribution: [],
                    }
                });
            }
            routeParams = [routeIds];
            routeFilter = `AND c.route_id = ANY($1)`;
        }

        const p1 = routeParams.length > 0 ? routeParams : [];

        const [overview, recentLogins, deviceDist] = await Promise.all([
            query(
                `SELECT
                     COUNT(DISTINCT cpt.customer_id)                                        AS total_portal_customers,
                     COUNT(DISTINCT CASE WHEN cpd.is_active THEN cpd.customer_id END)       AS customers_with_active_device,
                     COUNT(DISTINCT CASE WHEN cpd.is_active THEN cpd.id END)                AS total_active_devices,
                     COUNT(DISTINCT CASE WHEN NOT cpd.is_active THEN cpd.id END)            AS total_revoked_devices,
                     COUNT(DISTINCT CASE WHEN cpt.last_login IS NULL
                           THEN cpt.customer_id END)                                        AS never_logged_in,
                     COUNT(DISTINCT CASE WHEN cpt.last_login >= NOW() - INTERVAL '7 days'
                           THEN cpt.customer_id END)                                        AS active_last_7_days,
                     COUNT(DISTINCT CASE WHEN cpt.last_login >= NOW() - INTERVAL '30 days'
                           THEN cpt.customer_id END)                                        AS active_last_30_days
                 FROM customer_portal_tokens cpt
                 JOIN customers c ON c.id = cpt.customer_id
                 LEFT JOIN customer_portal_devices cpd ON cpd.customer_id = cpt.customer_id
                 WHERE 1=1 ${routeFilter}`,
                p1
            ),
            query(
                `SELECT c.shop_name, c.owner_name, c.customer_code,
                        cpt.last_login, cpt.bound_email AS portal_email
                 FROM customer_portal_tokens cpt
                 JOIN customers c ON c.id = cpt.customer_id
                 WHERE cpt.last_login IS NOT NULL ${routeFilter}
                 ORDER BY cpt.last_login DESC
                 LIMIT 10`,
                p1
            ),
            query(
                `SELECT device_count, COUNT(*) AS customer_count
                 FROM (
                     SELECT cpd.customer_id, COUNT(*) AS device_count
                     FROM customer_portal_devices cpd
                     JOIN customers c ON c.id = cpd.customer_id
                     WHERE cpd.is_active = true ${routeFilter}
                     GROUP BY cpd.customer_id
                 ) AS sub
                 GROUP BY device_count
                 ORDER BY device_count`,
                p1
            ),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                overview:            overview.rows[0],
                recent_logins:       recentLogins.rows,
                device_distribution: deviceDist.rows,
            },
        });

    } catch (error) {
        logger.error('❌ Portal Stats Error:', error.message);
        return res.status(500).json({ success: false, message: 'পরিসংখ্যান আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getPortalOverview,
    getCustomerDevices,
    revokeDevice,
    revokeAllDevices,
    restoreDevice,
    getPortalStats,
};
