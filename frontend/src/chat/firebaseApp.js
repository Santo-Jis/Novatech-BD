// chat/firebaseApp.js
//
// আগে এই ঠিক একই ফাংশন useChat.js আর ChatInbox.jsx দুই জায়গায় আলাদাভাবে
// কপি-পেস্ট করা ছিল। এক জায়গায় — বাকি যেকোনো Firebase-নির্ভর কোড (AIChat.jsx,
// CustomerAIChat.jsx সহ) চাইলে এটাই রিইউজ করতে পারে।

import { initializeApp, getApps } from 'firebase/app'

export function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
}
