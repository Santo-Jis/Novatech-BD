require('dotenv').config();
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
// Render-এ FRONTEND_URL env variable সেট করুন, যেমন:
//   https://novatech-bd.vercel.app
// একাধিক URL দিতে চাইলে comma দিয়ে আলাদা করুন:
//   https://novatech-bd.vercel.app,https://novatech-bd-git-main.vercel.app
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim());

app.use(cors({
    origin: (origin, callback) => {
        // Mobile app / Postman / Server-to-server — origin থাকে না
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));

// ── Cache disable — 304 problem fix ──
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// আপলোড করা ছবি/সেলফি দেখানোর জন্য
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================================
// RATE LIMITING
// ============================================================

// সাধারণ API limit
// ⚠️ FIX: আগে শুধু IP-based ছিল — অফিস নেটওয়ার্কে একই IP থেকে সবার request block হত।
// এখন লগইন থাকলে user ID দিয়ে limit, না থাকলে IP দিয়ে।
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // ১৫ মিনিট
    max: 300, // authenticated user প্রতি — বেশি request দরকার হয় real usage-এ
    keyGenerator: (req) => {
        // JWT middleware আগেই req.user populate করে (authenticated routes-এ)
        return req.user?.id ? `user_${req.user.id}` : `ip_${req.ip}`
    },
    skip: (req) => req.path === '/health', // keep-alive ping count করবে না
    message: {
        success: false,
        message: 'অনেক বেশি রিকোয়েস্ট। ১৫ মিনিট পরে চেষ্টা করুন।'
    }
});

// Login এ কড়া limit
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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
const salaryRoutes      = require('./routes/salary.routes');
const locationRoutes    = require('./routes/location.routes');
const portalRoutes              = require('./routes/customerPortal.routes');
const customerOrderReqRoutes    = require('./routes/customerOrderRequest.routes');
const appRoutes                 = require('./routes/app.routes');       // ← নতুন
const expenseRoutes             = require('./routes/expense.routes');
const returnRoutes              = require('./routes/return.routes');

app.use('/api/auth',        loginLimiter, authRoutes);
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
app.use('/api/portal',                  portalRoutes);
app.use('/api/customer-order-requests', customerOrderReqRoutes);
app.use('/api/app',                     appRoutes);            // ← নতুন
app.use('/api/expense',                 expenseRoutes);
app.use('/api/return',                  returnRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'NovaTechBD API চালু আছে ✅',
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
    console.error('❌ Server Error:', err);

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

const { startCommissionJob }       = require('./jobs/commission.job');
const { startBonusJob }            = require('./jobs/bonus.job');
const { startAIJob }               = require('./jobs/ai.job');
const { startGpsTrailCleanupJob }  = require('./jobs/gpsTrail.job');
const { scheduleCreditReminderJob } = require('./jobs/creditReminder.job');
const { startReservedStockJob }    = require('./jobs/reservedStock.job');


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
            console.log('✅ Keep-alive ping সফল');
        } catch (err) {
            console.log('⚠️ Keep-alive ping ব্যর্থ:', err.message);
        }
    }, 14 * 60 * 1000); // ১৪ মিনিট
};

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║     NovaTechBD Management System       ║');
    console.log('║     Backend API Server                 ║');
    console.log(`║     Port: ${PORT}                          ║`);
    console.log(`║     Mode: ${process.env.NODE_ENV}               ║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    // Background jobs শুরু করো
    startCommissionJob();
    startBonusJob();
    startAIJob();
    startGpsTrailCleanupJob();
    scheduleCreditReminderJob();
    startReservedStockJob();

    console.log('✅ Background jobs চালু হয়েছে');

    // ✅ FIX: keepAlive call করা হয়নি — Render free tier ঘুমিয়ে পড়ত।
    // Server সম্পূর্ণ উঠে যাওয়ার পর (listen callback-এ) call করা হচ্ছে
    // যাতে /api/health ping করার সময় server ready থাকে।
    if (process.env.NODE_ENV === 'production') {
        keepAlive();
        console.log('✅ Keep-alive চালু হয়েছে (প্রতি ১৪ মিনিট)');
    }
});

module.exports = app;
