// components/MessagesTab.jsx
// ✅ REDESIGNED (Chat Phase 1 — Session 1)
//
// এক ইনবক্স, প্রতি কোম্পানি একটা row (WhatsApp-এর মতো "contact" ফিলিং) —
// প্রতিটার ভেতরে দুইটা সাব-মোড: personal (assigned SR, "trust" নীল) আর
// support (কোম্পানির অফিসিয়াল লাইন, "warmth" কমলা)। এই অংশটা অপরিবর্তিত।
//
// যা বদলেছে: আসল কথোপকথন (মেসেজ/টাইপিং/অনলাইন-স্ট্যাটাস/রিড-টিক/অফলাইন-কিউ)
// এখন shared <ConversationPane> থেকে আসছে — ChatInbox.jsx (staff)-ও এই
// একই কম্পোনেন্ট ব্যবহার করে। পুরনো ভার্সন MessagesTab.jsx.orig-এ আছে।
//
// ব্যবহৃত এন্ডপয়েন্ট: /portal/chat/all-threads, /threads/ensure, /:id/read,
// /:id/notify, /firebase-token (useChat হুকে + chat/api/chatApi.js) —
// মেসেজ কনটেন্ট সরাসরি Firebase RTDB-তে, company session switch লাগে না।

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { FiMessageCircle, FiHeadphones, FiInbox } from 'react-icons/fi'
import { useChat } from '../hooks/useChat'
import { getCompanyColor } from '../utils/companyColor'
import { timeAgo } from '../../../chat/utils/time'
import ConversationPane from '../../../chat/components/ConversationPane'

// ── লোগো/ইনিশিয়াল অ্যাভাটার — companyColor.js রিইউজ করে (CompanyTag-এর মতোই deterministic রঙ) ──
function Avatar({ name, logoUrl, colorKey, size = 12 }) {
  const [imgError, setImgError] = useState(false)
  const c = getCompanyColor(colorKey ?? name)
  const showLogo = Boolean(logoUrl) && !imgError
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const dim = size === 9 ? 'w-9 h-9 text-sm' : 'w-12 h-12 text-lg'
  return showLogo ? (
    <img
      src={logoUrl}
      alt=""
      onError={() => setImgError(true)}
      className={clsx(dim, 'rounded-full object-cover bg-white border border-cp-border flex-shrink-0')}
    />
  ) : (
    <span className={clsx(dim, 'rounded-full flex items-center justify-center text-white font-cp-head font-semibold flex-shrink-0', c.dot)}>
      {initial}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// Inbox row — এক কোম্পানি, শেষ কার্যকলাপ অনুযায়ী রঙিন accent (অপরিবর্তিত)
// ════════════════════════════════════════════════════════════
function ThreadRow({ item, active, onClick }) {
  const isSupport = item.last_thread_type === 'support'
  const barClass = isSupport ? 'bg-cp-warmth-500' : 'bg-cp-trust-500'
  const textClass = isSupport ? 'text-cp-warmth-600' : 'text-cp-trust-600'

  return (
    <button
      onClick={onClick}
      type="button"
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150',
        'hover:bg-cp-bg-alt active:bg-cp-bg-sunken',
        active && 'bg-cp-bg-alt'
      )}
    >
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
          {item.last_message_at ? (
            <>
              {item.last_sender_type === 'customer' && <span className="text-cp-text-muted">আপনি: </span>}
              {item.last_message_preview}
            </>
          ) : (
            <span className="text-cp-text-muted italic">কথা বলা শুরু করুন</span>
          )}
        </p>
      </div>

      {item.unread && <span className={clsx('flex-shrink-0 w-2.5 h-2.5 rounded-full', barClass)} />}
    </button>
  )
}

// ════════════════════════════════════════════════════════════
// Tab switcher — সিগনেচার এলিমেন্ট: স্লাইডিং নীল ↔ কমলা (অপরিবর্তিত)
// ════════════════════════════════════════════════════════════
function ModeTabs({ mode, setMode }) {
  return (
    <div className="relative flex bg-cp-bg-sunken rounded-full p-1 h-10">
      <span
        className={clsx(
          'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out shadow-sm',
          mode === 'support' ? 'translate-x-[calc(100%+8px)] bg-cp-warmth-600' : 'translate-x-0 bg-gradient-to-r from-cp-trust-500 to-cp-trust-700'
        )}
      />
      <button
        onClick={() => setMode('personal')}
        type="button"
        className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', mode === 'personal' ? 'text-white' : 'text-cp-text-secondary')}
      >
        <FiMessageCircle size={14} /> SR চ্যাট
      </button>
      <button
        onClick={() => setMode('support')}
        type="button"
        className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', mode === 'support' ? 'text-white' : 'text-cp-text-secondary')}
      >
        <FiHeadphones size={14} /> সাপোর্ট
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Main export
// ════════════════════════════════════════════════════════════
export default function MessagesTab() {
  const chat = useChat()
  const [openItem, setOpenItem] = useState(null)
  const [mode, setMode] = useState('personal')
  const [composerValue, setComposerValue] = useState('')

  // openItem-কে সবসময় chat.threads-এর ফ্রেশ ভার্সনের সাথে সিঙ্কে রাখে —
  // ensureThreads()-এর পর নতুন thread id গুলো এখান দিয়েই openItem-এ ঢোকে
  useEffect(() => {
    if (!openItem) return
    const fresh = chat.threads.find((t) => t.connection_id === openItem.connection_id)
    if (fresh && (fresh.personal_thread_id !== openItem.personal_thread_id || fresh.support_thread_id !== openItem.support_thread_id)) {
      setOpenItem(fresh)
    }
  }, [chat.threads, openItem])

  // এই কোম্পানি/মোডের থ্রেড এখনো তৈরি না হলে (প্রথমবার) — বানানো শুরু করে
  useEffect(() => {
    if (!openItem) return
    const threadId = mode === 'support' ? openItem.support_thread_id : openItem.personal_thread_id
    if (!threadId) chat.ensureThreads(openItem.connection_id).catch((e) => console.error('[chat] ensureThreads:', e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem?.connection_id, mode])

  // নতুন কোম্পানি খুললে ড্রাফট রিসেট, মোড বদলালে ড্রাফট থেকে যায় (আগের আচরণ অপরিবর্তিত)
  useEffect(() => {
    setComposerValue('')
  }, [openItem?.connection_id])

  if (chat.threadsLoading && !chat.threads.length) {
    return (
      <div className="p-4 space-y-3">
        {[0, 1, 2].map((i) => (
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

  const activeThreadId = openItem ? (mode === 'support' ? openItem.support_thread_id : openItem.personal_thread_id) : null

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

      {/* ── থ্রেড ভিউ ── */}
      <div className={clsx('h-full', !openItem && 'hidden lg:flex lg:items-center lg:justify-center')}>
        {openItem && activeThreadId ? (
          <ConversationPane
            key={`${openItem.connection_id}:${mode}`}
            chatApi={chat.chatApi}
            db={chat.db}
            uid={chat.uid}
            ready={chat.ready}
            threadId={activeThreadId}
            senderType="customer"
            senderName="আপনি"
            accent={mode === 'support' ? 'warmth' : 'trust'}
            avatar={<Avatar name={openItem.company_name} logoUrl={openItem.logo_url} colorKey={openItem.tenant_id} size={9} />}
            title={openItem.company_name}
            subtitle={mode === 'support' ? 'সাপোর্ট ও ফিডব্যাক' : 'আপনার সেলস প্রতিনিধি'}
            onBack={() => setOpenItem(null)}
            showSenderName={mode === 'support'}
            emptyIcon={mode === 'support' ? <FiHeadphones size={24} /> : <FiMessageCircle size={24} />}
            emptyTitle={mode === 'support' ? 'কোনো সমস্যা বা মতামত জানান' : 'এখনো কোনো মেসেজ নেই'}
            emptyBody={mode === 'support' ? `${openItem.company_name}-এর টিম আপনার মেসেজের উত্তর দেবে।` : 'আপনার সেলস প্রতিনিধিকে এখানে সরাসরি মেসেজ করুন।'}
            composerPlaceholder={mode === 'support' ? 'আপনার সমস্যা লিখুন...' : 'মেসেজ লিখুন...'}
            tabs={<ModeTabs mode={mode} setMode={setMode} />}
            composerValue={composerValue}
            onComposerChange={setComposerValue}
          />
        ) : openItem ? (
          // থ্রেড এখনো ensure হচ্ছে (প্রথমবার এই কোম্পানি খোলা)
          <div className="flex items-center justify-center h-full">
            <span className="w-6 h-6 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />
          </div>
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
        @keyframes pulse-glow { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
        .animate-pulse-glow { animation: pulse-glow 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .animate-pulse-glow { animation: none !important; } }
      `}</style>
    </div>
  )
}
