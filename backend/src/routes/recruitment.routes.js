const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { auth } = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleCheck');
const {
    submitApplication,
    getApplications,
    getApplication,
    updateStatus,
    exportCSV,
    sendSROTP,
    confirmSROTP,
} = require('../controllers/recruitment.controller');

// Photo upload — memory storage (Cloudinary তে পাঠাবো)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/'))
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        cb(null, true);
    },
}).single('photo');

// ── Public (লগিন ছাড়া) ───────────────────────────────────────
// Email OTP যাচাই (SR আবেদনের আগে) — auth ছাড়া কারণ এটি public form
router.post('/verify-email/send',    sendSROTP);
router.post('/verify-email/confirm', confirmSROTP);
router.post('/apply', upload, submitApplication);

// ── Admin only ────────────────────────────────────────────────
router.get('/export',     auth, isAdmin, exportCSV);
router.get('/',           auth, isAdmin, getApplications);
router.get('/:id',        auth, isAdmin, getApplication);
router.put('/:id/status', auth, isAdmin, updateStatus);

module.exports = router;
