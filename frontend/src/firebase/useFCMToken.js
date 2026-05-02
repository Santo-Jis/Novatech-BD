import { useEffect, useRef } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { initMessaging, VAPID_KEY } from './config'
import { useAuthStore } from '../store/auth.store'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ============================================================
// useFCMToken Hook — SR / Manager / Worker
// ১. Notification permission চায় (প্রথমবার popup)
// ২. Service Worker কে Firebase config পাঠায় (background push)
// ③. FCM token backend এ save করে
// ④. Foreground message toast দেখায়
// ============================================================

const FCM_TOKEN_KEY = 'novatech_fcm_token'

// SW কে Firebase config পাঠাও (background push এর জন্য দরকার)
const sendConfigToSW = async () => {
  if (!('serviceWorker' in navigator)) return
  try {
    const swReg = await navigator.serviceWorker.ready
    if (!swReg.active) return
    swReg.active.postMessage({
      type: 'FIREBASE_CONFIG',
      config: {
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      },
    })
  } catch (e) {
    console.warn('[FCM] SW config send failed:', e.message)
  }
}

export function useFCMToken() {
  const { user, token: authToken } = useAuthStore()
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!user?.id || !authToken) return
    if (!('Notification' in window)) return

    let cancelled = false

    const setup = async () => {
      // ── ১. Permission চাও (denied হলে skip) ──────────────
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        if (result !== 'granted') return
      }
      if (Notification.permission !== 'granted') return

      // ── ২. SW কে Firebase config পাঠাও ──────────────────
      await sendConfigToSW()

      // ── ৩. Messaging initialize ───────────────────────────
      const messaging = await initMessaging()
      if (!messaging || cancelled) return

      // ── ৪. FCM token নাও ──────────────────────────────────
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

      // ── ৫. Cache check ─────────────────────────────────────
      const cached = localStorage.getItem(FCM_TOKEN_KEY)
      if (cached === fcmToken) return

      // ── ৬. Backend এ save ──────────────────────────────────
      try {
        await api.post('/auth/fcm-token', { fcmToken })
        localStorage.setItem(FCM_TOKEN_KEY, fcmToken)
        console.log('[FCM] Token registered ✅')
      } catch (e) {
        console.warn('[FCM] Token registration failed:', e.message)
      }

      // ── ৭. Foreground message handler ─────────────────────
      if (unsubRef.current) unsubRef.current()

      unsubRef.current = onMessage(messaging, (payload) => {
        if (cancelled) return
        const { title, body } = payload.notification || {}
        const type = payload.data?.type || 'general'
        toast(`${getIcon(type)} ${body || title || 'নতুন আপডেট'}`, {
          duration: 6000,
          style: { background: getBg(type), color: '#fff', fontWeight: '500' },
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

  // Logout এ token cache সাফ
  useEffect(() => {
    if (!user?.id) localStorage.removeItem(FCM_TOKEN_KEY)
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
    case 'credit_reminder':   return '💳'
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
    case 'credit_reminder':   return '#b91c1c'
    default:                  return '#374151'
  }
}
