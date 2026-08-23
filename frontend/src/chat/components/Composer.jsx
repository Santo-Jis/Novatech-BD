// chat/components/Composer.jsx
//
// ইনপুট বার — আগে দুই ফাইলেই প্রায়-হুবহু ছিল। এখন একটাই, plus নতুন:
// প্রতিটা কিস্ট্রোকে notifyTyping(true) কল করে (ইঞ্জিন নিজেই থ্রটল/অটো-স্টপ সামলায়)।

import { useRef } from 'react'
import clsx from 'clsx'
import { FiSend } from 'react-icons/fi'

export default function Composer({ value, onChange, onSend, onTypingChange, sending, accent, placeholder, leadingAction }) {
  const taRef = useRef(null)

  const handleSend = () => {
    if (!value.trim()) return
    onSend()
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-shrink-0 border-t border-cp-border backdrop-blur-lg bg-white/85 px-3 py-2.5">
      <div className="flex items-end gap-2">
        {leadingAction}
        <div className="flex-1 flex items-end gap-2 bg-cp-bg-sunken rounded-3xl px-3.5 py-2 border border-transparent focus-within:border-cp-border-focus transition-colors">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            onTypingChange?.(e.target.value.length > 0)
          }}
          onBlur={() => onTypingChange?.(false)}
          onKeyDown={handleKey}
          onInput={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
          }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent outline-none text-[14px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted leading-relaxed py-1 max-h-24"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim()}
          type="button"
          className={clsx(
            'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90',
            value.trim()
              ? accent === 'warmth'
                ? 'bg-cp-warmth-600 text-white shadow-sm'
                : 'bg-cp-trust-500 text-white shadow-sm'
              : 'bg-cp-border text-cp-text-muted cursor-not-allowed'
          )}
        >
          {sending ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <FiSend size={15} className="-ml-0.5" />
          )}
        </button>
        </div>
      </div>
    </div>
  )
}
