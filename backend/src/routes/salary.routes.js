const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getSalarySheet,
    getWorkerSalaryDetail,
    paySalary,
    getMySalaryHistory,
    cancelSalaryPayment
} = require('../controllers/salary.controller');

// ============================================================
// SALARY ROUTES
// Base: /api/salary
// ============================================================

// SR এর নিজের বেতন ইতিহাস
router.get('/my',
    auth,
    getMySalaryHistory
);

// সব worker এর মাসিক বেতন শীট (Admin/Accountant)
router.get('/sheet',
    auth,
    allowRoles('admin', 'accountant'),
    getSalarySheet
);

// একজন worker এর বিস্তারিত বেতন স্লিপ (Admin/Accountant)
router.get('/worker/:id',
    auth,
    allowRoles('admin', 'accountant'),
    getWorkerSalaryDetail
);

// বেতন পরিশোধ (Admin/Accountant)
router.post('/pay',
    auth,
    allowRoles('admin', 'accountant'),
    paySalary
);

// বেতন পরিশোধ বাতিল — শুধু ২৪ ঘণ্টার মধ্যে (Admin only)
router.delete('/payment/:id',
    auth,
    allowRoles('admin'),
    cancelSalaryPayment
);

module.exports = router;
