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

const express     = require('express');
const router      = express.Router();
const rateLimit    = require('express-rate-limit');
const crypto       = require('crypto');
const ctrl         = require('../controllers/superAdmin.controller');

// ✅ Phase 2 (Security Hardening): brute-force রোধে rate limit।
// /superadmin/api প্রথম থেকেই /api/ prefix-এর বাইরে ছিল বলে global
// apiLimiter এখানে কখনো apply হতো না — এখন dedicated limiter বসানো হলো।
const superAdminLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // ১৫ মিনিট
  max:             20,             // দৈনন্দিন ব্যবহারের জন্য যথেষ্ট, brute-force ঠেকানোর জন্য কড়া
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// ✅ Phase 2: timing-safe comparison — plain `!==` টাইমিং অ্যাটাকের
// (ছোট হলেও theoretical) ঝুঁকি রাখে, crypto.timingSafeEqual দিয়ে সেটা এড়ানো।
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false; // দৈর্ঘ্য না মিললে সরাসরি false (timingSafeEqual দৈর্ঘ্য না মিললে throw করে)
  return crypto.timingSafeEqual(bufA, bufB);
}

// Super Admin auth — simple secret key (timing-safe compare)
const superAdminAuth = (req, res, next) => {
  const key = req.headers['x-super-admin-key'];

  if (!process.env.SUPER_ADMIN_SECRET_KEY) {
    console.error('[superAdmin] SUPER_ADMIN_SECRET_KEY env var সেট নেই — সব request 401 হবে');
    return res.status(500).json({ success: false, message: 'Server misconfigured' });
  }

  if (!key || !safeCompare(key, process.env.SUPER_ADMIN_SECRET_KEY)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

router.use(superAdminLimiter);
router.use(superAdminAuth);

// Tenant CRUD
router.get   ('/tenants',                  ctrl.getAllTenants);
router.post  ('/tenants',                  ctrl.createTenant);
router.get   ('/tenants/:tenantId',        ctrl.getTenantDetails);
router.patch ('/tenants/:tenantId/status', ctrl.updateTenantStatus);
router.patch ('/tenants/:tenantId/plan',   ctrl.updateTenantPlan);
router.post  ('/tenants/:tenantId/reset-admin-password', ctrl.resetTenantAdminPassword); // ✅ Phase 3 TICKET-06
router.delete('/tenants/:tenantId',        ctrl.deleteTenant);

module.exports = router;
