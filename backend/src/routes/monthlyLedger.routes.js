const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const { getSummaryCard, getDailyLedger, getDailyLedgerDetail, getMySalarySlip, getDuesLedger } = require('../controllers/monthlyLedger.controller');

// ============================================================
// SR মাসিক লেজার রাউট
// Base: /api/monthly-ledger
// ============================================================

// বিভাগ ১ — সারসংক্ষেপ কার্ড
// মোট বিক্রয়, কর্মদিবস, মোট কমিশন, নেট পাওনা, টার্গেট প্রগ্রেস, টপ ১০ পণ্য
router.get('/summary',
    auth,
    allowRoles('worker'),
    getSummaryCard
);

// বিভাগ ২ — দৈনিক লেজার (তালিকা)
// তারিখ | বিক্রয় | নগদ | বাকি | ঘাটতি | কমিশন | স্ট্যাটাস
router.get('/daily',
    auth,
    allowRoles('worker'),
    getDailyLedger
);

// বিভাগ ২ — একটি দিনের বিস্তারিত (এক্সপ্যান্ড রো)
// দোকান-ভিত্তিক বিক্রয়, পণ্য চলাচল/ফেরত, ভিজিট, খরচ, চেক-ইন/আউট
router.get('/daily/:date',
    auth,
    allowRoles('worker'),
    getDailyLedgerDetail
);

// বিভাগ ৪ — বেতন স্লিপ + পরিশোধ স্ট্যাটাস
// হিসাবের ধাপ (মূল বেতন → কমিশন/বোনাস → কর্তন → নেট পাওনা) + পরিশোধ তারিখ/অনুমোদনকারী/রেফারেন্স
router.get('/salary-slip',
    auth,
    allowRoles('worker'),
    getMySalarySlip
);

// বিভাগ ৫ — বাকি লেজার (২ ট্যাব: আমার বকেয়া + গ্রাহকের বাকি)
router.get('/dues',
    auth,
    allowRoles('worker'),
    getDuesLedger
);

module.exports = router;
