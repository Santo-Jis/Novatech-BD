// chat/components/MessageBubble.jsx
//
// আগে MessagesTab.jsx আর ChatInbox.jsx-এ দুটো প্রায়-একই Bubble ছিল (একটায়
// cp- গ্রেডিয়েন্ট, একটায় primary flat রং)। এখন একটাই — accent prop দিয়ে
// রং ঠিক হয়, দুই পাশই ব্যবহার করে।
//
// নতুন: রিড-রিসিট টিক (নিজের পাঠানো মেসেজে) + অফলাইন-কিউ স্ট্যাটাস
// (pending ঘড়ি-আইকন, failed হলে লাল রিট্রাই বাটন)।

import { useState } from 'react'
import clsx from 'clsx'
import { FiCheck, FiClock, FiAlertCircle, FiRefreshCw, FiX, FiFlag, FiDollarSign, FiTag } from 'react-icons/fi'
import { clockTime } from '../utils/time'
import CardMessage from '../cards/CardMessage'

const FLAG_META = {
  price_quote: { label: 'প্রাইস কোট', Icon: FiTag },
  payment_promise: { label: 'পেমেন্ট প্রমিজ', Icon: FiDollarSign },
}

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

function FlagMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="ফ্ল্যাগ করুন"
        className="text-cp-text-muted/60 hover:text-cp-text-secondary p-0.5 -m-0.5"
      >
        <FiFlag size={11} />
      </button>
      {open && (
        <div className="absolute bottom-5 right-0 w-40 bg-white border border-cp-border rounded-xl shadow-lg overflow-hidden z-20">
          {Object.entries(FLAG_META).map(([key, { label, Icon }]) => (
            <button
              key={key}
              onClick={() => {
                onPick(key)
                setOpen(false)
              }}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-cp-text-primary hover:bg-cp-bg-alt"
            >
              <Icon size={12} className="text-cp-text-muted" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MessageBubble({ msg, mine, accent, showSender, readState, onRetry, onDiscard, onFlag }) {
  const isLocalOnly = Boolean(msg._localStatus)
  const isFailed = msg._localStatus === 'failed'
  const canFlag = onFlag && mine && msg.kind !== 'card' && !isLocalOnly

  return (
    <div className={clsx('flex mb-2.5 animate-msg-in', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[80%] sm:max-w-[65%]">
        {!mine && showSender && msg.senderName && (
          <p className="text-[11px] font-semibold text-cp-text-muted mb-1 ml-1">{msg.senderName}</p>
        )}
        {msg.kind === 'card' ? (
          <div className={clsx(isFailed && 'opacity-60')}>
            <CardMessage msg={msg} />
          </div>
        ) : (
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
        )}
        {msg.flagType && (
          <p className={clsx('flex items-center gap-1 text-[10px] font-medium mt-1', mine ? 'justify-end mr-1 text-cp-text-muted' : 'ml-1 text-cp-text-muted')}>
            {(() => {
              const { label, Icon } = FLAG_META[msg.flagType]
              return (
                <>
                  <Icon size={10} /> {label}
                </>
              )
            })()}
          </p>
        )}
        <div className={clsx('flex items-center gap-1.5 text-[10px] text-cp-text-muted mt-1', mine ? 'justify-end mr-1' : 'ml-1')}>
          <span>{clockTime(msg.createdAt)}</span>
          {mine && isLocalOnly && (
            <LocalStatusBadge status={msg._localStatus} onRetry={() => onRetry?.(msg.clientId)} onDiscard={() => onDiscard?.(msg.clientId)} />
          )}
          {mine && !isLocalOnly && <ReceiptTicks readState={readState} accent={accent} />}
          {canFlag && !msg.flagType && <FlagMenu onPick={(flagType) => onFlag(msg, flagType)} />}
        </div>
      </div>
    </div>
  )
}
