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
    getPublicCustomerByCode, // ✅ NEW: c= কোড দিয়ে shop_name/owner_name/shop_photo
    sendLoginOtp,            // ✅ NEW: WhatsApp OTP লগইন ধাপ ১
    verifyLoginOtp,          // ✅ NEW: WhatsApp OTP লগইন ধাপ ২
    selfRegisterCustomer,
    sendRegisterOtp,         // ✅ NEW: রেজিস্ট্রেশন WhatsApp OTP ধাপ ১
    verifyRegisterOtp,       // ✅ NEW: রেজিস্ট্রেশন WhatsApp OTP ধাপ ২
    passwordLogin,          // ✅ NEW: identifier + password লগইন
    portalForgotPassword,   // ✅ NEW: পাসওয়ার্ড OTP ধাপ ১ (email/WhatsApp)
    portalVerifyResetOtp,   // ✅ NEW: পাসওয়ার্ড OTP ধাপ ২
    portalResetPassword,    // ✅ NEW: পাসওয়ার্ড OTP ধাপ ৩
    verifyEmailToken,        // ✅ NEW: রেজিস্ট্রেশন ইমেইল magic-link ভেরিফাই
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
// ✅ getPortalActivePromotions ইতিমধ্যে আছে (Promotions Phase ৫) — শুধু
// calculatePortalPromotions যোগ করা হলো (ফেজ ০ — checkout discount calc)
const { getPortalActivePromotions, calculatePortalPromotions } = require('../controllers/promotion.controller'); // ← Promotions Phase ৫ + ✅ NEW (ফেজ ০)
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
    getTenantPaymentInfo,
    getProductSellers,
    getPortalProductDetail,
    getRelatedProducts,
    getOrderTracking,
    createReturnRequest,
    getMyReturnRequests,
} = require('../controllers/customerOrderRequest.controller');

// ✅ NEW (ফেজ ১ — কোম্পানির পোস্ট)
const { getPortalCompanyPosts } = require('../controllers/companyPost.controller');

// ✅ NEW (Phase 5 — কোড অডিট — কাস্টমার পোস্ট, HomeFeed.jsx-এর বাকি থাকা placeholder সম্পূর্ণ)
const { getNetworkFeed, createPost: createCustomerPost, deleteMyPost: deleteCustomerPost } = require('../controllers/customerPost.controller');

// ✅ NEW (ফেজ ৩ — উইশলিস্ট)
const { getWishlist, addToWishlist, removeFromWishlist } = require('../controllers/wishlist.controller');

// ✅ NEW (ফেজ ৪ — Path B ভিত্তি: ঠিকানা-বুক)
const { getAddresses, addAddress, updateAddress, deleteAddress } = require('../controllers/customerAddress.controller');

const { auth }          = require('../middlewares/auth');
const { aiTokenBucket } = require('../middlewares/aiTokenBucket');
const { customerAiChat, customerAiChatStream, getCustomerChatHistory } = require('../controllers/customerAiChat.controller');

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

// ⚠️ password login সরাসরি brute-force করা সম্ভব (Google token verify-এর
// মতো কোনো বাইরের বাধা নেই) — তাই portalLoginLimiter-এর চেয়ে কড়া:
// ১৫ মিনিটে IP প্রতি সর্বোচ্চ ৮ বার।
const passwordLoginLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          8,
    keyGenerator: (req) => `password_login:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// Password reset/OTP ধাপগুলো — ১৫ মিনিটে IP প্রতি সর্বোচ্চ ৫ বার
// (OTP guessing ও ইমেইল/WhatsApp স্প্যাম দুটোই ঠেকাতে)
const passwordResetLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          5,
    keyGenerator: (req) => `password_reset:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// c= কোড দিয়ে বেসিক তথ্য দেখা — read-only, কোনো OTP/মেসেজ পাঠায় না,
// তাই বাকিগুলোর চেয়ে ছাড় বেশি: ১৫ মিনিটে IP প্রতি সর্বোচ্চ ২০ বার
// (স্ক্র্যাপিং/enumeration নিরুৎসাহিত করতে যথেষ্ট, কিন্তু লিংকে বারবার
// ক্লিক করা স্বাভাবিক ইউজারকে আটকাবে না)
const customerInfoLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          20,
    keyGenerator: (req) => `customer_info:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// রেজিস্ট্রেশন WhatsApp OTP — প্ল্যাটফর্মের একটামাত্র Baileys সেশন থেকে
// পাঠানো হয় বলে স্প্যাম/abuse-এ পুরো নম্বরটাই ব্যান হওয়ার ঝুঁকি আছে —
// তাই কড়া লিমিট: ১৫ মিনিটে IP প্রতি সর্বোচ্চ ৫ বার।
const registerOtpLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          5,
    keyGenerator: (req) => `register_otp:${req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// WhatsApp OTP লগইন — registerOtpLimiter-এর মতো একই কারণে কড়া
// (প্ল্যাটফর্মের একটামাত্র Baileys সেশন, নম্বর ব্যান হওয়ার ঝুঁকি)।
// customer_code দিয়ে key করা হয়েছে (শুধু IP না) — যাতে ভিন্ন
// ভিন্ন IP থেকেও একই কাস্টমারের WhatsApp-এ বারবার OTP পাঠিয়ে
// স্প্যাম করা না যায়; body না থাকলে/পার্স-না-হলে IP fallback।
const loginOtpSendLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          5,
    keyGenerator: (req) => `login_otp_send:${req.body?.customer_code || req.ip}`,
    store:        makeRedisStore(),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' }
});

// Verify ধাপে guessing ঠেকাতে সামান্য বেশি ছাড় (৮) — সঠিক OTP টাইপ
// করতে গিয়ে স্বাভাবিক টাইপো/রিট্রাই হতে পারে, কিন্তু ব্রুট-ফোর্স করার
// মতো যথেষ্ট না (৬-ডিজিট, ১০ মিনিট মেয়াদ)
const loginOtpVerifyLimiter = rateLimit({
    windowMs:     15 * 60 * 1000,
    max:          8,
    keyGenerator: (req) => `login_otp_verify:${req.body?.customer_code || req.ip}`,
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

// ✅ NEW: SR-এর WhatsApp লিংকে (?c=customer_code) ক্লিক করলে "এটা কি
// আপনি?" কনফার্ম-স্ক্রিনের জন্য বেসিক তথ্য — নতুন OTP-লগইন ফ্লোর ধাপ ১
router.get('/customer-info/:code', customerInfoLimiter, getPublicCustomerByCode);

// ✅ NEW: WhatsApp OTP দিয়ে সরাসরি লগইন (password/Google ছাড়াই) — ধাপ ১+২
router.post('/send-login-otp',   loginOtpSendLimiter,   sendLoginOtp);
router.post('/verify-login-otp', loginOtpVerifyLimiter, verifyLoginOtp);

// ✅ NEW: রেজিস্ট্রেশনের আগে WhatsApp নম্বর OTP verification (বাধ্যতামূলক)
router.post('/send-register-otp',   registerOtpLimiter, sendRegisterOtp);
router.post('/verify-register-otp', registerOtpLimiter, verifyRegisterOtp);

router.post('/google-auth',   portalLoginLimiter, googleAuth);
router.post('/direct-auth',   portalLoginLimiter, directGoogleAuth);
router.post('/device-login',  portalLoginLimiter, deviceLogin);

// ✅ NEW: identifier (ইমেইল/মোবাইল) + password — Google-এর বিকল্প
router.post('/login',              passwordLoginLimiter, passwordLogin);
router.post('/forgot-password',    passwordResetLimiter, portalForgotPassword);
router.post('/verify-reset-otp',   passwordResetLimiter, portalVerifyResetOtp);
router.post('/reset-password',     passwordResetLimiter, portalResetPassword);

// ✅ NEW: রেজিস্ট্রেশনে দেওয়া ইমেইল ভেরিফাই (magic-link ক্লিকে ফ্রন্টএন্ড থেকে কল হয়)
router.post('/verify-email',       passwordResetLimiter, verifyEmailToken);

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
router.get('/products/:id',                portalAuth, getPortalProductDetail);
router.get('/products/:id/related',        portalAuth, getRelatedProducts); // ✅ NEW (ফেজ ২)
router.get('/categories',                  portalAuth, getPortalCategories); // ✅ FIX (ফেজ ০)
router.get('/payment-info',                portalAuth, getTenantPaymentInfo); // ✅ NEW (ফেজ ৪)
router.get('/product-sellers',             portalAuth, getProductSellers); // ✅ NEW (পার্ট ৩)
router.get('/promotions/active',           portalAuth, getPortalActivePromotions); // ← Promotions Phase ৫
router.post('/promotions/calculate',       portalAuth, calculatePortalPromotions); // ✅ NEW (ফেজ ০)
router.get('/company-posts',               portalAuth, getPortalCompanyPosts); // ✅ NEW (ফেজ ১)

// ✅ NEW (Phase 5 — কোড অডিট): কাস্টমার পোস্ট — HomeFeed.jsx-এর বাকি থাকা
// "কাস্টমার পোস্ট" placeholder সম্পূর্ণ করা। নেটওয়ার্ক-স্কোপড ভিজিবিলিটি
// (দেখুন customerPost.controller.js-এর getNetworkFeed কমেন্ট)।
router.get('/customer-posts',              portalAuth, getNetworkFeed);
router.post('/customer-posts',             portalAuth, createCustomerPost);
router.delete('/customer-posts/:id',       portalAuth, deleteCustomerPost);
router.get('/wishlist',                    portalAuth, getWishlist);          // ✅ NEW (ফেজ ৩)
router.post('/wishlist',                   portalAuth, addToWishlist);        // ✅ NEW (ফেজ ৩)
router.delete('/wishlist/:productId',      portalAuth, removeFromWishlist);   // ✅ NEW (ফেজ ৩)
router.get('/addresses',                   portalAuth, getAddresses);         // ✅ NEW (ফেজ ৪)
router.post('/addresses',                  portalAuth, addAddress);           // ✅ NEW (ফেজ ৪)
router.put('/addresses/:id',               portalAuth, updateAddress);        // ✅ NEW (ফেজ ৪)
router.delete('/addresses/:id',            portalAuth, deleteAddress);        // ✅ NEW (ফেজ ৪)
router.get('/promotions/active',           portalAuth, getPortalActivePromotions); // ← Promotions Phase ৫
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
router.post('/ai-chat/stream', portalAuth, aiTokenBucket, customerAiChatStream); // ✅ AI চ্যাট রি-ডিজাইন (স্ট্রিমিং) — নতুন, additive, /ai-chat অপরিবর্তিত
router.get('/ai-chat/history', portalAuth, getCustomerChatHistory);

module.exports = router;
