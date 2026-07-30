const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
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

const {
    downloadTemplate,
    previewImport,
    commitImport
} = require('../controllers/productImport.controller');

// ============================================================
// BULK CSV IMPORT — ফাইল আপলোড (মেমোরিতে, ডিস্কে সেভ হয় না)
// ============================================================
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 }, // ৫MB — কয়েক হাজার সারির জন্যও যথেষ্ট
    fileFilter: (req, file, cb) => {
        const isCsvExt = /\.csv$/i.test(file.originalname || '');
        if (!isCsvExt) {
            return cb(new Error('শুধু .csv ফাইল আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

// ============================================================
// PRODUCT ROUTES
// Base: /api/products
// ============================================================

// ⚠️ Import routes আগে — নাহলে '/:id' এগুলোকে match করে নিতে পারত
// (এখানে path depth আলাদা বলে বাস্তবে সংঘর্ষ নেই, তবু consistency-র জন্য উপরে রাখা হলো)

// CSV টেমপ্লেট ডাউনলোড (Admin)
router.get('/import/template', auth, allowRoles('admin'), downloadTemplate);

// CSV প্রিভিউ — validate করে, কিছু সেভ হয় না (Admin)
router.post('/import/preview', auth, allowRoles('admin'), csvUpload.single('file'), previewImport);

// CSV commit — আসল create/update (Admin)
router.post('/import/commit',  auth, allowRoles('admin'), commitImport);

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
