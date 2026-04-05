const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    canManageCommission,
    checkTeamAccess
} = require('../middlewares/roleCheck');

const {
    getMyCommission,
    getTeamCommission,
    getAllCommission,
    getSettings,
    updateSettings,
    getBonusStatus,
    getCommissionSummary
} = require('../controllers/commission.controller');

// ============================================================
// COMMISSION ROUTES
// Base: /api/commission
// ============================================================

// SR এর নিজের কমিশন
router.get('/my',           auth, getMyCommission);

// বোনাসের অগ্রগতি
router.get('/bonus-status', auth, getBonusStatus);

// কমিশন স্ল্যাব দেখা
router.get('/settings',     auth, getSettings);

// টিমের কমিশন সারসংক্ষেপ (Manager)
router.get('/team',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getTeamCommission
);

// সব কমিশন (Admin)
router.get('/all',
    auth,
    allowRoles('admin', 'accountant'),
    getAllCommission
);

// কমিশন সারসংক্ষেপ (Admin ড্যাশবোর্ড)
router.get('/summary',
    auth,
    allowRoles('admin', 'accountant'),
    getCommissionSummary
);

// কমিশন স্ল্যাব আপডেট (শুধু Admin)
router.put('/settings',
    auth,
    canManageCommission,
    updateSettings
);

module.exports = router;
