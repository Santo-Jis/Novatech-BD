// chat/hooks/useChatIdentity.js
//
// Firebase Auth সাইন-ইন (custom token, ব্যাকএন্ড থেকে) — যেকোনো role-এর জন্য
// একই লজিক, শুধু chatApi.getFirebaseToken()-এর ভেতরটা staff/customer অনুযায়ী
// আলাদা এন্ডপয়েন্ট কল করে। একবার সাইন-ইন হয়ে গেলে auth.currentUser.uid-ই
// namespaced identity (যেমন 'staff:xxx' বা 'customer:personId') — RTDB
// participants/presence/typing/reads সবখানে এই একই uid ব্যবহৃত হয়।

import { useState, useEffect, useRef } from 'react'
import { getDatabase } from 'firebase/database'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { getFirebaseApp } from '../firebaseApp'

export function useChatIdentity(chatApi) {
  const [ready, setReady] = useState(false)
  const [uid, setUid] = useState(null)
  const [error, setError] = useState(null)
  const dbRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const app = getFirebaseApp()
    const auth = getAuth(app)
    dbRef.current = getDatabase(app)

    ;(async () => {
      try {
        if (!auth.currentUser) {
          const token = await chatApi.getFirebaseToken()
          await signInWithCustomToken(auth, token)
        }
        if (!cancelled) {
          setUid(auth.currentUser?.uid || null)
          setReady(true)
        }
      } catch (e) {
        console.error('[chat] identity auth error:', e.message)
        if (!cancelled) setError(e)
      }
    })()

    return () => {
      cancelled = true
    }
    // chatApi role পাল্টায় না একটা মাউন্টেড কম্পোনেন্টে, তাই শুধু একবার চালানো ইচ্ছাকৃত
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ready, uid, db: dbRef.current, error }
}
