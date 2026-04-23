const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin, allowRoles } = require('../middlewares/roleCheck');

const {
    getInsights,
    markInsightRead,
    getAIConfig,
    getModels,
    updateAIConfig,
    testAIConnection,
    triggerAIJob,
    aiChat
} = require('../controllers/ai.controller');

// ============================================================
// AI ROUTES
// Base: /api/ai
// ============================================================

// AI Insights দেখুন
router.get('/insights',        auth, allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'), getInsights);

// Insight পড়া হিসেবে মার্ক করুন
router.put('/insights/:id/read', auth, allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'), markInsightRead);

// AI Config দেখুন
router.get('/config',          auth, isAdmin, getAIConfig);

// Available Models
router.get('/models',          auth, isAdmin, getModels);

// AI Config আপডেট
router.put('/config',          auth, isAdmin, updateAIConfig);

// Connection টেস্ট
router.post('/test',           auth, isAdmin, testAIConnection);

// Manual AI Job trigger
router.post('/trigger',        auth, isAdmin, triggerAIJob);

// AI Chat
router.post('/chat',           auth, aiChat);

module.exports = router;
