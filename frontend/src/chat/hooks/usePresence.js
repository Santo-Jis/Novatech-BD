// chat/hooks/usePresence.js
//
// অনলাইন-স্ট্যাটাস — Firebase-এর প্রমাণিত standard প্যাটার্ন (.info/connected +
// onDisconnect)। presence/{uid} গ্লোবাল (থ্রেড-নির্দিষ্ট না, ঠিক WhatsApp/
// Slack-এর মতো — কে অনলাইন সেটা একবারই ট্র্যাক হয়, প্রতি থ্রেডে আলাদা না)।
//
// অন্য পক্ষ কে কে (participants) সেটা chats/{threadId}/meta/participants থেকে
// পড়া হয় — এই নোডটা ব্যাকএন্ড আগে থেকেই লেখে (syncThreadParticipants,
// chatFirebase.service.js), তাই নতুন কোনো ব্যাকএন্ড এন্ডপয়েন্ট লাগেনি।
//
// ⚠️ RTDB rules-এ নতুন path — presence/{uid} (নিজেরটা লিখতে পারবে, যেকোনো
// authenticated ইউজার পড়তে পারবে)। যোগ করার জন্য rules স্নিপেট README-এ আছে।

import { useEffect, useState, useRef } from 'react'
import { ref, onValue, onDisconnect, set, serverTimestamp, off } from 'firebase/database'

// নিজের অনলাইন-হার্টবিট — একবারই মাউন্ট করলে চলবে (উদাহরণ: চ্যাট মডিউলের রুটে)
export function usePresenceHeartbeat(db, uid, ready) {
  useEffect(() => {
    if (!ready || !db || !uid) return

    const connectedRef = ref(db, '.info/connected')
    const myPresenceRef = ref(db, `presence/${uid}`)

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return
      // সংযোগ বিচ্ছিন্ন হলে (ট্যাব বন্ধ, নেট চলে যাওয়া, ক্র্যাশ) সার্ভার নিজে থেকেই
      // অফলাইন লিখে দেবে — ক্লায়েন্ট-সাইড cleanup-এর উপর নির্ভর করতে হয় না
      onDisconnect(myPresenceRef)
        .set({ online: false, lastSeen: serverTimestamp() })
        .then(() => set(myPresenceRef, { online: true, lastSeen: serverTimestamp() }))
        .catch(() => {})
    })

    return () => {
      off(connectedRef)
      unsubscribe && unsubscribe()
    }
  }, [db, uid, ready])
}

// একটা থ্রেডের অন্য অংশগ্রহণকারীরা অনলাইন কিনা
export function useOthersOnline(db, threadId, myUid) {
  const [participantUids, setParticipantUids] = useState([])
  const [onlineMap, setOnlineMap] = useState({})
  const presenceListenersRef = useRef([])

  useEffect(() => {
    if (!db || !threadId) return
    const participantsRef = ref(db, `chats/${threadId}/meta/participants`)
    const unsub = onValue(participantsRef, (snap) => {
      const val = snap.val() || {}
      setParticipantUids(Object.keys(val).filter((id) => id !== myUid))
    })
    return () => off(participantsRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, threadId, myUid])

  useEffect(() => {
    // আগের presence listener গুলো বন্ধ করো
    presenceListenersRef.current.forEach((unsub) => unsub())
    presenceListenersRef.current = []

    if (!db || participantUids.length === 0) {
      setOnlineMap({})
      return
    }

    const nextMap = {}
    participantUids.forEach((uid) => {
      const pRef = ref(db, `presence/${uid}`)
      const cb = onValue(pRef, (snap) => {
        const val = snap.val()
        setOnlineMap((prev) => ({ ...prev, [uid]: Boolean(val?.online) }))
      })
      presenceListenersRef.current.push(() => off(pRef, 'value', cb))
      nextMap[uid] = false
    })

    return () => {
      presenceListenersRef.current.forEach((unsub) => unsub())
      presenceListenersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, participantUids.join(',')])

  const anyOnline = Object.values(onlineMap).some(Boolean)
  return { anyOnline, onlineMap }
}
