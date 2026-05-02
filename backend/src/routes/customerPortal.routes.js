// ============================================================
// CUSTOMER PORTAL ROUTES
// Base: /api/portal
// ============================================================

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');

const {
    sendPortalLink,
    verifyPortalToken,
    googleAuth,
    getCustomerDashboard
} = require('../controllers/customerPortal.controller');

const { sendCreditReminder } = require('../controllers/creditReminder.controller');
const {
    getNotifications,
    markAllRead,
    markOneRead,
    saveCustomerFCMToken,
} = require('../controllers/customerNotification.controller');

const { auth } = require('../middlewares/auth');

// ── Portal JWT Middleware (কাস্টমার ড্যাশবোর্ডের জন্য) ──────
const portalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'লগইন করুন।' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        if (decoded.type !== 'customer_portal') {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }
        req.portalUser = decoded;
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'টোকেন মেয়াদোত্তীর্ণ। নতুন লিংক নিন।' });
    }
};

// ── SR বা System: কাস্টমারকে WhatsApp লিংক পাঠাবে ──────────
// POST /api/portal/send-link/:customerId
router.post('/send-link/:customerId', auth, sendPortalLink);

// ── কাস্টমার লিংক খুললে টোকেন যাচাই ──────────────────────
// GET /api/portal/verify-token?token=xxx
router.get('/verify-token', verifyPortalToken);

// ── Google OAuth → কাস্টমার লগইন ──────────────────────────
// POST /api/portal/google-auth
router.post('/google-auth', googleAuth);

// ── কাস্টমার ড্যাশবোর্ড ডেটা ──────────────────────────────
// GET /api/portal/dashboard
router.get('/dashboard', portalAuth, getCustomerDashboard);

// ── SR ম্যানুয়ালি reminder পাঠাবে ──────────────────────────
// POST /api/portal/send-reminder/:customerId
router.post('/send-reminder/:customerId', auth, sendCreditReminder);

// ── Customer FCM Token (Web Push) ───────────────────────────
// POST /api/portal/save-fcm-token
router.post('/save-fcm-token', portalAuth, saveCustomerFCMToken);

// ── Customer In-App Notifications ───────────────────────────
// GET    /api/portal/notifications
router.get('/notifications', portalAuth, getNotifications);
// PATCH  /api/portal/notifications/read-all
router.patch('/notifications/read-all', portalAuth, markAllRead);
// PATCH  /api/portal/notifications/:id/read
router.patch('/notifications/:id/read', portalAuth, markOneRead);

module.exports = router;
