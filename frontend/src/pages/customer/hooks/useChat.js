// hooks/useChat.js
// ✅ REDESIGNED (Chat Phase 1 — Session 1): আগে এই hook-এই পুরো কথোপকথন
// (RTDB মেসেজ/সেন্ড/অথ) ছিল। এখন সেই অংশটুকু shared chat/hooks/useChatEngine.js
// + ConversationPane-এ সরানো হয়েছে (staff-side-এর সাথে একই কোড শেয়ার করতে)।
// এই hook এখন শুধু ইনবক্স-লিস্ট (per-company aggregate, customer পোর্টালের
// নিজস্ব ডেটা-শেপ) আর ensureThreads সামলায়।
//
// পুরনো ভার্সন useChat.js.orig নামে পাশেই রাখা আছে, ডিফ/রেফারেন্সের জন্য —
// merge-এর পর চাইলে মুছে ফেলুন।

import { useState, useEffect, useCallback } from 'react'
import { createChatApi } from '../../../chat/api/chatApi'
import { useChatIdentity } from '../../../chat/hooks/useChatIdentity'

export function useChat() {
  const [chatApi] = useState(() => createChatApi('customer'))
  const identity = useChatIdentity(chatApi) // { ready, uid, db, error }

  const [threads, setThreads] = useState([])
  const [threadsLoading, setThreadsLoading] = useState(true)

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const data = await chatApi.listAllThreads()
      setThreads(data)
    } catch (e) {
      console.error('[chat] loadThreads error:', e.message)
    } finally {
      setThreadsLoading(false)
    }
  }, [chatApi])

  useEffect(() => {
    if (identity.ready) loadThreads()
  }, [identity.ready, loadThreads])

  // থ্রেড এখনো তৈরি না হলে (নতুন connection) — বানিয়ে ইনবক্স রিফ্রেশ করে,
  // ফ্রেশ {personalThreadId, supportThreadId} রিটার্ন করে
  const ensureThreads = useCallback(
    async (connectionId) => {
      const data = await chatApi.ensureThreads(connectionId)
      await loadThreads()
      return data
    },
    [chatApi, loadThreads]
  )

  return {
    chatApi,
    ready: identity.ready,
    uid: identity.uid,
    db: identity.db,
    threads,
    threadsLoading,
    loadThreads,
    ensureThreads,
  }
}
