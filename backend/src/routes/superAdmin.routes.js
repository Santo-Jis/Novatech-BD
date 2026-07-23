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
  // ⚠️ Phase 4 আপডেট: আগে max ছিল ২০, যেটা শুধু Tenant list/detail পেজের
  // জন্য যথেষ্ট ছিল। এখন Dashboard + Tenants + Staff + Audit Log +
  // Settings — এই ৫টা পেজ প্রতিটাই আলাদা GET request পাঠায়, স্বাভাবিক
  // ব্যবহারেই ২০ ছাড়িয়ে যায়। ১০০ এখনো একটা দীর্ঘ random secret key-এর
  // বিরুদ্ধে brute-force-কে অকার্যকর রাখে, কিন্তু বৈধ ব্যবহারকারীকে
  // আটকায় না।
  max:             100,
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

// ✅ Phase 4: Dashboard aggregate stats (স্কেল-নিরপেক্ষ, একটামাত্র query)
router.get   ('/dashboard-stats',          ctrl.getDashboardStats);

// ✅ Phase 4: প্ল্যাটফর্ম-ওয়াইড Audit Log viewer
router.get   ('/audit-log',                ctrl.getAuditLog);

// ✅ Phase 4: Platform Staff (Support Panel ইউজার) ম্যানেজমেন্ট —
// tenant-এর নিজস্ব user/customer থেকে সম্পূর্ণ আলাদা, ইচ্ছাকৃতভাবে
// এখানেই রাখা হলো যেহেতু staff account শুধু Super Admin-ই তৈরি করতে পারে।
router.get   ('/staff',                    ctrl.getAllStaff);
router.post  ('/staff',                    ctrl.createStaff);
router.patch ('/staff/:staffId',           ctrl.updateStaff);
router.post  ('/staff/:staffId/reset-password', ctrl.resetStaffPassword);

// ✅ Phase 4: Tenant System Settings (company info বাদে — সেটা tenant
// নিজের local admin panel থেকেই বদলাবে, Super Admin থেকে না)
router.get   ('/tenants/:tenantId/settings', ctrl.getTenantSettings);
router.patch ('/tenants/:tenantId/settings', ctrl.updateTenantSettings);

module.exports = router;
