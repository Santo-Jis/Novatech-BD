// components/NotificationBell.jsx
// স্টাফ-সাইড (Admin/Manager/Worker) নোটিফিকেশন bell + dropdown।
// Self-contained: নিজেই fetch করে, নিজের read/unread state ম্যানেজ করে —
// কোনো layout-এর parent state-এর উপর নির্ভর করে না, তাই যেকোনো layout-এ
// শুধু <NotificationBell /> বসিয়ে দিলেই কাজ করবে।

import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/axios'
import { FiBell, FiX } from 'react-icons/fi'

const CATEGORY_ICON = {
  general:        '📋',
  policy:         '📜',
  hr:             '🧑\u200d💼',
  attendance:     '🕒',
  order_sales:    '💰',
  route_delivery: '🚚',
}

const POLL_INTERVAL_MS = 60000 // ১ মিনিট পরপর unread count রিফ্রেশ

export default function NotificationBell() {
  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState([])
  const [unread,  setUnread]  = useState(0)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  const fetchList = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: 20 } })
      setItems(res.data.data || [])
      setUnread(res.data.unread || 0)
    } catch {
      // bell বন্ধ অবস্থায় silent fail — বিরক্তিকর toast দরকার নেই
    }
  }, [])

  useEffect(() => {
    fetchList()
    const t = setInterval(fetchList, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchList])

  // dropdown খোলার সময় fresh ডেটা
  const handleToggle = () => {
    setOpen(v => {
      const next = !v
      if (next) { setLoading(true); fetchList().finally(() => setLoading(false)) }
      return next
    })
  }

  // বাইরে ক্লিক করলে বন্ধ
  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markOneRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(u => Math.max(0, u - 1))
    try { await api.patch(`/notifications/${id}/read`) } catch { /* পরের poll-এ ঠিক হয়ে যাবে */ }
  }

  const markAllRead = async (e) => {
    e.stopPropagation()
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
    try { await api.patch('/notifications/read-all') } catch { /* পরের poll-এ ঠিক হয়ে যাবে */ }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={handleToggle}
        aria-label="নোটিফিকেশন"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <FiBell className="text-xl" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[320px] max-h-[420px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-y-auto z-[100] animate-slide-up">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800">
            <span className="font-bold text-sm text-gray-800 dark:text-gray-100">🔔 নোটিফিকেশন</span>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary font-medium hover:underline">
                  সব পড়া হলো
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400">
                <FiX size={16} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8 px-4">কোনো নোটিফিকেশন নেই।</p>
          ) : (
            items.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markOneRead(n.id)}
                className={`px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex gap-2.5 items-start ${
                  n.is_read ? 'bg-white dark:bg-slate-800' : 'bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                }`}
              >
                <span className="text-lg mt-0.5">
                  {n.is_urgent ? '🔴' : (CATEGORY_ICON[n.category] || '🔔')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13px] text-gray-800 dark:text-gray-100">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(n.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {n.sender_name ? ` — ${n.sender_name}` : ''}
                  </p>
                </div>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
