const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles, checkTeamAccess } = require('../middlewares/roleCheck');

const {
    createVisit,
    createSale,
    sendInvoice,
    verifyOTP,
    getMySales,
    getTeamSales,
    getTodaySummary,
    getSaleDetail
} = require('../controllers/sales.controller');

// ============================================================
// SALES ROUTES
// Base: /api/sales
// ============================================================

// দোকান ভিজিট রেকর্ড
router.post('/visit',   auth, allowRoles('worker'), createVisit);

// বিক্রয় তৈরি
router.post('/',        auth, allowRoles('worker'), createSale);

// Invoice পাঠানো (WhatsApp/SMS)
router.post('/invoice/send',  auth, allowRoles('worker'), sendInvoice);

// OTP যাচাই
router.post('/verify-otp',    auth, allowRoles('worker'), verifyOTP);

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

// একটি বিক্রয়ের বিস্তারিত
router.get('/:id',      auth, getSaleDetail);

module.exports = router;
