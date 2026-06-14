const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const { getMyRank, getTeamLeaderboard } = require('../controllers/leaderboard.controller');

router.get('/my-rank', auth, allowRoles('worker'),                  getMyRank);
router.get('/team',    auth, allowRoles('manager', 'admin'),        getTeamLeaderboard);

module.exports = router;
