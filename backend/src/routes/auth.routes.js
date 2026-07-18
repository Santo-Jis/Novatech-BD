const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');

const {
    login,
    refresh,
    logout,
    me,
    mySensitiveInfo,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPasswordWithOtp,
    saveFCMToken,
    checkEmailType,
    customerLogin
} = require('../controllers/auth.controller');

const { auth, DEFAULT_TENANT_ID } = require('../middlewares/auth');

// ============================================================
// ✅ বাগ ফিক্স: pre-login routes (login/forgot-password/etc.)-এ
// req.tenantId কখনোই সেট হতো না (auth middleware চলার আগেই এসব route
// hit হয়, আর tenantResolver mount করা নেই) — ফলে controller-এ
// `AND tenant_id = $2`-তে $2 = undefined যেত। এতদিন login query-তে
// OR/AND precedence bug থাকায় email/phone লগইন কাকতালীয়ভাবে কাজ
// করছিল (tenant filter কার্যত ignore হচ্ছিল, ঠিক আছে যেহেতু এখন
// একটাই tenant আছে) — কিন্তু employee_code লগইন ও forgot-password/
// verify-otp/reset-password/check-email/customer-login পুরোপুরি ভাঙা
// ছিল (tenant_id = NULL কখনো match করে না)।
//
// এই middleware শুধু req.tenantId খালি থাকলে DEFAULT_TENANT_ID বসায় —
// এখন যেহেতু সিস্টেমে একটাই tenant আছে, এটা সম্পূর্ণ নিরাপদ ও
// non-breaking। ভবিষ্যতে সত্যিকারের multi-tenant public routing
// (subdomain/X-Tenant-Slug) লাগলে এই জায়গাতেই tenantResolver বসানো
// যাবে।
const defaultTenant = (req, res, next) => {
    if (!req.tenantId) req.tenantId = DEFAULT_TENANT_ID;
    next();
};

// ============================================================
// RATE LIMITERS
// ============================================================

// OTP পাঠানো ও যাচাই — brute force এবং SMS/Email abuse রোধ
// ১৫ মিনিটে সর্বোচ্চ ৫টি request
const otpLimiter = rateLimit({
    windowMs:         15 * 60 * 1000,
    max:              5,
    standardHeaders:  true,
    legacyHeaders:    false,
    message: {
        success: false,
        message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।'
    }
});

// Login — credential stuffing রোধ
// ১৫ মিনিটে সর্বোচ্চ ১০টি request
const loginLimiter = rateLimit({
    windowMs:         15 * 60 * 1000,
    max:              10,
    standardHeaders:  true,
    legacyHeaders:    false,
    message: {
        success: false,
        message: 'অনেকবার লগইন চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।'
    }
});

// ============================================================
// AUTH ROUTES
// Base: /api/auth
// ============================================================

// POST /api/auth/login
// ৩ ভাবে লগইন: ইমেইল / ফোন / কর্মী কোড + পাসওয়ার্ড
// ✅ loginLimiter: ১৫ মিনিটে ১০টি — credential stuffing রোধ
router.post('/login', loginLimiter, defaultTenant, login);

// POST /api/auth/refresh
// Refresh Token দিয়ে নতুন Access Token নেওয়া
router.post('/refresh', refresh);

// POST /api/auth/logout
// টোকেন বাতিল করা
router.post('/logout', auth, logout);

// GET /api/auth/me
// বর্তমান লগইন করা ইউজারের তথ্য
router.get('/me', auth, me);

// GET /api/auth/my-sensitive-info
// basic_salary, outstanding_dues, manager_id, nid — localStorage-এ কখনো সেভ করবে না
router.get('/my-sensitive-info', auth, mySensitiveInfo);

// PUT /api/auth/change-password
// পাসওয়ার্ড পরিবর্তন
router.put('/change-password', auth, changePassword);

// POST /api/auth/forgot-password
// OTP পাঠাও
// ✅ otpLimiter: ১৫ মিনিটে ৫টি — email abuse এবং brute force রোধ
router.post('/forgot-password', otpLimiter, defaultTenant, forgotPassword);

// POST /api/auth/verify-otp
// OTP যাচাই
// ✅ otpLimiter: ১৫ মিনিটে ৫টি — OTP guessing attack রোধ
router.post('/verify-otp', otpLimiter, defaultTenant, verifyOtp);

// POST /api/auth/reset-password
// নতুন পাসওয়ার্ড সেট
// ✅ otpLimiter: reset token guessing রোধ
router.post('/reset-password', otpLimiter, defaultTenant, resetPasswordWithOtp);

// POST /api/auth/fcm-token
// FCM Push Token সেভ করা (login করা user)
router.post('/fcm-token', auth, saveFCMToken);

// POST /api/auth/check-email
// Google Login এর পর email দিয়ে কাস্টমার/কর্মী চেক
router.post('/check-email', defaultTenant, checkEmailType);

// POST /api/auth/customer-login
// কাস্টমার কোড + ফোন নম্বর দিয়ে কাস্টমার পোর্টালে লগইন
// customers টেবিলে password নেই — customer_code + phone দিয়ে verify
// ✅ loginLimiter: ১৫ মিনিটে ১০টি — brute force রোধ
router.post('/customer-login', loginLimiter, defaultTenant, customerLogin);

module.exports = router;
