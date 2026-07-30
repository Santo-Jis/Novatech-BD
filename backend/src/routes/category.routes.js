const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/category.controller');

// ============================================================
// CATEGORY ROUTES
// Base: /api/categories
// ============================================================

// ক্যাটাগরি তালিকা (সব রোল দেখতে পারবে — প্রডাক্ট ফিল্টার/ফর্মে দরকার)
router.get('/',    auth, getCategories);

// নতুন ক্যাটাগরি তৈরি (Admin)
router.post('/',   auth, allowRoles('admin'), createCategory);

// ক্যাটাগরি আপডেট (Admin)
router.put('/:id', auth, allowRoles('admin'), updateCategory);

// ক্যাটাগরি ডিলিট (Admin)
router.delete('/:id', auth, allowRoles('admin'), deleteCategory);

module.exports = router;
