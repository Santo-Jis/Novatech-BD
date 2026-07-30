const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getPurchaseOrders,
    getPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    placeOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    deletePurchaseOrder
} = require('../controllers/purchaseOrder.controller');

// ============================================================
// PURCHASE ORDER ROUTES
// Base: /api/purchase-orders
// ============================================================

// তালিকা / বিস্তারিত (admin, manager, accountant দেখতে পারবে)
router.get('/',    auth, allowRoles('admin', 'manager', 'accountant'), getPurchaseOrders);
router.get('/:id', auth, allowRoles('admin', 'manager', 'accountant'), getPurchaseOrder);

// তৈরি / সম্পাদনা / লাইফসাইকেল অ্যাকশন (procurement সিদ্ধান্ত — admin, manager)
router.post('/',                auth, allowRoles('admin', 'manager'), createPurchaseOrder);
router.put('/:id',              auth, allowRoles('admin', 'manager'), updatePurchaseOrder);
router.post('/:id/place-order', auth, allowRoles('admin', 'manager'), placeOrder);
router.post('/:id/receive',     auth, allowRoles('admin', 'manager'), receivePurchaseOrder);
router.post('/:id/cancel',      auth, allowRoles('admin', 'manager'), cancelPurchaseOrder);
router.delete('/:id',           auth, allowRoles('admin', 'manager'), deletePurchaseOrder);

module.exports = router;
