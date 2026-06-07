const { query } = require('../config/db');
const logger    = require('../config/logger');

// ============================================================
// requireCheckin Middleware
// NovaTechBD Management System
// ============================================================
// Worker-কে অর্ডার / বিক্রয় / লোকেশন আপডেট করতে হলে
// আগে আজকের চেক-ইন করতে হবে।
// ============================================================

const requireCheckin = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'লগইন করুন।'
            });
        }

        // আজকের তারিখ (UTC ISO string থেকে date অংশ)
        const today = new Date().toISOString().split('T')[0];

        // আজকের চেক-ইন রেকর্ড আছে কিনা চেক করো
        const result = await query(
            `SELECT id
               FROM attendance
              WHERE user_id       = $1
                AND date          = $2
                AND check_in_time IS NOT NULL`,
            [userId, today]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'আগে চেক-ইন করুন। চেক-ইন ছাড়া এই কাজ করা যাবে না।'
            });
        }

        next();
    } catch (err) {
        logger.error('❌ requireCheckin Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'সার্ভারে সমস্যা হয়েছে।'
        });
    }
};

module.exports = requireCheckin;
