// components/dashboard/StatCard.jsx
// ছোট পরিসংখ্যান কার্ড (এই মাস/সর্বমোট সেকশনে ব্যবহৃত) — cp- ডিজাইন টোকেন সহ

import clsx from 'clsx'

const COLOR_MAP = {
  text:    { text: 'text-cp-text-primary',    bg: 'bg-cp-bg-alt',        border: 'border-cp-border' },
  trust:   { text: 'text-cp-trust-700',       bg: 'bg-cp-trust-100',     border: 'border-cp-trust-300' },
  success: { text: 'text-cp-confidence-600',  bg: 'bg-cp-confidence-100',border: 'border-cp-confidence-300' },
  danger:  { text: 'text-cp-error',           bg: 'bg-cp-error-bg',      border: 'border-cp-error/30' },
}

export default function StatCard({ label, value, tone = 'text' }) {
  const c = COLOR_MAP[tone] || COLOR_MAP.text
  return (
    <div className={clsx('rounded-2xl border-[1.5px] px-3.5 py-3', c.bg, c.border)}>
      <p className="text-[11px] text-cp-text-muted font-medium mb-1">{label}</p>
      <p className={clsx('text-xl font-bold leading-none font-cp-mono', c.text)}>{value}</p>
    </div>
  )
}
