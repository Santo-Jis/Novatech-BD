// ============================================================
// SETTINGS ROUTES
// Base: /api/settings
//
// /api/settings/public  → লগইন করা যেকোনো user
// ============================================================

const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { getPublicSettings } = require('../controllers/admin.controller');

// GET /api/settings/public
// ExpenseForm, WorkerDashboard ইত্যাদি এটি ব্যবহার করে expense limit পেতে
router.get('/public', auth, getPublicSettings);

module.exports = router;
