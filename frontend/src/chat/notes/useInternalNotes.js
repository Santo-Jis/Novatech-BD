// chat/notes/useInternalNotes.js
//
// ইচ্ছাকৃতভাবে useChatEngine থেকে সম্পূর্ণ আলাদা — RTDB না, শুধু REST। নোট
// customer-facing RTDB পাইপলাইনের ধারেকাছেও যায় না (দেখুন migration_chat_
// internal_notes.sql-এর টপ কমেন্ট)। তাই এখানে অফলাইন-কিউ/টাইপিং/প্রেজেন্স
// কিছুই নেই — সরল fetch-on-open + optimistic-append।

import { useState, useEffect, useCallback } from 'react'

export function useInternalNotes(chatApi, threadId, open) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !threadId) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([chatApi.listNotes(threadId), chatApi.listTeamMembers()])
      .then(([n, tm]) => {
        if (cancelled) return
        setNotes(n)
        setTeamMembers(tm)
      })
      .catch((e) => {
        console.error('[chat] notes load error:', e.message)
        if (!cancelled) setError('নোট লোড করতে সমস্যা হয়েছে')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, threadId, chatApi])

  const addNote = useCallback(
    async (text, mentionedUserIds) => {
      setPosting(true)
      setError('')
      try {
        const note = await chatApi.addNote(threadId, text, mentionedUserIds)
        setNotes((prev) => [...prev, note])
        return true
      } catch (e) {
        console.error('[chat] addNote error:', e.message)
        setError('নোট সেভ করতে সমস্যা হয়েছে')
        return false
      } finally {
        setPosting(false)
      }
    },
    [chatApi, threadId]
  )

  return { notes, loading, teamMembers, posting, error, addNote }
}
