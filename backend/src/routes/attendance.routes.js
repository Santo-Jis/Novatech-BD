const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    checkTeamAccess,
    workerSelfOnly
} = require('../middlewares/roleCheck');

const {
    checkIn,
    checkOut,
    getMyAttendance,
    getTeamAttendance,
    getAllAttendance,
    getTodayLive,
    getMonthlyReport
} = require('../controllers/attendance.controller');

// ============================================================
// FILE UPLOAD (সেলফির জন্য)
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 }, // ৫ MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

// ============================================================
// ATTENDANCE ROUTES
// Base: /api/attendance
// ============================================================

// চেক-ইন (Worker/Manager/Supervisor)
router.post('/checkin',
    auth,
    allowRoles('worker', 'manager', 'supervisor', 'asm', 'rsm'),
    upload.single('selfie'),
    checkIn
);

// চেক-আউট
router.post('/checkout',
    auth,
    allowRoles('worker', 'manager', 'supervisor', 'asm', 'rsm'),
    upload.single('selfie'),
    checkOut
);

// নিজের হাজিরা ইতিহাস
router.get('/my',    auth, getMyAttendance);

// আজকের লাইভ হাজিরা (Manager/Admin)
router.get('/today',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'),
    checkTeamAccess,
    getTodayLive
);

// টিমের হাজিরা (Manager)
router.get('/team',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'),
    checkTeamAccess,
    getTeamAttendance
);

// সব হাজিরা (Admin)
router.get('/all',
    auth,
    allowRoles('admin', 'accountant'),
    getAllAttendance
);

// মাসিক রিপোর্ট
router.get('/monthly',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'accountant'),
    checkTeamAccess,
    getMonthlyReport
);

module.exports = router;
