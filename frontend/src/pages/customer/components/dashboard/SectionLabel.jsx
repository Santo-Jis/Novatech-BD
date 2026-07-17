// components/dashboard/SectionLabel.jsx
// সেকশন হেডিং লেবেল (ছোট রঙিন বার + আপারকেস টেক্সট) — আগে DashboardView.jsx-এ 'SL' নামে ছিল

import clsx from 'clsx'

const BAR_COLOR = {
  trust:      'bg-cp-trust-500',
  success:    'bg-cp-confidence-600',
  warmth:     'bg-cp-warmth-600',
}

export default function SectionLabel({ label, tone = 'trust' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={clsx('w-[3px] h-[15px] rounded-sm flex-shrink-0', BAR_COLOR[tone])} />
      <p className="text-[10px] font-bold text-cp-text-secondary uppercase tracking-wider">{label}</p>
    </div>
  )
}
