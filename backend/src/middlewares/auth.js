const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');

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
// Trade-off:
//   role বা status পরিবর্তন হলে সর্বোচ্চ ১৫ মিনিট পুরনো token চলবে।
//   suspend করলে admin চাইলে deleteAllUserSessions() দিয়ে
//   refresh token বাতিল করতে পারবে — নতুন access token তৈরি হবে না।

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

        // ৩. Token payload থেকে সরাসরি req.user তৈরি — DB query নেই
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
        };

        next();

    } catch (error) {
        console.error('❌ Auth Middleware Error:', error.message);
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

// ✅ OPT: basic_salary token-এ রাখা হয়নি (sensitive data)।
// শুধু attendance check-in route-এ লাগে।
// auth middleware-এর পরে, সেই route-এ এই middleware দিন:
//   router.post('/check-in', auth, enrichUserSalary, requireCheckin, ...)
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
        console.error('❌ enrichUserSalary Error:', error.message);
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
        };
        next();
    } catch {
        req.user = null;
        next();
    }
};

module.exports = { auth, optionalAuth, enrichUserSalary };
