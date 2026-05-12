// ============================================================
// CUSTOMER ORDER REQUEST ROUTES (Admin/Manager Side)
// Base: /api/customer-order-requests
//
// Admin ও Manager কাস্টমারের অর্ডার রিকোয়েস্ট দেখবে ও আপডেট করবে
// ============================================================

const express           = require('express');
const router            = express.Router();
const { auth }          = require('../middlewares/auth');
const { canApproveOrder } = require('../middlewares/roleCheck');

const {
    getAllOrderRequests,
    updateOrderRequest,
    notifyAdminStockWarning,
} = require('../controllers/customerOrderRequest.controller');

// ── সব অর্ডার রিকোয়েস্ট দেখো (pending/confirmed/all ফিল্টার সহ) ──
// GET /api/customer-order-requests?status=pending&limit=50&offset=0
router.get('/', auth, canApproveOrder, getAllOrderRequests);

// ── একটি রিকোয়েস্ট আপডেট করো (SR অ্যাসাইন / কনফার্ম / বাতিল) ──
// PATCH /api/customer-order-requests/:id
router.patch('/:id', auth, canApproveOrder, updateOrderRequest);

// ── স্টক সংকট → Admin কে notify করো ──
// POST /api/customer-order-requests/:id/stock-warning
router.post('/:id/stock-warning', auth, canApproveOrder, notifyAdminStockWarning);

module.exports = router;
