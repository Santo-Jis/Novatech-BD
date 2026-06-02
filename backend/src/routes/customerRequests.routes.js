// ============================================================
// customerRequests.routes.js
// Admin & Manager — Credit Limit Requests ও Complaints
// Base: /api/customer-requests
// ============================================================
const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getCreditLimitRequests,
    resolveCreditLimitRequest,
    getComplaints,
    resolveComplaint,
} = require('../controllers/customerRequests.controller');

const canManage = allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm');

// ── Credit Limit Requests ──────────────────────────────────
// GET  /api/customer-requests/credit-limit?status=pending
router.get('/credit-limit',     auth, canManage, getCreditLimitRequests);
// PATCH /api/customer-requests/credit-limit/:id
router.patch('/credit-limit/:id', auth, canManage, resolveCreditLimitRequest);

// ── Complaints / Feedback ──────────────────────────────────
// GET  /api/customer-requests/complaints?status=open&type=complaint
router.get('/complaints',         auth, canManage, getComplaints);
// PATCH /api/customer-requests/complaints/:id
router.patch('/complaints/:id',   auth, canManage, resolveComplaint);

module.exports = router;
