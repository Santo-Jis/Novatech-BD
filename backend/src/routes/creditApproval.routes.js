const express = require('express');
const router  = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getSettings,
    updateSettings,
    requestApproval,
    getPendingApprovals,
    approveRequest,
    rejectRequest,
    checkApprovalStatus,
    getDueLeaderboard,
    getApprovalHistory
} = require('../controllers/creditApproval.controller');

// ============================================================
// CREDIT APPROVAL ROUTES
// Base: /api/credit-approvals
// ============================================================

// ── Settings (Admin only) ─────────────────────────────────
router.get('/settings',
    auth,
    allowRoles('admin', 'manager'),
    getSettings
);

router.put('/settings',
    auth,
    allowRoles('admin'),
    updateSettings
);

// ── SR: approval request পাঠানো ──────────────────────────
router.post('/request',
    auth,
    allowRoles('worker', 'supervisor'),
    requestApproval
);

// ── SR: নিজের request-এর status চেক ─────────────────────
router.get('/check/:customerId',
    auth,
    checkApprovalStatus
);

// ── Manager/Admin: pending approvals ─────────────────────
router.get('/pending',
    auth,
    allowRoles('admin', 'manager', 'supervisor'),
    getPendingApprovals
);

// ── Manager/Admin: approve / reject ──────────────────────
router.put('/:id/approve',
    auth,
    allowRoles('admin', 'manager', 'supervisor'),
    approveRequest
);

router.put('/:id/reject',
    auth,
    allowRoles('admin', 'manager', 'supervisor'),
    rejectRequest
);

// ── Manager/Admin: due leaderboard ────────────────────────
router.get('/due-leaderboard',
    auth,
    allowRoles('admin', 'manager', 'supervisor'),
    getDueLeaderboard
);

// ── Manager/Admin: approval history ──────────────────────
router.get('/history',
    auth,
    allowRoles('admin', 'manager', 'supervisor'),
    getApprovalHistory
);

module.exports = router;
