// chat/components/ConversationPane.jsx
//
// এটাই আসল "ইউনিফাইড চ্যাট ইঞ্জিন"-এর দৃশ্যমান অংশ — হেডার + মেসেজ লিস্ট +
// কম্পোজার, প্রেজেন্স/টাইপিং/রিড-রিসিট/অফলাইন-কিউ সব ওয়্যার করা। staff
// (ChatInbox.jsx) আর customer (MessagesTab.jsx) দুই পাশই এই একই কম্পোনেন্ট
// রেন্ডার করে — শুধু বাম পাশের থ্রেড-লিস্টটা আলাদা থাকে (সেটা সত্যিকারের
// আলাদা mental model, দেখুন chatApi.js-এর কমেন্ট)।

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { FiWifiOff } from 'react-icons/fi'
import { ref, update } from 'firebase/database'
import { useChatEngine } from '../hooks/useChatEngine'
import { useOthersOnline } from '../hooks/usePresence'
import ThreadHeader from './ThreadHeader'
import MessageBubble from './MessageBubble'
import TypingDots from './TypingDots'
import Composer from './Composer'
import AttachMenu from './AttachMenu'
import AICopilotMenu from '../ai/AICopilotMenu'
import AIResultModal from '../ai/AIResultModal'
import { useVoiceRecorder } from '../voice/useVoiceRecorder'
import MicButton from '../voice/MicButton'
import VoiceRecordingBar from '../voice/VoiceRecordingBar'

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
  customerId, // Phase 2: দিলেই "+" কার্ড-অ্যাটাচ বাটন দেখা যাবে (এখন staff-only, ChatInbox.jsx থেকে আসে)
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

  // Phase 4 — AI কোপাইলট। মেসেজ-হিস্ট্রি এখান থেকেই (লাইভ engine.messages) —
  // ব্যাকএন্ডকে RTDB পড়তে হয় না। কার্ড-টাইপ মেসেজ বাদ (AI-কে প্লেইন টেক্সট
  // হিসেবে গুলিয়ে দেওয়া ঠিক না)।
  const [aiModal, setAiModal] = useState(null) // { mode, summary, risk, error, flagMsg } | null
  const [flagging, setFlagging] = useState(false)

  const getRecentMessages = () =>
    engine.messages
      .filter((m) => !m.kind && !m._localStatus)
      .map((m) => ({ senderType: m.senderType, senderName: m.senderName, text: m.text }))

  const handleAIFlag = async () => {
    if (!aiModal?.risk?.detected || !aiModal.flagMsg) return
    setFlagging(true)
    try {
      await chatApi.flagMessage(threadId, aiModal.flagMsg.clientId, aiModal.risk.flagType, aiModal.flagMsg.text)
      if (db && aiModal.flagMsg.id) {
        await update(ref(db, `chats/${threadId}/messages/${aiModal.flagMsg.id}`), { flagType: aiModal.risk.flagType })
      }
      setAiModal(null)
    } catch (e) {
      console.error('[chat-ai] flag from risk-check failed:', e.message)
    } finally {
      setFlagging(false)
    }
  }

  // Phase 3, Session 2 — staff-only (customerId থাকলেই এই মোড, AttachMenu-এর মতোই)।
  // dual-write: REST → chat_flagged_messages (এক্সপোর্ট/অডিটের আসল সোর্স),
  // RTDB update → শুধু ওই মেসেজেই flagType বসে, বাকি ফিল্ড অক্ষত থাকে (তাই set() না, update())
  const handleFlag = async (msg, flagType) => {
    try {
      await chatApi.flagMessage(threadId, msg.clientId, flagType, msg.text)
      if (db && msg.id) {
        await update(ref(db, `chats/${threadId}/messages/${msg.id}`), { flagType })
      }
    } catch (e) {
      console.error('[chat] flag message failed:', e.message)
    }
  }

  // ভয়েস নোট — staff/customer দুই পাশেই (AttachMenu/AI-এর মতো staff-only না)।
  // আপলোড নেটওয়ার্ক লাগে বলে অফলাইনে মাইক বাটন ডিজেবল (দেখুন MicButton-এর disabled prop)।
  const voiceRec = useVoiceRecorder()
  const [voiceUploading, setVoiceUploading] = useState(false)

  const handleVoiceSend = async () => {
    const result = await voiceRec.stop()
    if (!result) return
    setVoiceUploading(true)
    try {
      const { url, durationSeconds } = await chatApi.uploadVoice(threadId, result.blob, result.durationSeconds)
      engine.sendVoice(url, durationSeconds)
    } catch (e) {
      console.error('[voice] send failed:', e.message)
    } finally {
      setVoiceUploading(false)
    }
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
                onFlag={customerId ? handleFlag : undefined}
              />
            ))}
            {engine.typingOthers && <TypingDots accent={accent} />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {voiceRec.recording ? (
        <VoiceRecordingBar
          durationSeconds={voiceRec.durationSeconds}
          maxDurationSeconds={voiceRec.maxDurationSeconds}
          uploading={voiceUploading}
          onCancel={voiceRec.cancel}
          onSend={handleVoiceSend}
          accent={accent}
        />
      ) : (
        <Composer
          value={composerValue}
          onChange={onComposerChange}
          onSend={handleSend}
          onTypingChange={engine.notifyTyping}
          sending={engine.sending}
          accent={accent}
          placeholder={composerPlaceholder}
          leadingAction={
            <>
              <MicButton onStart={voiceRec.start} disabled={engine.isOffline || voiceUploading} accent={accent} />
              {customerId && (
                <>
                  <AttachMenu chatApi={chatApi} customerId={customerId} onAttach={engine.sendCard} accent={accent} />
                  <AICopilotMenu
                    chatApi={chatApi}
                    getRecentMessages={getRecentMessages}
                    customerName={title}
                    accent={accent}
                    onDraftReply={(text) => onComposerChange(text)}
                    onSummaryResult={(summary, error) => setAiModal({ mode: 'summary', summary, error })}
                    onRiskResult={(risk, flagMsg, error) => setAiModal({ mode: 'risk', risk, flagMsg, error })}
                  />
                </>
              )}
            </>
          }
        />
      )}
      {voiceRec.error && <p className="text-[11px] text-cp-error text-center py-1 flex-shrink-0">{voiceRec.error}</p>}

      {aiModal && (
        <AIResultModal
          mode={aiModal.mode}
          summary={aiModal.summary}
          risk={aiModal.risk}
          error={aiModal.error}
          flagging={flagging}
          onFlag={handleAIFlag}
          onClose={() => setAiModal(null)}
        />
      )}

      <style>{`
        @keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-msg-in { animation: msg-in 0.25s ease-out; }
        @media (prefers-reduced-motion: reduce) { .animate-msg-in { animation: none !important; } }
      `}</style>
    </div>
  )
}
