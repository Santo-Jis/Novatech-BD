const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin, allowRoles } = require('../middlewares/roleCheck');

const {
    getInsights,
    markInsightRead,
    getModels,
    aiChat,
    getOwnAIKeyStatus,
    updateOwnAIKey
} = require('../controllers/ai.controller');

// ============================================================
// AI ROUTES
// Base: /api/ai
//
// ⚠️ ৩০ জুলাই ২০২৬: getAIConfig/updateAIConfig/testAIConnection/
// triggerAIJob এখান থেকে সরিয়ে Super-Admin-only /superadmin/api/ai/*
// এ নেওয়া হয়েছে — কারণ এগুলো ai_config-এর *গ্লোবাল, সব tenant-শেয়ার্ড*
// key/model বদলায়। আগে tenant-role 'admin' (isAdmin) দিয়ে protect করা
// ছিল — মানে যেকোনো tenant-এর Admin পুরো প্ল্যাটফর্মের shared AI key
// ওভাররাইট করতে পারতো। এখন প্রতি-tenant BYOK (/own-key) ব্যবহার হবে।
// ============================================================

// AI Insights দেখুন
router.get('/insights',        auth, allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'), getInsights);

// Insight পড়া হিসেবে মার্ক করুন
router.put('/insights/:id/read', auth, allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'), markInsightRead);

// Available Models — নিজের key যোগ করার সময় model বাছাইয়ের জন্য দরকার, তাই tenant admin-এর জন্য খোলা
router.get('/models',          auth, isAdmin, getModels);

// AI Chat
router.post('/chat',           auth, aiChat);

// ✅ ৩০ জুলাই ২০২৬: Tenant নিজের AI Key (BYOK) — জমা দেওয়ার পর Super Admin approve করলে সক্রিয় হয়
router.get('/own-key',         auth, isAdmin, getOwnAIKeyStatus);
router.put('/own-key',         auth, isAdmin, updateOwnAIKey);

module.exports = router;
