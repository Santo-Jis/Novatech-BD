// chat/components/ThreadHeader.jsx

import clsx from 'clsx'
import { FiArrowLeft } from 'react-icons/fi'

export default function ThreadHeader({ avatar, title, subtitle, accent, onBack, othersOnline, typingOthers, tabs }) {
  const subtitleColor = accent === 'warmth' ? 'text-cp-warmth-600' : 'text-cp-trust-500'

  return (
    <div className="flex-shrink-0 sticky top-0 z-10 backdrop-blur-lg bg-white/80 border-b border-cp-border">
      <div className="flex items-center gap-3 px-3 py-3">
        <button onClick={onBack} className="lg:hidden p-2 -ml-1 rounded-full hover:bg-cp-bg-alt text-cp-text-secondary" type="button" aria-label="ফিরে যান">
          <FiArrowLeft size={19} />
        </button>

        <div className="relative flex-shrink-0">
          {avatar}
          {othersOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-cp-success border-2 border-white" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-cp-head font-semibold text-[15px] text-cp-text-primary truncate">{title}</p>
          <p className={clsx('text-[11px] font-medium truncate', subtitleColor)}>
            {typingOthers ? 'টাইপ করছে...' : subtitle}
          </p>
        </div>
      </div>

      {tabs && <div className="px-3 pb-2.5">{tabs}</div>}
    </div>
  )
}
