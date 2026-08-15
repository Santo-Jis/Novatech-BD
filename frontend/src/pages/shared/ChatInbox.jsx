// pages/shared/ChatInbox.jsx
// ✅ NEW — Part 4: স্টাফ-সাইড চ্যাট (Admin/Manager/Supervisor/ASM/RSM/Worker সবার
// জন্য একই কম্পোনেন্ট — কে কোন থ্রেড দেখবে সেটা ব্যাকএন্ডেই role অনুযায়ী স্কোপ করা,
// এখানে আলাদা role-চেক লাগে না)।
//
// personal ট্যাব: worker হলে নিজের assigned কাস্টমার, manager হলে নিজের route,
//                  admin/asm/rsm হলে সব।
// support ট্যাব: admin + tenant_support_agents-এ যাদের access আছে; বাকিদের কাছে খালি।
//
// মেসেজ RTDB-তে সরাসরি (Firebase custom token দিয়ে sign in করে, namespace:
// staff:<firebase_uid>) — REST শুধু থ্রেড লিস্ট/read/notify-এর জন্য (api/axios.js)।

import { useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, onValue, off, push, set, serverTimestamp } from 'firebase/database'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { FiArrowLeft, FiSend, FiMessageCircle, FiHeadphones, FiInbox } from 'react-icons/fi'
import api from '../../api/axios'

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

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'এখনই'
  if (min < 60) return `${min} মি আগে`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ঘণ্টা আগে`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'গতকাল'
  if (day < 7) return `${day} দিন আগে`
  return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
}
function clockTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
}

// ── চ্যাট hook (এই ফাইলেই, আলাদা hooks ফোল্ডার-কনভেনশন গেস না করে) ──
function useStaffChat() {
  const [authReady, setAuthReady] = useState(false)
  const [myUid, setMyUid] = useState(null)
  const [threads, setThreads] = useState({ personal: [], support: [] })
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const dbRef = useRef(null)
  const listenerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const app = getFirebaseApp()
    const auth = getAuth(app)
    dbRef.current = getDatabase(app)
    ;(async () => {
      try {
        if (!auth.currentUser) {
          const res = await api.get('/chat/firebase-token')
          await signInWithCustomToken(auth, res.data.data.token)
        }
        if (!cancelled) { setMyUid(auth.currentUser?.uid || null); setAuthReady(true) }
      } catch (e) { console.error('[chat] firebase auth error:', e.message) }
    })()
    return () => { cancelled = true }
  }, [])

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const [p, s] = await Promise.all([
        api.get('/chat/threads', { params: { type: 'personal' } }),
        api.get('/chat/threads', { params: { type: 'support' } }),
      ])
      setThreads({ personal: p.data.data || [], support: s.data.data || [] })
    } catch (e) { console.error('[chat] loadThreads error:', e.message) }
    finally { setThreadsLoading(false) }
  }, [])

  useEffect(() => { if (authReady) loadThreads() }, [authReady, loadThreads])

  const openThread = useCallback((threadId) => {
    setMessages([])
    setMessagesLoading(true)
    setActiveThreadId(threadId)

    if (listenerRef.current) { off(listenerRef.current); listenerRef.current = null }
    const msgsNode = ref(dbRef.current, `chats/${threadId}/messages`)
    onValue(msgsNode, (snap) => {
      const val = snap.val() || {}
      const list = Object.entries(val).map(([id, m]) => ({ id, ...m })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      setMessages(list)
      setMessagesLoading(false)
    })
    listenerRef.current = msgsNode

    api.patch(`/chat/threads/${threadId}/read`).catch(() => {})
  }, [])

  const closeThread = useCallback(() => {
    if (listenerRef.current) { off(listenerRef.current); listenerRef.current = null }
    setActiveThreadId(null)
    setMessages([])
  }, [])

  const sendMessage = useCallback(async (text, senderName) => {
    const trimmed = (text || '').trim()
    if (!trimmed || !activeThreadId || sending) return
    setSending(true)
    try {
      const msgsNode = ref(dbRef.current, `chats/${activeThreadId}/messages`)
      const newRef = push(msgsNode)
      await set(newRef, {
        senderId: getAuth(getFirebaseApp()).currentUser.uid,
        senderType: 'staff',
        senderName: senderName || 'স্টাফ',
        text: trimmed,
        createdAt: serverTimestamp(),
      })
      await api.post(`/chat/threads/${activeThreadId}/notify`, { preview: trimmed.slice(0, 150) })
      loadThreads()
    } finally { setSending(false) }
  }, [activeThreadId, sending, loadThreads])

  useEffect(() => () => { if (listenerRef.current) off(listenerRef.current) }, [])

  return { authReady, myUid, threads, threadsLoading, loadThreads, activeThreadId, openThread, closeThread, messages, messagesLoading, sendMessage, sending }
}

// ════════════════════════════════════════════════════════════
function ThreadRow({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-100 dark:border-slate-700/50',
        'hover:bg-gray-50 dark:hover:bg-slate-700/40',
        active && 'bg-blue-50 dark:bg-slate-700/60'
      )}
    >
      <span className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0', item.unread ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600')}>
        {(item.shop_name || item.owner_name || '?').trim().charAt(0).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={clsx('truncate text-[14px]', item.unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300')}>
            {item.shop_name || item.owner_name || 'কাস্টমার'}
          </p>
          <span className={clsx('flex-shrink-0 text-[11px]', item.unread ? 'text-primary font-semibold' : 'text-gray-400')}>{timeAgo(item.last_message_at)}</span>
        </div>
        <p className={clsx('truncate text-[12.5px] mt-0.5', item.unread ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')}>
          {item.last_message_preview || <span className="italic text-gray-400">এখনো মেসেজ নেই</span>}
        </p>
      </div>
      {item.unread && <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />}
    </button>
  )
}

function Bubble({ msg, mine, showSender }) {
  return (
    <div className={clsx('flex mb-2.5', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[80%] sm:max-w-[60%]">
        {!mine && showSender && msg.senderName && <p className="text-[11px] font-semibold text-gray-400 mb-1 ml-1">{msg.senderName}</p>}
        <div className={clsx('px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words rounded-2xl',
          mine ? 'bg-primary text-white rounded-br-md' : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-600 rounded-bl-md')}>
          {msg.text}
        </div>
        <p className={clsx('text-[10px] text-gray-400 mt-1', mine ? 'text-right mr-1' : 'ml-1')}>{clockTime(msg.createdAt)}</p>
      </div>
    </div>
  )
}

export default function ChatInbox() {
  const chat = useStaffChat()
  const [tab, setTab] = useState('personal')
  const [openId, setOpenId] = useState(null)
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const list = chat.threads[tab] || []
  const activeItem = list.find(t => t.id === openId)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages])

  const handleOpen = (item) => { setOpenId(item.id); chat.openThread(item.id) }
  const handleBack = () => { setOpenId(null); chat.closeThread() }
  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    try { await chat.sendMessage(text) } catch { setInput(text) }
  }

  // h-full কাজ করবে যদি প্রতিটা layout-এর <main> একটা flex-col শেলের ভেতর
  // flex-1 হিসেবে বসানো থাকে (এই কোডবেসের standard প্যাটার্ন)। কোথাও height
  // ঠিকমতো resolve না হলে min-height সেফটি-নেট হিসেবে রাখা হলো, যাতে অন্তত
  // পুরো পেজ স্ক্রল করে চ্যাটটা ব্যবহারযোগ্য থাকে, শূন্য-height হয়ে না যায়।
  return (
    <div className="h-full min-h-[560px] lg:grid lg:grid-cols-[360px_1fr] bg-gray-50 dark:bg-slate-900">
      {/* ── ইনবক্স ── */}
      <div className={clsx('h-full overflow-y-auto border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col', openId && 'hidden lg:flex')}>
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <h2 className="font-bold text-[17px] text-gray-900 dark:text-gray-100 mb-2">মেসেজ</h2>
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-full p-1">
            {[['personal', 'কাস্টমার', FiMessageCircle], ['support', 'সাপোর্ট', FiHeadphones]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={clsx('flex-1 flex items-center justify-center gap-1.5 text-[13px] font-medium rounded-full py-1.5 transition-colors',
                  tab === id ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400')}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {chat.threadsLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-2"><div className="h-3 w-1/2 bg-gray-200 dark:bg-slate-700 rounded" /><div className="h-2.5 w-2/3 bg-gray-200 dark:bg-slate-700 rounded" /></div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 flex-1">
            <FiInbox size={28} className="text-gray-300 mb-2" />
            <p className="text-gray-400 text-[13px]">{tab === 'support' ? 'সাপোর্ট থ্রেড নেই' : 'কোনো কাস্টমার মেসেজ নেই'}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {list.map(item => <ThreadRow key={item.id} item={item} active={openId === item.id} onClick={() => handleOpen(item)} />)}
          </div>
        )}
      </div>

      {/* ── থ্রেড ভিউ ── */}
      <div className={clsx('h-full flex flex-col', !openId && 'hidden lg:flex lg:items-center lg:justify-center')}>
        {activeItem ? (
          <>
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <button onClick={handleBack} className="lg:hidden p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300"><FiArrowLeft size={19} /></button>
              <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                {(activeItem.shop_name || activeItem.owner_name || '?').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-[15px] text-gray-900 dark:text-gray-100 truncate">{activeItem.shop_name || activeItem.owner_name}</p>
                <p className="text-[11px] text-gray-400">{tab === 'support' ? 'সাপোর্ট থ্রেড' : 'কাস্টমার চ্যাট'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3.5 py-4">
              {chat.messagesLoading ? (
                <div className="flex justify-center pt-10"><span className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>
              ) : chat.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-[13px] pt-16">এখনো কোনো মেসেজ নেই</p>
              ) : (
                chat.messages.map(m => <Bubble key={m.id} msg={m} mine={m.senderId === chat.myUid} showSender={tab === 'support'} />)
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5">
              <div className="flex items-end gap-2 bg-gray-100 dark:bg-slate-700 rounded-3xl px-3.5 py-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  rows={1}
                  placeholder="মেসেজ লিখুন..."
                  className="flex-1 resize-none bg-transparent outline-none text-[14px] text-gray-800 dark:text-gray-100 placeholder:text-gray-400 py-1 max-h-24"
                />
                <button onClick={handleSend} disabled={!input.trim() || chat.sending}
                  className={clsx('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90',
                    input.trim() && !chat.sending ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-400 cursor-not-allowed')}>
                  {chat.sending ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <FiSend size={15} className="-ml-0.5" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-[14px]">বাম পাশ থেকে একটা কথোপকথন বেছে নিন</p>
        )}
      </div>
    </div>
  )
}
