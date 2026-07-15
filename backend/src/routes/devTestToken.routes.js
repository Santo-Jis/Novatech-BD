// ⚠️ TEMPORARY — Phase 1 functional test শেষে মুছে ফেলতে হবে।
const express = require('express');
const router  = express.Router();
const { mintTestToken } = require('../controllers/devTestToken.controller');

router.post('/mint', mintTestToken);

module.exports = router;
