const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    canCreateCustomer,
    checkTeamAccess
} = require('../middlewares/roleCheck');

const {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    getCustomerHistory,
    setCreditLimit,
    collectCredit,
    getMyCustomerCount,
    requestCustomerEdit,
    getPendingCustomerEdits,
    approveCustomerEdit,
    rejectCustomerEdit
} = require('../controllers/customer.controller');

// ============================================================
// FILE UPLOAD (দোকানের ছবির জন্য)
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

// ============================================================
// CUSTOMER ROUTES
// Base: /api/customers
// ============================================================

// কাস্টমার তালিকা (দূরত্ব সহ)
router.get('/',          auth, checkTeamAccess, getCustomers);

// Worker এর মোট কাস্টমার সংখ্যা
router.get('/my-count',  auth, getMyCustomerCount,
    requestCustomerEdit,
    getPendingCustomerEdits,
    approveCustomerEdit,
    rejectCustomerEdit);

// নতুন কাস্টমার তৈরি
router.post('/',    auth, canCreateCustomer, upload.single('shop_photo'), createCustomer);

// একজনের বিস্তারিত
router.get('/:id',  auth, getCustomer);

// কাস্টমার এডিট
router.put('/:id',  auth, upload.single('shop_photo'), updateCustomer);

// কাস্টমারের ক্রয় ইতিহাস, বাকি, রিপ্লেসমেন্ট
router.get('/:id/history', auth, getCustomerHistory);

// ক্রেডিট লিমিট সেট (Admin/Manager)
router.put('/:id/credit-limit',
    auth,
    allowRoles('admin', 'manager'),
    setCreditLimit
);

// বাকি আদায়
router.post('/:id/collect-credit',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'worker'),
    collectCredit
);

module.exports = router;

router.post('/:id/edit-request', auth, requestCustomerEdit);
router.get('/edit-requests/pending', auth, allowRoles('admin', 'manager'), getPendingCustomerEdits);
router.put('/edit-requests/:requestId/approve', auth, allowRoles('admin', 'manager'), approveCustomerEdit);
router.put('/edit-requests/:requestId/reject', auth, allowRoles('admin', 'manager'), rejectCustomerEdit);
