// chat/components/MessageBubble.jsx
//
// আগে MessagesTab.jsx আর ChatInbox.jsx-এ দুটো প্রায়-একই Bubble ছিল (একটায়
// cp- গ্রেডিয়েন্ট, একটায় primary flat রং)। এখন একটাই — accent prop দিয়ে
// রং ঠিক হয়, দুই পাশই ব্যবহার করে।
//
// নতুন: রিড-রিসিট টিক (নিজের পাঠানো মেসেজে) + অফলাইন-কিউ স্ট্যাটাস
// (pending ঘড়ি-আইকন, failed হলে লাল রিট্রাই বাটন)।

import clsx from 'clsx'
import { FiCheck, FiClock, FiAlertCircle, FiRefreshCw, FiX } from 'react-icons/fi'
import { clockTime } from '../utils/time'

const ACCENT = {
  trust: {
    mineBg: 'bg-gradient-to-br from-cp-trust-500 to-cp-trust-700',
    seenTick: 'text-cp-trust-200',
  },
  warmth: {
    mineBg: 'bg-cp-warmth-600',
    seenTick: 'text-cp-warmth-200',
  },
}

function ReceiptTicks({ readState, accent }) {
  if (readState === 'seen') {
    // ডাবল-টিক, ভরাট রং — দেখা হয়ে গেছে
    return (
      <span className={clsx('inline-flex -space-x-1.5', ACCENT[accent].seenTick)}>
        <FiCheck size={12} strokeWidth={3} />
        <FiCheck size={12} strokeWidth={3} />
      </span>
    )
  }
  // 'sent' — একটা টিক, হালকা রং
  return (
    <span className="inline-flex text-white/60">
      <FiCheck size={12} strokeWidth={3} />
    </span>
  )
}

function LocalStatusBadge({ status, onRetry, onDiscard }) {
  if (status === 'pending' || status === 'sending') {
    return (
      <span className="inline-flex items-center gap-1 text-white/70">
        <FiClock size={11} className={status === 'sending' ? 'animate-spin' : ''} />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-cp-error">
        <FiAlertCircle size={12} />
        <button onClick={onRetry} className="underline decoration-dotted hover:text-cp-error/80" type="button">
          আবার চেষ্টা
        </button>
        <button onClick={onDiscard} className="hover:text-cp-error/80" type="button" aria-label="মুছে ফেলুন">
          <FiX size={12} />
        </button>
      </span>
    )
  }
  return null
}

export default function MessageBubble({ msg, mine, accent, showSender, readState, onRetry, onDiscard }) {
  const isLocalOnly = Boolean(msg._localStatus)
  const isFailed = msg._localStatus === 'failed'

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
              ? clsx('text-white rounded-2xl rounded-br-md shadow-sm', ACCENT[accent].mineBg, isFailed && 'opacity-60')
              : 'bg-white text-cp-text-primary rounded-2xl rounded-bl-md border border-cp-border'
          )}
        >
          {msg.text}
        </div>
        <div className={clsx('flex items-center gap-1.5 text-[10px] text-cp-text-muted mt-1', mine ? 'justify-end mr-1' : 'ml-1')}>
          <span>{clockTime(msg.createdAt)}</span>
          {mine && isLocalOnly && (
            <LocalStatusBadge status={msg._localStatus} onRetry={() => onRetry?.(msg.clientId)} onDiscard={() => onDiscard?.(msg.clientId)} />
          )}
          {mine && !isLocalOnly && <ReceiptTicks readState={readState} accent={accent} />}
        </div>
      </div>
    </div>
  )
}
