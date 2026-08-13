const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    listPendingReturns,
    receiveReturn,
    listDiscrepancies,
    resolveDiscrepancy,
} = require('../controllers/settlementReturns.controller');

// Warehouse/Manager — settlement-return pending queue দেখবে
router.get('/pending', auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), listPendingReturns);

// Warehouse/Manager — physically গুনে receive confirm করবে (তখনই stock বাড়বে)
router.post('/:id/receive', auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), receiveReturn);

// Manager — claim ও প্রাপ্ত পরিমাণ না মেলা discrepancy-গুলোর তালিকা
router.get('/discrepancies', auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), listDiscrepancies);

// Manager — discrepancy charge করবে (dues-এ যোগ) অথবা waive করবে (মওকুফ)
router.post('/:id/resolve-discrepancy', auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), resolveDiscrepancy);

module.exports = router;
