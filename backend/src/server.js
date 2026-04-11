require('dotenv').config();
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const compression   = require('compression');
const rateLimit     = require('express-rate-limit');
const path          = require('path');

const app = express();
app.set('trust proxy', 1);
// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet());

app.use(cors({
    origin: '*',
credentials: false,
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
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // ১৫ মিনিট
    max: 100,
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

const { startCommissionJob } = require('./jobs/commission.job');
const { startBonusJob }      = require('./jobs/bonus.job');
const { startAIJob }         = require('./jobs/ai.job');


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

    console.log('✅ Background jobs চালু হয়েছে');
});

module.exports = app;
