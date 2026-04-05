const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    adjustStock,
    getStockMovements
} = require('../controllers/product.controller');

// ============================================================
// PRODUCT ROUTES
// Base: /api/products
// ============================================================

// পণ্য তালিকা (সব রোল দেখতে পারবে)
router.get('/',     auth, getProducts);

// একটি পণ্যের বিস্তারিত
router.get('/:id',  auth, getProduct);

// নতুন পণ্য তৈরি (Admin)
router.post('/',    auth, allowRoles('admin'), createProduct);

// পণ্য আপডেট (Admin)
router.put('/:id',  auth, allowRoles('admin'), updateProduct);

// স্টক ম্যানুয়াল এডজাস্ট (Admin)
router.post('/:id/adjust-stock',
    auth,
    allowRoles('admin'),
    adjustStock
);

// স্টক মুভমেন্ট ইতিহাস
router.get('/:id/movements',
    auth,
    allowRoles('admin', 'manager'),
    getStockMovements
);

module.exports = router;
