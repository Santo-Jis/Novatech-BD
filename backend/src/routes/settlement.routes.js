const express         = require('express');
const router          = express.Router();
const { auth }        = require('../middlewares/auth');
const {
    allowRoles,
    canApproveSettlement,
    checkTeamAccess
} = require('../middlewares/roleCheck');
const requireCheckin  = require('../middlewares/requireCheckin'); // ✅ নতুন — F2: checkin ছাড়া settlement submit বন্ধ

const {
    createSettlement,
    getMySettlements,
    getMyStatement,
    getPendingSettlements,
    approveSettlement,
    disputeSettlement,
    payShortage,
    getAllSettlements,
    getSettlementDetail,
    getTodayPreview
} = require('../controllers/settlement.controller');

// ============================================================
// SETTLEMENT ROUTES
// Base: /api/settlements
// ============================================================

// SR হিসাব জমা দেবে
// ✅ requireCheckin: চেক-ইন না করলে সেটেলমেন্ট জমা দেওয়া যাবে না (view/GET রুটগুলো অপরিবর্তিত — checkin ছাড়াও দেখা যাবে)
router.post('/',
    auth,
    allowRoles('worker'),
    requireCheckin,
    createSettlement
);

// SR এর নিজের হিসাব
router.get('/my',
    auth,
    allowRoles('worker'),
    getMySettlements
);

// SR এর মাসিক statement (কয়েক মাস একসাথে)
// ?from_month=1&from_year=2026&to_month=6&to_year=2026
router.get('/my/statement',
    auth,
    allowRoles('worker'),
    getMyStatement
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

// আজকের preview (product-wise sold qty) — /:id এর আগে রাখতে হবে
router.get('/today-preview',
    auth,
    allowRoles('worker'),
    getTodayPreview
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
