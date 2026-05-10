// backend/src/routes/app.routes.js
const express = require('express')
const path    = require('path')
const fs      = require('fs')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// নতুন APK বানালে GitHub Actions auto-update করবে (versionCode ও versionName)
// apkUrl সরাসরি GitHub release — backend proxy বাদ দেওয়া হয়েছে
const GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/latest/download/app-release.apk'

const APP_VERSION = {
  versionCode: 153,
  versionName: '1.0.153',
  apkUrl: GITHUB_APK_URL,   // ← সরাসরি GitHub, backend-এর ভেতর দিয়ে নয়
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

// GET /api/app/download
// Local APK থাকলে সেটা serve করো, না থাকলে GitHub-এ redirect
router.get('/download', (req, res) => {
  const fileName = `NovaTech-BD-v${APP_VERSION.versionName}.apk`
  const localPath = path.join(__dirname, '../../uploads/app-release.apk')

  if (fs.existsSync(localPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Type', 'application/vnd.android.package-archive')
    return res.sendFile(localPath)
  }

  return res.redirect(302, GITHUB_APK_URL)
})

module.exports = router
