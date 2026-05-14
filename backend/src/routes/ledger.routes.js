const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getMyStock,
    getLedgerHistory,
    adjustStock,
} = require('../controllers/ledger.controller');

// SR নিজের হাতের স্টক দেখবে
router.get('/stock',   auth, allowRoles('worker'), getMyStock);

// ইতিহাস — SR নিজেরটা, Manager/Supervisor/ASM/RSM যেকোনো SR-এর
router.get('/history', auth, allowRoles('worker', 'manager', 'supervisor', 'asm', 'rsm', 'admin'), getLedgerHistory);

// Admin/Manager/Supervisor ম্যানুয়াল সংশোধন
router.post('/adjust', auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), adjustStock);

module.exports = router;
