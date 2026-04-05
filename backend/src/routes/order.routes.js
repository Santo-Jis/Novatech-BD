const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    canApproveOrder
} = require('../middlewares/roleCheck');

const {
    createOrder,
    getMyOrders,
    getPendingOrders,
    approveOrder,
    rejectOrder,
    getTodayOrder
} = require('../controllers/order.controller');

// ============================================================
// ORDER ROUTES
// Base: /api/orders
// ============================================================

// আজকের অর্ডার (SR এর)
router.get('/today',    auth, allowRoles('worker'), getTodayOrder);

// SR এর অর্ডার তালিকা
router.get('/my',       auth, allowRoles('worker'), getMyOrders);

// পেন্ডিং অর্ডার (Manager/Admin)
router.get('/pending',  auth, canApproveOrder, getPendingOrders);

// নতুন অর্ডার (SR)
router.post('/',        auth, allowRoles('worker'), createOrder);

// অর্ডার অনুমোদন
router.put('/:id/approve', auth, canApproveOrder, approveOrder);

// অর্ডার রিজেক্ট
router.put('/:id/reject',  auth, canApproveOrder, rejectOrder);

module.exports = router;
