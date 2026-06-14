const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const { getMyProgress, getTeamProgress, setTarget } = require('../controllers/invoiceTarget.controller');

router.get('/my-progress',   auth, allowRoles('worker'),              getMyProgress);
router.get('/team-progress', auth, allowRoles('manager', 'admin'),    getTeamProgress);
router.put('/set',           auth, allowRoles('admin', 'manager'),    setTarget);

module.exports = router;
