import { initializeApp }  from 'firebase/app'
import { getDatabase }    from 'firebase/database'
import { getAuth }        from 'firebase/auth'
import { getMessaging, isSupported } from 'firebase/messaging'

// ============================================================
// Firebase Configuration
// NovaTechBD Management System
// Realtime নোটিফিকেশন + FCM Push Notification
// ============================================================

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID

// ⚠️ GUARD: env vars না থাকলে Firebase init skip করো
// না হলে initializeApp(undefined) → crash → পুরো app সাদা
const firebaseReady = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_APP_ID
)

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         FIREBASE_PROJECT_ID,
  storageBucket:     `${FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase App initialize — config না থাকলে dummy fallback
let app, db, auth

try {
  if (firebaseReady) {
    app  = initializeApp(firebaseConfig)
    db   = getDatabase(app)
    auth = getAuth(app)
  } else {
    console.warn('[Firebase] env vars missing — Firebase disabled')
    app = null; db = null; auth = null
  }
} catch (e) {
  console.error('[Firebase] Init failed:', e.message)
  app = null; db = null; auth = null
}

// ── FCM Messaging (browser support চেক করে তারপর initialize) ──
let messaging = null

const initMessaging = async () => {
  if (!app) return null
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

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

export { app, db, auth, messaging, initMessaging, firebaseReady }
export default app
