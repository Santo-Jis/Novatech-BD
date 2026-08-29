// chat/voice/MicButton.jsx

import clsx from 'clsx'
import { FiMic } from 'react-icons/fi'

export default function MicButton({ onStart, disabled, accent }) {
  return (
    <button
      onClick={onStart}
      disabled={disabled}
      type="button"
      aria-label="ভয়েস নোট রেকর্ড করুন"
      title={disabled ? 'অফলাইনে ভয়েস নোট পাঠানো যায় না' : 'ভয়েস নোট'}
      className={clsx(
        'w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90',
        'bg-cp-bg-sunken text-cp-text-secondary disabled:opacity-40 disabled:cursor-not-allowed'
      )}
    >
      <FiMic size={16} />
    </button>
  )
}
