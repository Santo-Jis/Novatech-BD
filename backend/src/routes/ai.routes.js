const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleCheck');

const {
    getSettings,
    updateSettings,
    getAuditLogs,
    getSystemStats,
    testSmsGateway
} = require('../controllers/admin.controller');

// ============================================================
// ADMIN ROUTES
// Base: /api/admin
// ============================================================

// সিস্টেম সেটিংস দেখা
router.get('/settings',    auth, isAdmin, getSettings);

// সিস্টেম সেটিংস আপডেট
router.put('/settings',    auth, isAdmin, updateSettings);

// Audit Log
router.get('/audit-logs',  auth, isAdmin, getAuditLogs);

// সিস্টেম পরিসংখ্যান
router.get('/stats',       auth, isAdmin, getSystemStats);

// SMS গেটওয়ে টেস্ট
router.post('/sms-test',   auth, isAdmin, testSmsGateway);

module.exports = router;
