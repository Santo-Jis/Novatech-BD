// ============================================================
// FCM Push Notification Helper
// backend/src/services/fcm.service.js
//
// Firebase Admin SDK দিয়ে FCM push পাঠায়
// sendNotification() (Realtime DB) এর সাথে একসাথে কল করুন
// ============================================================

const admin = require('firebase-admin')
const { query } = require('../config/db')
const { initializeFirebase } = require('../config/firebase')

// ============================================================
// saveFCMToken — User-এর FCM token DB-তে সেভ করো
// auth.controller.js এর নতুন route handler থেকে কল হবে
// ============================================================

const saveFCMToken = async (userId, fcmToken) => {
  // users টেবিলে fcm_token column সেভ করো
  // Migration: ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
  await query(
    `UPDATE users SET fcm_token = $1, fcm_token_updated_at = NOW() WHERE id = $2`,
    [fcmToken, userId]
  )
}

// ============================================================
// getFCMTokens — এক বা একাধিক userId-র FCM token নাও
// ============================================================

const getFCMTokens = async (userIds) => {
  if (!userIds?.length) return []
  const { rows } = await query(
    `SELECT id, fcm_token FROM users
     WHERE id = ANY($1::int[]) AND fcm_token IS NOT NULL`,
    [userIds]
  )
  return rows.map(r => r.fcm_token).filter(Boolean)
}

// ============================================================
// sendPushNotification — একটি user-এ push পাঠাও
// Realtime DB-র sendNotification() এর সাথে জোড়ায় ব্যবহার করুন
//
// উদাহরণ:
//   await sendNotification(userId, payload)        // Realtime DB (in-app)
//   await sendPushNotification(userId, payload)    // FCM (background/push)
// ============================================================

const sendPushNotification = async (userId, { title, body, type, data = {} }) => {
  const tokens = await getFCMTokens([userId])
  if (!tokens.length) return

  await sendPushToTokens(tokens, { title, body, type, data })
}

// ============================================================
// sendPushToMany — একাধিক user-এ push পাঠাও (multicast)
// ============================================================

const sendPushToMany = async (userIds, { title, body, type, data = {} }) => {
  const tokens = await getFCMTokens(userIds)
  if (!tokens.length) return

  await sendPushToTokens(tokens, { title, body, type, data })
}

// ── Internal helper ───────────────────────────────────────────

const sendPushToTokens = async (tokens, { title, body, type, data = {} }) => {
  if (!tokens.length) return

  // প্রথম push call-এ Firebase init নিশ্চিত করো
  initializeFirebase()

  try {
    const message = {
      notification: { title, body },
      data: {
        type:      type || 'general',
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },
      android: {
        notification: {
          sound:       'default',
          channelId:   'novatech_default',
          priority:    'high',
        },
      },
      webpush: {
        notification: {
          icon:  '/icon-192.png',
          badge: '/badge-72.png',
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          link: getClickUrl(type),
        },
      },
      tokens,
    }

    const response = await admin.messaging().sendEachForMulticast(message)

    // Stale token cleanup
    const staleTokens = []
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(tokens[idx])
        }
      }
    })

    if (staleTokens.length) {
      await query(
        `UPDATE users SET fcm_token = NULL WHERE fcm_token = ANY($1::text[])`,
        [staleTokens]
      )
      console.log(`[FCM] ${staleTokens.length} stale token(s) removed`)
    }

    console.log(`[FCM] Sent: ${response.successCount}/${tokens.length}`)
  } catch (e) {
    console.error('[FCM] sendPushToTokens error:', e.message)
  }
}

function getClickUrl(type) {
  switch (type) {
    case 'order':             return '/manager/orders'
    case 'settlement':        return '/manager/settlements'
    case 'settlement_result': return '/worker/settlement'
    case 'approval':          return '/worker/attendance'
    case 'bonus':             return '/worker/dashboard'
    default:                  return '/'
  }
}

// ============================================================
// clearStaleCustomerToken — কাস্টমারের expired FCM token মুছো
// customers টেবিলে NULL করে — দুই জায়গায় আলাদা করে না লিখে
// এই single function সব জায়গায় ব্যবহার করো
// ============================================================

const clearStaleCustomerToken = async (fcmToken) => {
  try {
    await query(
      `UPDATE customers SET fcm_token = NULL, fcm_token_updated_at = NOW()
       WHERE fcm_token = $1`,
      [fcmToken]
    )
    console.log('[FCM] Stale customer token cleared')
  } catch (e) {
    console.error('[FCM] clearStaleCustomerToken error:', e.message)
  }
}

// ============================================================
// sendCustomerPush — একজন কাস্টমারের browser-এ push পাঠাও
// stale token হলে automatically customers টেবিল থেকে মুছবে
// ============================================================

const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

const sendCustomerPush = async (fcmToken, { title, body, type = 'general' }) => {
  if (!fcmToken) return

  initializeFirebase()

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { type },
      webpush: {
        notification: {
          icon:    '/icon-192.png',
          badge:   '/badge-72.png',
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: '/customer-portal' },
      },
    })
  } catch (e) {
    if (STALE_TOKEN_CODES.has(e.code)) {
      await clearStaleCustomerToken(fcmToken)
    } else {
      console.error('[FCM] sendCustomerPush error:', e.message)
    }
  }
}

module.exports = {
  saveFCMToken,
  getFCMTokens,
  sendPushNotification,
  sendPushToMany,
  sendCustomerPush,
  clearStaleCustomerToken,
}
