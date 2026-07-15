// ============================================================
// CUSTOMER PORTAL PROFILE ROUTES — Base: /api/portal/profile
// ============================================================

const express = require('express');
const router  = express.Router();
const { portalAuth } = require('../middlewares/portalAuthShared');

const { getMyAreaAndField, updateMyAreaAndField } = require('../controllers/customerPortalProfile.controller');

router.get('/area-field', portalAuth, getMyAreaAndField);
router.put('/area-field', portalAuth, updateMyAreaAndField);

module.exports = router;
