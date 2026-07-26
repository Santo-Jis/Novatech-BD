/**
 * platformTwoFactor.routes.js — নতুন ফাইল
 * server.js-এ যোগ করো:
 *   const platformTwoFactorRoutes = require('./routes/platformTwoFactor.routes');
 *   app.use('/platform/api/auth/2fa', platformTwoFactorRoutes);
 *
 * ⚠️ এই সব রুট normal accessToken (platformAuth middleware) লাগবে —
 * প্রতিটা staff শুধু নিজের 2FA সেটআপ/বন্ধ করতে পারবে (req.platformStaff.id
 * থেকেই নেওয়া হয়, কারো id parameter দিয়ে অন্যের 2FA touch করা যায় না)।
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/platformTwoFactor.controller');
const { platformAuth, requireScope } = require('../middlewares/platformAuth');
const { auditLog } = require('../services/platformAudit.service');

router.use(platformAuth);
router.use(requireScope('full', 'support'));

router.get('/status', ctrl.status);
router.post('/setup/start', auditLog('2fa.setup_start', 'platform_staff'), ctrl.setupStart);
router.post('/setup/confirm', auditLog('2fa.setup_confirm', 'platform_staff'), ctrl.setupConfirm);
router.post('/disable', auditLog('2fa.disable', 'platform_staff'), ctrl.disable);
router.post('/recovery-codes/regenerate', auditLog('2fa.regenerate_recovery_codes', 'platform_staff'), ctrl.regenerateRecoveryCodes);

module.exports = router;
