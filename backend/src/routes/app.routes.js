// backend/src/routes/app.routes.js
const express = require('express')
const https   = require('https')
const http    = require('http')
const logger  = require('../config/logger')
const router  = express.Router()

// ─────────────────────────────────────────────────────────────
// MAIN APK (Staff) version
// GitHub Actions (build-apk.yml) auto-update করবে
// ─────────────────────────────────────────────────────────────
const GITHUB_APK_URL = 'https://github.com/Santo-Jis/ZovoriX/releases/latest/download/app-release.apk'

const APP_VERSION = {
  versionCode: 279,
  versionName: '1.0.279',
  apkUrl: 'https://zovorix.onrender.com/api/app/download',
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER APK version
// GitHub Actions (build-customer-apk.yml) auto-update করবে
// ─────────────────────────────────────────────────────────────
// CUSTOMER_VERSION_CODE — এই comment টি রাখো, workflow grep করে এটা দিয়ে
const CUSTOMER_VERSION_CODE = 357
const CUSTOMER_VERSION_NAME = '1.0.357'
const CUSTOMER_GITHUB_APK_URL = 'https://github.com/Santo-Jis/ZovoriX/releases/download/customer-v1.0.357/customer-release.apk'

const CUSTOMER_APP_VERSION = {
  versionCode: CUSTOMER_VERSION_CODE,
  versionName: CUSTOMER_VERSION_NAME,
  apkUrl: 'https://zovorix.onrender.com/api/app/customer-download',
  forceUpdate: false,
  changelog: 'Customer App প্রথম সংস্করণ।',
}

// ─────────────────────────────────────────────────────────────
// SR (Worker) APK version
// GitHub Actions (build-sr-apk.yml) auto-update করবে
// ─────────────────────────────────────────────────────────────
// SR_VERSION_CODE — এই comment টি রাখো, workflow grep করে এটা দিয়ে
// (baseline 0 রাখা হয়েছে — build-sr-apk.yml প্রথমবার চললে ১-এ bump হয়ে
//  versionName '1.0.1' হবে; Customer-এর মতোই versionCode == versionName-এর শেষ অংশ)
const SR_VERSION_CODE = 7
const SR_VERSION_NAME = '1.0.7'
const SR_GITHUB_APK_URL = 'https://github.com/Santo-Jis/ZovoriX/releases/download/sr-v1.0.7/sr-release.apk'

const SR_APP_VERSION = {
  versionCode: SR_VERSION_CODE,
  versionName: SR_VERSION_NAME,
  apkUrl: 'https://zovorix.onrender.com/api/app/sr-download',
  forceUpdate: false,
  changelog: 'SR App প্রথম সংস্করণ।',
}

// ─────────────────────────────────────────────────────────────
// Helper: GitHub থেকে APK stream করে দাও
// ─────────────────────────────────────────────────────────────
function streamApkFromGitHub(githubUrl, fileName, res) {
  const fetchAndPipe = (url, redirectCount = 0) => {
    if (redirectCount > 5) {
      return res.status(500).json({ error: 'Too many redirects' })
    }

    const lib = url.startsWith('https') ? https : http

    lib.get(url, (apkRes) => {
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
      logger.error('APK download error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' })
      }
    })
  }

  fetchAndPipe(githubUrl)
}

// ─────────────────────────────────────────────────────────────
// MAIN APK routes
// ─────────────────────────────────────────────────────────────

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

// GET /api/app/download
router.get('/download', (req, res) => {
  const fileName = `ZovoriX-v${APP_VERSION.versionName}.apk`
  streamApkFromGitHub(GITHUB_APK_URL, fileName, res)
})

// ─────────────────────────────────────────────────────────────
// CUSTOMER APK routes
// ─────────────────────────────────────────────────────────────

// GET /api/app/customer-version
router.get('/customer-version', (req, res) => {
  res.json({ success: true, data: CUSTOMER_APP_VERSION })
})

// GET /api/app/customer-download
router.get('/customer-download', (req, res) => {
  const fileName = `ZovoriX-Customer-v${CUSTOMER_APP_VERSION.versionName}.apk`
  streamApkFromGitHub(CUSTOMER_GITHUB_APK_URL, fileName, res)
})

// ─────────────────────────────────────────────────────────────
// SR (Worker) APK routes
// ─────────────────────────────────────────────────────────────

// GET /api/app/sr-version
router.get('/sr-version', (req, res) => {
  res.json({ success: true, data: SR_APP_VERSION })
})

// GET /api/app/sr-download
router.get('/sr-download', (req, res) => {
  const fileName = `ZovoriX-SR-v${SR_APP_VERSION.versionName}.apk`
  streamApkFromGitHub(SR_GITHUB_APK_URL, fileName, res)
})

module.exports = router
