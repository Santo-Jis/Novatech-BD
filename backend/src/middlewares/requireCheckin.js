// ============================================================
// requireCheckin Middleware
// ভিজিট / বিক্রয় / অর্ডার করার আগে
// SR আজকে চেক-ইন করেছে কিনা যাচাই করে।
// চেক-ইন না থাকলে 403 ফেরত দেয়।
// ============================================================

const { query } = require('../config/db');

const requireCheckin = async (req, res, next) => {
    try {
        // শুধু worker role-এর জন্য প্রযোজ্য
        if (!req.user || req.user.role !== 'worker') {
            return next();
        }

        const today    = new Date().toISOString().split('T')[0];
        const workerId = req.user.id;

        const result = await query(
            `SELECT check_in_time FROM attendance
             WHERE worker_id = $1 AND date = $2
             LIMIT 1`,
            [workerId, today]
        );

        const checkedIn = result.rows.length > 0 && !!result.rows[0].check_in_time;

        if (!checkedIn) {
            return res.status(403).json({
                success:       false,
                code:          'CHECKIN_REQUIRED',
                message:       'আগে চেক-ইন করুন। চেক-ইন ছাড়া ভিজিট, বিক্রয় বা অর্ডার করা যাবে না।'
            });
        }

        next();
    } catch (error) {
        console.error('❌ requireCheckin Middleware Error:', error.message);
        // DB error হলে block না করে পরের handler-এ পাঠাই
        next();
    }
};

module.exports = requireCheckin;
