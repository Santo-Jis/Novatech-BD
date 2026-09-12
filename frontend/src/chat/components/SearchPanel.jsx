// chat/components/SearchPanel.jsx
//
// ধাপ ২ (Foundation) — Message Search। BroadcastPanel.jsx-এর ঠিক একই
// inbox-লেভেল "absolute inset-0" ওভারলে প্যাটার্ন (থ্রেড-ভিউ-নির্দিষ্ট
// NotesPanel-এর মতো না — এটা সব থ্রেড জুড়ে সার্চ করে বলে পুরো ChatInbox
// এরিয়া কভার করে)।
//
// রেজাল্ট ক্লিক করলে onNavigate(threadId, threadType) কল হয় — ChatInbox.jsx-ই
// আসল tab/openId state ওনার, তাই সুইচ করার সিদ্ধান্ত ওখানেই।
//
// ⚠️ dual-write-নির্ভর — যেসব মেসেজ dual-write ডিপ্লয়ের আগে পাঠানো হয়েছিল,
// সেগুলো RTDB-তে আছে কিন্তু chat_messages-এ নেই, তাই এখানে আসবে না। ডেটা
// খালি থাকা অবস্থাতেও UI ভাঙবে না — শুধু "কোনো ফলাফল নেই" দেখাবে।

import { useState, useEffect, useRef } from 'react'
import { FiSearch, FiX, FiMessageCircle, FiHeadphones } from 'react-icons/fi'
import { timeAgo } from '../utils/time'

function highlightMatch(text, q) {
  if (!q.trim()) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200/70 text-cp-text-primary rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default function SearchPanel({ chatApi, onNavigate, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null) // null = এখনো সার্চ করা হয়নি
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setResults(null)
      setError('')
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await chatApi.searchMessages(q.trim())
        setResults(data)
      } catch (e) {
        setError(e?.response?.data?.message || e.message || 'সার্চ ব্যর্থ')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350) // ✅ debounce — প্রতিটা কি-স্ট্রোকে রিকোয়েস্ট পাঠানো হচ্ছে না
    return () => clearTimeout(debounceRef.current)
  }, [q, chatApi])

  const handlePick = (r) => {
    onNavigate(r.thread_id, r.thread_type)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-cp-border bg-cp-bg-alt flex-shrink-0">
        <FiSearch size={15} className="text-cp-trust-600 flex-shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="সব কথোপকথনে খুঁজুন..."
          className="flex-1 bg-transparent outline-none text-[14px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted"
        />
        <button onClick={onClose} type="button" aria-label="বন্ধ করুন" className="p-1.5 rounded-full hover:bg-cp-bg-sunken text-cp-text-secondary flex-shrink-0">
          <FiX size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center pt-8">
            <span className="w-5 h-5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && q.trim().length > 0 && q.trim().length < 2 && (
          <p className="text-center text-[12.5px] text-cp-text-muted pt-8 px-6">অন্তত ২ অক্ষর লিখুন</p>
        )}

        {!loading && error && <p className="text-center text-[12.5px] text-cp-error pt-8 px-6">{error}</p>}

        {!loading && !error && results !== null && results.length === 0 && (
          <p className="text-center text-[12.5px] text-cp-text-muted pt-8 px-6">
            কোনো ফলাফল নেই — মনে রাখবেন, শুধু নতুন মেসেজই সার্চেবল (পুরনো মেসেজ এখনো সিঙ্ক হয়নি)
          </p>
        )}

        {!loading && results === null && q.trim().length === 0 && (
          <p className="text-center text-[12.5px] text-cp-text-muted pt-8 px-6">কাস্টমারের নাম বা মেসেজের লেখা দিয়ে সব কথোপকথনে খুঁজুন</p>
        )}

        {!loading && results && results.length > 0 && (
          <div className="divide-y divide-cp-border/60">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => handlePick(r)}
                type="button"
                className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-cp-bg-alt"
              >
                <span className={r.thread_type === 'support' ? 'text-cp-warmth-600 mt-0.5' : 'text-cp-trust-500 mt-0.5'}>
                  {r.thread_type === 'support' ? <FiHeadphones size={14} /> : <FiMessageCircle size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] font-semibold text-cp-text-primary truncate">
                      {r.shop_name || r.owner_name || 'কাস্টমার'}
                    </p>
                    <span className="text-[10.5px] text-cp-text-muted flex-shrink-0">{timeAgo(new Date(r.created_at).getTime())}</span>
                  </div>
                  <p className="text-[12.5px] text-cp-text-secondary line-clamp-2 mt-0.5">
                    <span className="text-cp-text-muted">{r.sender_type === 'staff' ? 'আপনি: ' : ''}</span>
                    {highlightMatch(r.text || '', q.trim())}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
