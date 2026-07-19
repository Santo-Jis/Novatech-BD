const jwt    = require('jsonwebtoken');
const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Platform Staff Auth Middleware
// Support Role & Panel — নতুন, স্বতন্ত্র সিস্টেম।
//
// ⚠️ এটা বিদ্যমান tenant-user auth (middlewares/auth.js) বা
//    superAdmin key-based auth (routes/superAdmin.routes.js)-এর
//    কোনোটাই প্রতিস্থাপন করে না — সম্পূর্ণ আলাদা namespace
//    (/platform/api/*), platform_staff টেবিলের উপর ভিত্তি করে।
//
// JWT payload: { staffId, scope, email }
// scope: 'full' | 'support' — এই ফাইলে দুটোই সাপোর্টেড থাকলেও,
// এই কাজে (Support agent) শুধু 'support' scope routes ওয়্যার করা হচ্ছে।
// ============================================================

const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET;

const platformAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Platform access token নেই। লগইন করুন।'
            });
        }

        if (!PLATFORM_JWT_SECRET) {
            logger.error('❌ PLATFORM_JWT_SECRET env var সেট নেই।');
            return res.status(500).json({ success: false, message: 'Server misconfigured' });
        }

        const token = authHeader.split(' ')[1];

        let decoded;
        try {
            decoded = jwt.verify(token, PLATFORM_JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'টোকেনের মেয়াদ শেষ। আবার লগইন করুন।',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({ success: false, message: 'অবৈধ টোকেন।', code: 'INVALID_TOKEN' });
        }

        // Staff এখনো active কিনা লাইভ চেক (suspended হলে পুরনো token থাকলেও ব্লক)
        const staffResult = await query(
            'SELECT id, name, email, scope, status FROM platform_staff WHERE id = $1',
            [decoded.staffId]
        );

        if (staffResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Staff account পাওয়া যায়নি।' });
        }

        const staff = staffResult.rows[0];

        if (staff.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ।' });
        }

        req.platformStaff = {
            id:    staff.id,
            name:  staff.name,
            email: staff.email,
            scope: staff.scope,
        };

        next();
    } catch (error) {
        logger.error('❌ platformAuth Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// নির্দিষ্ট scope(s) না থাকলে 403 — route-level whitelist।
const requireScope = (...scopes) => (req, res, next) => {
    if (!req.platformStaff || !scopes.includes(req.platformStaff.scope)) {
        return res.status(403).json({
            success: false,
            message: `এই কাজের অনুমতি নেই। প্রয়োজনীয় scope: ${scopes.join(', ')}`
        });
    }
    next();
};

module.exports = { platformAuth, requireScope };
