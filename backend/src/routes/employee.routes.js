const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const { auth }  = require('../middlewares/auth');
const {
    canCreateEmployee,
    canApproveEmployee,
    canSuspendEmployee,
    canApproveOrder,
    checkTeamAccess,
    selfOrAdmin,
    isAdmin
} = require('../middlewares/roleCheck');

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
    getEmployeePDF
} = require('../controllers/employee.controller');

// ============================================================
// FILE UPLOAD (Multer — Memory Storage)
// ছবি Cloudinary তে যাবে, ডকুমেন্ট Drive এ যাবে
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // ৫ MB
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'profile_photo') {
            // শুধু ছবি
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
            }
        }
        cb(null, true);
    }
});

const employeeUpload = upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'documents',     maxCount: 10 } // NID, সার্টিফিকেট ইত্যাদি
]);

// ============================================================
// EMPLOYEE ROUTES
// Base: /api/employees
// ============================================================

// তালিকা ও তৈরি
router.get('/',         auth, checkTeamAccess, getEmployees);
router.post('/',        auth, canCreateEmployee, employeeUpload, createEmployee);

// পেন্ডিং অনুমোদন (Admin)
router.get('/pending',  auth, canApproveEmployee, getPendingEmployees);

// পেন্ডিং এডিট তালিকা
router.get('/audit',    auth, canApproveOrder, getPendingEdits);

// এডিট অনুমোদন/রিজেক্ট
router.put('/audit/:id/approve', auth, canApproveOrder, approveEdit);
router.put('/audit/:id/reject',  auth, canApproveOrder, rejectEdit);

// একজন কর্মচারীর বিস্তারিত
router.get('/:id',      auth, selfOrAdmin, getEmployee);

// PDF প্রোফাইল
router.get('/:id/pdf',  auth, selfOrAdmin, getEmployeePDF);

// অনুমোদন/রিজেক্ট/বরখাস্ত (Admin)
router.put('/:id/approve',  auth, canApproveEmployee, approveEmployee);
router.put('/:id/reject',   auth, canApproveEmployee, rejectEmployee);
router.put('/:id/suspend',  auth, canSuspendEmployee, suspendEmployee);

// প্রোফাইল এডিট
router.put('/:id',      auth, selfOrAdmin, employeeUpload, editEmployee);

module.exports = router;
