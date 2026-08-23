// chat/cards/DueCard.jsx
//
// payload শেপ: backend/src/controllers/chat.controller.js-এর getCustomerDueCard()
// { shop_name, owner_name, credit_limit, current_credit, available_credit, utilization_pct, status }

import clsx from 'clsx'
import { FiCreditCard } from 'react-icons/fi'

const STATUS_STYLE = {
  healthy: { bar: 'bg-cp-success', text: 'text-cp-success', label: 'স্বাভাবিক' },
  warning: { bar: 'bg-amber-500', text: 'text-amber-600', label: 'নজরে রাখুন' },
  critical: { bar: 'bg-orange-500', text: 'text-orange-600', label: 'ঝুঁকিপূর্ণ' },
  exceeded: { bar: 'bg-cp-error', text: 'text-cp-error', label: 'সীমা ছাড়িয়েছে' },
}

function taka(n) {
  return `৳${Number(n || 0).toLocaleString('bn-BD')}`
}

export default function DueCard({ payload }) {
  const s = STATUS_STYLE[payload.status] || STATUS_STYLE.healthy
  const pct = Math.min(100, parseFloat(payload.utilization_pct) || 0)

  return (
    <div className="w-64 rounded-xl overflow-hidden border border-cp-border bg-white">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-cp-bg-alt">
        <span className="w-7 h-7 rounded-lg bg-cp-trust-100 text-cp-trust-700 flex items-center justify-center flex-shrink-0">
          <FiCreditCard size={14} />
        </span>
        <p className="font-cp-head font-semibold text-[13px] text-cp-text-primary">বাকির তথ্য</p>
      </div>

      <div className="px-3.5 py-3">
        <p className="text-[11px] text-cp-text-muted mb-0.5">বর্তমান বাকি</p>
        <p className="font-cp-head font-bold text-[22px] text-cp-text-primary leading-tight">{taka(payload.current_credit)}</p>

        <div className="mt-2.5 mb-1.5 h-1.5 rounded-full bg-cp-bg-sunken overflow-hidden">
          <div className={clsx('h-full rounded-full', s.bar)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className={clsx('font-medium', s.text)}>{s.label} · {pct}%</span>
          <span className="text-cp-text-muted">সীমা {taka(payload.credit_limit)}</span>
        </div>
      </div>
    </div>
  )
}
