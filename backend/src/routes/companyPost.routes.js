const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getCompanyPosts, createCompanyPost, updateCompanyPost, deleteCompanyPost,
    uploadCompanyPostImage,   // ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
    uploadCompanyPostVideo,   // ✅ NEW (Redesign Phase ১.৬ — ভিডিও সাপোর্ট)
    uploadCompanyPostGallery, // ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি)
} = require('../controllers/companyPost.controller');

// ✅ NEW (Redesign Phase ১.৫): promotion.routes.js-এর bannerUpload-এর ঠিক
// একই সেটআপ — memory storage (ডিস্কে লেখা হয় না, buffer সরাসরি Cloudinary-তে)
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('image');

// ✅ NEW (Redesign Phase ১.৬): ভিডিওর জন্য আলাদা multer instance — ২০MB
// লিমিট (videoMedia.service.js-এর MAX_VIDEO_BYTES-এর সাথে মিলিয়ে)
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).single('video');

// ✅ NEW (Redesign Phase ১.৭): গ্যালারি — একাধিক ফাইল, প্রতিটা ৫MB পর্যন্ত,
// সর্বোচ্চ ৪টা (controller-এর MAX_GALLERY_IMAGES-এর সাথে মিলিয়ে)
const galleryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).array('images', 4);

// Admin/Manager
router.get('/',        auth, allowRoles('admin', 'manager'), getCompanyPosts);
router.post('/',       auth, allowRoles('admin'),             createCompanyPost);
router.put('/:id',     auth, allowRoles('admin'),             updateCompanyPost);
router.delete('/:id',  auth, allowRoles('admin'),             deleteCompanyPost);
router.post('/:id/image',   auth, allowRoles('admin'), imageUpload,   uploadCompanyPostImage);   // ✅ NEW (Redesign Phase ১.৫)
router.post('/:id/video',   auth, allowRoles('admin'), videoUpload,   uploadCompanyPostVideo);   // ✅ NEW (Redesign Phase ১.৬)
router.post('/:id/gallery', auth, allowRoles('admin'), galleryUpload, uploadCompanyPostGallery); // ✅ NEW (Redesign Phase ১.৭)

module.exports = router;
