// ============================================================
// REFERENCE ROUTES — Base: /api/reference (public, auth লাগে না)
// ============================================================

const express = require('express');
const router  = express.Router();

const { getDivisions, getDistricts, getBusinessFields } = require('../controllers/reference.controller');

router.get('/divisions',       getDivisions);
router.get('/districts',       getDistricts);
router.get('/business-fields', getBusinessFields);

module.exports = router;
