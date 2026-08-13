const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getAllPromotions, createPromotion, updatePromotion,
    deletePromotion, approvePromotion, rejectPromotion,
    uploadPromotionBanner, // ← Phase ৫
    getActivePromotions, calculatePromotions, getPromotionReport,
    getPromotionsDashboardSummary,
} = require('../controllers/promotion.controller');

// employee.routes.js-এর profile-photo আপলোডের একই প্যাটার্ন
const bannerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('banner');

// Worker
router.get('/active',        auth, allowRoles('worker','manager','admin'), getActivePromotions);
router.post('/calculate',    auth, allowRoles('worker'),                   calculatePromotions);

// Admin/Manager
router.get('/dashboard-summary', auth, allowRoles('admin','manager'),      getPromotionsDashboardSummary); // ← Phase ৪
router.get('/',              auth, allowRoles('admin','manager'),          getAllPromotions);
router.post('/',             auth, allowRoles('admin'),                    createPromotion);
router.put('/:id',           auth, allowRoles('admin'),                    updatePromotion);
router.delete('/:id',        auth, allowRoles('admin'),                    deletePromotion);
router.post('/:id/approve',  auth, allowRoles('admin'),                    approvePromotion); // ← Phase ৩
router.post('/:id/reject',   auth, allowRoles('admin'),                    rejectPromotion);  // ← Phase ৩
router.post('/:id/banner',   auth, allowRoles('admin'), bannerUpload,      uploadPromotionBanner); // ← Phase ৫
router.get('/:id/report',    auth, allowRoles('admin','manager'),          getPromotionReport);

module.exports = router;
