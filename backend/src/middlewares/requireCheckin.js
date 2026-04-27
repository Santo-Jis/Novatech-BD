// ============================================================
// requireCheckin Middleware
// ভিজিট / বিক্রয় / অর্ডার করার আগে
// SR আজকে চেক-ইন করেছে কিনা যাচাই করে।
// চেক-ইন না থাকলে 403 ফেরত দেয়।
//
// বাগ ফিক্স:
//   ১. worker_id → user_id  (attendance টেবিলের আসল কলাম নাম)
//   ২. catch-এ next() সরানো — DB error হলে 500 দিয়ে block করবে,
//      security bypass হবে না।
// ============================================================

const { query } = require('../config/db');

const requireCheckin = async (req, res, next) => {
    try {
        // শুধু worker role-এর জন্য প্রযোজ্য
        if (!req.user || req.user.role !== 'worker') {
            return next();
        }

        const today  = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const userId = req.user.id;

        // ✅ FIX #1: worker_id ছিল → user_id হওয়া উচিত
        const result = await query(
            `SELECT check_in_time FROM attendance
             WHERE user_id = $1 AND date = $2
             LIMIT 1`,
            [userId, today]
        );

        const checkedIn = result.rows.length > 0 && !!result.rows[0].check_in_time;

        if (!checkedIn) {
            return res.status(403).json({
                success: false,
                code:    'CHECKIN_REQUIRED',
                message: 'আগে চেক-ইন করুন। চেক-ইন ছাড়া ভিজিট, বিক্রয় বা অর্ডার করা যাবে না।'
            });
        }

        return next();

    } catch (error) {
        // ✅ FIX #2: আগে next() ছিল — যেকোনো DB error-এ middleware bypass হতো।
        // এখন 500 দিয়ে block করা হচ্ছে, security নিশ্চিত।
        console.error('❌ requireCheckin Middleware Error:', error.message);
        return res.status(500).json({
            success: false,
            code:    'SERVER_ERROR',
            message: 'সার্ভার ত্রুটি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
        });
    }
};

module.exports = requireCheckin;
