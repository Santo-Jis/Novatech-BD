// chat/voice/VoiceRecordingBar.jsx
//
// রেকর্ডিং চলাকালীন Composer-এর জায়গায় এটা দেখা যায় (ConversationPane
// রেকর্ডিং-স্টেট অনুযায়ী দুটোর মধ্যে টগল করে)।

import clsx from 'clsx'
import { FiTrash2, FiSend } from 'react-icons/fi'

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VoiceRecordingBar({ durationSeconds, maxDurationSeconds, uploading, onCancel, onSend, accent }) {
  const nearLimit = durationSeconds >= maxDurationSeconds - 10

  return (
    <div className="flex-shrink-0 border-t border-cp-border bg-white/85 backdrop-blur-lg px-3 py-2.5">
      <div className="flex items-center gap-2.5 bg-red-50 rounded-3xl px-3.5 py-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        <span className={clsx('text-[13.5px] font-cp-head font-medium tabular-nums flex-1', nearLimit ? 'text-red-600' : 'text-cp-text-primary')}>
          {formatMMSS(durationSeconds)}
          {nearLimit && <span className="text-[11px] font-normal ml-1.5">(সর্বোচ্চ {formatMMSS(maxDurationSeconds)})</span>}
        </span>

        <button
          onClick={onCancel}
          disabled={uploading}
          type="button"
          aria-label="বাতিল করুন"
          className="w-8 h-8 rounded-full flex items-center justify-center text-cp-text-muted hover:bg-red-100 disabled:opacity-40"
        >
          <FiTrash2 size={15} />
        </button>
        <button
          onClick={onSend}
          disabled={uploading}
          type="button"
          aria-label="পাঠান"
          className={clsx(
            'w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0',
            accent === 'warmth' ? 'bg-cp-warmth-600' : 'bg-cp-trust-500',
            uploading && 'opacity-70'
          )}
        >
          {uploading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <FiSend size={14} />}
        </button>
      </div>
    </div>
  )
}
