// chat/hooks/useChatEngine.js
//
// একটা সক্রিয় থ্রেডের জন্য সম্পূর্ণ কথোপকথন-ইঞ্জিন — মেসেজ (RTDB লাইভ +
// অফলাইন-কিউ merged), পাঠানো, টাইপিং সিগন্যাল, রিড-রিসিট (per-message
// "sent"/"seen" টিক)। staff ও customer দুই পাশেই এই একই হুক ব্যবহার হয়
// (useChatIdentity + chatApi adapter দিয়ে role আলাদা হয়, এই হুকের ভেতরে না)।
//
// আগে useChat.js (customer) আর ChatInbox.jsx-এর ভেতরের useStaffChat —
// দুটো প্রায় হুবহু কপি ছিল, শুধু REST কল আলাদা। এখন একটাই সোর্স অফ ট্রুথ।

import { useState, useEffect, useCallback, useRef } from 'react'
import { ref, onValue, off, push, set, remove, serverTimestamp } from 'firebase/database'
import {
  subscribeQueue,
  enqueueMessage,
  markSending,
  markFailed,
  removeFromQueue,
  retryMessage,
  discardMessage,
} from '../services/offlineQueue'
import { isFresh } from '../utils/time'

const TYPING_STALE_MS = 6000 // এর চেয়ে পুরনো টাইপিং-সিগন্যাল ধরে নেওয়া হয় ক্লায়েন্ট ক্র্যাশ/ট্যাব-বন্ধ, ইগনোর করা হয়
const TYPING_WRITE_THROTTLE_MS = 2000
const TYPING_AUTO_STOP_MS = 3000
const RETRY_INTERVAL_MS = 15000

export function useChatEngine({ chatApi, db, uid, ready, threadId, senderType, senderName }) {
  const [rtdbMessages, setRtdbMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [queueSnapshot, setQueueSnapshot] = useState([])
  const [typingOthers, setTypingOthers] = useState(false)
  const [readsMap, setReadsMap] = useState({})
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  const messagesListenerRef = useRef(null)
  const typingListenerRef = useRef(null)
  const readsListenerRef = useRef(null)
  const rtdbMessagesRef = useRef([]) // flush-এর সময় stale closure এড়াতে
  const flushingRef = useRef(new Set())
  const typingStopTimeoutRef = useRef(null)
  const lastTypingWriteAtRef = useRef(0)
  const lastReadMarkedForCountRef = useRef(0)

  useEffect(() => {
    rtdbMessagesRef.current = rtdbMessages
  }, [rtdbMessages])

  // ── অনলাইন/অফলাইন ──────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── অফলাইন-কিউ সাবস্ক্রাইব ─────────────────────────────────
  useEffect(() => {
    return subscribeQueue(setQueueSnapshot)
  }, [])

  // ── RTDB: মেসেজ, টাইপিং, রিড — থ্রেড বদলালে re-subscribe ─────
  useEffect(() => {
    if (!ready || !db || !threadId) {
      setRtdbMessages([])
      return
    }
    setMessagesLoading(true)
    lastReadMarkedForCountRef.current = 0

    const msgsNode = ref(db, `chats/${threadId}/messages`)
    onValue(msgsNode, (snap) => {
      const val = snap.val() || {}
      const list = Object.entries(val)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      setRtdbMessages(list)
      setMessagesLoading(false)
    })
    messagesListenerRef.current = msgsNode

    const typingNode = ref(db, `chats/${threadId}/typing`)
    onValue(typingNode, (snap) => {
      const val = snap.val() || {}
      const anyoneTyping = Object.entries(val).some(
        ([otherUid, ts]) => otherUid !== uid && isFresh(ts, TYPING_STALE_MS)
      )
      setTypingOthers(anyoneTyping)
    })
    typingListenerRef.current = typingNode

    const readsNode = ref(db, `chats/${threadId}/reads`)
    onValue(readsNode, (snap) => {
      setReadsMap(snap.val() || {})
    })
    readsListenerRef.current = readsNode

    return () => {
      if (messagesListenerRef.current) off(messagesListenerRef.current)
      if (typingListenerRef.current) off(typingListenerRef.current)
      if (readsListenerRef.current) off(readsListenerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, db, threadId])

  // ── রিড মার্ক করা — থ্রেড খোলার সময় + নতুন মেসেজ এলে ────────
  useEffect(() => {
    if (!ready || !db || !threadId) return
    if (rtdbMessages.length === 0) return
    if (rtdbMessages.length === lastReadMarkedForCountRef.current) return
    lastReadMarkedForCountRef.current = rtdbMessages.length

    set(ref(db, `chats/${threadId}/reads/${uid}`), serverTimestamp()).catch(() => {})
    chatApi.markRead(threadId).catch(() => {})
  }, [ready, db, threadId, uid, rtdbMessages.length, chatApi])

  // ── অফলাইন-কিউ ফ্লাশ ────────────────────────────────────────
  const flushOne = useCallback(
    async (item) => {
      if (flushingRef.current.has(item.clientId)) return
      flushingRef.current.add(item.clientId)
      markSending(item.clientId)
      try {
        const alreadyInRtdb = rtdbMessagesRef.current.some((m) => m.clientId === item.clientId)
        if (!alreadyInRtdb) {
          const msgsNode = ref(db, `chats/${item.threadId}/messages`)
          const newRef = push(msgsNode)
          await set(newRef, {
            clientId: item.clientId,
            senderId: uid,
            senderType: item.senderType,
            senderName: item.senderName,
            text: item.text,
            createdAt: serverTimestamp(),
            // ⚠️ RTDB undefined ভ্যালু গ্রহণ করে না — তাই plain টেক্সট মেসেজে
            // এই কী-গুলো একদমই বাদ (null-ও না), শুধু কার্ড/ভয়েস হলে যোগ হয়
            ...(item.kind === 'card' ? { kind: 'card', cardType: item.cardType, cardPayload: item.cardPayload } : {}),
            ...(item.kind === 'voice' ? { kind: 'voice', voiceUrl: item.voiceUrl, voiceDuration: item.voiceDuration } : {}),
          })
        }
        // ⚠️ notify() শুধু push-notification-এর জন্য — মেসেজটা ততক্ষণে RTDB-তে
        // পৌঁছে গেছে (আসল ডেলিভারি), তাই এটা ব্যর্থ হলেও গোটা আইটেম retry করা হচ্ছে না
        try {
          await chatApi.notify(item.threadId, item.text.slice(0, 150))
        } catch (notifyErr) {
          console.warn('[chat] notify ব্যর্থ (মেসেজ তবু ডেলিভার হয়েছে):', notifyErr.message)
        }
        removeFromQueue(item.clientId)
      } catch (e) {
        console.error('[chat] send ব্যর্থ:', e.message)
        markFailed(item.clientId)
      } finally {
        flushingRef.current.delete(item.clientId)
      }
    },
    [db, uid, chatApi]
  )

  const attemptFlush = useCallback(() => {
    if (!db || !threadId || isOffline) return
    queueSnapshot
      .filter((i) => i.threadId === threadId && i.status === 'pending')
      .forEach(flushOne)
  }, [db, threadId, isOffline, queueSnapshot, flushOne])

  useEffect(() => {
    attemptFlush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueSnapshot, threadId, isOffline, ready])

  useEffect(() => {
    const interval = setInterval(attemptFlush, RETRY_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [attemptFlush])

  // ── টাইপিং সিগন্যাল ─────────────────────────────────────────
  const notifyTyping = useCallback(
    (isTyping) => {
      if (!ready || !db || !threadId) return
      const node = ref(db, `chats/${threadId}/typing/${uid}`)

      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current)
        typingStopTimeoutRef.current = null
      }

      if (!isTyping) {
        remove(node).catch(() => {})
        return
      }

      const now = Date.now()
      if (now - lastTypingWriteAtRef.current > TYPING_WRITE_THROTTLE_MS) {
        lastTypingWriteAtRef.current = now
        set(node, serverTimestamp()).catch(() => {})
      }
      typingStopTimeoutRef.current = setTimeout(() => {
        remove(node).catch(() => {})
      }, TYPING_AUTO_STOP_MS)
    },
    [ready, db, threadId, uid]
  )

  // send()-এর ভেতর থেকে সবচেয়ে সাম্প্রতিক notifyTyping কল করতে (স্টেল ক্লোজার এড়াতে,
  // ref-এ রাখা হচ্ছে যাতে send-এর নিজের dependency array ছোট থাকে)
  const notifyTypingRef = useRef(null)
  useEffect(() => {
    notifyTypingRef.current = notifyTyping
  }, [notifyTyping])

  // ── পাঠানো — সরাসরি RTDB না লিখে কিউ-তে ঢোকায়, optimistic UI ───
  const send = useCallback(
    (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed || !threadId) return
      notifyTypingRef.current?.(false)
      enqueueMessage({ threadId, text: trimmed, senderType, senderName })
    },
    [threadId, senderType, senderName]
  )

  // Phase 1 (দেরিতে) — ভয়েস নোট পাঠানো। আপলোড ইতিমধ্যে হয়ে গেছে (নেটওয়ার্ক
  // লাগে বলে অফলাইন-কিউ করা হয়নি, দেখুন VoiceRecordButton.jsx) — এখান থেকে
  // শুধু ছোট RTDB মেসেজটা যায়, যেটা টেক্সট/কার্ডের মতোই অফলাইন-সেফ
  const sendVoice = useCallback(
    (voiceUrl, voiceDuration) => {
      if (!threadId) return
      notifyTypingRef.current?.(false)
      enqueueMessage({
        threadId,
        text: '🎤 ভয়েস বার্তা',
        senderType,
        senderName,
        kind: 'voice',
        voiceUrl,
        voiceDuration,
      })
    },
    [threadId, senderType, senderName]
  )
  const sendCard = useCallback(
    (cardType, cardPayload, previewText) => {
      if (!threadId) return
      notifyTypingRef.current?.(false)
      enqueueMessage({
        threadId,
        text: previewText || 'একটা কার্ড শেয়ার করা হয়েছে',
        senderType,
        senderName,
        kind: 'card',
        cardType,
        cardPayload,
      })
    },
    [threadId, senderType, senderName]
  )

  useEffect(() => {
    return () => {
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current)
    }
  }, [])

  // ── রিড-রিসিট: এই মেসেজটা (আমার পাঠানো) অন্য পক্ষ দেখেছে কিনা ───
  const getReadState = useCallback(
    (msg) => {
      if (!msg || msg.senderId !== uid) return null
      const otherTimestamps = Object.entries(readsMap)
        .filter(([otherUid]) => otherUid !== uid)
        .map(([, ts]) => ts)
        .filter(Boolean)
      if (otherTimestamps.length === 0) return 'sent'
      const maxOtherReadAt = Math.max(...otherTimestamps)
      return msg.createdAt && maxOtherReadAt >= msg.createdAt ? 'seen' : 'sent'
    },
    [uid, readsMap]
  )

  // ── প্রদর্শনের জন্য merge: RTDB মেসেজ + এখনো-না-পৌঁছানো কিউ আইটেম ───
  const pendingForThread = queueSnapshot.filter((i) => i.threadId === threadId)
  const displayMessages = [
    ...rtdbMessages,
    ...pendingForThread.map((i) => ({
      id: i.clientId,
      clientId: i.clientId,
      senderId: uid,
      senderType: i.senderType,
      senderName: i.senderName,
      text: i.text,
      createdAt: i.createdAtLocal,
      _localStatus: i.status, // 'pending' | 'sending' | 'failed'
      ...(i.kind === 'card' ? { kind: 'card', cardType: i.cardType, cardPayload: i.cardPayload } : {}),
      ...(i.kind === 'voice' ? { kind: 'voice', voiceUrl: i.voiceUrl, voiceDuration: i.voiceDuration } : {}),
    })),
  ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  return {
    messages: displayMessages,
    messagesLoading,
    send,
    sendCard,
    sendVoice,
    sending: pendingForThread.some((i) => i.status === 'sending'),
    typingOthers,
    notifyTyping,
    getReadState,
    isOffline,
    retryFailed: retryMessage,
    discardFailed: discardMessage,
  }
}
