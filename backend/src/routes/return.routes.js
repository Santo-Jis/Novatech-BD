const express    = require('express');
const router     = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    submitReturn,
    getMyReturns,
    getTeamReturns,
    reviewReturn,
    completeReturn
} = require('../controllers/return.controller');

// SR Routes
router.post('/submit',        auth, allowRoles('worker'), submitReturn);
router.get('/my',             auth, allowRoles('worker'), getMyReturns);
router.patch('/:id/complete', auth, allowRoles('worker'), completeReturn);

// Manager / Admin Routes
router.get('/team',           auth, allowRoles('admin','manager','supervisor','asm','rsm','accountant'), getTeamReturns);
router.patch('/:id/review',   auth, allowRoles('admin','manager','supervisor','asm','rsm','accountant'), reviewReturn);

module.exports = router;
