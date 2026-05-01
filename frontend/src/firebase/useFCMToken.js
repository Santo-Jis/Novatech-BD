import { useEffect, useRef } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { initMessaging, VAPID_KEY } from './config'
import { useAuthStore } from '../store/auth.store'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ============================================================
// useFCMToken Hook
// FCM token নিবন্ধন করে backend-এ পাঠায়
// App foreground-এ থাকলে push notification দেখায়
//
// ব্যবহার:
//   FirebaseProvider-এর ভেতরে একবার mount করুন
//   (notifications.js এর useFirebaseNotifications-এর পাশে)
// ============================================================

const FCM_TOKEN_KEY = 'novatech_fcm_token' // localStorage cache key

export function useFCMToken() {
  const { user, token: authToken } = useAuthStore()
  const unsubRef = useRef(null)

  useEffect(() => {
    // User login না করলে বা notification permission না থাকলে skip
    if (!user?.id || !authToken) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    let cancelled = false

    const setup = async () => {
      // ── ১. Messaging initialize ──────────────────────────
      const messaging = await initMessaging()
      if (!messaging || cancelled) return

      // ── ২. FCM token নাও ─────────────────────────────────
      let fcmToken
      try {
        fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: await navigator.serviceWorker.ready,
        })
      } catch (e) {
        console.warn('[FCM] getToken failed:', e.message)
        return
      }

      if (!fcmToken || cancelled) return

      // ── ৩. আগের token-এর সাথে মিললে backend call skip ──
      const cached = localStorage.getItem(FCM_TOKEN_KEY)
      if (cached === fcmToken) return

      // ── ৪. Backend-এ পাঠাও ──────────────────────────────
      try {
        await api.post('/auth/fcm-token', { fcmToken })
        localStorage.setItem(FCM_TOKEN_KEY, fcmToken)
        console.log('[FCM] Token registered successfully')
      } catch (e) {
        console.warn('[FCM] Token registration failed:', e.message)
        // silent fail — পরের login-এ retry হবে
      }

      // ── ৫. Foreground message handler ───────────────────
      // App খোলা থাকলে service worker notification দেখায় না,
      // তাই এখানে toast দিয়ে দেখাই
      if (unsubRef.current) unsubRef.current() // পুরনো listener সরাও

      unsubRef.current = onMessage(messaging, (payload) => {
        if (cancelled) return
        const { title, body } = payload.notification || {}
        const type = payload.data?.type || 'general'

        const icon = getIcon(type)
        const bg   = getBg(type)

        toast(`${icon} ${body || title || 'নতুন আপডেট'}`, {
          duration: 6000,
          style: { background: bg, color: '#fff', fontWeight: '500' },
        })
      })
    }

    setup()

    return () => {
      cancelled = true
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
    }
  }, [user?.id, authToken])

  // Logout-এ cached token সাফ করে
  useEffect(() => {
    if (!user?.id) {
      localStorage.removeItem(FCM_TOKEN_KEY)
    }
  }, [user?.id])
}

// ── Helpers ───────────────────────────────────────────────────

function getIcon(type) {
  switch (type) {
    case 'order':             return '📦'
    case 'settlement':        return '💰'
    case 'settlement_result': return '✅'
    case 'approval':          return '✅'
    case 'bonus':             return '🎉'
    default:                  return '🔔'
  }
}

function getBg(type) {
  switch (type) {
    case 'order':             return '#1e3a8a'
    case 'settlement':        return '#065f46'
    case 'settlement_result': return '#065f46'
    case 'approval':          return '#065f46'
    case 'bonus':             return '#d97706'
    default:                  return '#374151'
  }
}
