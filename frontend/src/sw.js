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

// ── Firebase init ────────────────────────────────────────────
// env variable সরাসরি SW এ কাজ করে না, তাই
// main thread থেকে config নেওয়া হবে (postMessage)
// fallback হিসেবে নিচে placeholder রাখা আছে

let firebaseInitialized = false

function tryInitFirebase(config) {
  if (firebaseInitialized) return
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config)
    }
    firebaseInitialized = true
    setupMessaging()
  } catch (e) {
    console.error('[SW] Firebase init error:', e)
  }
}

// ── Main thread থেকে Firebase config নাও ────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    tryInitFirebase(event.data.config)
  }
  // PWA skipWaiting
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Firebase Messaging setup ─────────────────────────────────
function setupMessaging() {
  const messaging = firebase.messaging()

  // App বন্ধ বা background এ থাকলে এখানে notification আসে
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
