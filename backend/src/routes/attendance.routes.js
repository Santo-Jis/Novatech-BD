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
    getTodayLive,
    getTeamAttendance,
    getAllAttendance,
    getMonthlyReport,
    getAttendanceSettings,
    applyLeave,
    getMyLeaveRequests,
    getAllLeaveRequests,
    reviewLeaveRequest,
    correctAttendance
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

// হাজিরা সেটিংস (সকল authenticated user)
router.get('/settings', auth, getAttendanceSettings);

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

// ============================================================
// LEAVE APPLICATION ROUTES
// ============================================================

// SR/Worker নিজে ছুটির আবেদন করবে
router.post('/leave/apply',
    auth,
    allowRoles('worker', 'manager', 'supervisor', 'asm', 'rsm'),
    applyLeave
);

// নিজের আবেদনের তালিকা
router.get('/leave/my',
    auth,
    getMyLeaveRequests
);

// সব আবেদন (Manager/Admin দেখবে)
router.get('/leave/all',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'),
    getAllLeaveRequests
);

// আবেদন অনুমোদন / প্রত্যাখ্যান
router.put('/leave/:id/review',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'),
    reviewLeaveRequest
);

// হাজিরা ম্যানুয়াল সংশোধন (Manager/Admin)
router.put('/correct',
    auth,
    allowRoles('admin', 'manager'),
    correctAttendance
);

module.exports = router;
