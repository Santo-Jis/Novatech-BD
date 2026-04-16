const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const {
    canCreateEmployee,
    canApproveEmployee,
    canSuspendEmployee,
    canApproveOrder,
    checkTeamAccess,
    selfOrAdmin,
    isAdmin
} = require('../middlewares/roleCheck');
const { auth } = require('../middlewares/auth');

const {
    getEmployees,
    getEmployee,
    createEmployee,
    getPendingEmployees,
    approveEmployee,
    rejectEmployee,
    suspendEmployee,
    editEmployee,
    getPendingEdits,
    approveEdit,
    rejectEdit,
    getEmployeePDF,
    updateOwnProfile,
    uploadProfilePhoto,
    reactivateEmployee,
    broadcastEmail,
    resetPassword
} = require('../controllers/employee.controller');

// ============================================================
// FILE UPLOAD (Multer — Memory Storage)
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'profile_photo') {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
            }
        }
        cb(null, true);
    }
});

const employeeUpload = upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'documents',     maxCount: 10 }
]);

// ============================================================
// EMPLOYEE ROUTES
// Base: /api/employees
// ============================================================

// নিজের প্রোফাইল আপডেট
router.put('/profile',       auth, updateOwnProfile);

// নিজের ছবি আপলোড
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('photo');
router.post('/profile-photo', auth, photoUpload, uploadProfilePhoto);

// Broadcast email (Admin)
router.post('/broadcast-email', auth, isAdmin, broadcastEmail);

// পেন্ডিং অনুমোদন (Admin)
router.get('/pending',  auth, canApproveEmployee, getPendingEmployees);

// পেন্ডিং এডিট তালিকা
router.get('/audit',    auth, canApproveOrder, getPendingEdits);

// এডিট অনুমোদন/রিজেক্ট
router.put('/audit/:id/approve', auth, canApproveOrder, approveEdit);
router.put('/audit/:id/reject',  auth, canApproveOrder, rejectEdit);

// তালিকা ও তৈরি
router.get('/',         auth, checkTeamAccess, getEmployees);
router.post('/',        auth, canCreateEmployee, employeeUpload, createEmployee);

// PDF প্রোফাইল
router.get('/:id/pdf',  auth, selfOrAdmin, getEmployeePDF);

// অনুমোদন/রিজেক্ট/বরখাস্ত (Admin)
router.put('/:id/approve',    auth, canApproveEmployee, approveEmployee);
router.put('/:id/reject',     auth, canApproveEmployee, rejectEmployee);
router.put('/:id/suspend',    auth, canSuspendEmployee, suspendEmployee);
router.put('/:id/reactivate', auth, canApproveEmployee, reactivateEmployee);

// Password reset (Admin)
router.post('/:id/reset-password', auth, isAdmin, resetPassword);

// প্রোফাইল এডিট
router.put('/:id',      auth, selfOrAdmin, employeeUpload, editEmployee);

// একজন কর্মচারীর বিস্তারিত
router.get('/:id',      auth, selfOrAdmin, getEmployee);

module.exports = router;
