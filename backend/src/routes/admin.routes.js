// ============================================================
// ADMIN ROUTES
// Base: /api/admin
// ============================================================

const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin, allowRoles } = require('../middlewares/roleCheck');

// Admin + Manager উভয়ই portal device routes access করতে পারবে
// Controller-এর ভেতরে role চেক করে data filter হবে:
//   admin   → সব customer
//   manager → শুধু নিজের route-এর customer
const isAdminOrManager = allowRoles('admin', 'manager');

const {
    getSettings,
    updateSettings,
    getAuditLogs,
    getSystemStats,
    testSmsGateway,
} = require('../controllers/admin.controller');

const {
    getPortalOverview,
    getCustomerDevices,
    revokeDevice,
    revokeAllDevices,
    restoreDevice,
    getPortalStats,
} = require('../controllers/adminDevice.controller');

// ✅ নতুন — Customer Portal Return Request Review
const {
    getPortalReturnRequests,
    getPortalReturnRequestDetail,
    reviewPortalReturnRequest,
    completePortalReturnRequest,
} = require('../controllers/customerPortalReturn.controller');

// ── System Settings (Admin only) ─────────────────────────────
router.get('/settings',        auth, isAdmin, getSettings);
router.put('/settings',        auth, isAdmin, updateSettings);

// ── Audit & Stats (Admin only) ───────────────────────────────
router.get('/audit-logs',      auth, isAdmin, getAuditLogs);
router.get('/stats',           auth, isAdmin, getSystemStats);

// ── SMS Gateway (Admin only) ─────────────────────────────────
router.post('/sms-test',       auth, isAdmin, testSmsGateway);

// ── Portal Device Management (Admin + Manager) ───────────────
//
// Admin  → সব customer দেখবে ও manage করবে
// Manager → শুধু নিজের route-এর customer দেখবে ও manage করবে
//
// Permissions matrix:
//   Overview list  → admin ✓  manager ✓
//   Stats widget   → admin ✓  manager ✓  (নিজের route-এর data)
//   Device list    → admin ✓  manager ✓  (route check)
//   Revoke device  → admin ✓  manager ✓  (route check)
//   Revoke all     → admin ✓  manager ✓  (route check; also_revoke_link admin only)
//   Restore device → admin ✓  manager ✗  (controller-এ 403)

router.get('/portal-devices',                                   auth, isAdminOrManager, getPortalOverview);
router.get('/portal-devices/stats',                             auth, isAdminOrManager, getPortalStats);
router.get('/portal-devices/:customerId',                       auth, isAdminOrManager, getCustomerDevices);
router.delete('/portal-devices/:customerId',                    auth, isAdminOrManager, revokeAllDevices);
router.delete('/portal-devices/:customerId/:deviceId',          auth, isAdminOrManager, revokeDevice);
router.patch('/portal-devices/:customerId/:deviceId/restore',   auth, isAdminOrManager, restoreDevice);

// ── Customer Portal Return Requests (Admin + Manager + Supervisor) ──
//
// GET    /api/admin/portal-returns                  → সব লিস্ট (filter করা যাবে)
// GET    /api/admin/portal-returns/:id              → বিবরণ (invoice info সহ)
// PATCH  /api/admin/portal-returns/:id/review       → approve / reject
// PATCH  /api/admin/portal-returns/:id/complete     → পণ্য হাতে পেলে complete

const CAN_VIEW_RETURNS   = allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant');
const CAN_REVIEW_RETURNS = allowRoles('admin', 'manager', 'supervisor');

router.get('/portal-returns',              auth, CAN_VIEW_RETURNS,   getPortalReturnRequests);
router.get('/portal-returns/:id',          auth, CAN_VIEW_RETURNS,   getPortalReturnRequestDetail);
router.patch('/portal-returns/:id/review', auth, CAN_REVIEW_RETURNS, reviewPortalReturnRequest);
router.patch('/portal-returns/:id/complete', auth, CAN_REVIEW_RETURNS, completePortalReturnRequest);

module.exports = router;
