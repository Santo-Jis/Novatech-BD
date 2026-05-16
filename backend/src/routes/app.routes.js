// backend/src/routes/app.routes.js
const express = require('express')
const https   = require('https')
const http    = require('http')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// GitHub Actions auto-update করবে: versionCode, versionName
// latest URL ব্যবহার করায় সবসময় সর্বশেষ APK পাবে
const GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/latest/download/app-release.apk'

const APP_VERSION = {
  versionCode: 358,
  versionName: '1.0.158',
  apkUrl: 'https://novatechbd-backend.onrender.com/api/app/download',
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

// GET /api/app/download
// GitHub থেকে APK pipe করে সঠিক নামে serve করে
router.get('/download', (req, res) => {
  const fileName = `NovaTech-BD-v${APP_VERSION.versionName}.apk`

  const fetchAndPipe = (url, redirectCount = 0) => {
    if (redirectCount > 5) {
      return res.status(500).json({ error: 'Too many redirects' })
    }

    const lib = url.startsWith('https') ? https : http

    lib.get(url, (apkRes) => {
      // redirect follow করো
      if (apkRes.statusCode === 301 || apkRes.statusCode === 302 || apkRes.statusCode === 307) {
        return fetchAndPipe(apkRes.headers.location, redirectCount + 1)
      }

      if (apkRes.statusCode !== 200) {
        return res.status(502).json({ error: 'APK fetch failed', status: apkRes.statusCode })
      }

      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      res.setHeader('Content-Type', 'application/vnd.android.package-archive')

      if (apkRes.headers['content-length']) {
        res.setHeader('Content-Length', apkRes.headers['content-length'])
      }

      apkRes.pipe(res)
    }).on('error', (err) => {
      console.error('APK download error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' })
      }
    })
  }

  fetchAndPipe(GITHUB_APK_URL)
})

module.exports = router
