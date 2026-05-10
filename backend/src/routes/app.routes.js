// backend/src/routes/app.routes.js
const express = require('express')
const path    = require('path')
const fs      = require('fs')
const https   = require('https')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// নতুন APK বানালে এই দুটো বাড়ান, Render auto-deploy করবে
// তারপর সব user এর App এ update notification আসবে
const APP_VERSION = {
  versionCode: 149,
  versionName: '1.0.149',
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
// Backend থেকে সরাসরি APK দেবে — ZIP হবে না, সঠিক নামে নামবে
router.get('/download', (req, res) => {
  const fileName = `NovaTech-BD-v${APP_VERSION.versionName}.apk`

  // প্রথমে local uploads ফোল্ডারে দেখো
  const localPath = path.join(__dirname, '../../uploads/app-release.apk')
  if (fs.existsSync(localPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    return res.sendFile(localPath)
  }

  // Local না থাকলে GitHub থেকে proxy করে দাও
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.setHeader('Content-Type', 'application/vnd.android.package-archive')

  const request = https.get(GITHUB_APK_URL, (githubRes) => {
    // GitHub redirect follow করো
    if (githubRes.statusCode === 302 || githubRes.statusCode === 301) {
      const redirectUrl = githubRes.headers.location
      https.get(redirectUrl, (redirectRes) => {
        redirectRes.pipe(res)
      }).on('error', () => {
        res.status(500).json({ success: false, message: 'APK ডাউনলোড করা যায়নি।' })
      })
    } else {
      githubRes.pipe(res)
    }
  })

  request.on('error', () => {
    res.status(500).json({ success: false, message: 'APK ডাউনলোড করা যায়নি।' })
  })
})

module.exports = router

