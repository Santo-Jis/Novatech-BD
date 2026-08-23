// chat/broadcast/useBroadcast.js
//
// ইচ্ছাকৃতভাবে useChatEngine-এর অফলাইন-কিউ ব্যবহার করা হয়নি — সেটা একটা
// "সক্রিয় থ্রেড"-এর জন্য ডিজাইন করা, ব্রডকাস্টে একসাথে N-টা থ্রেডে লিখতে হয়।
// তাই এখানে সরাসরি RTDB write + sequential loop, প্রতিটা রেসিপিয়েন্টের
// status আলাদাভাবে ট্র্যাক করে। বড় route-এ ধীর হতে পারে (ইচ্ছাকৃত ট্রেড-অফ —
// concurrent write একসাথে অনেকগুলো করলে ডিবাগ করা কঠিন হতো, sequential
// simple ও predictable)।

import { useState, useEffect, useCallback } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'

export function useBroadcast(chatApi, db, uid, ready, senderName) {
  const [routes, setRoutes] = useState([])
  const [routeId, setRouteId] = useState('')
  const [recipients, setRecipients] = useState([]) // {customer_id, shop_name, owner_name, thread_id, checked}
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    chatApi.listRoutes().then(setRoutes).catch((e) => console.error('[broadcast] routes load error:', e.message))
  }, [chatApi])

  const loadRecipients = useCallback(
    async (rid) => {
      setRouteId(rid)
      setResults(null)
      setError('')
      if (!rid) {
        setRecipients([])
        return
      }
      setLoadingRecipients(true)
      try {
        const customers = await chatApi.listRouteCustomers(rid)
        if (!customers.length) {
          setRecipients([])
          return
        }
        const resolved = await chatApi.resolveBroadcastRecipients(customers.map((c) => c.id))
        setRecipients(resolved.map((r) => ({ ...r, checked: Boolean(r.thread_id) })))
      } catch (e) {
        console.error('[broadcast] recipients load error:', e.message)
        setError('রেসিপিয়েন্ট লোড করতে সমস্যা হয়েছে')
      } finally {
        setLoadingRecipients(false)
      }
    },
    [chatApi]
  )

  const toggleRecipient = useCallback((customerId) => {
    setRecipients((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, checked: !r.checked } : r)))
  }, [])

  const send = useCallback(
    async (text) => {
      const trimmed = (text || '').trim()
      const targets = recipients.filter((r) => r.checked && r.thread_id)
      if (!trimmed || !targets.length || !ready || !db) return

      setSending(true)
      setResults(null)
      setProgress({ done: 0, total: targets.length })

      let successCount = 0
      for (const t of targets) {
        try {
          const msgsNode = ref(db, `chats/${t.thread_id}/messages`)
          const newRef = push(msgsNode)
          await set(newRef, {
            senderId: uid,
            senderType: 'staff',
            senderName: senderName || 'স্টাফ',
            text: trimmed,
            createdAt: serverTimestamp(),
          })
          await chatApi.notify(t.thread_id, trimmed.slice(0, 150)).catch(() => {})
          successCount++
        } catch (e) {
          console.error('[broadcast] send failed for', t.customer_id, e.message)
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }

      setSending(false)
      setResults({ successCount, failCount: targets.length - successCount })
      chatApi.logBroadcast(trimmed, targets.length, successCount).catch((e) => console.error('[broadcast] log failed:', e.message))
    },
    [recipients, db, uid, ready, senderName, chatApi]
  )

  return {
    routes,
    routeId,
    recipients,
    loadingRecipients,
    sending,
    progress,
    results,
    error,
    loadRecipients,
    toggleRecipient,
    send,
  }
}
