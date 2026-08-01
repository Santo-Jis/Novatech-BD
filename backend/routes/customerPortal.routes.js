// ============================================================
// CUSTOMER PORTAL ROUTES — Secure Token Edition
// Base: /api/portal
// ============================================================

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const { RedisStore }     = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

// ============================================================
// FILE UPLOAD (সেলফ-রেজিস্ট্রেশনে প্রোফাইল ছবি ও দোকানের ছবি)
// ============================================================
const selfRegisterUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

const {
    sendPortalLink,
    selfRegisterCustomer,
    resolveLink,
    verifyPortalToken,
    deviceLogin,
    googleAuth,
    directGoogleAuth,
    refreshPortalToken,   // ✅ NEW
    logoutPortal,         // ✅ NEW
    listCustomerDevices,
    revokeDevice,
    revokeAllDevices,
    getCustomerDashboard,
    getCustomerInvoices,
    getPaymentHistory,
    getMonthlySummary,
    getCreditOverview,
    getCustomerStatement,
    submitCreditLimitRequest,
    getMyLimitRequests,
    submitComplaint,
    getMyComplaints,
} = require('../controllers/customerPortal.controller');

const { sendCreditReminder } = require('../controllers/creditReminder.controller');
const {
    getNotifications,
    markAllRead,
    markOneRead,
    saveCustomerFCMToken,
} = require('../controllers/customerNotification.controller');

const {
    createOrderRequest,
    getMyOrderRequests,
    cancelMyOrderRequest,
    getPortalProducts,
    getPortalCategories,
    getPortalProductDetail,
    getOrderTracking,
    createReturnRequest,
    getMyReturnRequests,
} = require('../controllers/customerOrderRequest.controller');

const { auth }          = require('../middlewares/auth');
const { aiTokenBucket } = require('../middlewares/aiTokenBucket');
const { customerAiChat, getCustomerChatHistory } = require('../controllers/customerAiChat.controller');

// ── Portal JWT Middleware ─────────────────────────────────────
// ⚠️ FIX: আগে এখানে একই লজিকের একটা আলাদা inline কপি ছিল, যেটাতে
// tenant suspend/cancel enforcement (SaaS Phase 1) মিস হয়ে গিয়েছিল —
// company suspend করলেও এই routes (dashboard/invoices/credit/ইত্যাদি)
// দিয়ে customer ডেটা অ্যাক্সেস করতে পারতো। এখন middlewares/portalAuthShared.js
// থেকে single, canonical কপি import করা হচ্ছে — দুই জায়গায় একই লজিক
// আলাদাভাবে maintain করলে ঠিক এভাবেই ভবিষ্যতেও drift হতে পারে।
const { portalAuth } = require('../middlewares/portalAuthShared');

// ============================================================
// RATE LIMITERS — Redis-backed, customer_id keyed
// IP-based নয় — প্রতিটি customer আলাদাভাবে track হয়।
// Redis unavailable হলে keyGenerator-এ req.ip fallback আছে।
// ============================================================

const makeRedisStore = () => new RedisStore({
    sendCommand: async (...args) => {
        const client = await getRedisClient();
        return client.sendCommand(args);
    }
});

// Complaint: ১৫ মিনিটে সর্বোচ্চ ৫টি
const complaintLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          5,
    keyGenerator: (req) => `complaint:${req.portalUser?.customer_id || req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেক বেশি অভিযোগ জমা হয়েছে। ১৫ মিনিট পর চেষ্টা করুন।' }
});

// Credit limit request: ১ ঘণ্টায় সর্বোচ্চ ৩টি
const creditLimiter = rateLimit({
    windowMs:     60 * 60 * 1000,
    max:          3,
    keyGenerator: (req) => `credit_req:${req.portalUser?.customer_id || req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেক বেশি আবেদন করা হয়েছে। ১ ঘণ্টা পর চেষ্টা করুন।' }
});

// সেলফ-রেজিস্ট্রেশন: ১ ঘণ্টায় প্রতি IP থেকে সর্বোচ্চ ৫টি (spam/bot ঠেকাতে)
const selfRegisterLimiter = rateLimit({
    windowMs:     60 * 60 * 1000,
    max:          5,
    keyGenerator: (req) => `self_register:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা করা হয়েছে। ১ ঘণ্টা পর আবার চেষ্টা করুন।' }
});

// ⚠️ FIX: portal login endpoints (/google-auth, /direct-auth, /device-login)-এ
// আগে কোনো rate limiter ছিল না, অথচ staff-side /login-এ ছিল। যদিও Google
// token verify করা লাগে (তাই সরাসরি password brute-force সম্ভব না), তারপরও
// এটা unbound customer_code/person_id-তে নিজের Gmail bind করার race,
// device-login link_token guessing, এবং Google API abuse-এর বিরুদ্ধে সুরক্ষা দেয়।
// ১৫ মিনিটে ১৫টি — staff login-এর চেয়ে একটু বেশি ছাড় (device switching/retry
// স্বাভাবিক কারণেও ঘন ঘন হতে পারে)।
const portalLoginLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          15,
    keyGenerator: (req) => `portal_login:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// ============================================================
// AUTH ROUTES
// ============================================================

router.post('/send-link/:customerId', auth, sendPortalLink);
router.post('/self-register', selfRegisterLimiter,
    selfRegisterUpload.fields([{ name: 'profile_photo', maxCount: 1 }, { name: 'shop_photo', maxCount: 1 }]),
    selfRegisterCustomer);
router.post('/resolve-link',  resolveLink);
router.get('/verify-token',   verifyPortalToken);
router.post('/google-auth',   portalLoginLimiter, googleAuth);
router.post('/direct-auth',   portalLoginLimiter, directGoogleAuth);
router.post('/device-login',  portalLoginLimiter, deviceLogin);

// ✅ NEW: HttpOnly cookie → নতুন 15-মিনিট access token
// Authorization header লাগে না — browser cookie automatically পাঠায়
router.post('/refresh', refreshPortalToken);

// ✅ NEW: HttpOnly refresh cookie মুছে দেয় (logout)
router.post('/logout', logoutPortal);

// ============================================================
// DEVICE MANAGEMENT ROUTES (Admin/SR)
// ============================================================

router.get('/devices/:customerId',              auth, listCustomerDevices);
router.delete('/devices/:customerId',           auth, revokeAllDevices);
router.delete('/devices/:customerId/:deviceId', auth, revokeDevice);

// ============================================================
// CUSTOMER PORTAL DASHBOARD ROUTES
// ============================================================

router.get('/dashboard',       portalAuth, getCustomerDashboard);
router.get('/invoices',        portalAuth, getCustomerInvoices);
router.get('/payment-history', portalAuth, getPaymentHistory);
router.get('/monthly-summary', portalAuth, getMonthlySummary);
router.get('/credit-overview', portalAuth, getCreditOverview);

// ============================================================
// OTHER PORTAL ROUTES
// ============================================================

router.post('/send-reminder/:customerId', auth, sendCreditReminder);

router.post('/save-fcm-token',             portalAuth, saveCustomerFCMToken);
router.get('/notifications',               portalAuth, getNotifications);
router.patch('/notifications/read-all',    portalAuth, markAllRead);
router.patch('/notifications/:id/read',    portalAuth, markOneRead);

router.get('/products',                    portalAuth, getPortalProducts);
router.get('/categories',                  portalAuth, getPortalCategories);
router.get('/products/:id',                portalAuth, getPortalProductDetail);
router.post('/order-request',              portalAuth, createOrderRequest);
router.get('/order-requests',              portalAuth, getMyOrderRequests);
router.patch('/order-requests/:id/cancel', portalAuth, cancelMyOrderRequest);
router.get('/order-requests/:id/tracking', portalAuth, getOrderTracking);

router.post('/return-request',             portalAuth, createReturnRequest);
router.get('/return-requests',             portalAuth, getMyReturnRequests);

router.get('/statement',                   portalAuth, getCustomerStatement);

router.post('/credit-limit-request',       portalAuth, creditLimiter,   submitCreditLimitRequest);
router.get('/credit-limit-request',        portalAuth, getMyLimitRequests);

router.post('/complaint',                  portalAuth, complaintLimiter, submitComplaint);
router.get('/complaint',                   portalAuth, getMyComplaints);

router.post('/ai-chat',        portalAuth, aiTokenBucket, customerAiChat);
router.get('/ai-chat/history', portalAuth, getCustomerChatHistory);

module.exports = router;
