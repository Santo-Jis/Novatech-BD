import { initializeApp }  from 'firebase/app'
import { getDatabase }    from 'firebase/database'
import { getAuth }        from 'firebase/auth'
import { getMessaging, isSupported } from 'firebase/messaging'

// ============================================================
// Firebase Configuration
// NovaTechBD Management System
// Realtime নোটিফিকেশন + FCM Push Notification
// ============================================================

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase App initialize
const app  = initializeApp(firebaseConfig)
const db   = getDatabase(app)
const auth = getAuth(app)

// ── FCM Messaging (browser support চেক করে তারপর initialize) ──
// Safari / older browsers-এ isSupported() false দেয়
let messaging = null

const initMessaging = async () => {
  try {
    const supported = await isSupported()
    if (supported) {
      messaging = getMessaging(app)
    }
  } catch (e) {
    console.warn('FCM not supported on this browser:', e.message)
  }
  return messaging
}

// VAPID key — Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

export { app, db, auth, messaging, initMessaging }
export default app
