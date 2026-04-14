const express = require('express');
const router  = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles, isAdmin } = require('../middlewares/roleCheck');
const {
    getInsights, markInsightRead,
    getAIConfig, getModels, updateAIConfig,
    testAIConnection, triggerAIJob, aiChat
} = require('../controllers/ai.controller');

router.get('/insights',         auth,          getInsights);
router.put('/insights/:id/read',auth,          markInsightRead);
router.get('/config',           auth, isAdmin, getAIConfig);
router.get('/models',           auth, isAdmin, getModels);
router.put('/config',           auth, isAdmin, updateAIConfig);
router.post('/test',            auth, isAdmin, testAIConnection);
router.post('/trigger',         auth, isAdmin, triggerAIJob);
router.post('/chat',            auth, allowRoles('admin','manager','supervisor','asm','rsm'), aiChat);

module.exports = router;
