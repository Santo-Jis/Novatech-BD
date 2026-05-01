// ============================================================
// Firebase Cloud Messaging Service Worker
// NovaTechBD — Background Push Notification Handler
// এই ফাইলটি /public/ ফোল্ডারে রাখতে হবে
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:      self.FIREBASE_API_KEY      || '%%VITE_FIREBASE_API_KEY%%',
  authDomain:  self.FIREBASE_AUTH_DOMAIN  || '%%VITE_FIREBASE_AUTH_DOMAIN%%',
  projectId:   self.FIREBASE_PROJECT_ID   || '%%VITE_FIREBASE_PROJECT_ID%%',
  storageBucket: self.FIREBASE_STORAGE_BUCKET || '%%VITE_FIREBASE_STORAGE_BUCKET%%',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '%%VITE_FIREBASE_MESSAGING_SENDER_ID%%',
  appId:       self.FIREBASE_APP_ID       || '%%VITE_FIREBASE_APP_ID%%',
})

const messaging = firebase.messaging()

// ── Background message handler ───────────────────────────────
// App বন্ধ বা background-এ থাকলে এখানে notification আসে
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload)

  const { title, body, icon, data } = payload.notification || {}
  const notifTitle = title || 'NovaTech BD'
  const notifBody  = body  || 'নতুন আপডেট এসেছে'

  const options = {
    body:  notifBody,
    icon:  icon || '/icon-192.png',
    badge: '/badge-72.png',
    tag:   data?.type || 'general',       // একই type-এর পুরনো notification replace হবে
    renotify: true,
    data:  data || {},
    actions: getActions(data?.type),
    vibrate: [200, 100, 200],
  }

  self.registration.showNotification(notifTitle, options)
})

// ── Notification click handler ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const url  = getClickUrl(data.type, data)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // App ইতিমধ্যে খোলা থাকলে focus করো
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          if (url) client.navigate(url)
          return
        }
      }
      // না থাকলে নতুন window খোলো
      if (clients.openWindow) {
        return clients.openWindow(url || '/')
      }
    })
  )
})

// ── Helpers ───────────────────────────────────────────────────

function getActions(type) {
  switch (type) {
    case 'order':
      return [{ action: 'view', title: '📦 দেখুন' }]
    case 'settlement':
    case 'settlement_result':
      return [{ action: 'view', title: '💰 দেখুন' }]
    case 'approval':
      return [{ action: 'view', title: '✅ দেখুন' }]
    default:
      return []
  }
}

function getClickUrl(type, data) {
  switch (type) {
    case 'order':       return '/manager/orders'
    case 'settlement':  return '/manager/settlements'
    case 'settlement_result': return '/worker/settlement'
    case 'approval':    return '/worker/attendance'
    case 'bonus':       return '/worker/dashboard'
    default:            return '/'
  }
}
