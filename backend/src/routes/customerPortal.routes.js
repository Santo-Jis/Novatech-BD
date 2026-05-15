// ============================================================
// CUSTOMER PORTAL ROUTES
// Base: /api/portal
// ============================================================

const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');

const {
    sendPortalLink,
    resolveLink,
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
    cancelMyOrderRequest,
    getPortalProducts,
} = require('../controllers/customerOrderRequest.controller');

const { auth } = require('../middlewares/auth');
const { customerAiChat, getCustomerChatHistory } = require('../controllers/customerAiChat.controller');
const { query } = require('../config/db');

// ============================================================
// PER-CUSTOMER AI CHAT RATE LIMITER
//
// সমস্যা ১: global apiLimiter (১৫ মিনিটে ৩০০) শুধু সব request গণে।
//            একজন কাস্টমার burst করলে সবার AI budget শেষ হয়।
// সমস্যা ২: AI call প্রতিটি দুটি LLM pass করে (intent + final) —
//            cost সাধারণ endpoint-এর চেয়ে ~১০x বেশি।
//
// সমাধান:  ai-chat route-এ আলাদা, কড়া limiter।
//   • ১ মিনিটে সর্বোচ্চ ৫টি AI request (burst রোধ)
//   • Key: customer_id (JWT থেকে) — IP নয়, shared WiFi-তেও আলাদা count
//   • portalAuth middleware-এর পরে চলে তাই req.portalUser নিশ্চিত
// ============================================================
const customerAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,   // ১ মিনিট window
    max: 5,                      // ১ মিনিটে ৫টি AI request
    keyGenerator: (req) => {
        // portalAuth-এর পরে চলে — customer_id সবসময় থাকবে
        return `ai_cust_${req.portalUser.customer_id}`;
    },
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: 'একটু থামুন! প্রতি মিনিটে সর্বোচ্চ ৫টি AI প্রশ্ন করা যাবে। ১ মিনিট পরে আবার চেষ্টা করুন।',
        error_code: 'AI_RATE_LIMIT'
    }
});

// ── Portal JWT Middleware (কাস্টমার ড্যাশবোর্ডের জন্য) ──────
const portalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'লগইন করুন।' });
    }

    if (!process.env.JWT_PORTAL_SECRET) {
        return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
    }

    const token = authHeader.split(' ')[1];
    try {
        // শুধুমাত্র JWT_PORTAL_SECRET দিয়ে verify — JWT_ACCESS_SECRET fallback নেই।
        // algorithms সুনির্দিষ্ট করা — 'none' algorithm attack বন্ধ।
        const decoded = jwt.verify(token, process.env.JWT_PORTAL_SECRET, {
            algorithms: ['HS256']
        });

        if (decoded.type !== 'customer_portal') {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }

        if (!decoded.customer_id) {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন — customer_id নেই।' });
        }

        // ── DB-তে customer active আছে কিনা verify ────────────
        // JWT valid হলেও deactivated customer block হবে।
        try {
            const custCheck = await query(
                'SELECT id FROM customers WHERE id = $1 AND is_active = true',
                [decoded.customer_id]
            );
            if (custCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।'
                });
            }
        } catch (dbErr) {
            console.error('❌ portalAuth DB check error:', dbErr.message);
            return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
        }

        // ✅ Fix 1: একটি JOIN query-তে customer active চেক + token_version মেলানো।
        // নতুন লিংক পাঠালে sendPortalLink token_version বাড়ায়।
        // পুরনো JWT-এ আগের version → এখানে reject → 30-দিনের JWT তাৎক্ষণিক বাতিল।
        try {
            const authCheck = await query(
                `SELECT c.id, cpt.token_version AS current_version
                 FROM customers c
                 LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
                 WHERE c.id = $1 AND c.is_active = true`,
                [decoded.customer_id]
            );

            if (authCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।'
                });
            }

            const currentVersion = authCheck.rows[0].current_version || 1;
            const jwtVersion     = decoded.token_version || 1;

            if (jwtVersion !== currentVersion) {
                return res.status(401).json({
                    success: false,
                    message: 'নতুন লিংক ইস্যু হয়েছে। পুনরায় লগইন করুন।',
                    error_code: 'TOKEN_REVOKED'
                });
            }
        } catch (dbErr) {
            console.error('❌ portalAuth DB check error:', dbErr.message);
            return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
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

// ── Fix 1: redirect_id → actual portal_token (POST body) ────
// POST /api/portal/resolve-link  { redirect_id }
// URL-এ token নেই — WhatsApp preview / server log / history safe
router.post('/resolve-link', resolveLink);

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
// PATCH /api/portal/order-requests/:id/cancel — কাস্টমার pending অর্ডার বাতিল করবে
router.patch('/order-requests/:id/cancel', portalAuth, cancelMyOrderRequest);

// ── Customer AI Chat ─────────────────────────────────────────
// POST /api/portal/ai-chat        — AI-এর সাথে কথা বলো
// GET  /api/portal/ai-chat/history — পুরনো chat দেখো
router.post('/ai-chat',         portalAuth, customerAiLimiter, customerAiChat);
router.get('/ai-chat/history',  portalAuth, getCustomerChatHistory);

module.exports = router;

// ── Customer AI Chat ─────────────────────────────────────────
// POST /api/portal/ai-chat
// GET  /api/portal/ai-chat/history
