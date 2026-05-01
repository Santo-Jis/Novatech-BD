const express = require('express');
const router  = express.Router();

const {
    login,
    refresh,
    logout,
    me,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPasswordWithOtp,
    saveFCMToken
} = require('../controllers/auth.controller');

const { auth } = require('../middlewares/auth');

// ============================================================
// AUTH ROUTES
// Base: /api/auth
// ============================================================

// POST /api/auth/login
// ৩ ভাবে লগইন: ইমেইল / ফোন / কর্মী কোড + পাসওয়ার্ড
router.post('/login', login);

// POST /api/auth/refresh
// Refresh Token দিয়ে নতুন Access Token নেওয়া
router.post('/refresh', refresh);

// POST /api/auth/logout
// টোকেন বাতিল করা
router.post('/logout', auth, logout);

// GET /api/auth/me
// বর্তমান লগইন করা ইউজারের তথ্য
router.get('/me', auth, me);

// PUT /api/auth/change-password
// পাসওয়ার্ড পরিবর্তন
router.put('/change-password', auth, changePassword);

// POST /api/auth/forgot-password
// OTP পাঠাও
router.post('/forgot-password', forgotPassword);

// POST /api/auth/verify-otp
// OTP যাচাই
router.post('/verify-otp', verifyOtp);

// POST /api/auth/reset-password
// নতুন পাসওয়ার্ড সেট
router.post('/reset-password', resetPasswordWithOtp);

// POST /api/auth/fcm-token
// FCM Push Token সেভ করা (login করা user)
router.post('/fcm-token', auth, saveFCMToken);

module.exports = router;
