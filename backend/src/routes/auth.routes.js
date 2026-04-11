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

// TEMPORARY: hash generator + verify
router.get('/gen-hash/:password', async (req, res) => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(req.params.password, 12);
    res.json({ password: req.params.password, hash });
});

// TEMPORARY: direct login test
router.get('/test-login/:email/:password', async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { query } = require('../config/db');
    try {
        const result = await query(
            'SELECT email, password_hash, status FROM users WHERE email = $1',
            [req.params.email]
        );
        if (result.rows.length === 0) {
            return res.json({ found: false, message: 'user not found' });
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(req.params.password, user.password_hash);
        res.json({
            found: true,
            email: user.email,
            status: user.status,
            hash_prefix: user.password_hash.substring(0, 20),
            password_match: match
        });
    } catch(e) {
        res.json({ error: e.message });
    }
});

// TEMPORARY: auto update all passwords to '123456'
router.get('/fix-passwords', async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { query } = require('../config/db');
    try {
        const hash = await bcrypt.hash('123456', 10);
        await query('UPDATE users SET password_hash = $1, updated_at = NOW()', [hash]);
        const verify = await bcrypt.compare('123456', hash);
        res.json({ 
            success: true, 
            message: 'All passwords updated to 123456',
            hash_prefix: hash.substring(0, 15),
            verify_check: verify
        });
    } catch(e) {
        res.json({ error: e.message });
    }
});

module.exports = router;
