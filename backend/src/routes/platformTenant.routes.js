/**
 * platformTenant.routes.js — নতুন ফাইল
 * Copy করো: backend/src/routes/platformTenant.routes.js
 *
 * server.js-এ যোগ করো:
 *   const platformTenantRoutes = require('./routes/platformTenant.routes');
 *   app.use('/platform/api/tenants', platformTenantRoutes);
 *
 * ⚠️ Read-only — create/status/plan/delete এখনো /superadmin/api/tenants-এই
 * (X-Super-Admin-Key)। এই ফাইল শুধু platform_staff (full/support scope)-কে
 * Tenant List/Detail দেখার অ্যাক্সেস দেয়, ধ্বংসাত্মক কোনো action না।
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/platformTenant.controller');
const { platformAuth, requireScope } = require('../middlewares/platformAuth');

router.use(platformAuth);

router.get('/', requireScope('full', 'support'), ctrl.listTenants);
router.get('/:tenantId', requireScope('full', 'support'), ctrl.getTenantDetail);
// কাস্টমার/সিট লিমিট, ওয়ালেট (full-only), AI টোকেন (full-only), সাম্প্রতিক SMS —
// এই রুটও read-only, উপরের দুইটার মতোই।
router.get('/:tenantId/diagnostics', requireScope('full', 'support'), ctrl.getTenantDiagnostics);

module.exports = router;
