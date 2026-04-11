const express = require('express');
const router  = express.Router();

const {
    login,
    refresh,
    logout,
    me,
    changePassword
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

// TEMPORARY: hash generator — deploy করার পর remove করবেন
router.get('/gen-hash/:password', async (req, res) => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(req.params.password, 12);
    res.json({ password: req.params.password, hash });
});

module.exports = router;
