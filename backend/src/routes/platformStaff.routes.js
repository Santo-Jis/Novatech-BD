/**
 * platformStaff.routes.js — নতুন ফাইল
 * server.js-এ যোগ করো:
 *   const platformStaffRoutes = require('./routes/platformStaff.routes');
 *   app.use('/platform/api/staff', platformStaffRoutes);
 *
 * ⚠️ পুরো রাউটার requireScope('full')-এর পেছনে — Support scope
 * এখানে কিছুই করতে পারবে না (নিজেকে বা অন্য কাউকে দিয়ে privilege
 * escalation ঠেকাতে)।
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/platformStaff.controller');
const { platformAuth, requireScope } = require('../middlewares/platformAuth');
const { auditLog } = require('../services/platformAudit.service');

router.use(platformAuth);
router.use(requireScope('full'));

router.get('/', ctrl.listStaff);
router.post('/', auditLog('staff.create', 'platform_staff'), ctrl.createStaff);
router.patch('/:id/status', auditLog('staff.status_change', 'platform_staff'), ctrl.updateStaffStatus);
router.post('/:id/reset-password', auditLog('staff.reset_password', 'platform_staff'), ctrl.resetStaffPassword);

module.exports = router;
