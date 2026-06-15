const jwt               = require('jsonwebtoken');
const logger = require('../config/logger');
const { query }         = require('../config/db');
const { isUserBlocked } = require('../config/redis');

// ============================================================
// JWT Authentication Middleware
// প্রতিটি protected route এ এই middleware চলবে
// ============================================================

// ✅ OPT: auth middleware-এ DB query বাদ দেওয়া হলো।
// Token-এ এখন status, role, manager_id, employee_code সব আছে।
// req.user token থেকে সরাসরি তৈরি হয় — প্রতি request-এ SELECT নেই।
//
// basic_salary শুধু attendance controller-এ লাগে।
// সেখানে lazy fetch করা হয়েছে (auth.enrichUser দেখুন)।
//
// ✅ FIX (Stale Token):
//   suspend/archive করলে deleteAllUserSessions() + blockUserTokens()
//   একসাথে ডাকা হয়। middleware Redis blocklist চেক করে — instant block।
//   Redis TTL = JWT_ACCESS_EXPIRES (default ১৫ মিনিট)।

// ✅ SaaS Phase 2 (lite): req.user.tenantId এবং req.tenantId যোগ হলো।
// auth / optionalAuth / enrichUserSalary — তিনটা export-ই অপরিবর্তিত,
// তাই বিদ্যমান ৩৫+ route file কোনো পরিবর্তন ছাড়াই কাজ করবে।
//
// পুরোনো access token-এ tenantId নেই (এই আপডেটের আগে issued) —
// decoded.tenantId undefined হলে DEFAULT_TENANT_ID ধরা হয়, তাই কেউ
// instantly logged out হবে না। ১৫ মিনিটের মধ্যে refresh হয়ে নতুন
// token-এ real tenantId চলে আসবে (auth.service.js verifyRefreshToken)।
//
// X-Tenant-Slug header / tenantResolver-এর কোনো dependency নেই —
// তাই mount করার সাথে app বন্ধ হবে না।
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

const auth = async (req, res, next) => {
    try {
        // ১. Header থেকে token নাও
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'অ্যাক্সেস টোকেন নেই। লগইন করুন।'
            });
        }

        const token = authHeader.split(' ')[1];

        // ২. Token যাচাই করো
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'টোকেনের মেয়াদ শেষ। আবার লগইন করুন।',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'অবৈধ টোকেন।',
                code: 'INVALID_TOKEN'
            });
        }

        // Customer portal token দিয়ে employee route access block
        if (decoded.type === 'customer_portal') {
            return res.status(403).json({
                success: false,
                message: 'Customer portal token দিয়ে এই route access করা যাবে না।',
                code: 'WRONG_TOKEN_TYPE'
            });
        }

        // ৩. Redis blocklist চেক — suspend/archive হলে instant block
        //    Token payload-এ পুরনো status='active' থাকলেও এটা ধরে ফেলে।
        const blocked = await isUserBlocked(decoded.userId);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট বন্ধ করা হয়েছে। Admin এর সাথে যোগাযোগ করুন।',
                code: 'USER_BLOCKED'
            });
        }

        // ৪. Token payload থেকে status যাচাই
        const status = decoded.status;

        if (status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ করা হয়েছে। Admin এর সাথে যোগাযোগ করুন।'
            });
        }

        if (status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট এখনো অনুমোদিত হয়নি।'
            });
        }

        if (status === 'archived') {
            return res.status(403).json({
                success: false,
                message: 'এই অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।'
            });
        }

        req.user = {
            id:            decoded.userId,
            role:          decoded.role,
            status:        decoded.status,
            name_bn:       decoded.name_bn,
            name_en:       decoded.name_en       || null,
            manager_id:    decoded.manager_id    || null,
            employee_code: decoded.employee_code || null,
            phone:         decoded.phone         || null,
            tenantId:      decoded.tenantId      || DEFAULT_TENANT_ID, // ✅ SaaS
        };

        // ✅ SaaS: controller-এ সরাসরি req.tenantId হিসেবেও পাওয়া যাবে
        req.tenantId = req.user.tenantId;

        next();

    } catch (error) {
        logger.error('❌ Auth Middleware Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'সার্ভারে সমস্যা হয়েছে।'
        });
    }
};

// ============================================================
// LAZY ENRICHMENT — শুধু basic_salary দরকার এমন route-এ ব্যবহার করুন
// যেমন: attendance controller-এ check-in-এর সময়
// ============================================================
const enrichUserSalary = async (req, res, next) => {
    try {
        const result = await query(
            'SELECT basic_salary, outstanding_dues FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length > 0) {
            req.user.basic_salary     = result.rows[0].basic_salary;
            req.user.outstanding_dues = result.rows[0].outstanding_dues;
        }
        next();
    } catch (error) {
        logger.error('❌ enrichUserSalary Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// OPTIONAL AUTH
// লগইন না থাকলেও চলবে, থাকলে user set হবে
// ============================================================
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            req.tenantId = DEFAULT_TENANT_ID; // ✅ SaaS: single-tenant default
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        req.user = {
            id:         decoded.userId,
            role:       decoded.role,
            status:     decoded.status,
            name_bn:    decoded.name_bn,
            manager_id: decoded.manager_id || null,
            tenantId:   decoded.tenantId   || DEFAULT_TENANT_ID, // ✅ SaaS
        };
        req.tenantId = req.user.tenantId; // ✅ SaaS
        next();
    } catch {
        req.user = null;
        req.tenantId = DEFAULT_TENANT_ID; // ✅ SaaS
        next();
    }
};

module.exports = { auth, optionalAuth, enrichUserSalary, DEFAULT_TENANT_ID };
