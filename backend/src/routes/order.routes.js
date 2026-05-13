const express        = require('express');
const router         = express.Router();
const { auth }       = require('../middlewares/auth');
const {
    allowRoles,
    canApproveOrder
} = require('../middlewares/roleCheck');
const requireCheckin = require('../middlewares/requireCheckin'); // ✅ নতুন

const {
    createOrder,
    getMyOrders,
    getPendingOrders,
    approveOrder,
    rejectOrder,
    cancelOrder,
    getTodayOrder,
    getStockStatus,
} = require('../controllers/order.controller');

// ============================================================
// ORDER ROUTES
// Base: /api/orders
// ============================================================

// আজকের অর্ডার (SR এর)
router.get('/today',        auth, allowRoles('worker'), getTodayOrder);

// SR স্টক স্ট্যাটাস — অর্ডার vs বিক্রয় vs হাতে
router.get('/stock-status', auth, allowRoles('worker'), getStockStatus);

// SR এর অর্ডার তালিকা
router.get('/my',       auth, allowRoles('worker'), getMyOrders);

// পেন্ডিং অর্ডার (Manager/Admin)
router.get('/pending',  auth, canApproveOrder, getPendingOrders);

// নতুন অর্ডার (SR) — ✅ চেক-ইন বাধ্যতামূলক
router.post('/',        auth, allowRoles('worker'), requireCheckin, createOrder);

// অর্ডার অনুমোদন
router.put('/:id/approve', auth, canApproveOrder, approveOrder);

// অর্ডার রিজেক্ট
router.put('/:id/reject',  auth, canApproveOrder, rejectOrder);

// SR নিজে pending অর্ডার বাতিল করতে পারবে — slot ফেরত পাবে
router.put('/:id/cancel',  auth, allowRoles('worker'), cancelOrder);

module.exports = router;
