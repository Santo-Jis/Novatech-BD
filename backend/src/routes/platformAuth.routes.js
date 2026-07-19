const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const ctrl      = require('../controllers/platformAuth.controller');

// Security Doc §৪ — brute-force ঠেকাতে login rate-limit
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // ১৫ মিনিট
    max: 5,                    // ১৫ মিনিটে সর্বোচ্চ ৫ চেষ্টা প্রতি IP
    message: { success: false, message: 'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/login', loginLimiter, ctrl.login);

module.exports = router;
