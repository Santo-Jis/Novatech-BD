const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles, isAdmin } = require('../middlewares/roleCheck');

const {
    getInsights,
    markInsightRead,
    getAIConfig,
    updateAIConfig,
    triggerAIJob,
    aiChat
} = require('../controllers/ai.controller');

// ============================================================
// AI ROUTES
// Base: /api/ai
// ============================================================

// বর্তমান ইউজারের Insights
router.get('/insights',         auth, getInsights);

// Insight পড়া হয়েছে মার্ক করো
router.put('/insights/:id/read', auth, markInsightRead);

// AI Config দেখা (Admin)
router.get('/config',           auth, isAdmin, getAIConfig);

// AI Config আপডেট (Admin)
router.put('/config',           auth, isAdmin, updateAIConfig);

// Manual AI Job trigger (Admin — টেস্টিংয়ের জন্য)
router.post('/trigger', auth, isAdmin, triggerAIJob);

// AI Chat (Manager/Admin)
router.post('/chat', auth, allowRoles(['admin','manager','supervisor','asm','rsm']), aiChat);

module.exports = router;
