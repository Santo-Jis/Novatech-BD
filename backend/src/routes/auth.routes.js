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
    checkEmailType
} = require('../controllers/auth.controller');

const { auth } = require('../middlewares/auth');

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
router.post('/login', loginLimiter, login);

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
router.post('/forgot-password', otpLimiter, forgotPassword);

// POST /api/auth/verify-otp
// OTP যাচাই
// ✅ otpLimiter: ১৫ মিনিটে ৫টি — OTP guessing attack রোধ
router.post('/verify-otp', otpLimiter, verifyOtp);

// POST /api/auth/reset-password
// নতুন পাসওয়ার্ড সেট
// ✅ otpLimiter: reset token guessing রোধ
router.post('/reset-password', otpLimiter, resetPasswordWithOtp);

// POST /api/auth/fcm-token
// FCM Push Token সেভ করা (login করা user)
router.post('/fcm-token', auth, saveFCMToken);

// POST /api/auth/check-email
// Google Login এর পর email দিয়ে কাস্টমার/কর্মী চেক
router.post('/check-email', checkEmailType);

module.exports = router;
