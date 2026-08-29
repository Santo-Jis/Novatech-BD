// chat/ai/AICopilotMenu.jsx
//
// AttachMenu.jsx-এর ঠিক একই প্যাটার্ন — "+"-এর বদলে ✨, ৩টা on-demand অ্যাকশন।
// draftReply সরাসরি composer-এ বসে যায় (কোনো মডাল লাগে না); summarize/
// riskCheck ফলাফল দেখানোর জন্য onResult() callback দিয়ে AIResultModal খোলে
// (ConversationPane-এ, যেখানে সেই মডালের স্টেট থাকে)।

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FiZap, FiEdit3, FiFileText, FiAlertTriangle } from 'react-icons/fi'

function friendlyError(e) {
  return e?.response?.data?.message || 'AI ফিচারে সমস্যা হয়েছে, আবার চেষ্টা করুন'
}

export default function AICopilotMenu({ chatApi, getRecentMessages, customerName, onDraftReply, onSummaryResult, onRiskResult, accent }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const run = async (key) => {
    const recentMessages = getRecentMessages()
    if (!recentMessages.length) {
      setOpen(false)
      return
    }
    setLoading(key)
    try {
      if (key === 'draft') {
        const { reply } = await chatApi.draftReply(recentMessages, customerName)
        onDraftReply(reply)
      } else if (key === 'summary') {
        const data = await chatApi.summarizeThread(recentMessages, customerName)
        onSummaryResult(data.summary)
      } else if (key === 'risk') {
        const data = await chatApi.checkRisk(recentMessages, customerName)
        const lastCustomerMsg = [...recentMessages].reverse().find((m) => m.senderType === 'customer')
        onRiskResult(data, lastCustomerMsg)
      }
      setOpen(false)
    } catch (e) {
      console.error('[chat-ai] action failed:', e.message)
      if (key === 'summary') onSummaryResult(null, friendlyError(e))
      else if (key === 'risk') onRiskResult(null, null, friendlyError(e))
      setOpen(false)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="AI কোপাইলট"
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90',
          open ? (accent === 'warmth' ? 'bg-cp-warmth-600 text-white' : 'bg-cp-trust-500 text-white') : 'bg-cp-bg-sunken text-cp-text-secondary'
        )}
      >
        <FiZap size={16} />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 w-56 bg-white rounded-2xl border border-cp-border shadow-lg overflow-hidden z-20">
          {[
            { key: 'draft', label: 'রিপ্লাই লিখে দিন', Icon: FiEdit3 },
            { key: 'summary', label: 'কথোপকথনের সারাংশ', Icon: FiFileText },
            { key: 'risk', label: 'রিস্ক/অভিযোগ চেক করুন', Icon: FiAlertTriangle },
          ].map(({ key, label, Icon }, i) => (
            <button
              key={key}
              onClick={() => run(key)}
              disabled={loading !== null}
              type="button"
              className={clsx('w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt disabled:opacity-50', i > 0 && 'border-t border-cp-border')}
            >
              <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <Icon size={13} />
              </span>
              <span className="text-[13px] font-medium text-cp-text-primary flex-1">{label}</span>
              {loading === key && <span className="w-3.5 h-3.5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
