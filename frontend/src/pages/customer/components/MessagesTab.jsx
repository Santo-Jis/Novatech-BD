// components/MessagesTab.jsx
// ✅ NEW — Part 3: চ্যাট ট্যাব (ComingSoonView.jsx-এর রিজার্ভ করা "মেসেজ" স্লট)
//
// এক ইনবক্স, প্রতি কোম্পানি একটা row (WhatsApp-এর মতো "contact" ফিলিং) —
// প্রতিটার ভেতরে দুইটা সাব-মোড: personal (assigned SR, "trust" নীল) আর
// support (কোম্পানির অফিসিয়াল লাইন, "warmth" কমলা)। এই দুই রঙই এই পুরো
// পেজের সিগনেচার — কোন মোডে আছো সেটা টেক্সট না পড়েও রঙ দিয়ে বোঝা যায়।
//
// ব্যবহৃত এন্ডপয়েন্ট: /portal/chat/all-threads, /threads/ensure, /:id/read,
// /:id/notify, /firebase-token (useChat হুকে) — মেসেজ কনটেন্ট সরাসরি
// Firebase RTDB-তে, company session switch করার দরকার নেই।

import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import {
  FiArrowLeft, FiSend, FiMessageCircle, FiHeadphones, FiInbox,
} from 'react-icons/fi'
import { useChat } from '../hooks/useChat'
import { getCompanyColor } from '../utils/companyColor'

// ── ছোট, স্বনির্ভর রিলেটিভ-টাইম হেল্পার (চ্যাটের জন্য যথেষ্ট, নতুন dependency লাগে না) ──
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

// ── লোগো/ইনিশিয়াল অ্যাভাটার — companyColor.js রিইউজ করে (CompanyTag-এর মতোই deterministic রঙ) ──
function Avatar({ name, logoUrl, colorKey, size = 12 }) {
  const [imgError, setImgError] = useState(false)
  const c = getCompanyColor(colorKey ?? name)
  const showLogo = Boolean(logoUrl) && !imgError
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const dim = size === 9 ? 'w-9 h-9 text-sm' : 'w-12 h-12 text-lg'
  return showLogo ? (
    <img src={logoUrl} alt="" onError={() => setImgError(true)}
      className={clsx(dim, 'rounded-full object-cover bg-white border border-cp-border flex-shrink-0')} />
  ) : (
    <span className={clsx(dim, 'rounded-full flex items-center justify-center text-white font-cp-head font-semibold flex-shrink-0', c.dot)}>
      {initial}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// Inbox row — এক কোম্পানি, শেষ কার্যকলাপ অনুযায়ী রঙিন accent
// ════════════════════════════════════════════════════════════
function ThreadRow({ item, active, onClick }) {
  // ⚠️ Tailwind-এর JIT স্ক্যানার টেমপ্লেট-লিটারেল দিয়ে বানানো ক্লাসনেম (`bg-${x}-500`)
  // চিনতে পারে না — সব কটা variant সম্পূর্ণ, literal string হিসেবে লেখা হলো
  const isSupport = item.last_thread_type === 'support'
  const barClass  = isSupport ? 'bg-cp-warmth-500' : 'bg-cp-trust-500'
  const textClass = isSupport ? 'text-cp-warmth-600' : 'text-cp-trust-600'

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150',
        'hover:bg-cp-bg-alt active:bg-cp-bg-sunken',
        active && 'bg-cp-bg-alt'
      )}
    >
      {/* Accent bar — unread হলে জ্বলজ্বল করে, পড়া হলে নিভে যায় */}
      <span className="relative flex-shrink-0 w-1 self-stretch rounded-full overflow-hidden min-h-[44px]">
        <span className={clsx('absolute inset-0', item.unread ? barClass : 'bg-cp-border')} />
        {item.unread && <span className={clsx('absolute inset-0 animate-pulse-glow', barClass)} />}
      </span>

      <Avatar name={item.company_name} logoUrl={item.logo_url} colorKey={item.tenant_id} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={clsx('font-cp-head truncate text-[14.5px]', item.unread ? 'font-semibold text-cp-text-primary' : 'font-medium text-cp-text-primary')}>
            {item.company_name}
          </p>
          <span className={clsx('flex-shrink-0 text-[11px]', item.unread ? clsx(textClass, 'font-semibold') : 'text-cp-text-muted')}>
            {timeAgo(item.last_message_at)}
          </span>
        </div>
        <p className={clsx('truncate text-[13px] mt-0.5 font-cp-body', item.unread ? 'text-cp-text-primary' : 'text-cp-text-secondary')}>
          {item.last_message_at
            ? <>{item.last_sender_type === 'customer' && <span className="text-cp-text-muted">আপনি: </span>}{item.last_message_preview}</>
            : <span className="text-cp-text-muted italic">কথা বলা শুরু করুন</span>}
        </p>
      </div>

      {item.unread && <span className={clsx('flex-shrink-0 w-2.5 h-2.5 rounded-full', barClass)} />}
    </button>
  )
}

// ════════════════════════════════════════════════════════════
// Message bubble
// ════════════════════════════════════════════════════════════
function Bubble({ msg, mine, mode, showSender }) {
  return (
    <div className={clsx('flex mb-2.5 animate-msg-in', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[80%] sm:max-w-[65%]">
        {!mine && showSender && msg.senderName && (
          <p className="text-[11px] font-semibold text-cp-text-muted mb-1 ml-1">{msg.senderName}</p>
        )}
        <div
          className={clsx(
            'px-3.5 py-2.5 text-[14px] leading-relaxed font-cp-body whitespace-pre-wrap break-words',
            mine
              ? clsx('text-white rounded-2xl rounded-br-md shadow-sm', mode === 'support' ? 'bg-cp-warmth-600' : 'bg-gradient-to-br from-cp-trust-500 to-cp-trust-700')
              : 'bg-white text-cp-text-primary rounded-2xl rounded-bl-md border border-cp-border'
          )}
        >
          {msg.text}
        </div>
        <p className={clsx('text-[10px] text-cp-text-muted mt-1', mine ? 'text-right mr-1' : 'ml-1')}>
          {clockTime(msg.createdAt)}
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Thread view — হেডার (contact + tab switcher) + মেসেজ লিস্ট + ইনপুট
// ════════════════════════════════════════════════════════════
function ThreadView({ item, mode, setMode, chat, onBack }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const threadId = mode === 'support' ? item.support_thread_id : item.personal_thread_id

  useEffect(() => {
    chat.openThread(item.connection_id, mode, threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.connection_id, mode])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    try { await chat.sendMessage(text) } catch { setInput(text) }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-full bg-cp-bg-base">
      {/* ── Header — glass ── */}
      <div className="flex-shrink-0 sticky top-0 z-10 backdrop-blur-lg bg-white/80 border-b border-cp-border">
        <div className="flex items-center gap-3 px-3 py-3">
          <button onClick={onBack} className="lg:hidden p-2 -ml-1 rounded-full hover:bg-cp-bg-alt text-cp-text-secondary">
            <FiArrowLeft size={19} />
          </button>
          <Avatar name={item.company_name} logoUrl={item.logo_url} colorKey={item.tenant_id} size={9} />
          <div className="min-w-0 flex-1">
            <p className="font-cp-head font-semibold text-[15px] text-cp-text-primary truncate">{item.company_name}</p>
            <p className={clsx('text-[11px] font-medium', mode === 'support' ? 'text-cp-warmth-600' : 'text-cp-trust-500')}>
              {mode === 'support' ? 'সাপোর্ট ও ফিডব্যাক' : 'আপনার সেলস প্রতিনিধি'}
            </p>
          </div>
        </div>

        {/* Tab switcher — সিগনেচার এলিমেন্ট: স্লাইডিং নীল ↔ কমলা */}
        <div className="px-3 pb-2.5">
          <div className="relative flex bg-cp-bg-sunken rounded-full p-1 h-10">
            <span
              className={clsx(
                'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out shadow-sm',
                mode === 'support' ? 'translate-x-[calc(100%+8px)] bg-cp-warmth-600' : 'translate-x-0 bg-gradient-to-r from-cp-trust-500 to-cp-trust-700'
              )}
            />
            <button
              onClick={() => setMode('personal')}
              className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', mode === 'personal' ? 'text-white' : 'text-cp-text-secondary')}
            >
              <FiMessageCircle size={14} /> SR চ্যাট
            </button>
            <button
              onClick={() => setMode('support')}
              className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', mode === 'support' ? 'text-white' : 'text-cp-text-secondary')}
            >
              <FiHeadphones size={14} /> সাপোর্ট
            </button>
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4">
        {chat.messagesLoading ? (
          <div className="flex justify-center pt-10">
            <span className="w-6 h-6 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-16 px-6">
            <span className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center mb-3', mode === 'support' ? 'bg-cp-warmth-100 text-cp-warmth-600' : 'bg-cp-trust-100 text-cp-trust-700')}>
              {mode === 'support' ? <FiHeadphones size={24} /> : <FiMessageCircle size={24} />}
            </span>
            <p className="font-cp-head font-semibold text-cp-text-primary text-[15px]">
              {mode === 'support' ? 'কোনো সমস্যা বা মতামত জানান' : 'এখনো কোনো মেসেজ নেই'}
            </p>
            <p className="text-[13px] text-cp-text-secondary mt-1 max-w-[240px]">
              {mode === 'support'
                ? `${item.company_name}-এর টিম আপনার মেসেজের উত্তর দেবে।`
                : 'আপনার সেলস প্রতিনিধিকে এখানে সরাসরি মেসেজ করুন।'}
            </p>
          </div>
        ) : (
          chat.messages.map((m) => (
            <Bubble key={m.id} msg={m} mine={m.senderId === chat.myUid} mode={mode} showSender={mode === 'support'} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input — glass ── */}
      <div className="flex-shrink-0 border-t border-cp-border backdrop-blur-lg bg-white/85 px-3 py-2.5">
        <div className="flex items-end gap-2 bg-cp-bg-sunken rounded-3xl px-3.5 py-2 border border-transparent focus-within:border-cp-border-focus transition-colors">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px' }}
            rows={1}
            placeholder={mode === 'support' ? 'আপনার সমস্যা লিখুন...' : 'মেসেজ লিখুন...'}
            className="flex-1 resize-none bg-transparent outline-none text-[14px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted leading-relaxed py-1 max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chat.sending}
            className={clsx(
              'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90',
              input.trim() && !chat.sending
                ? (mode === 'support' ? 'bg-cp-warmth-600 text-white shadow-sm' : 'bg-cp-trust-500 text-white shadow-sm')
                : 'bg-cp-border text-cp-text-muted cursor-not-allowed'
            )}
          >
            {chat.sending
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <FiSend size={15} className="-ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Main export
// ════════════════════════════════════════════════════════════
export default function MessagesTab({ portalJWT }) {
  const chat = useChat()
  const [openItem, setOpenItem] = useState(null) // ইনবক্সে বর্তমানে খোলা company row
  const [mode, setMode] = useState('personal')

  // নতুন connection-এ প্রথমবার খোলার পর ensureThreads থ্রেড আইডি বানায় ও loadThreads()
  // রিফ্রেশ করে — openItem-কেও সেই তাজা আইডি দিয়ে সিঙ্ক করে রাখা হচ্ছে,
  // নাহলে tab বদলালে (personal→support) আবার অপ্রয়োজনীয় ensure কল হতো
  useEffect(() => {
    if (!openItem) return
    const fresh = chat.threads.find(t => t.connection_id === openItem.connection_id)
    if (fresh && (fresh.personal_thread_id !== openItem.personal_thread_id || fresh.support_thread_id !== openItem.support_thread_id)) {
      setOpenItem(fresh)
    }
  }, [chat.threads, openItem])

  if (chat.threadsLoading && !chat.threads.length) {
    return (
      <div className="p-4 space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-12 h-12 rounded-full bg-cp-bg-sunken flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 bg-cp-bg-sunken rounded-full" />
              <div className="h-2.5 w-2/3 bg-cp-bg-sunken rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!chat.threadsLoading && chat.threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <span className="w-16 h-16 rounded-2xl bg-cp-trust-100 text-cp-trust-700 flex items-center justify-center mb-3">
          <FiInbox size={28} />
        </span>
        <p className="font-cp-head font-semibold text-cp-text-primary text-[15px]">এখনো কোনো কোম্পানির সাথে সংযোগ নেই</p>
        <p className="text-[13px] text-cp-text-secondary mt-1 max-w-[260px]">
          কোনো কোম্পানির সাথে সংযুক্ত হলে তাদের সেলস প্রতিনিধি ও সাপোর্ট টিমের সাথে এখানেই কথা বলতে পারবেন।
        </p>
      </div>
    )
  }

  return (
    <div className="h-full lg:grid lg:grid-cols-[340px_1fr]">
      {/* ── ইনবক্স — মোবাইলে openItem থাকলে হাইড, lg-তে সবসময় দৃশ্যমান ── */}
      <div className={clsx('h-full overflow-y-auto border-r border-cp-border bg-white', openItem && 'hidden lg:block')}>
        <div className="px-4 py-4 border-b border-cp-border">
          <h2 className="font-cp-head font-bold text-[17px] text-cp-text-primary">মেসেজ</h2>
        </div>
        <div className="divide-y divide-cp-border/60">
          {chat.threads.map((item) => (
            <ThreadRow
              key={item.connection_id}
              item={item}
              active={openItem?.connection_id === item.connection_id}
              onClick={() => {
                setOpenItem(item)
                setMode(item.last_thread_type === 'support' ? 'support' : 'personal')
              }}
            />
          ))}
        </div>
      </div>

      {/* ── থ্রেড ভিউ — মোবাইলে শুধু openItem থাকলে দেখায়, lg-তে সবসময় ── */}
      <div className={clsx('h-full', !openItem && 'hidden lg:flex lg:items-center lg:justify-center')}>
        {openItem ? (
          <ThreadView
            key={openItem.connection_id}
            item={openItem}
            mode={mode}
            setMode={setMode}
            chat={chat}
            onBack={() => setOpenItem(null)}
          />
        ) : (
          <div className="text-center px-6">
            <span className="w-16 h-16 rounded-2xl bg-cp-bg-alt text-cp-text-muted flex items-center justify-center mb-3 mx-auto">
              <FiMessageCircle size={26} />
            </span>
            <p className="text-cp-text-secondary text-[14px]">বাম পাশ থেকে একটা কোম্পানি বেছে নিন</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-msg-in { animation: msg-in 0.25s ease-out; }
        @keyframes pulse-glow { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
        .animate-pulse-glow { animation: pulse-glow 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-msg-in, .animate-pulse-glow { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
