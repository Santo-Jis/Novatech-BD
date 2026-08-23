// pages/shared/ChatInbox.jsx
// ✅ REDESIGNED (Chat Phase 1 — Session 1): Admin/Manager/Supervisor/ASM/RSM/
// Worker সবার জন্য একই কম্পোনেন্ট (কে কোন থ্রেড দেখবে সেটা ব্যাকএন্ডেই role
// অনুযায়ী স্কোপ করা — অপরিবর্তিত, দেখুন chat.controller.js)।
//
// যা বদলেছে:
//  ১) আসল কথোপকথন এখন shared <ConversationPane> — MessagesTab.jsx (customer)
//     এর সাথে একই কোড শেয়ার করে (মেসেজ/টাইপিং/অনলাইন-স্ট্যাটাস/রিড-টিক/
//     অফলাইন-কিউ — এসব আগে ছিলই না, প্রথমবার যোগ হলো)।
//  ২) ভিজ্যুয়াল ভাষা flat primary/gray থেকে cp-trust/cp-warmth-এ — কাস্টমার
//     পোর্টালের মতোই personal=নীল, support=কমলা এখন এখানেও, যাতে স্টাফ চোখের
//     পলকে বুঝতে পারে কোন মোডে আছে। dark: ভ্যারিয়েন্ট বাদ পড়েছে — cp-
//     টোকেনে ডার্ক-মোড কাউন্টারপার্ট এখনো ডিফাইন করা নেই (দেখুন README-এর
//     "Open items")।
//
// পুরনো ভার্সন ChatInbox.jsx.orig-এ আছে।

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { FiMessageCircle, FiHeadphones, FiInbox, FiFileText, FiRadio } from 'react-icons/fi'
import { createChatApi } from '../../chat/api/chatApi'
import { useChatIdentity } from '../../chat/hooks/useChatIdentity'
import { timeAgo } from '../../chat/utils/time'
import ConversationPane from '../../chat/components/ConversationPane'
import NotesPanel from '../../chat/notes/NotesPanel'
import BroadcastPanel from '../../chat/broadcast/BroadcastPanel'

// ── থ্রেড-লিস্ট hook — staff-নির্দিষ্ট শেপ (flat personal[]/support[]), তাই
// shared engine-এর অংশ না (দেখুন chatApi.js-এর টপ কমেন্ট) ──
function useStaffThreadList(chatApi, ready) {
  const [threads, setThreads] = useState({ personal: [], support: [] })
  const [threadsLoading, setThreadsLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      setThreadsLoading(true)
      try {
        const [personal, support] = await Promise.all([chatApi.listThreads('personal'), chatApi.listThreads('support')])
        if (!cancelled) setThreads({ personal, support })
      } catch (e) {
        console.error('[chat] loadThreads error:', e.message)
      } finally {
        if (!cancelled) setThreadsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chatApi, ready])

  return { threads, threadsLoading }
}

function Avatar({ name, accent }) {
  const bg = accent === 'warmth' ? 'bg-cp-warmth-600' : 'bg-gradient-to-br from-cp-trust-500 to-cp-trust-700'
  return (
    <span className={clsx('w-11 h-11 rounded-full flex items-center justify-center text-white font-cp-head font-semibold flex-shrink-0', bg)}>
      {(name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function ThreadRow({ item, accent, active, onClick }) {
  const barClass = accent === 'warmth' ? 'bg-cp-warmth-500' : 'bg-cp-trust-500'
  const name = item.shop_name || item.owner_name || 'কাস্টমার'

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

      <Avatar name={name} accent={accent} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={clsx('font-cp-head truncate text-[14.5px]', item.unread ? 'font-semibold text-cp-text-primary' : 'font-medium text-cp-text-primary')}>
            {name}
          </p>
          <span className={clsx('flex-shrink-0 text-[11px]', item.unread ? 'text-cp-trust-600 font-semibold' : 'text-cp-text-muted')}>{timeAgo(item.last_message_at)}</span>
        </div>
        <p className={clsx('truncate text-[13px] mt-0.5 font-cp-body', item.unread ? 'text-cp-text-primary' : 'text-cp-text-secondary')}>
          {item.last_message_preview || <span className="text-cp-text-muted italic">এখনো মেসেজ নেই</span>}
        </p>
      </div>

      {item.unread && <span className={clsx('flex-shrink-0 w-2.5 h-2.5 rounded-full', barClass)} />}
    </button>
  )
}

export default function ChatInbox() {
  const [chatApi] = useState(() => createChatApi('staff'))
  const { ready, uid, db } = useChatIdentity(chatApi)
  const { threads, threadsLoading } = useStaffThreadList(chatApi, ready)

  const [tab, setTab] = useState('personal')
  const [openId, setOpenId] = useState(null)
  const [composerValue, setComposerValue] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [broadcastOpen, setBroadcastOpen] = useState(false)

  const list = threads[tab] || []
  const activeItem = list.find((t) => t.id === openId)
  const accent = tab === 'support' ? 'warmth' : 'trust'

  useEffect(() => {
    setComposerValue('')
    setNotesOpen(false)
  }, [openId])

  const handleOpen = (item) => setOpenId(item.id)
  const handleBack = () => setOpenId(null)

  // h-full কাজ করবে যদি প্রতিটা layout-এর <main> flex-col শেলের ভেতর flex-1
  // হিসেবে বসানো থাকে (এই কোডবেসের standard প্যাটার্ন)। min-height সেফটি-নেট।
  return (
    <div className="relative h-full min-h-[560px] lg:grid lg:grid-cols-[360px_1fr] bg-cp-bg-base">
      {/* ── ইনবক্স ── */}
      <div className={clsx('h-full overflow-y-auto border-r border-cp-border bg-white flex flex-col', openId && 'hidden lg:flex')}>
        <div className="px-4 py-3 border-b border-cp-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-cp-head font-bold text-[17px] text-cp-text-primary">মেসেজ</h2>
            <button
              onClick={() => setBroadcastOpen(true)}
              type="button"
              className="flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full bg-cp-trust-50 text-cp-trust-700 text-[11.5px] font-semibold hover:bg-cp-trust-100 transition-colors"
            >
              <FiRadio size={12} /> ব্রডকাস্ট
            </button>
          </div>
          <div className="relative flex bg-cp-bg-sunken rounded-full p-1 h-10">
            <span
              className={clsx(
                'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out shadow-sm',
                tab === 'support' ? 'translate-x-[calc(100%+8px)] bg-cp-warmth-600' : 'translate-x-0 bg-gradient-to-r from-cp-trust-500 to-cp-trust-700'
              )}
            />
            <button
              onClick={() => setTab('personal')}
              type="button"
              className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', tab === 'personal' ? 'text-white' : 'text-cp-text-secondary')}
            >
              <FiMessageCircle size={14} /> কাস্টমার
            </button>
            <button
              onClick={() => setTab('support')}
              type="button"
              className={clsx('relative z-10 flex-1 flex items-center justify-center gap-1.5 text-[13px] font-cp-head font-medium rounded-full transition-colors', tab === 'support' ? 'text-white' : 'text-cp-text-secondary')}
            >
              <FiHeadphones size={14} /> সাপোর্ট
            </button>
          </div>
        </div>

        {threadsLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-cp-bg-sunken flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 bg-cp-bg-sunken rounded-full" />
                  <div className="h-2.5 w-2/3 bg-cp-bg-sunken rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 flex-1">
            <span className="w-14 h-14 rounded-2xl bg-cp-bg-alt text-cp-text-muted flex items-center justify-center mb-3">
              <FiInbox size={24} />
            </span>
            <p className="text-cp-text-secondary text-[13px]">{tab === 'support' ? 'সাপোর্ট থ্রেড নেই' : 'কোনো কাস্টমার মেসেজ নেই'}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-cp-border/60">
            {list.map((item) => (
              <ThreadRow key={item.id} item={item} accent={accent} active={openId === item.id} onClick={() => handleOpen(item)} />
            ))}
          </div>
        )}
      </div>

      {/* ── থ্রেড ভিউ ── */}
      <div className={clsx('relative h-full flex flex-col', !openId && 'hidden lg:flex lg:items-center lg:justify-center')}>
        {activeItem ? (
          <ConversationPane
            key={activeItem.id}
            chatApi={chatApi}
            db={db}
            uid={uid}
            ready={ready}
            threadId={activeItem.id}
            senderType="staff"
            senderName="স্টাফ"
            accent={accent}
            customerId={activeItem.customer_id}
            avatar={<Avatar name={activeItem.shop_name || activeItem.owner_name} accent={accent} />}
            title={activeItem.shop_name || activeItem.owner_name || 'কাস্টমার'}
            subtitle={tab === 'support' ? 'সাপোর্ট থ্রেড' : 'কাস্টমার চ্যাট'}
            onBack={handleBack}
            showSenderName={tab === 'support'}
            emptyIcon={tab === 'support' ? <FiHeadphones size={24} /> : <FiMessageCircle size={24} />}
            emptyTitle="এখনো কোনো মেসেজ নেই"
            emptyBody={tab === 'support' ? 'কাস্টমারের সাপোর্ট মেসেজ এখানে দেখা যাবে।' : 'কাস্টমারকে এখান থেকে মেসেজ পাঠান।'}
            composerPlaceholder="মেসেজ লিখুন..."
            composerValue={composerValue}
            onComposerChange={setComposerValue}
          />
        ) : (
          <p className="text-cp-text-secondary text-[14px]">বাম পাশ থেকে একটা কথোপকথন বেছে নিন</p>
        )}

        {activeItem && !notesOpen && (
          <button
            onClick={() => setNotesOpen(true)}
            type="button"
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[11.5px] font-semibold shadow-sm hover:bg-amber-200 transition-colors"
          >
            <FiFileText size={13} /> নোট
          </button>
        )}

        {activeItem && notesOpen && <NotesPanel chatApi={chatApi} threadId={activeItem.id} onClose={() => setNotesOpen(false)} />}
      </div>

      <style>{`
        @keyframes pulse-glow { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
        .animate-pulse-glow { animation: pulse-glow 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .animate-pulse-glow { animation: none !important; } }
      `}</style>

      {broadcastOpen && (
        <BroadcastPanel chatApi={chatApi} db={db} uid={uid} ready={ready} senderName="স্টাফ" onClose={() => setBroadcastOpen(false)} />
      )}
    </div>
  )
}
