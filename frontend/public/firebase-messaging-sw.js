// ============================================================
// Firebase Cloud Messaging Service Worker
// NovaTechBD — Background Push Notification Handler
// এই ফাইলটি /public/ ফোল্ডারে রাখতে হবে
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// ============================================================
// FIX: Service Worker-এ import.meta.env কাজ করে না।
// তাই useFCMToken.js → sendConfigToSW() থেকে postMessage-এ
// actual Firebase config inject করা হয়।
// ============================================================

let messaging = null

// ── Main app থেকে Firebase config নাও ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FIREBASE_CONFIG') return

  // ইতিমধ্যে init হয়ে গেলে skip
  if (messaging) return

  try {
    firebase.initializeApp(event.data.config)
    messaging = firebase.messaging()

    // Background message handler — app বন্ধ বা background-এ থাকলে
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Background message received:', payload)
      showNotification(payload)
    })

    console.log('[SW] Firebase initialized via postMessage ✅')
  } catch (e) {
    console.error('[SW] Firebase init error:', e.message)
  }
})

// ── Notification দেখানোর helper ────────────────────────────
function showNotification(payload) {
  const { title, body, icon } = payload.notification || {}
  const data = payload.data || {}

  const options = {
    body:     body  || 'নতুন আপডেট এসেছে',
    icon:     icon  || '/icon-192.png',
    badge:    '/badge-72.png',
    tag:      data.type || 'general',
    renotify: true,
    data:     data,
    actions:  getActions(data.type),
    vibrate:  [200, 100, 200],
  }

  self.registration.showNotification(title || 'NovaTech BD', options)
}

// ── Notification click handler ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const url  = getClickUrl(data.type)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          if (url) client.navigate(url)
          return
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url || '/')
      }
    })
  )
})

// ── Helpers ───────────────────────────────────────────────────

function getActions(type) {
  switch (type) {
    case 'order':             return [{ action: 'view', title: '📦 দেখুন' }]
    case 'settlement':
    case 'settlement_result': return [{ action: 'view', title: '💰 দেখুন' }]
    case 'approval':          return [{ action: 'view', title: '✅ দেখুন' }]
    case 'bonus':             return [{ action: 'view', title: '🎉 দেখুন' }]
    default:                  return []
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
