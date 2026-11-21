const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    expenseReceiptUpload,
    submitExpense,
    getTodayExpense,
    getMyExpenses,
    getTeamExpenses,
    reviewExpense,
    updateExpense
} = require('../controllers/expense.controller');
const {
    receiptUpload,
    listCompanyExpenses,
    createCompanyExpense,
    updateCompanyExpense,
    deleteCompanyExpense,
    listCategories, createCategory, updateCategory, deleteCategory,
    listRecurring, createRecurring, updateRecurring, deleteRecurring,
    listPrepaid, createPrepaid, deletePrepaid, getBudgets, setBudget
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
    expenseReceiptUpload,
    submitExpense
);

// pending রিপোর্ট edit করো
router.put('/:id',
    auth,
    allowRoles('worker'),
    expenseReceiptUpload,
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
const fin = [auth, allowRoles('admin', 'accountant')];

// ক্যাটাগরি ও নির্দিষ্ট মাসিক খরচ — '/company/:id'-এর আগে রাখা হয়েছে
router.get('/company/categories',        ...fin, listCategories);
router.post('/company/categories',       ...fin, createCategory);
router.put('/company/categories/:id',    ...fin, updateCategory);
router.delete('/company/categories/:id', ...fin, deleteCategory);

router.get('/company/recurring',         ...fin, listRecurring);
router.post('/company/recurring',        ...fin, createRecurring);
router.put('/company/recurring/:id',     ...fin, updateRecurring);
router.delete('/company/recurring/:id',  ...fin, deleteRecurring);

router.get('/company/prepaid',           ...fin, listPrepaid);
router.post('/company/prepaid',          ...fin, receiptUpload, createPrepaid);
router.delete('/company/prepaid/:id',    ...fin, deletePrepaid);

router.get('/company/budgets',           ...fin, getBudgets);
router.put('/company/budgets',           ...fin, setBudget);

router.get('/company',        ...fin, listCompanyExpenses);
router.post('/company',       ...fin, receiptUpload, createCompanyExpense);
router.put('/company/:id',    ...fin, receiptUpload, updateCompanyExpense);
router.delete('/company/:id', ...fin, deleteCompanyExpense);

module.exports = router;
