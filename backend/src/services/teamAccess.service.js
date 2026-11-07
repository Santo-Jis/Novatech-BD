// ============================================================
// backend/src/services/teamAccess.service.js
//
// SR (worker) এর "টিম-লেভেল" access যাচাই।
//
// নিয়ম: একই ম্যানেজারের নিচের সব SR টিমের সব রুট ও সব কাস্টমার দেখতে পারবে
// (assignment এখানে access-control নয়)। কিন্তু অন্য ম্যানেজারের টিমের
// কাস্টমার/রুট নয় — শুধু tenant মিললেই চলবে না।
//
// worker ছাড়া অন্য রোলের জন্য এই ফাইল কিছু করে না (তাদের আগের চেক আগের মতোই)।
// ============================================================

const { query } = require('../config/db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORBIDDEN_CUSTOMER = {
    success: false,
    message: 'এই কাস্টমার আপনার টিমে নেই।'
};
const FORBIDDEN_ROUTE = {
    success: false,
    message: 'এই রুট আপনার টিমে নেই।'
};

/**
 * এই worker কি এই কাস্টমার দেখতে পারবে?
 * অনুমতি পাবে যদি:
 *   ১. কাস্টমারের রুটের manager_id == worker-এর manager_id (টিম), অথবা
 *   ২. কাস্টমার সরাসরি এই worker-এর নামে active assigned, অথবা
 *   ৩. কাস্টমারটি এই worker নিজে তৈরি করেছে, অথবা
 *   ৪. কাস্টমারের কোনো রুট নেই ও verified নয় (getCustomers-এর "unclaimed lead" নিয়মের সাথে মিল)
 */
async function workerCanAccessCustomer(workerId, tenantId, customerId) {
    if (!customerId || !UUID_RE.test(String(customerId))) return false;

    const { rows } = await query(
        `SELECT 1
           FROM customers c
           LEFT JOIN routes r ON r.id = c.route_id
          WHERE c.id = $1
            AND c.tenant_id = $2
            AND (
                  r.manager_id = (SELECT manager_id FROM users WHERE id = $3 AND tenant_id = $2)
               OR EXISTS (
                      SELECT 1 FROM customer_assignments ca
                       WHERE ca.customer_id = c.id AND ca.worker_id = $3 AND ca.is_active = true
                  )
               OR c.created_by = $3
               OR (c.route_id IS NULL AND c.is_verified = false)
            )
          LIMIT 1`,
        [customerId, tenantId, workerId]
    );
    return rows.length > 0;
}

/**
 * এই worker কি এই রুট দেখতে পারবে? (রুটের manager == worker-এর manager)
 */
async function workerCanAccessRoute(workerId, tenantId, routeId) {
    if (!routeId || !UUID_RE.test(String(routeId))) return false;

    const { rows } = await query(
        `SELECT 1
           FROM routes r
          WHERE r.id = $1
            AND r.tenant_id = $2
            AND r.manager_id = (SELECT manager_id FROM users WHERE id = $3 AND tenant_id = $2)
          LIMIT 1`,
        [routeId, tenantId, workerId]
    );
    return rows.length > 0;
}

/**
 * Controller-এর শুরুতে ব্যবহার:
 *     if (await denyWorkerOutsideTeam(req, res, customerId)) return;
 * worker হলে এবং কাস্টমার টিমের বাইরে হলে 403 পাঠিয়ে true ফেরত দেয়।
 * অন্য রোলে সবসময় false (কিছু করে না)।
 */
async function denyWorkerOutsideTeam(req, res, customerId) {
    if (req.user?.role !== 'worker') return false;
    const ok = await workerCanAccessCustomer(req.user.id, req.tenantId, customerId);
    if (ok) return false;
    res.status(403).json(FORBIDDEN_CUSTOMER);
    return true;
}

async function denyWorkerOutsideTeamRoute(req, res, routeId) {
    if (req.user?.role !== 'worker') return false;
    const ok = await workerCanAccessRoute(req.user.id, req.tenantId, routeId);
    if (ok) return false;
    res.status(403).json(FORBIDDEN_ROUTE);
    return true;
}

module.exports = {
    workerCanAccessCustomer,
    workerCanAccessRoute,
    denyWorkerOutsideTeam,
    denyWorkerOutsideTeamRoute
};
