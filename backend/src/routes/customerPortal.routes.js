// ============================================================
// CUSTOMER PORTAL ROUTES — Multi-Device Whitelist Edition
// Base: /api/portal
// ============================================================

const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const { getRedisClient } = require('../config/redis');

const {
    sendPortalLink,
    resolveLink,
    verifyPortalToken,
    deviceLogin,
    googleAuth,
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
    getPortalProductDetail,
    getOrderTracking,
    createReturnRequest,
    getMyReturnRequests,
} = require('../controllers/customerOrderRequest.controller');

const { auth }          = require('../middlewares/auth');
const { aiTokenBucket } = require('../middlewares/aiTokenBucket');
const { customerAiChat, getCustomerChatHistory } = require('../controllers/customerAiChat.controller');
const { query }         = require('../config/db');

// ============================================================
// PORTAL AUTH CACHE — Redis-backed, in-memory fallback
//
// key   → portal_auth:{customer_id}
// value → JSON { token_version, cachedAt }
// TTL   → 60 সেকেন্ড (Redis EX)
//
// Multi-instance safe: Redis থাকলে সব instance একই cache দেখে।
// Redis না থাকলে (REDIS_URL নেই) in-memory fallback — single
// instance-এ কাজ করে, redis.js-এর existing pattern অনুযায়ী।
// ============================================================
const PORTAL_CACHE_TTL_SEC = 60;
const PORTAL_CACHE_PREFIX  = 'portal_auth:';

const getCached = async (customerId) => {
    try {
        const client = await getRedisClient();
        const raw = await client.get(`${PORTAL_CACHE_PREFIX}${customerId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        console.error('portalAuth cache GET error:', err.message);
        return null; // cache miss — DB fallback চলবে
    }
};

// নতুন লিংক পাঠালে বা admin deactivate করলে বাতিল করুন
const invalidatePortalAuthCache = async (customerId) => {
    try {
        const client = await getRedisClient();
        await client.del(`${PORTAL_CACHE_PREFIX}${customerId}`);
    } catch (err) {
        console.error('portalAuth cache DEL error:', err.message);
        // DEL fail হলেও fatal নয় — পরের request DB থেকে নেবে
    }
};

// ── Portal JWT Middleware ────────────────────────────────────
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
        const decoded = jwt.verify(token, process.env.JWT_PORTAL_SECRET, {
            algorithms: ['HS256']
        });

        if (decoded.type !== 'customer_portal') {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }

        if (!decoded.customer_id) {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন — customer_id নেই।' });
        }

        const customerId = decoded.customer_id;
        const jwtVersion = decoded.token_version || 1;

        // Cache-first — hit হলে DB query নেই।
        // Redis থাকলে সব instance একই entry দেখে → multi-instance safe।
        let cached = await getCached(customerId);

        if (!cached) {
            try {
                const authCheck = await query(
                    `SELECT c.id, c.is_active, cpt.token_version AS current_version
                     FROM customers c
                     LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
                     WHERE c.id = $1`,
                    [customerId]
                );

                if (authCheck.rows.length === 0 || !authCheck.rows[0].is_active) {
                    return res.status(403).json({
                        success: false,
                        message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
                    });
                }

                const currentVersion = authCheck.rows[0].current_version || 1;
                cached = { token_version: currentVersion, cachedAt: Date.now() };

                // Redis-এ write — TTL দিয়ে auto-expire, সব instance দেখবে
                try {
                    const client = await getRedisClient();
                    await client.set(
                        `${PORTAL_CACHE_PREFIX}${customerId}`,
                        JSON.stringify(cached),
                        { EX: PORTAL_CACHE_TTL_SEC }
                    );
                } catch (cacheErr) {
                    console.error('portalAuth cache SET error:', cacheErr.message);
                    // write fail হলেও চলবে — next request আবার DB থেকে নেবে
                }

            } catch (dbErr) {
                console.error('❌ portalAuth DB check error:', dbErr.message);
                return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
            }
        }

        if (jwtVersion !== cached.token_version) {
            await invalidatePortalAuthCache(customerId);
            return res.status(401).json({
                success:    false,
                message:    'নতুন লিংক ইস্যু হয়েছে। পুনরায় লগইন করুন।',
                error_code: 'TOKEN_REVOKED',
            });
        }

        req.portalUser = decoded;
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'টোকেন মেয়াদোত্তীর্ণ। নতুন লিংক নিন।' });
    }
};

// ============================================================
// AUTH ROUTES (login flow)
// ============================================================

// SR বা System: WhatsApp লিংক পাঠাবে
// POST /api/portal/send-link/:customerId
router.post('/send-link/:customerId', auth, sendPortalLink);

// redirect_id → actual portal_token (POST body — URL-এ token নেই)
// POST /api/portal/resolve-link  { redirect_id }
router.post('/resolve-link', resolveLink);

// Pre-login check: token valid? device whitelisted? Google skip যাবে?
// GET /api/portal/verify-token?token=xxx&device_id=xxx
router.get('/verify-token', verifyPortalToken);

// Google OAuth → email lock + device whitelist-এ add
// POST /api/portal/google-auth  { google_token, link_token, device_id }
router.post('/google-auth', googleAuth);

// Whitelisted device-এ Google ছাড়া login
// POST /api/portal/device-login  { link_token, device_id }
router.post('/device-login', deviceLogin);

// ============================================================
// DEVICE MANAGEMENT ROUTES (Admin/SR)
// ============================================================

// কাস্টমারের সব whitelisted device দেখো
// GET /api/portal/devices/:customerId
router.get('/devices/:customerId', auth, listCustomerDevices);

// সব device revoke (কাস্টমারকে Google দিয়ে নতুন করে login করতে বাধ্য করো)
// DELETE /api/portal/devices/:customerId
router.delete('/devices/:customerId', auth, revokeAllDevices);

// নির্দিষ্ট একটি device revoke
// DELETE /api/portal/devices/:customerId/:deviceId
router.delete('/devices/:customerId/:deviceId', auth, revokeDevice);

// ============================================================
// CUSTOMER PORTAL DASHBOARD ROUTES
// ============================================================

// GET /api/portal/dashboard
router.get('/dashboard', portalAuth, getCustomerDashboard);

// GET /api/portal/invoices?page=1&limit=15&search=INV&payment_method=cash
router.get('/invoices', portalAuth, getCustomerInvoices);

// GET /api/portal/payment-history?page=1&type=cash&date_from=2025-01-01
router.get('/payment-history', portalAuth, getPaymentHistory);

// GET /api/portal/monthly-summary?months=6
// GET /api/portal/monthly-summary?year=2025&month=3
router.get('/monthly-summary', portalAuth, getMonthlySummary);

// GET /api/portal/credit-overview
router.get('/credit-overview', portalAuth, getCreditOverview);

// ============================================================
// OTHER PORTAL ROUTES
// ============================================================

// Credit reminder
router.post('/send-reminder/:customerId', auth, sendCreditReminder);

// FCM + Notifications
router.post('/save-fcm-token',              portalAuth, saveCustomerFCMToken);
router.get('/notifications',                portalAuth, getNotifications);
router.patch('/notifications/read-all',     portalAuth, markAllRead);
router.patch('/notifications/:id/read',     portalAuth, markOneRead);

// Products + Order Requests
router.get('/products',                     portalAuth, getPortalProducts);
router.get('/products/:id',                 portalAuth, getPortalProductDetail);
router.post('/order-request',               portalAuth, createOrderRequest);
router.get('/order-requests',               portalAuth, getMyOrderRequests);
router.patch('/order-requests/:id/cancel',  portalAuth, cancelMyOrderRequest);
router.get('/order-requests/:id/tracking',  portalAuth, getOrderTracking);

// Return Requests
router.post('/return-request',              portalAuth, createReturnRequest);
router.get('/return-requests',              portalAuth, getMyReturnRequests);

// Statement PDF Download
// GET /api/portal/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/statement', portalAuth, getCustomerStatement);

// Credit Limit Request
// POST /api/portal/credit-limit-request
// GET  /api/portal/credit-limit-request
router.post('/credit-limit-request', portalAuth, submitCreditLimitRequest);
router.get('/credit-limit-request',  portalAuth, getMyLimitRequests);

// Complaint / Feedback
// POST /api/portal/complaint
// GET  /api/portal/complaint
router.post('/complaint', portalAuth, submitComplaint);
router.get('/complaint',  portalAuth, getMyComplaints);

// AI Chat
router.post('/ai-chat',         portalAuth, aiTokenBucket, customerAiChat);
router.get('/ai-chat/history',  portalAuth, getCustomerChatHistory);

module.exports = router;
module.exports.invalidatePortalAuthCache = invalidatePortalAuthCache;
