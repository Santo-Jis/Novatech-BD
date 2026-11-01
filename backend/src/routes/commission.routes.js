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
    getCommissionSummary,
    payCommission,
    getPayableCommissions,
    getLiveCommission,
    getWorkerRates,
    setWorkerRate,
    getProductRates,
    setProductRates,
    getMyDayBreakdown
} = require('../controllers/commission.controller');

// ============================================================
// COMMISSION ROUTES
// Base: /api/commission
// ============================================================

// SR এর নিজের কমিশন
router.get('/my',           auth, getMyCommission);

// ✅ কোন বিক্রি/আদায় থেকে কত কমিশন — একটা দিনের ব্রেকডাউন (শুধু SR নিজের)
router.get('/my/day/:date', auth, allowRoles('worker'), getMyDayBreakdown);

// ✅ আজকের live commission — প্রতিটি sale-এর পরে আপডেট হয়
// SR app-এ real-time badge দেখানোর জন্য
router.get('/live',         auth, allowRoles('worker'), getLiveCommission);

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

// সব worker এর পরিশোধযোগ্য কমিশন (Admin/Accountant)
router.get('/payable',
    auth,
    allowRoles('admin', 'accountant'),
    getPayableCommissions
);

// কমিশন পরিশোধ করো (Admin/Accountant)
router.post('/pay',
    auth,
    allowRoles('admin', 'accountant'),
    payCommission
);

// ✅ SR ভিত্তিক আলাদা কমিশন রেট
// দেখা: Admin/Accountant — বদলানো: শুধু Admin
router.get('/worker-rates',
    auth,
    allowRoles('admin', 'accountant'),
    getWorkerRates
);

router.put('/worker-rates/:userId',
    auth,
    canManageCommission,
    setWorkerRate
);

// ✅ SR × প্রডাক্ট ভিত্তিক কমিশন রেট
// দেখা: Admin/Accountant — বদলানো: শুধু Admin
router.get('/product-rates',
    auth,
    allowRoles('admin', 'accountant'),
    getProductRates
);

router.put('/product-rates/:workerId',
    auth,
    canManageCommission,
    setProductRates
);

module.exports = router;
