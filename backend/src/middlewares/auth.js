const jwt     = require('jsonwebtoken');
const { query } = require('../config/db');

// ============================================================
// JWT Authentication Middleware
// প্রতিটি protected route এ এই middleware চলবে
// ============================================================

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

        // ৩. DB থেকে ইউজার যাচাই করো
        const result = await query(
            `SELECT id, role, employee_code, name_bn, name_en, 
                    email, phone, status, manager_id, basic_salary,
                    outstanding_dues
             FROM users 
             WHERE id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'ব্যবহারকারী পাওয়া যায়নি।'
            });
        }

        const user = result.rows[0];

        // ৪. অ্যাকাউন্ট স্ট্যাটাস যাচাই
        if (user.status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ করা হয়েছে। Admin এর সাথে যোগাযোগ করুন।'
            });
        }

        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট এখনো অনুমোদিত হয়নি।'
            });
        }

        if (user.status === 'archived') {
            return res.status(403).json({
                success: false,
                message: 'এই অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।'
            });
        }

        // ৫. Request এ user যোগ করো
        req.user = user;
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
// OPTIONAL AUTH
// লগইন না থাকলেও চলবে, থাকলে user set হবে
// ============================================================

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        const result = await query(
            'SELECT id, role, name_bn, name_en, status, manager_id FROM users WHERE id = $1',
            [decoded.userId]
        );

        req.user = result.rows[0] || null;
        next();
    } catch {
        req.user = null;
        next();
    }
};

module.exports = { auth, optionalAuth };
