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
    deviceLogin,
    googleAuth,
    getCustomerDashboard,
    getCustomerInvoices
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
    getPortalProducts,
} = require('../controllers/customerOrderRequest.controller');

const { auth } = require('../middlewares/auth');
const { customerAiChat, getCustomerChatHistory } = require('../controllers/customerAiChat.controller');

// ── Portal JWT Middleware (কাস্টমার ড্যাশবোর্ডের জন্য) ──────
const portalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'লগইন করুন।' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_PORTAL_SECRET || process.env.JWT_ACCESS_SECRET);
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

// ── Google OAuth → কাস্টমার লগইন (প্রথমবার — device lock হয়) ─
// POST /api/portal/google-auth
router.post('/google-auth', googleAuth);

// ── Device Re-login (Google ছাড়া, fingerprint দিয়ে) ─────────
// POST /api/portal/device-login
router.post('/device-login', deviceLogin);

// ── কাস্টমার ড্যাশবোর্ড ডেটা ──────────────────────────────
// GET /api/portal/dashboard
router.get('/dashboard', portalAuth, getCustomerDashboard);

// ── কাস্টমারের Paginated Invoice List ──────────────────────
// GET /api/portal/invoices?page=1&limit=15
router.get('/invoices', portalAuth, getCustomerInvoices);

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

// ── Customer Order Request (নতুন) ───────────────────────────
// GET  /api/portal/products
router.get('/products', portalAuth, getPortalProducts);
// POST /api/portal/order-request
router.post('/order-request', portalAuth, createOrderRequest);
// GET  /api/portal/order-requests
router.get('/order-requests', portalAuth, getMyOrderRequests);

// ── Customer AI Chat ─────────────────────────────────────────
// POST /api/portal/ai-chat        — AI-এর সাথে কথা বলো
// GET  /api/portal/ai-chat/history — পুরনো chat দেখো
router.post('/ai-chat',         portalAuth, customerAiChat);
router.get('/ai-chat/history',  portalAuth, getCustomerChatHistory);

module.exports = router;

// ── Customer AI Chat ─────────────────────────────────────────
// POST /api/portal/ai-chat
// GET  /api/portal/ai-chat/history
