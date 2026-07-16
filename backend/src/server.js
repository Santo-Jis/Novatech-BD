require('dotenv').config();

const logger = require('./config/logger');

// ✅ ENV VALIDATION — dotenv-এর পরে, বাকি সব require-এর আগে।
// Missing বা insecure variable থাকলে এখানেই server বন্ধ হবে।
const { validateEnv } = require('./config/validateEnv');
validateEnv();

const { initializeFirebase } = require('./config/firebase');
initializeFirebase();
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const compression   = require('compression');
const rateLimit     = require('express-rate-limit');
const cookieParser  = require('cookie-parser');
const path          = require('path');

const app = express();
app.set('trust proxy', 1);
// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet());
app.use(cookieParser());   // HttpOnly cookie পড়ার জন্য

// ── CORS ─────────────────────────────────────────────────────
// Render-এ FRONTEND_URL env variable সেট করুন।
//
// একাধিক URL: comma দিয়ে আলাদা করুন
//   https://zovorix-eta.vercel.app,https://localhost:3000
//
// Wildcard (*) সাপোর্ট — Vercel preview URL-এর জন্য:
//   https://*.vercel.app         → সব vercel subdomain
//   https://zovorix*.vercel.app → শুধু zovorix prefix
//
// Render → Environment → FRONTEND_URL তে সেট করুন:
//   https://zovorix-eta.vercel.app,https://zovorix*.vercel.app

const RAW_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);

// Wildcard pattern → RegExp রূপান্তর
// * → যেকোনো character (dot সহ)
const ORIGIN_PATTERNS = RAW_ORIGINS.map(pattern => {
    if (!pattern.includes('*')) return { type: 'exact', value: pattern };
    const regexStr = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // special chars escape
        .replace(/\*/g, '.*');                   // * → .*
    return { type: 'regex', value: new RegExp(`^${regexStr}$`) };
});

// Capacitor APK request-এ origin হয় এগুলোর একটি অথবা সম্পূর্ণ absent।
// CORS browser-only mechanism — এই origins block করলে APK ভেঙে যাবে।
const CAPACITOR_ORIGINS = [
    'capacitor://localhost',  // Capacitor v3+ Android/iOS
    'http://localhost',       // Capacitor dev / older versions
    'ionic://localhost',      // Ionic fallback
];

function isOriginAllowed(origin) {
    return ORIGIN_PATTERNS.some(p =>
        p.type === 'exact'
            ? p.value === origin
            : p.value.test(origin)
    );
}

app.use(cors({
    origin: (origin, callback) => {
        // Origin absent — server-to-server বা Capacitor APK।
        // CORS browser-only mechanism, তাই এটা block করা অর্থহীন।
        if (!origin) return callback(null, true);
        // Capacitor APK explicit origins
        if (CAPACITOR_ORIGINS.includes(origin)) return callback(null, true);
        // Configured frontend origins (FRONTEND_URL env)
        if (isOriginAllowed(origin)) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-secret']
}));

app.use(morgan(
    process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
    { stream: logger.stream }
));

// ── Cache disable — শুধু API routes-এ ──
// শুধু /api/ route-এ apply হবে।
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// ============================================================
// RATE LIMITING
// ============================================================

// সাধারণ API limit
// ✅ Fix: keyGenerator এখন req.user (employee) ও req.portalUser (customer) দুটোই চেক করে।
// আগে portal routes-এ req.user null থাকত — সব কাস্টমার IP-based limit-এ পড়ত।
// একই নেটওয়ার্ক (market WiFi) থেকে সবার request একসাথে block হওয়ার সমস্যা ছিল।
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // ১৫ মিনিট
    max: 300,
    keyGenerator: (req) => {
        // Employee routes: auth middleware req.user সেট করে
        if (req.user?.id)           return `emp_${req.user.id}`;
        // Portal routes: portalAuth middleware req.portalUser সেট করে
        if (req.portalUser?.customer_id) return `cust_${req.portalUser.customer_id}`;
        // unauthenticated (login page, verify-token ইত্যাদি) → IP fallback
        return `ip_${req.ip}`;
    },
    skip: (req) => req.path === '/health',
    message: {
        success: false,
        message: 'অনেক বেশি রিকোয়েস্ট। ১৫ মিনিট পরে চেষ্টা করুন।'
    }
});

// Login এ কড়া limit (test-এ disable — integration test অনেক request করে)
// ✅ Fix: IP-based না করে identifier-based করা হয়েছে।
//   কারণ: বাজারের shared WiFi থেকে ১০০ customer একই IP-তে পড়লে
//   সবাই block হয়ে যেত। এখন প্রতিটি identifier (phone/email) আলাদা count।
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10000 : 50, // প্রতি identifier-এ ১৫ মিনিটে ৫০ বার (আগে ২০ — একসাথে অনেক SR login করলে block হত)
    keyGenerator: (req) => {
        // Employee login: identifier field (email/phone/employee_code)
        const identifier = req.body?.identifier || req.body?.phone || req.body?.portal_token;
        if (identifier) return `login_${identifier}`;
        // fallback → IP
        return `login_ip_${req.ip}`;
    },
    message: {
        success: false,
        message: 'অনেকবার ভুল চেষ্টা। ১৫ মিনিট পরে চেষ্টা করুন।'
    }
});

app.use('/api/', apiLimiter);

// ============================================================
// ROUTES
// ============================================================

const authRoutes        = require('./routes/auth.routes');
const employeeRoutes    = require('./routes/employee.routes');
const attendanceRoutes  = require('./routes/attendance.routes');
const routeRoutes       = require('./routes/route.routes');
const customerRoutes    = require('./routes/customer.routes');
const productRoutes     = require('./routes/product.routes');
const orderRoutes       = require('./routes/order.routes');
const salesRoutes       = require('./routes/sales.routes');
const settlementRoutes  = require('./routes/settlement.routes');
const commissionRoutes  = require('./routes/commission.routes');
const reportRoutes      = require('./routes/report.routes');
const aiRoutes          = require('./routes/ai.routes');
const adminRoutes       = require('./routes/admin.routes');
const noticeRoutes      = require('./routes/notice.routes');
const recruitmentRoutes = require('./routes/recruitment.routes');
const teamRoutes        = require('./routes/team.routes');
const ledgerRoutes      = require('./routes/ledger.routes');
const monthlyLedgerRoutes = require('./routes/monthlyLedger.routes'); // ✅ SR মাসিক লেজার (সারসংক্ষেপ/দৈনিক/উপস্থিতি/বেতন/বাকি)
const salaryRoutes      = require('./routes/salary.routes');
const locationRoutes    = require('./routes/location.routes');
const portalRoutes              = require('./routes/customerPortal.routes');
const customerOrderReqRoutes    = require('./routes/customerOrderRequest.routes');
const appRoutes                 = require('./routes/app.routes');
const customerRequestsRoutes    = require('./routes/customerRequests.routes');       // ← নতুন
const expenseRoutes             = require('./routes/expense.routes');
const returnRoutes              = require('./routes/return.routes');
const settingsRoutes            = require('./routes/settings.routes');   // ✅ public settings
const creditApprovalRoutes      = require('./routes/creditApproval.routes'); // ✅ credit approval
const jisAiRoutes               = require('./routes/jisai.routes');           // ✅ JIS-AI WhatsApp integration
const collectionRoutes          = require('./routes/collection.routes');       // ✅ collection (বাকি আদায়)
const promotionRoutes           = require('./routes/promotion.routes');        // ← নতুন (Promotions)
const deliveryRoutes            = require('./routes/delivery.routes');         // ← নতুন (Deliveries)
const coverageRoutes            = require('./routes/coverage.routes');         // ← নতুন (Coverage)
const leaderboardRoutes         = require('./routes/leaderboard.routes');      // ← নতুন (Leaderboard)
const invoiceTargetRoutes       = require('./routes/invoiceTarget.routes');    // ← নতুন (Invoice Target)
const batteryRoutes             = require('./routes/battery.routes');          // ← নতুন (Battery Alert)
const onboardingRoutes          = require('./routes/onboarding.routes');       // ← নতুন (SaaS: company register)
const superAdminRoutes          = require('./routes/superAdmin.routes');       // ← নতুন (SaaS: super admin panel)
const connectionRoutes          = require('./routes/connection.routes');       // ← নতুন (Multi-Company: staff-side connections)
const portalConnectionRoutes    = require('./routes/customerPortalConnection.routes'); // ← নতুন (Multi-Company: customer-side connections)
const referenceRoutes           = require('./routes/reference.routes');        // ← নতুন (Phase 2: বিভাগ/জেলা/বিজনেস ফিল্ড)
const discoveryRoutes           = require('./routes/discovery.routes');        // ← নতুন (Phase 2: staff-side area/field settings + shop discovery)
const portalProfileRoutes       = require('./routes/customerPortalProfile.routes'); // ← নতুন (Phase 2: customer নিজের area/field প্রোফাইল)
app.use('/api/auth',        loginLimiter, authRoutes);
app.use('/api/portal',     loginLimiter, portalRoutes); // ✅ customer portal login-এও limiter
app.use('/api/portal/connections', portalConnectionRoutes); // ✅ নতুন — multi-company (customer side)
app.use('/api/connections', connectionRoutes);               // ✅ নতুন — multi-company (staff/company side)
app.use('/api/reference', referenceRoutes);                   // ✅ নতুন — বিভাগ/জেলা/বিজনেস ফিল্ড (public)
app.use('/api/discovery', discoveryRoutes);                   // ✅ নতুন — staff-side discovery
app.use('/api/portal/profile', portalProfileRoutes);          // ✅ নতুন — customer নিজের প্রোফাইল
app.use('/api/employees',   employeeRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/routes',      routeRoutes);
app.use('/api/customers',   customerRoutes);
app.use('/api/products',    productRoutes);
app.use('/api/orders',      orderRoutes);
app.use('/api/sales',       salesRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/commission',  commissionRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/notices',     noticeRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/teams',      teamRoutes);
app.use('/api/salary',     salaryRoutes);
app.use('/api/location',   locationRoutes);
app.use('/api/ledger',     ledgerRoutes);
app.use('/api/monthly-ledger', monthlyLedgerRoutes); // ✅ SR মাসিক লেজার
// /api/portal — উপরে loginLimiter সহ mount করা হয়েছে
app.use('/api/customer-order-requests', customerOrderReqRoutes);
app.use('/api/app',                     appRoutes);
app.use('/api/customer-requests',       customerRequestsRoutes);            // ← নতুন
app.use('/api/expense',                 expenseRoutes);
app.use('/api/settings',                settingsRoutes);       // ✅ public settings (expense limits etc.)
app.use('/api/return',                  returnRoutes);
app.use('/api/credit-approvals',        creditApprovalRoutes); // ✅ credit approval workflow
app.use('/api/collections',             collectionRoutes);     // ✅ collection (বাকি আদায়)
app.use('/api/promotions',              promotionRoutes);      // ← নতুন
app.use('/api/deliveries',              deliveryRoutes);       // ← নতুন
app.use('/api/coverage',                coverageRoutes);       // ← নতুন
app.use('/api/leaderboard',             leaderboardRoutes);    // ← নতুন
app.use('/api/invoice-target',          invoiceTargetRoutes);  // ← নতুন
app.use('/api/battery',                 batteryRoutes);        // ← নতুন
app.use('/api',          onboardingRoutes);   // ← নতুন (SaaS): POST /api/register, GET /api/register/check-slug/:slug
app.use('/superadmin/api', superAdminRoutes); // ← নতুন (SaaS): X-Super-Admin-Key দিয়ে protected, /api ও tenant middleware-এর বাইরে
jisAiRoutes(app);                                              // ✅ JIS-AI WhatsApp integration

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'ZovoriX API চালু আছে ✅',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// ============================================================
// 404 HANDLER
// ============================================================

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `রুট পাওয়া যায়নি: ${req.method} ${req.originalUrl}`
    });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    logger.error('Unhandled server error', {
        err,
        method:  req.method,
        url:     req.originalUrl,
        userId:  req.user?.id,
    });

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'ফাইল সাইজ সর্বোচ্চ ৫MB হতে পারবে।'
        });
    }

    // JWT error
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'অবৈধ টোকেন।'
        });
    }

    // PostgreSQL unique violation
    if (err.code === '23505') {
        return res.status(400).json({
            success: false,
            message: 'এই তথ্য ইতোমধ্যে বিদ্যমান।'
        });
    }

    // PostgreSQL foreign key violation
    if (err.code === '23503') {
        return res.status(400).json({
            success: false,
            message: 'সম্পর্কিত তথ্য পাওয়া যায়নি।'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'সার্ভারে সমস্যা হয়েছে।'
    });
});

// ============================================================
// BACKGROUND JOBS
// ============================================================

const { startCommissionJob }        = require('./jobs/commission.job');
const { startBonusJob }             = require('./jobs/bonus.job');
const { startAIJob }                = require('./jobs/ai.job');
const { startGpsTrailCleanupJob }   = require('./jobs/gpsTrail.job');
const { scheduleCreditReminderJob } = require('./jobs/creditReminder.job');
const { startReservedStockJob }     = require('./jobs/reservedStock.job');
const { startSessionCleanupJob }    = require('./jobs/sessionCleanup.job');


// ============================================================
// KEEP-ALIVE — Render free tier ঘুমানো বন্ধ করতে
// প্রতি ১৪ মিনিটে নিজেকে ping করবে
// ============================================================

const keepAlive = () => {
    const axios = require('axios');
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    setInterval(async () => {
        try {
            await axios.get(`${url}/api/health`, { timeout: 5000 });
            logger.info('Keep-alive ping OK');
        } catch (err) {
            logger.warn('Keep-alive ping failed', { err });
        }
    }, 10 * 60 * 1000); // ১০ মিনিট (আগে ১৪ মিনিট — Render ১৫ মিনিটে sleep করে, margin কম ছিল)
};

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;

// test mode-এ listen করি না — supertest নিজেই handle করে
// এতে background jobs চলে না, port conflict হয় না, worker leak হয় না
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, "0.0.0.0", () => {
        logger.info('');
        logger.info('╔════════════════════════════════════════╗');
        logger.info('║     ZovoriX Management System       ║');
        logger.info('║     Backend API Server                 ║');
        logger.info(`║     Port: ${PORT}                          ║`);
        logger.info(`║     Mode: ${process.env.NODE_ENV}               ║`);
        logger.info('╚════════════════════════════════════════╝');
        logger.info('');

        // Background jobs শুরু করো
        startCommissionJob();
        startBonusJob();
        startAIJob();
        startGpsTrailCleanupJob();
        scheduleCreditReminderJob();
        startReservedStockJob();
        startSessionCleanupJob();

        logger.info('✅ Background jobs চালু হয়েছে');

        if (process.env.NODE_ENV === 'production') {
            keepAlive();
            logger.info('✅ Keep-alive চালু হয়েছে (প্রতি ১০ মিনিট)');
        }
    });
}

module.exports = app;
