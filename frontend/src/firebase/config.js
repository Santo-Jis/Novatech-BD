import { initializeApp }  from 'firebase/app'
import { getDatabase }    from 'firebase/database'
import { getAuth }        from 'firebase/auth'

// ============================================================
// Firebase Configuration
// NovaTechBD Management System
// Realtime নোটিফিকেশনের জন্য ব্যবহার
// ============================================================

const firebaseConfig = {
  apiKey:      import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:  `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:   import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:       import.meta.env.VITE_FIREBASE_APP_ID
}

// Firebase App initialize
const app  = initializeApp(firebaseConfig)
const db   = getDatabase(app)
const auth = getAuth(app)

export { app, db, auth }
export default app
