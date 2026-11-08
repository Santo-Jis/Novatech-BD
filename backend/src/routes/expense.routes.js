const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    submitExpense,
    getTodayExpense,
    getMyExpenses,
    getTeamExpenses,
    reviewExpense,
    updateExpense
} = require('../controllers/expense.controller');
const {
    listCompanyExpenses,
    createCompanyExpense,
    updateCompanyExpense,
    deleteCompanyExpense
} = require('../controllers/companyExpense.controller');

// ============================================================
// SR Routes (worker)
// ============================================================

// আজকের রিপোর্ট আছে কিনা
router.get('/today',
    auth,
    allowRoles('worker'),
    getTodayExpense
);

// নিজের ইতিহাস দেখো
router.get('/my',
    auth,
    allowRoles('worker'),
    getMyExpenses
);

// নতুন রিপোর্ট জমা দাও
router.post('/submit',
    auth,
    allowRoles('worker'),
    submitExpense
);

// pending রিপোর্ট edit করো
router.put('/:id',
    auth,
    allowRoles('worker'),
    updateExpense
);

// ============================================================
// Manager / Admin Routes
// ============================================================

// দলের সব রিপোর্ট দেখো
router.get('/team',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    getTeamExpenses
);

// Approve / Reject
router.patch('/:id/review',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    reviewExpense
);

// ============================================================
// কোম্পানির সাধারণ খরচ (ভাড়া, বিদ্যুৎ ইত্যাদি) — Admin / Accountant
// ============================================================
router.get('/company',        auth, allowRoles('admin', 'accountant'), listCompanyExpenses);
router.post('/company',       auth, allowRoles('admin', 'accountant'), createCompanyExpense);
router.put('/company/:id',    auth, allowRoles('admin', 'accountant'), updateCompanyExpense);
router.delete('/company/:id', auth, allowRoles('admin', 'accountant'), deleteCompanyExpense);

module.exports = router;
