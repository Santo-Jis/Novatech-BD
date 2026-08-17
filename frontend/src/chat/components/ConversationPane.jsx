// chat/components/ConversationPane.jsx
//
// এটাই আসল "ইউনিফাইড চ্যাট ইঞ্জিন"-এর দৃশ্যমান অংশ — হেডার + মেসেজ লিস্ট +
// কম্পোজার, প্রেজেন্স/টাইপিং/রিড-রিসিট/অফলাইন-কিউ সব ওয়্যার করা। staff
// (ChatInbox.jsx) আর customer (MessagesTab.jsx) দুই পাশই এই একই কম্পোনেন্ট
// রেন্ডার করে — শুধু বাম পাশের থ্রেড-লিস্টটা আলাদা থাকে (সেটা সত্যিকারের
// আলাদা mental model, দেখুন chatApi.js-এর কমেন্ট)।

import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { FiWifiOff } from 'react-icons/fi'
import { useChatEngine } from '../hooks/useChatEngine'
import { useOthersOnline } from '../hooks/usePresence'
import ThreadHeader from './ThreadHeader'
import MessageBubble from './MessageBubble'
import TypingDots from './TypingDots'
import Composer from './Composer'

export default function ConversationPane({
  chatApi,
  db,
  uid,
  ready,
  threadId,
  senderType,
  senderName,
  accent = 'trust',
  avatar,
  title,
  subtitle,
  onBack,
  showSenderName = false,
  emptyIcon,
  emptyTitle,
  emptyBody,
  composerPlaceholder = 'মেসেজ লিখুন...',
  tabs,
  composerValue,
  onComposerChange,
}) {
  const engine = useChatEngine({ chatApi, db, uid, ready, threadId, senderType, senderName })
  const { anyOnline } = useOthersOnline(db, threadId, uid)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [engine.messages.length, engine.typingOthers])

  const handleSend = () => {
    if (!composerValue.trim()) return
    engine.send(composerValue)
    onComposerChange('')
  }

  return (
    <div className="flex flex-col h-full bg-cp-bg-base">
      <ThreadHeader
        avatar={avatar}
        title={title}
        subtitle={subtitle}
        accent={accent}
        onBack={onBack}
        othersOnline={anyOnline}
        typingOthers={engine.typingOthers}
        tabs={tabs}
      />

      {engine.isOffline && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1.5 bg-cp-warning-bg text-cp-warning text-[11.5px] font-medium py-1.5 px-3">
          <FiWifiOff size={12} />
          ইন্টারনেট সংযোগ নেই — সংযোগ ফিরলেই মেসেজ পাঠানো হবে
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3.5 py-4">
        {engine.messagesLoading ? (
          <div className="flex justify-center pt-10">
            <span className="w-6 h-6 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />
          </div>
        ) : engine.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-16 px-6">
            <span
              className={clsx(
                'w-14 h-14 rounded-2xl flex items-center justify-center mb-3',
                accent === 'warmth' ? 'bg-cp-warmth-100 text-cp-warmth-600' : 'bg-cp-trust-100 text-cp-trust-700'
              )}
            >
              {emptyIcon}
            </span>
            <p className="font-cp-head font-semibold text-cp-text-primary text-[15px]">{emptyTitle}</p>
            <p className="text-[13px] text-cp-text-secondary mt-1 max-w-[240px]">{emptyBody}</p>
          </div>
        ) : (
          <>
            {engine.messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                mine={m.senderId === uid}
                accent={accent}
                showSender={showSenderName}
                readState={engine.getReadState(m)}
                onRetry={engine.retryFailed}
                onDiscard={engine.discardFailed}
              />
            ))}
            {engine.typingOthers && <TypingDots accent={accent} />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer
        value={composerValue}
        onChange={onComposerChange}
        onSend={handleSend}
        onTypingChange={engine.notifyTyping}
        sending={engine.sending}
        accent={accent}
        placeholder={composerPlaceholder}
      />

      <style>{`
        @keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-msg-in { animation: msg-in 0.25s ease-out; }
        @media (prefers-reduced-motion: reduce) { .animate-msg-in { animation: none !important; } }
      `}</style>
    </div>
  )
}
