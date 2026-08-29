const express = require('express')
const router = express.Router()
const multer = require('multer')
const { auth } = require('../middlewares/auth')
const { allowRoles, isManagement } = require('../middlewares/roleCheck')

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) return cb(new Error('শুধু অডিও ফাইল আপলোড করা যাবে।'))
    cb(null, true)
  },
})

const {
  getFirebaseToken,
  listThreads,
  markRead,
  notifyNewMessage,
  listSupportAgents,
  addSupportAgent,
  removeSupportAgent,
  getCustomerDueCard,
  listInternalNotes,
  addInternalNote,
  listTeamMembers,
  getSlaStats,
  flagMessage,
  listFlaggedMessages,
  resolveBroadcastRecipients,
  logBroadcast,
  draftReply,
  summarizeThread,
  checkRisk,
  uploadVoiceNote,
} = require('../controllers/chat.controller')

router.get('/firebase-token',       auth, getFirebaseToken)
router.get('/threads',              auth, listThreads)
router.patch('/threads/:id/read',   auth, markRead)
router.post('/threads/:id/notify',  auth, notifyNewMessage)

// Phase 2 — বিজনেস কার্ড (Session 1: বাকি/ক্রেডিট)
router.get('/cards/due/:customerId', auth, getCustomerDueCard)

// Phase 3, Session 1 — ইন্টারনাল নোট/@মেনশন
router.get('/threads/:id/notes',    auth, listInternalNotes)
router.post('/threads/:id/notes',   auth, addInternalNote)
router.get('/team-members',         auth, listTeamMembers)

// Phase 3, Session 2 — SLA + অডিট ট্রেইল
// flag: যেকোনো স্টাফ নিজের পাঠানো মেসেজ ফ্ল্যাগ করতে পারবে (main chat send-এর
// মতোই role-খোলা), stats/flagged-list ম্যানেজমেন্ট-টিয়ার — support-agents-এর
// মতোই admin-only রাখা হলো (manager-দের access দরকার হলে allowRoles-এ যোগ করুন)
router.post('/threads/:id/flag',    auth, flagMessage)
router.get('/sla/stats',            auth, allowRoles('admin'), getSlaStats)
router.get('/flagged',              auth, allowRoles('admin'), listFlaggedMessages)

// Phase 3, Session 3 — ব্রডকাস্ট/ক্যাম্পেইন (route.routes.js-এর isManagement-এর
// সাথে সঙ্গতিপূর্ণ গার্ড — admin/manager/supervisor/asm/rsm)
router.post('/broadcast/resolve',   auth, isManagement, resolveBroadcastRecipients)
router.post('/broadcast/log',       auth, isManagement, logBroadcast)

// Phase 4 — AI কোপাইলট (on-demand, যেকোনো staff — খরচের গেট callAI-এর ভেতরেই
// প্রতি-tenant wallet/BYOK চেক দিয়ে হয়, এখানে আলাদা role-restriction লাগেনি)
router.post('/ai/draft-reply',      auth, draftReply)
router.post('/ai/summarize',        auth, summarizeThread)
router.post('/ai/risk-check',       auth, checkRisk)

// Phase 1 (দেরিতে) — ভয়েস নোট আপলোড
router.post('/threads/:id/voice',   auth, voiceUpload.single('audio'), uploadVoiceNote)

// শুধু Admin — support থ্রেডে কার access থাকবে
router.get('/support-agents',            auth, allowRoles('admin'), listSupportAgents)
router.post('/support-agents',           auth, allowRoles('admin'), addSupportAgent)
router.delete('/support-agents/:userId', auth, allowRoles('admin'), removeSupportAgent)

module.exports = router
