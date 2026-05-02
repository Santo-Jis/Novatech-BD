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

// ইতিহাস — SR নিজেরটা, Manager যেকোনো SR-এর
router.get('/history', auth, allowRoles('worker', 'manager', 'admin'), getLedgerHistory);

// Admin/Manager ম্যানুয়াল সংশোধন
router.post('/adjust', auth, allowRoles('manager', 'admin'), adjustStock);

module.exports = router;
