const express = require('express')
const router = express.Router()
const { portalAuth } = require('../middlewares/portalAuthShared') // নাম না মিললে auth.js/portalAuthShared.js-এর exact export নাম বসাও
const {
  getFirebaseToken,
  ensureThreads,
  listAllThreads,
  markRead,
  notifyNewMessage,
} = require('../controllers/customerPortalChat.controller')

router.get('/firebase-token',      portalAuth, getFirebaseToken)
router.post('/threads/ensure',     portalAuth, ensureThreads)
router.get('/all-threads',         portalAuth, listAllThreads)
router.patch('/threads/:id/read',  portalAuth, markRead)
router.post('/threads/:id/notify', portalAuth, notifyNewMessage)

module.exports = router
