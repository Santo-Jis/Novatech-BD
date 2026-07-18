// frontend/src/sw.js
// ============================================================
// ZovoriX — Combined Service Worker
// ১. Workbox (PWA precache) — vite-plugin-pwa inject করবে
// ২. Firebase Background Push — app বন্ধ থাকলেও notification
// ============================================================

// ── Workbox manifest (vite-plugin-pwa এটা inject করবে) ─────
// ✅ FIX: CSS/icons/fonts precache হয়, কিন্তু HTML আর precache হয় না
//   (vite.config.js এর globPatterns থেকে html বাদ দেওয়া হয়েছে)।
//   JS chunks আলাদাভাবে runtime cache-এ যাবে (নিচের fetch handler)।
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

precacheAndRoute(self.__WB_MANIFEST)

// ✅ FIX: নতুন SW install হওয়ার সাথে সাথেই activate + সব খোলা ট্যাব control করো।
// আগে শুধু client message পাঠালে skipWaiting হতো — সেটা না হলে
// ইউজার সবসময় পুরনো (stale) SW-এর কাছে আটকে থাকত, ফলে পুরনো loading page দেখাত।
self.skipWaiting()
clientsClaim()

// ✅ FIX: HTML (loading page সহ পুরো app shell) সবসময় Network First-এ যাবে।
// আগে workbox precache HTML-কে cache-first serve করত, তাই deploy হওয়া নতুন
// index.html কখনো দেখা যেত না — শুধু একদম প্রথমবার (SW install হওয়ার আগে) দেখা যেত।
// এখন: network থেকে সবসময় নতুন HTML আনার চেষ্টা হবে, অফলাইন থাকলে বা ৩ সেকেন্ডে
// রেসপন্স না এলে cache থেকে fallback হবে (অফলাইন সাপোর্টও বজায় থাকবে)।
// ✅ FIX (Session 9): 3 সেকেন্ড টাইমআউট স্লো নেটওয়ার্কে (2G/3G, খারাপ সিগন্যাল)
// অনেক সময়ই পার হয়ে যায় — তখন SW চুপচাপ পুরনো cached HTML সার্ভ করে দিত,
// ফলে নতুন deploy হওয়া UI (নতুন JS bundle রেফারেন্স) হার্ড রিফ্রেশ করলেও
// দেখা যেত না। টাইমআউট বাড়িয়ে ৮ সেকেন্ড করা হলো যাতে সাধারণ স্লো কানেকশনেও
// (যেমন ২৭ KB/s) নতুন HTML আনার যথেষ্ট সময় পাওয়া যায়, fallback শুধু সত্যিকারের
// অফলাইন/টাইমআউট অবস্থাতেই হবে।
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'html-cache-v2', // ✅ FIX: cache নাম বদলানো হলো — পুরনো v1-এ যদি
    // কোনো stale HTML আটকে থাকে, সেটা নতুন নামের cache খুললে আর ব্যবহার হবে না।
    networkTimeoutSeconds: 8,
  })
)

// ✅ FIX (Session 9): পুরনো cache নাম (html-cache-v1, js-chunks-v1) থেকে যেকোনো
// stale entry activate-এর সময় মুছে ফেলা হয়, যাতে নতুন SW সবসময় ফাঁকা/ফ্রেশ
// অবস্থা থেকে শুরু করে — কোনো অদৃশ্য পুরনো cache থেকে যায় না।
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n === 'html-cache-v1')
          .map((n) => caches.delete(n))
      )
    )
  )
})

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

// ============================================================
// ✅ FIX: importScripts ES module SW-তে কাজ করে না।
// এখন 'install' event-এ Firebase compat scripts load করা হয়।
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAYfLiYtbcpX9R9TqhcrEkeghwIw-az-r0',
  authDomain:        'zovorix.firebaseapp.com',
  databaseURL:       'https://zovorix-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:         'zovorix',
  storageBucket:     'zovorix.firebasestorage.app',
  messagingSenderId: '578352842284',
  appId:             '1:578352842284:web:56f515a2ea35fe8ae6b389',
}

// ── Firebase Messaging setup ─────────────────────────────────
function setupMessaging() {
  if (typeof firebase === 'undefined') return
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG)
    }
    const messaging = firebase.messaging()

    // ✅ App বন্ধ বা background এ থাকলেও notification আসবে
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Background push received:', payload)
      const { title, body } = payload.notification || {}
      const data = payload.data || {}
      self.registration.showNotification(title || 'ZovoriX', {
        body:     body || 'নতুন আপডেট এসেছে',
        icon:     '/icon-192.png',
        badge:    '/badge-72.png',
        tag:      data.type || 'general',
        renotify: true,
        data,
        vibrate:  [200, 100, 200],
      })
    })
  } catch (e) {
    console.error('[SW] Firebase Messaging setup error:', e.message)
  }
}

// ── SW activate হলে Firebase compat load করো ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // ES module SW-এ importScripts নেই — তাই fetch করে eval করো
        // (classic SW হলে importScripts এখানে দেওয়া হত)
        const [appResp, msgResp] = await Promise.all([
          fetch('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js'),
          fetch('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js'),
        ])
        const appCode = await appResp.text()
        const msgCode = await msgResp.text()
        // eslint-disable-next-line no-new-func
        new Function(appCode)()
        // eslint-disable-next-line no-new-func
        new Function(msgCode)()
        setupMessaging()
      } catch (e) {
        console.warn('[SW] Firebase compat load failed:', e.message)
      }
    })()
  )
})

// ── PWA skipWaiting ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
