import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ============================================================
// useFCMToken Hook — Web + Native Android উভয়ই সাপোর্ট করে
//
// Web (Browser/PWA):
//   firebase/messaging + Service Worker দিয়ে FCM token নেয
//
// Native (Android APK via Capacitor):
//   @capacitor/push-notifications দিয়ে native FCM token নেয়
//   — Service Worker নেই, Notification API নেই, VAPID নেই
//
// Platform detect: window.Capacitor?.isNativePlatform()
// ============================================================

const FCM_TOKEN_KEY = 'novatech_fcm_token'
const IS_NATIVE     = () => window?.Capacitor?.isNativePlatform?.() === true

// ── Helpers (উভয় platform-এ একই) ──────────────────────────

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

// Backend-এ FCM token save করো (উভয় platform-এ একই endpoint)
async function saveTokenToBackend(fcmToken) {
  const cached = localStorage.getItem(FCM_TOKEN_KEY)
  if (cached === fcmToken) return  // আগেই save আছে, skip

  try {
    await api.post('/auth/fcm-token', { fcmToken })
    localStorage.setItem(FCM_TOKEN_KEY, fcmToken)
    console.log('[FCM] Token registered', IS_NATIVE() ? '(Native)' : '(Web)', '✅')
  } catch (e) {
    console.warn('[FCM] Token save failed:', e.message)
  }
}

// ============================================================
// NATIVE SETUP — @capacitor/push-notifications
// Android APK-এ এই path চলবে
// Service Worker নেই, VAPID নেই, Notification API নেই
// ============================================================

async function setupNativeFCM(cancelledRef, navigate) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // ── ১. Permission চাও ──────────────────────────────────
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') {
      console.warn('[FCM Native] Permission denied')
      return null
    }

    // ── ২. FCM-এ Register করো ─────────────────────────────
    await PushNotifications.register()

    // ── ৩. Token পাওয়ার listener ──────────────────────────
    const tokenListener = await PushNotifications.addListener(
      'registration',
      async ({ value: fcmToken }) => {
        if (cancelledRef.current) return
        await saveTokenToBackend(fcmToken)
      }
    )

    // ── ৪. Registration error ──────────────────────────────
    const errorListener = await PushNotifications.addListener(
      'registrationError',
      (err) => console.error('[FCM Native] Registration error:', JSON.stringify(err))
    )

    // ── ৫. Foreground notification ─────────────────────────
    // App সামনে থাকলে OS notification দেখায় না — toast দেখাই
    const foregroundListener = await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        if (cancelledRef.current) return
        const title = notification.title || ''
        const body  = notification.body  || ''
        const type  = notification.data?.type || 'general'

        toast(`${getIcon(type)} ${body || title || 'নতুন আপডেট'}`, {
          duration: 6000,
          style: { background: getBg(type), color: '#fff', fontWeight: '500' },
        })
      }
    )

    // ── ৬. Notification ট্যাপ (background/killed → app খোলা) ──
    const actionListener = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        if (cancelledRef.current) return
        const type = action.notification?.data?.type
        const url  = getClickUrl(type)
        // ✅ React Router navigate — killed state থেকে খুললেও safe
        // App mount হওয়ার পরে navigate call হয়, white screen হয় না
        if (url && url !== '/') {
          // App just launched — Router mount হতে সামান্য সময় দাও
          setTimeout(() => navigate(url, { replace: true }), 300)
        }
      }
    )

    // Cleanup — সব listener সরাও
    return () => {
      tokenListener.remove()
      errorListener.remove()
      foregroundListener.remove()
      actionListener.remove()
    }

  } catch (e) {
    // package না থাকলে বা অন্য error হলে silently fail
    console.error('[FCM Native] Setup failed:', e.message)
    return null
  }
}

// ============================================================
// WEB SETUP — firebase/messaging + Service Worker
// Browser / PWA-এ এই path চলবে
// ============================================================

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
    console.warn('[FCM Web] SW config send failed:', e.message)
  }
}

async function setupWebFCM(cancelledRef) {
  if (!('Notification' in window)) return null

  // ── ১. Permission চাও ──────────────────────────────────
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') return null
  }
  if (Notification.permission !== 'granted') return null

  // ── ২. SW কে Firebase config পাঠাও ───────────────────
  await sendConfigToSW()

  // ── ৩. Firebase Messaging initialize ──────────────────
  const { initMessaging, VAPID_KEY } = await import('./config')
  const messaging = await initMessaging()
  if (!messaging || cancelledRef.current) return null

  // ── ৪. FCM token নাও ──────────────────────────────────
  let fcmToken
  try {
    const { getToken } = await import('firebase/messaging')
    fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    })
  } catch (e) {
    console.warn('[FCM Web] getToken failed:', e.message)
    return null
  }

  if (!fcmToken || cancelledRef.current) return null
  await saveTokenToBackend(fcmToken)

  // ── ৫. Foreground message handler ─────────────────────
  const { onMessage } = await import('firebase/messaging')
  const unsub = onMessage(messaging, (payload) => {
    if (cancelledRef.current) return
    const { title, body } = payload.notification || {}
    const type = payload.data?.type || 'general'
    toast(`${getIcon(type)} ${body || title || 'নতুন আপডেট'}`, {
      duration: 6000,
      style: { background: getBg(type), color: '#fff', fontWeight: '500' },
    })
  })

  return () => unsub()
}

// ============================================================
// Main Hook — App.jsx এ FirebaseProvider-এর ভেতরে চলে
// ============================================================

export function useFCMToken() {
  const { user, token: authToken } = useAuthStore()
  const navigate     = useNavigate()
  const cleanupRef   = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!user?.id || !authToken) return

    cancelledRef.current = false

    const setup = async () => {
      const cleanupFn = IS_NATIVE()
        ? await setupNativeFCM(cancelledRef, navigate)  // Android APK — navigate pass করা হলো
        : await setupWebFCM(cancelledRef)               // Web / PWA

      if (!cancelledRef.current) {
        cleanupRef.current = cleanupFn
      } else {
        // setup চলাকালীন component unmount হলে তুরন্ত cleanup
        cleanupFn?.()
      }
    }

    setup()

    return () => {
      cancelledRef.current = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [user?.id, authToken])

  // Logout হলে token cache সাফ করো
  useEffect(() => {
    if (!user?.id) localStorage.removeItem(FCM_TOKEN_KEY)
  }, [user?.id])
}
