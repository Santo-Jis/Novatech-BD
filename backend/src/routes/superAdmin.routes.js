/**
 * superAdmin.routes.js — নতুন ফাইল
 * Copy করো: backend/src/routes/superAdmin.routes.js
 *
 * server.js-এ যোগ করো:
 *   const superAdminRoutes = require('./routes/superAdmin.routes');
 *   app.use('/superadmin/api', superAdminRoutes);
 *
 * ⚠️ এই routes existing auth/tenant middleware ব্যবহার করে না —
 * শুধু SUPER_ADMIN_SECRET_KEY header দিয়ে protect।
 * .env-এ যোগ করো:
 *   SUPER_ADMIN_SECRET_KEY=<লম্বা random string>
 *
 * Call করার সময় header:
 *   X-Super-Admin-Key: <সেই same string>
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/superAdmin.controller');

// Super Admin auth — simple secret key
const superAdminAuth = (req, res, next) => {
  const key = req.headers['x-super-admin-key'];

  if (!process.env.SUPER_ADMIN_SECRET_KEY) {
    console.error('[superAdmin] SUPER_ADMIN_SECRET_KEY env var সেট নেই — সব request 401 হবে');
    return res.status(500).json({ success: false, message: 'Server misconfigured' });
  }

  if (!key || key !== process.env.SUPER_ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

router.use(superAdminAuth);

// Tenant CRUD
router.get   ('/tenants',                  ctrl.getAllTenants);
router.post  ('/tenants',                  ctrl.createTenant);
router.get   ('/tenants/:tenantId',        ctrl.getTenantDetails);
router.patch ('/tenants/:tenantId/status', ctrl.updateTenantStatus);
router.patch ('/tenants/:tenantId/plan',   ctrl.updateTenantPlan);
router.delete('/tenants/:tenantId',        ctrl.deleteTenant);

module.exports = router;
