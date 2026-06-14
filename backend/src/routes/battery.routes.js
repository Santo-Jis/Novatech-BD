const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const { reportBatteryLow } = require('../controllers/battery.controller');

// SR battery কম হলে report করবে
router.post('/alert', auth, allowRoles('worker'), reportBatteryLow);

module.exports = router;
