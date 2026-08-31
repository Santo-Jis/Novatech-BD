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
        // ⚠️ ফিক্স: আগে `if (!auth.currentUser)` দিয়ে সাইন-ইন স্কিপ করা হতো —
        // ধরে নেওয়া হয়েছিল ব্রাউজারে একবারে একটাই identity থাকবে। কিন্তু এই
        // একই SPA কাস্টমার আর স্টাফ/অ্যাডমিন দুই role-ই সার্ভ করে (একই origin,
        // তাই একই Firebase Auth persistence শেয়ার হয়)। ফলে কেউ একই ব্রাউজারে
        // আগে কাস্টমার হিসেবে সাইন-ইন করা থাকলে, পরে স্টাফ প্যানেল খুললে
        // auth.currentUser আগের কাস্টমার-uid নিয়েই "truthy" থেকে যেত — স্টাফ
        // হিসেবে নতুন করে সাইন-ইনই হতো না। ফলাফল: স্টাফ-ভিউতে uid আসলে
        // customer:personId থেকে যেত, তাই m.senderId===uid সব মেসেজের জন্যই
        // true হয়ে যেত (কে কার মেসেজ বোঝা যেত না, আর স্টাফের পাঠানো মেসেজও
        // ভুল senderId নিয়ে সেভ হতো)। এখন প্রতিবার এই hook মাউন্ট হলে এই
        // role-এর নিজস্ব টোকেন দিয়েই ফ্রেশ সাইন-ইন হয়, আগের currentUser যা-ই
        // থাকুক না কেন — signInWithCustomToken স্বয়ংক্রিয়ভাবে আগেরটা replace করে।
        const token = await chatApi.getFirebaseToken()
        await signInWithCustomToken(auth, token)
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
