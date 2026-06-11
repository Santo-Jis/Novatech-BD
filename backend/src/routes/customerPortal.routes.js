// ============================================================
// CUSTOMER PORTAL ROUTES — Secure Token Edition
// Base: /api/portal
// ============================================================

const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { RedisStore }     = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');
const logger             = require('../config/logger');
const { getCached, setCache, invalidatePortalAuthCache } = require('../services/portalCache.service');

const {
    sendPortalLink,
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

// ── Portal JWT Middleware ─────────────────────────────────────
// ✅ শুধু short-lived access token (type: 'customer_portal') গ্রহণ করে।
//    Refresh token (type: 'customer_portal_refresh') এখানে reject হবে।
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

        // refresh token দিয়ে portal route access করা যাবে না
        if (decoded.type !== 'customer_portal') {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }

        if (!decoded.customer_id) {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন — customer_id নেই।' });
        }

        const customerId = decoded.customer_id;
        const jwtVersion = decoded.token_version || 1;

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
                await setCache(customerId, cached);

            } catch (dbErr) {
                logger.error('❌ portalAuth DB check error:', dbErr.message);
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

    } catch (err) {
        // ✅ TokenExpiredError আলাদাভাবে ধরা — frontend auto-refresh করবে
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success:    false,
                message:    'Token মেয়াদোত্তীর্ণ।',
                error_code: 'TOKEN_EXPIRED',
            });
        }
        return res.status(401).json({ success: false, message: 'অবৈধ টোকেন।' });
    }
};

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

// ============================================================
// AUTH ROUTES
// ============================================================

router.post('/send-link/:customerId', auth, sendPortalLink);
router.post('/resolve-link',  resolveLink);
router.get('/verify-token',   verifyPortalToken);
router.post('/google-auth',   googleAuth);
router.post('/direct-auth',   directGoogleAuth);
router.post('/device-login',  deviceLogin);

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
router.get('/ai-chat/history', portalAuth, getCustomerChatHistory);

module.exports = router;
