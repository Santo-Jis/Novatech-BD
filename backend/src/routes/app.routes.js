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
const GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/latest/download/app-release.apk'

const APP_VERSION = {
  versionCode: 329,
  versionName: '1.0.329',
  apkUrl: 'https://zovorix.onrender.com/api/app/download',
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER APK version
// GitHub Actions (build-customer-apk.yml) auto-update করবে
// ─────────────────────────────────────────────────────────────
// CUSTOMER_VERSION_CODE — এই comment টি রাখো, workflow grep করে এটা দিয়ে
const CUSTOMER_VERSION_CODE = 417
const CUSTOMER_VERSION_NAME = '1.0.417'
const CUSTOMER_GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/download/customer-v1.0.417/customer-release.apk'

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
const SR_VERSION_CODE = 25
const SR_VERSION_NAME = '1.0.25'
const SR_GITHUB_APK_URL = 'https://github.com/Santo-Jis/Novatech-BD/releases/download/sr-v1.0.25/sr-release.apk'

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
// Private repo হলে Render-এ GITHUB_TOKEN (repo read / contents:read) সেট করতে হবে।
// Token থাকলে GitHub API দিয়ে release asset খুঁজে authenticated ভাবে stream করা হয়।
function ghRequest(url, headers, cb) {
  const u = new URL(url)
  return https.get({
    hostname: u.hostname,
    path: u.pathname + u.search,
    headers: { 'User-Agent': 'ZovoriX-Backend', ...headers },
  }, cb)
}

function parseGithubUrl(githubUrl) {
  const m = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/(?:(latest)\/download|download\/([^/]+))\/(.+)$/)
  if (!m) return null
  return { owner: m[1], repo: m[2], tag: m[3] ? 'latest' : m[4], file: m[5] }
}

function pipeResponse(apkRes, fileName, res) {
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.setHeader('Content-Type', 'application/vnd.android.package-archive')
  if (apkRes.headers['content-length']) {
    res.setHeader('Content-Length', apkRes.headers['content-length'])
  }
  apkRes.pipe(res)
}

function streamApkFromGitHub(githubUrl, fileName, res) {
  const token = process.env.GITHUB_TOKEN
  const fail = (err) => {
    logger.error('APK download error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' })
  }

  // ── Public repo (token নেই): সরাসরি download URL ──
  const fetchPublic = (url, redirectCount = 0) => {
    if (redirectCount > 5) return res.status(500).json({ error: 'Too many redirects' })
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (apkRes) => {
      if ([301, 302, 307, 308].includes(apkRes.statusCode)) {
        apkRes.resume()
        return fetchPublic(apkRes.headers.location, redirectCount + 1)
      }
      if (apkRes.statusCode !== 200) {
        apkRes.resume()
        return res.status(502).json({
          error: 'APK fetch failed',
          status: apkRes.statusCode,
          hint: apkRes.statusCode === 404 ? 'Release না থাকলে বা repo private হলে GITHUB_TOKEN সেট করুন' : undefined,
        })
      }
      pipeResponse(apkRes, fileName, res)
    }).on('error', fail)
  }

  if (!token) return fetchPublic(githubUrl)

  // ── Private repo (token আছে): API দিয়ে asset খুঁজে download ──
  const info = parseGithubUrl(githubUrl)
  if (!info) return fetchPublic(githubUrl)

  const apiPath = info.tag === 'latest'
    ? `https://api.github.com/repos/${info.owner}/${info.repo}/releases/latest`
    : `https://api.github.com/repos/${info.owner}/${info.repo}/releases/tags/${info.tag}`
  const auth = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }

  ghRequest(apiPath, auth, (relRes) => {
    let body = ''
    relRes.on('data', (c) => (body += c))
    relRes.on('end', () => {
      if (relRes.statusCode !== 200) {
        return res.status(502).json({ error: 'APK fetch failed', status: relRes.statusCode, step: 'release lookup' })
      }
      let asset
      try { asset = (JSON.parse(body).assets || []).find((a) => a.name === info.file) } catch (e) { return fail(e) }
      if (!asset) {
        return res.status(404).json({ error: 'APK asset not found in release', tag: info.tag, file: info.file })
      }

      const download = (url, headers, redirectCount = 0) => {
        if (redirectCount > 5) return res.status(500).json({ error: 'Too many redirects' })
        ghRequest(url, headers, (apkRes) => {
          if ([301, 302, 307, 308].includes(apkRes.statusCode)) {
            apkRes.resume()
            // redirect-এ (S3/CDN) Authorization header পাঠানো যাবে না
            return download(apkRes.headers.location, {}, redirectCount + 1)
          }
          if (apkRes.statusCode !== 200) {
            apkRes.resume()
            return res.status(502).json({ error: 'APK fetch failed', status: apkRes.statusCode, step: 'asset download' })
          }
          pipeResponse(apkRes, fileName, res)
        }).on('error', fail)
      }
      download(asset.url, { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' })
    })
  }).on('error', fail)
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
