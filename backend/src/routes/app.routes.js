// backend/src/routes/app.routes.js
const express = require('express')
const path    = require('path')
const fs      = require('fs')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// নতুন APK বানালে এই দুটো বাড়ান, Render auto-deploy করবে
// তারপর সব user এর App এ update notification আসবে
const APP_VERSION = {
  versionCode: 150,
  versionName: '1.0.150',
  apkUrl: `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000'}/api/app/download`,
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// GitHub থেকে APK-এর direct download URL
const GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/latest/download/app-release.apk'

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

// GET /api/app/download
// সঠিক নামে APK download হবে
router.get('/download', (req, res) => {
  const fileName = `NovaTech-BD-v${APP_VERSION.versionName}.apk`

  // প্রথমে local uploads ফোল্ডারে দেখো
  const localPath = path.join(__dirname, '../../uploads/app-release.apk')
  if (fs.existsSync(localPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    return res.sendFile(localPath)
  }

  // Local না থাকলে GitHub-এ সরাসরি redirect করো।
  // আগে proxy করা হতো (https.get → pipe) কিন্তু GitHub multiple 302 redirect
  // করে — শুধু একটা follow করলে download fail হয়।
  // তাই client-কেই GitHub-এ পাঠিয়ে দিচ্ছি, browser নিজেই সব redirect follow করবে।
  return res.redirect(302, GITHUB_APK_URL)
})

module.exports = router
