const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/planBooking.controller');
const { auth } = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleCheck');

// পাবলিক এন্ডপয়েন্ট — কেউ লগইন ছাড়াই বারবার POST করে স্প্যাম করতে পারে,
// তাই rate-limit (superAdmin.routes.js-এর প্যাটার্ন অনুসরণ করে)
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' },
});

// নতুন কাস্টমার — trial ছাড়াই সরাসরি প্ল্যান বুক করতে চায় (পাবলিক)
router.post('/', bookingLimiter, ctrl.submitPublicBooking);

// বিদ্যমান trial tenant — upgrade করতে চায় (লগইন করা admin-ই পাঠাতে পারবে)
router.post('/upgrade', auth, isAdmin, bookingLimiter, ctrl.submitTenantUpgradeBooking);

// নিজের বিলিং/প্রোফাইল তথ্য দেখা — upgrade ফর্ম pre-fill করার জন্য
router.get('/my-profile', auth, isAdmin, ctrl.getMyTenantProfile);

module.exports = router;
