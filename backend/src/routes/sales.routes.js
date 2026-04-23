const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles, checkTeamAccess } = require('../middlewares/roleCheck');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const {
    createVisit,
    createSale,
    sendInvoice,
    verifyOTP,
    skipOTPWithPhoto,
    getMySales,
    getTeamSales,
    getTodaySummary,
    getSaleDetail,
    getMyMonthlySales,
    getMyVisitStats,
    getVisitStatus
} = require('../controllers/sales.controller');

// ============================================================
// SALES ROUTES
// Base: /api/sales
// ============================================================

// দোকান ভিজিট রেকর্ড (বন্ধ দোকানের ছবি optional)
router.post('/visit',
    auth,
    allowRoles('worker'),
    upload.single('closed_shop_photo'),
    createVisit
);

// বিক্রয় তৈরি
router.post('/',        auth, allowRoles('worker'), createSale);

// Invoice পাঠানো (WhatsApp/SMS)
router.post('/invoice/send',  auth, allowRoles('worker'), sendInvoice);

// OTP যাচাই
router.post('/verify-otp',    auth, allowRoles('worker'), verifyOTP);

// OTP skip — মেমো ছবি আপলোড বাধ্যতামূলক
router.post('/skip-otp',
    auth,
    allowRoles('worker'),
    upload.single('memo_photo'),
    skipOTPWithPhoto
);

// SR এর নিজের বিক্রয়
router.get('/my',       auth, allowRoles('worker'), getMySales);

// আজকের সারসংক্ষেপ (SR ড্যাশবোর্ড)
router.get('/today-summary',  auth, getTodaySummary);

// টিমের বিক্রয় (Manager/Admin)
router.get('/team',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getTeamSales
);

// SR-এর মাসিক দৈনিক বিক্রয় সারসংক্ষেপ
router.get('/my-monthly',     auth, allowRoles('worker'), getMyMonthlySales);

// SR-এর মাসিক ভিজিট স্ট্যাটস
router.get('/my-visit-stats', auth, allowRoles('worker'), getMyVisitStats);

// আজকে এই কাস্টমারে ভিজিট হয়েছে কিনা চেক
router.get('/visit-status/:customerId', auth, allowRoles('worker'), getVisitStatus);

// একটি বিক্রয়ের বিস্তারিত
router.get('/:id',      auth, getSaleDetail);

module.exports = router;
