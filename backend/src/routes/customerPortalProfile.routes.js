// ============================================================
// CUSTOMER PORTAL PROFILE ROUTES — Base: /api/portal/profile
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { portalAuth } = require('../middlewares/portalAuthShared');

const { getMyAreaAndField, updateMyAreaAndField, updateMyPhoto, getMySecurityInfo, changeMyPassword, revokeMyDevice, getDeletionPreview, deleteMyAccount, getMyPreferences, updateMyPreferences } = require('../controllers/customerPortalProfile.controller');

// customerPortal.routes.js-এর selfRegisterUpload-এর সাথে একই লিমিট/ফিল্টার —
// দুই জায়গাতেই আলাদা multer ইনস্ট্যান্স, কিন্তু কনভেনশন এক রাখা হলো।
const profilePhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

router.get('/area-field', portalAuth, getMyAreaAndField);
router.put('/area-field', portalAuth, updateMyAreaAndField);

router.post('/photo', portalAuth,
    profilePhotoUpload.fields([{ name: 'shop_photo', maxCount: 1 }, { name: 'profile_photo', maxCount: 1 }]),
    updateMyPhoto);

router.get('/security',                  portalAuth, getMySecurityInfo);
router.post('/password',                 portalAuth, changeMyPassword);
router.post('/devices/:deviceId/revoke', portalAuth, revokeMyDevice);

// ✅ NEW — অ্যাকাউন্ট ডিলিট, সরাসরি ও এখনই কার্যকর (admin/SR রিভিউ নেই)
router.get('/deletion-preview', portalAuth, getDeletionPreview);
router.post('/delete-account',  portalAuth, deleteMyAccount);

// ✅ NEW — থিম/ভাষা/নোটিফিকেশন পছন্দ (আগে localStorage-only ছিল)
router.get('/preferences', portalAuth, getMyPreferences);
router.put('/preferences', portalAuth, updateMyPreferences);

module.exports = router;
