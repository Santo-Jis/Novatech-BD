// backend/src/routes/app.routes.js
const express = require('express')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// নতুন APK বানালে এই দুটো বাড়ান, Render auto-deploy করবে
// তারপর সব user এর App এ update notification আসবে
const APP_VERSION = {
  versionCode: 122,          // ← integer (1, 2, 3...)
  versionName: '1.0.122',   // ← string  (1.0.0, 1.0.1...)
  apkUrl: 'https://github.com/Santo-Jis/Novatech-BD/releases/latest/download/app-release.apk',
  forceUpdate: false,      // ← true করলে update না করলে app চলবে না
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

module.exports = router
