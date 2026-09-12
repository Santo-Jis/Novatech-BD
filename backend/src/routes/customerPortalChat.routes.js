const express = require('express')
const router = express.Router()
const multer = require('multer')
const { portalAuth } = require('../middlewares/portalAuthShared') // নাম না মিললে auth.js/portalAuthShared.js-এর exact export নাম বসাও
const { chatSendRateLimit } = require('../middlewares/chatRateLimit')

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
  ensureThreads,
  listAllThreads,
  markRead,
  notifyNewMessage,
  uploadVoiceNote,
  blockThread,
  reportThread,
} = require('../controllers/customerPortalChat.controller')

router.get('/firebase-token',      portalAuth, getFirebaseToken)
router.post('/threads/ensure',     portalAuth, ensureThreads)
router.get('/all-threads',         portalAuth, listAllThreads)
router.patch('/threads/:id/read',  portalAuth, markRead)
router.post('/threads/:id/notify', portalAuth, chatSendRateLimit, notifyNewMessage)
router.post('/threads/:id/voice',  portalAuth, chatSendRateLimit, voiceUpload.single('audio'), uploadVoiceNote)

// ধাপ ২ (Foundation) — Block/Report। ⚠️ ইচ্ছাকৃতভাবে এখানে DELETE/unblock নেই —
// কাস্টমার নিজে ব্লক করলে শুধু staff/management (chat.routes.js) সেটা তুলতে পারবে।
router.post('/threads/:id/block',  portalAuth, blockThread)
router.post('/threads/:id/report', portalAuth, reportThread)

module.exports = router
