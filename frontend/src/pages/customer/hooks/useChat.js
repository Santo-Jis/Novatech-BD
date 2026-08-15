// hooks/useChat.js
// ✅ NEW — Part 3: Customer পোর্টাল চ্যাট hook।
// ConnectionsTab/ComplaintsTab-এর মতোই: company session switch ছাড়াই
// person_id দিয়ে সব কোম্পানির থ্রেড। মেসেজ RTDB-তে সরাসরি client থেকে
// (Firebase custom token দিয়ে sign in করার পর) — REST শুধু থ্রেড
// lifecycle আর metadata sync/push notify-এর জন্য।

import { useState, useEffect, useRef, useCallback } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, onValue, off, push, set, serverTimestamp } from 'firebase/database'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { portalFetch } from '../utils/api'

function getFirebaseApp() {
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

export function useChat() {
  const [authReady, setAuthReady]         = useState(false)
  const [myUid, setMyUid]                 = useState(null)
  const [threads, setThreads]             = useState([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages]           = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending]             = useState(false)

  const dbRef       = useRef(null)
  const listenerRef = useRef(null) // { path, unsubscribe }

  // ── Firebase auth (একবারই — custom token, person_id-ভিত্তিক identity) ──
  useEffect(() => {
    let cancelled = false
    const app  = getFirebaseApp()
    const auth = getAuth(app)
    dbRef.current = getDatabase(app)
    ;(async () => {
      try {
        if (!auth.currentUser) {
          const res = await portalFetch('/portal/chat/firebase-token')
          await signInWithCustomToken(auth, res.data.token)
        }
        if (!cancelled) {
          setMyUid(auth.currentUser?.uid || null)
          setAuthReady(true)
        }
      } catch (e) {
        console.error('[chat] firebase auth error:', e.message)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── ইনবক্স (এক row = এক কোম্পানি) ──────────────────────────
  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const res = await portalFetch('/portal/chat/all-threads')
      setThreads(res.data || [])
    } catch (e) {
      console.error('[chat] loadThreads error:', e.message)
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  useEffect(() => { if (authReady) loadThreads() }, [authReady, loadThreads])

  // ── একটা কোম্পানির personal/support থ্রেড খোলা (লাগলে তৈরি করে) ──
  const openThread = useCallback(async (connectionId, threadType, knownThreadId) => {
    setMessages([])
    setMessagesLoading(true)

    let threadId = knownThreadId
    try {
      if (!threadId) {
        const res = await portalFetch('/portal/chat/threads/ensure', {
          method: 'POST',
          body: JSON.stringify({ connectionId }),
        })
        threadId = threadType === 'support' ? res.data.supportThreadId : res.data.personalThreadId
        loadThreads() // নতুন থ্রেড তৈরি হলে ইনবক্স রিফ্রেশ (assignedSr ইত্যাদির জন্য)
      }

      setActiveThreadId(threadId)

      // আগের listener বন্ধ করো
      if (listenerRef.current) {
        off(listenerRef.current.node)
        listenerRef.current = null
      }

      const msgsNode = ref(dbRef.current, `chats/${threadId}/messages`)
      onValue(msgsNode, (snap) => {
        const val = snap.val() || {}
        const list = Object.entries(val)
          .map(([id, m]) => ({ id, ...m }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        setMessages(list)
        setMessagesLoading(false)
      })
      listenerRef.current = { node: msgsNode }

      // খোলার সাথে সাথে read মার্ক করো
      portalFetch(`/portal/chat/threads/${threadId}/read`, { method: 'PATCH' }).catch(() => {})
    } catch (e) {
      console.error('[chat] openThread error:', e.message)
      setMessagesLoading(false)
    }

    return threadId
  }, [loadThreads])

  const closeThread = useCallback(() => {
    if (listenerRef.current) {
      off(listenerRef.current.node)
      listenerRef.current = null
    }
    setActiveThreadId(null)
    setMessages([])
  }, [])

  // ── মেসেজ পাঠানো — সরাসরি RTDB-তে লিখে তারপর notify কল করে ──
  const sendMessage = useCallback(async (text, senderName) => {
    const trimmed = (text || '').trim()
    if (!trimmed || !activeThreadId || sending) return
    setSending(true)
    try {
      const msgsNode = ref(dbRef.current, `chats/${activeThreadId}/messages`)
      const newRef = push(msgsNode)
      await set(newRef, {
        senderId: getAuth(getFirebaseApp()).currentUser.uid,
        senderType: 'customer',
        senderName: senderName || 'আপনি',
        text: trimmed,
        createdAt: serverTimestamp(),
      })
      await portalFetch(`/portal/chat/threads/${activeThreadId}/notify`, {
        method: 'POST',
        body: JSON.stringify({ preview: trimmed.slice(0, 150) }),
      })
      loadThreads()
    } catch (e) {
      console.error('[chat] sendMessage error:', e.message)
      throw e
    } finally {
      setSending(false)
    }
  }, [activeThreadId, sending, loadThreads])

  useEffect(() => () => { if (listenerRef.current) off(listenerRef.current.node) }, [])

  return {
    authReady, myUid, threads, threadsLoading, loadThreads,
    activeThreadId, openThread, closeThread,
    messages, messagesLoading, sendMessage, sending,
  }
}
