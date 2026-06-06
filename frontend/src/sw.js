// frontend/src/sw.js
// ============================================================
// NovaTechBD — Combined Service Worker
// ১. Workbox (PWA precache) — vite-plugin-pwa inject করবে
// ২. Firebase Background Push — app বন্ধ থাকলেও notification
// ============================================================

// ── Workbox manifest (vite-plugin-pwa এটা inject করবে) ─────
// ✅ FIX: এখন শুধু app shell (HTML, CSS, icons) pre-cached।
//   JS chunks আলাদাভাবে runtime cache-এ যাবে (নিচের fetch handler)।
import { precacheAndRoute } from 'workbox-precaching'
precacheAndRoute(self.__WB_MANIFEST)

// ── Runtime caching for JS role chunks ─────────────────────
// ✅ FIX: role-worker.js, role-admin.js ইত্যাদি প্রথমবার navigate করলে
//   SW cache-এ রাখা হয়। পরের বার instant load — কোনো network request নেই।
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // শুধু JS assets cache করবে (role chunks + vendor chunks)
  if (
    event.request.destination === 'script' &&
    (url.pathname.includes('/assets/') || url.pathname.includes('/role-') || url.pathname.includes('/vendor-'))
  ) {
    event.respondWith(
      caches.open('js-chunks-v1').then(async (cache) => {
        // Cache-first: আগে cache চেক, না থাকলে network থেকে নিয়ে cache করে দাও
        const cached = await cache.match(event.request)
        if (cached) return cached

        const response = await fetch(event.request)
        if (response.ok) {
          cache.put(event.request, response.clone())
        }
        return response
      }).catch(() => fetch(event.request)) // cache ব্যর্থ হলে সরাসরি network
    )
  }
})

// ── Firebase compat scripts ──────────────────────────────────
// try/catch: CDN unavailable হলে SW crash না করে gracefully fail করবে
let firebaseLoaded = false
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')
  firebaseLoaded = true
} catch (e) {
  console.warn('[SW] Firebase scripts load failed:', e.message)
}

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
  if (firebaseLoaded && typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG)
    }
    setupMessaging()
  }
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
