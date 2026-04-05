const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    canApproveSettlement,
    checkTeamAccess
} = require('../middlewares/roleCheck');

const {
    createSettlement,
    getMySettlements,
    getPendingSettlements,
    approveSettlement,
    disputeSettlement,
    payShortage,
    getAllSettlements,
    getSettlementDetail
} = require('../controllers/settlement.controller');

// ============================================================
// SETTLEMENT ROUTES
// Base: /api/settlements
// ============================================================

// SR হিসাব জমা দেবে
router.post('/',
    auth,
    allowRoles('worker'),
    createSettlement
);

// SR এর নিজের হিসাব
router.get('/my',
    auth,
    allowRoles('worker'),
    getMySettlements
);

// Manager এর pending তালিকা
router.get('/pending',
    auth,
    canApproveSettlement,
    getPendingSettlements
);

// Admin সব দেখবে
router.get('/all',
    auth,
    allowRoles('admin', 'accountant'),
    getAllSettlements
);

// একটি settlement এর বিস্তারিত
router.get('/:id',
    auth,
    getSettlementDetail
);

// Manager অনুমোদন
router.put('/:id/approve',
    auth,
    canApproveSettlement,
    approveSettlement
);

// ঘাটতি চিহ্নিত
router.put('/:id/dispute',
    auth,
    canApproveSettlement,
    disputeSettlement
);

// ঘাটতি পরিশোধ
router.post('/:id/pay-shortage',
    auth,
    allowRoles('admin', 'manager'),
    payShortage
);

module.exports = router;
