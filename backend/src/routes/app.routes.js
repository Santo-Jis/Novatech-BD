// backend/src/routes/app.routes.js
const express = require('express')
const https   = require('https')
const http    = require('http')
const axios   = require('axios')
const router  = express.Router()

// ─── Current APK version ──────────────────────────────────────
// GitHub Actions auto-update করবে: versionCode, versionName, B2_FILE_NAME
const B2_FILE_NAME = 'NovaTech-BD-v1.0.160.apk'

const APP_VERSION = {
  versionCode: 160,
  versionName: '1.0.159',
  apkUrl: '/api/app/download',  // backend proxy → B2 private → সঠিক নামে download
  forceUpdate: false,
  changelog: 'প্রথম সংস্করণ। সব ফিচার যোগ করা হয়েছে।',
}

// B2 authorize করে download URL + token নেয়
const getB2DownloadAuth = async () => {
  const keyId  = process.env.B2_KEY_ID
  const appKey = process.env.B2_APPLICATION_KEY
  const bucketName = process.env.B2_BUCKET_NAME

  // Step 1: authorize_account
  const authRes = await axios.get('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    auth: { username: keyId, password: appKey },
  })

  const { authorizationToken, apiInfo } = authRes.data
  const apiUrl = apiInfo.storageApi.apiUrl

  // Step 2: get_download_authorization (private bucket용 token)
  const dlAuthRes = await axios.post(
    `${apiUrl}/b2api/v3/b2_get_download_authorization`,
    {
      bucketId:               process.env.B2_BUCKET_ID,
      fileNamePrefix:         B2_FILE_NAME,
      validDurationInSeconds: 3600,
    },
    { headers: { Authorization: authorizationToken } }
  )

  const downloadUrl = apiInfo.storageApi.downloadUrl

  return {
    downloadUrl,
    downloadToken: dlAuthRes.data.authorizationToken,
  }
}

// GET /api/app/version
router.get('/version', (req, res) => {
  res.json({ success: true, data: APP_VERSION })
})

// GET /api/app/download
// B2 private bucket থেকে authorized download → সঠিক নামে serve
router.get('/download', async (req, res) => {
  const fileName = B2_FILE_NAME

  try {
    const { downloadUrl, downloadToken } = await getB2DownloadAuth()

    const fileUrl = `${downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`

    const b2Res = await axios.get(fileUrl, {
      headers:      { Authorization: downloadToken },
      responseType: 'stream',
    })

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Type', 'application/vnd.android.package-archive')

    if (b2Res.headers['content-length']) {
      res.setHeader('Content-Length', b2Res.headers['content-length'])
    }

    b2Res.data.pipe(res)

  } catch (err) {
    console.error('B2 download error:', err?.response?.data || err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'APK download failed' })
    }
  }
})

module.exports = router
