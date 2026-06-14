const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const { getMyCustomerCoverage, getVisitAlert, getTeamCoverageSummary } = require('../controllers/coverage.controller');

router.get('/my-customers',       auth, allowRoles('worker'),           getMyCustomerCoverage);
router.get('/visit-alert/:customer_id', auth, allowRoles('worker'),     getVisitAlert);
router.get('/team-summary',       auth, allowRoles('manager', 'admin'), getTeamCoverageSummary);

module.exports = router;
