/**
 * onboarding.routes.js — নতুন ফাইল
 * Copy করো: backend/src/routes/onboarding.routes.js
 *
 * server.js-এ যোগ করো (অন্য /api/* routes-এর মতোই, কোনো auth middleware ছাড়া):
 *   const onboardingRoutes = require('./routes/onboarding.routes');
 *   app.use('/api', onboardingRoutes);
 *
 * Endpoints:
 *   POST /api/register                 — নতুন company/tenant register
 *   GET  /api/register/check-slug/:slug — slug available কিনা check
 */

const express = require('express');
const router  = express.Router();
const { registerCompany, checkSlugAvailability } = require('../controllers/onboarding.controller');

router.post('/register', registerCompany);
router.get('/register/check-slug/:slug', checkSlugAvailability);

module.exports = router;
