// components/ChatBell.jsx
// ✅ NEW — Part 4: স্টাফ-সাইড চ্যাট আইকন। NotificationBell.jsx-এর ঠিক একই
// প্যাটার্নে: self-contained, যেকোনো layout-এ <ChatBell /> বসিয়ে দিলেই কাজ করবে।
// personal+support দুই ধরনের থ্রেড থেকেই unread গোনে — worker/manager হলে
// support সবসময় খালি আসবে (ব্যাকএন্ডেই স্কোপ করা, এখানে আলাদা role-চেক লাগে না)।
//
// App.jsx-এ /admin, /manager, /worker — প্রতিটার নিচেই আলাদা "chat" রুট নেস্টেড,
// তাই basePath prop নেয় (AdminLayout→"/admin", ManagerLayout→"/manager", WorkerLayout→"/worker")।

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { FiMessageCircle } from 'react-icons/fi'

const POLL_INTERVAL_MS = 60000

export default function ChatBell({ basePath = '/admin' }) {
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()

  const fetchUnread = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        api.get('/chat/threads', { params: { type: 'personal' } }),
        api.get('/chat/threads', { params: { type: 'support' } }),
      ])
      const count = [...(p.data.data || []), ...(s.data.data || [])].filter(t => t.unread).length
      setUnread(count)
    } catch {
      // silent — পরের poll-এ ঠিক হয়ে যাবে
    }
  }, [])

  useEffect(() => {
    fetchUnread()
    const t = setInterval(fetchUnread, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchUnread])

  return (
    <button
      onClick={() => navigate(`${basePath}/chat`)}
      aria-label="মেসেজ"
      className="relative w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
    >
      <FiMessageCircle className="text-xl" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
