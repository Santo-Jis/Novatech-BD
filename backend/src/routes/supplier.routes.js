const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const { auth }    = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/supplier.controller');
const { paySupplier, getSupplierPayments }                                           = require('../controllers/supplierPayment.controller');
const { getSupplierProducts, upsertSupplierProduct, deleteSupplierProduct }          = require('../controllers/supplierProduct.controller');
const { getSupplierPerformance }                                                     = require('../controllers/supplierPerformance.controller');
const { downloadTemplate, previewImport, commitImport }                              = require('../controllers/supplierImport.controller');

// CSV upload — product.routes.js-এর মতোই memory storage, 5MB limit
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!/\.csv$/i.test(file.originalname || '')) return cb(new Error('শুধু .csv ফাইল আপলোড করা যাবে।'));
        cb(null, true);
    }
});

// ⚠️ Import routes আগে — '/:id' এগুলোকে match না করে নেয়
router.get('/import/template', auth, allowRoles('admin'), downloadTemplate);
router.post('/import/preview', auth, allowRoles('admin'), csvUpload.single('file'), previewImport);
router.post('/import/commit',  auth, allowRoles('admin'), commitImport);

router.get('/',    auth, allowRoles('admin', 'manager', 'accountant'), getSuppliers);
router.get('/:id', auth, allowRoles('admin', 'manager', 'accountant'), getSupplier);
router.post('/',   auth, allowRoles('admin', 'manager'), createSupplier);
router.put('/:id', auth, allowRoles('admin', 'manager'), updateSupplier);
router.delete('/:id', auth, allowRoles('admin', 'manager'), deleteSupplier);

router.post('/:id/pay',     auth, allowRoles('admin', 'manager', 'accountant'), paySupplier);
router.get('/:id/payments', auth, allowRoles('admin', 'manager', 'accountant'), getSupplierPayments);

router.get('/:id/products',               auth, allowRoles('admin', 'manager', 'accountant'), getSupplierProducts);
router.post('/:id/products',              auth, allowRoles('admin', 'manager'), upsertSupplierProduct);
router.delete('/:id/products/:productId', auth, allowRoles('admin', 'manager'), deleteSupplierProduct);

router.get('/:id/performance', auth, allowRoles('admin', 'manager', 'accountant'), getSupplierPerformance);

module.exports = router;
