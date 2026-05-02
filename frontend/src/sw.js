// frontend/src/sw.js
// ============================================================
// NovaTechBD — Combined Service Worker
// ১. Workbox (PWA precache) — vite-plugin-pwa inject করবে
// ২. Firebase Background Push — app বন্ধ থাকলেও notification
// ============================================================

// ── Workbox manifest (vite-plugin-pwa এটা inject করবে) ─────
import { precacheAndRoute } from 'workbox-precaching'
precacheAndRoute(self.__WB_MANIFEST)

// ── Firebase compat scripts ──────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// ============================================================
// ✅ Firebase config — সরাসরি SW এ রাখা হয়েছে
// কারণ: app বন্ধ থাকলে postMessage কাজ করে না
// এখন background push কখনো miss হবে না
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAHdK7zelJcBFc8fOFSgH8G_6jEjZdNoSI',
  authDomain:        'novatech-bd-10421.firebaseapp.com',
  databaseURL:       'https://novatech-bd-10421-default-rtdb.firebaseio.com',
  projectId:         'novatech-bd-10421',
  storageBucket:     'novatech-bd-10421.firebasestorage.app',
  messagingSenderId: '1098950143887',
  appId:             '1:1098950143887:web:bb7014007540c878b165fa',
}

// ── Firebase init — SW start হওয়ার সাথে সাথেই ──────────────
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG)
  }
  setupMessaging()
} catch (e) {
  console.error('[SW] Firebase init error:', e)
}

// ── Firebase Messaging setup ─────────────────────────────────
function setupMessaging() {
  const messaging = firebase.messaging()

  // ✅ App বন্ধ বা background এ থাকলেও notification আসবে
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background push received:', payload)

    const { title, body } = payload.notification || {}
    const data = payload.data || {}

    self.registration.showNotification(title || 'NovaTech BD', {
      body:     body || 'নতুন আপডেট এসেছে',
      icon:     '/icon-192.png',
      badge:    '/badge-72.png',
      tag:      data.type || 'general',
      renotify: true,
      data,
      actions:  getActions(data.type),
      vibrate:  [200, 100, 200],
    })
  })
}

// ── PWA skipWaiting ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Notification click ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const url  = getClickUrl(data.type)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          if (url) client.navigate(url)
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url || '/')
    })
  )
})

// ── Helpers ──────────────────────────────────────────────────
function getActions(type) {
  switch (type) {
    case 'order':             return [{ action: 'view', title: '📦 দেখুন' }]
    case 'settlement':
    case 'settlement_result': return [{ action: 'view', title: '💰 দেখুন' }]
    case 'approval':          return [{ action: 'view', title: '✅ দেখুন' }]
    case 'credit_reminder':   return [{ action: 'view', title: '💳 দেখুন' }]
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
    case 'credit_reminder':   return '/manager/customers'
    default:                  return '/'
  }
}
