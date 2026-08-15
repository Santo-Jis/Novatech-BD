const express = require('express')
const router = express.Router()
const { auth } = require('../middlewares/auth')
const { allowRoles } = require('../middlewares/roleCheck')
const {
  getFirebaseToken,
  listThreads,
  markRead,
  notifyNewMessage,
  listSupportAgents,
  addSupportAgent,
  removeSupportAgent,
} = require('../controllers/chat.controller')

router.get('/firebase-token',       auth, getFirebaseToken)
router.get('/threads',              auth, listThreads)
router.patch('/threads/:id/read',   auth, markRead)
router.post('/threads/:id/notify',  auth, notifyNewMessage)

// শুধু Admin — support থ্রেডে কার access থাকবে
router.get('/support-agents',            auth, allowRoles('admin'), listSupportAgents)
router.post('/support-agents',           auth, allowRoles('admin'), addSupportAgent)
router.delete('/support-agents/:userId', auth, allowRoles('admin'), removeSupportAgent)

module.exports = router
