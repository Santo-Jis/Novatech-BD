// pages/admin/ChatSupportAgents.jsx
// ✅ NEW — Part 4: সাপোর্ট চ্যাটে কার কার access থাকবে, Admin এখান থেকে ঠিক করে।
// Admin নিজে কোড-লেভেলে সবসময় access পায় (chat.controller.js দেখুন) — এই
// লিস্টে নিজেকে যোগ করা লাগে না, এটা শুধু বাকি স্টাফদের জন্য।

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import { FiUserPlus, FiX, FiHeadphones } from 'react-icons/fi'

export default function ChatSupportAgents() {
  const [agents, setAgents] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, e] = await Promise.all([
        api.get('/chat/support-agents'),
        api.get('/employees', { params: { limit: 200 } }),
      ])
      setAgents(a.data.data || [])
      setStaff(e.data.data?.employees || [])
    } catch {
      toast.error('লোড করা যায়নি')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const agentIds = new Set(agents.map(a => a.user_id))
  const candidates = staff.filter(s =>
    !agentIds.has(s.id) &&
    (s.name_bn || s.name_en || '').toLowerCase().includes(search.toLowerCase())
  )

  const addAgent = async (userId) => {
    setAdding(true)
    try {
      await api.post('/chat/support-agents', { userId })
      setPickerOpen(false)
      setSearch('')
      load()
    } catch {
      toast.error('যোগ করা যায়নি')
    } finally {
      setAdding(false)
    }
  }

  const removeAgent = async (userId) => {
    try {
      await api.delete(`/chat/support-agents/${userId}`)
      setAgents(prev => prev.filter(a => a.user_id !== userId))
    } catch {
      toast.error('বাদ দেওয়া যায়নি')
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><FiHeadphones size={20} /></span>
        <div>
          <h2 className="font-bold text-[16px] text-gray-900 dark:text-gray-100">সাপোর্ট চ্যাট অ্যাক্সেস</h2>
          <p className="text-[12px] text-gray-500">এই স্টাফরা কাস্টমারের সাপোর্ট/ফিডব্যাক থ্রেড দেখতে ও রিপ্লাই দিতে পারবেন</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {loading ? (
          [0, 1].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)
        ) : agents.length === 0 ? (
          <p className="text-center text-gray-400 text-[13px] py-6">এখনো কেউ যোগ করা হয়নি — Admin নিজে সবসময় দেখতে পাবেন।</p>
        ) : (
          agents.map(a => (
            <div key={a.user_id} className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
              <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(a.name_bn || a.name_en || '?').charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-gray-800 dark:text-gray-100 truncate">{a.name_bn || a.name_en}</p>
                <p className="text-[11px] text-gray-400">{a.role}</p>
              </div>
              <button onClick={() => removeAgent(a.user_id)} className="text-gray-400 hover:text-red-500 p-1.5"><FiX size={16} /></button>
            </div>
          ))
        )}
      </div>

      {!pickerOpen ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-primary/30 text-primary rounded-xl py-3 text-[13.5px] font-semibold hover:bg-primary/5"
        >
          <FiUserPlus size={16} /> স্টাফ যোগ করুন
        </button>
      ) : (
        <div className="mt-4 border border-gray-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম দিয়ে খুঁজুন..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-[13px] outline-none mb-2"
          />
          <div className="max-h-52 overflow-y-auto space-y-1">
            {candidates.length === 0 ? (
              <p className="text-center text-gray-400 text-[12px] py-3">কেউ পাওয়া যায়নি</p>
            ) : candidates.map(s => (
              <button
                key={s.id}
                disabled={adding}
                onClick={() => addAgent(s.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-left disabled:opacity-50"
              >
                <span className="w-7 h-7 rounded-full bg-gray-300 dark:bg-slate-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                  {(s.name_bn || s.name_en || '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 dark:text-gray-100 truncate">{s.name_bn || s.name_en}</p>
                  <p className="text-[10.5px] text-gray-400">{s.role}</p>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => { setPickerOpen(false); setSearch('') }} className="mt-2 w-full text-center text-[12px] text-gray-400 py-1">বাতিল</button>
        </div>
      )}
    </div>
  )
}
