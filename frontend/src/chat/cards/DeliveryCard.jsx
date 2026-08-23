// chat/cards/DeliveryCard.jsx
//
// payload শেপ: backend/src/controllers/delivery.controller.js-এর getCustomerDeliveries()
// একটা সিঙ্গেল ডেলিভারি রো: { id, status, items, total_amount, started_at, arrived_at, delivered_at, delivery_person }

import clsx from 'clsx'
import { FiTruck, FiCheckCircle, FiClock, FiXCircle } from 'react-icons/fi'
import { clockTime } from '../utils/time'

const STATUS_MAP = {
  pending: { label: 'অপেক্ষমান', color: 'text-cp-text-muted bg-cp-bg-sunken', Icon: FiClock },
  in_transit: { label: 'পথে আছে', color: 'text-cp-trust-700 bg-cp-trust-100', Icon: FiTruck },
  arrived: { label: 'পৌঁছেছে', color: 'text-amber-700 bg-amber-100', Icon: FiTruck },
  delivered: { label: 'ডেলিভার হয়েছে', color: 'text-cp-success bg-green-100', Icon: FiCheckCircle },
  failed: { label: 'ব্যর্থ', color: 'text-cp-error bg-red-100', Icon: FiXCircle },
}

function taka(n) {
  return `৳${Number(n || 0).toLocaleString('bn-BD')}`
}

export default function DeliveryCard({ payload }) {
  const st = STATUS_MAP[payload.status] || STATUS_MAP.pending
  const itemCount = Array.isArray(payload.items) ? payload.items.length : null
  const timestamp = payload.delivered_at || payload.arrived_at || payload.started_at

  return (
    <div className="w-64 rounded-xl overflow-hidden border border-cp-border bg-white">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-cp-bg-alt">
        <span className="w-7 h-7 rounded-lg bg-cp-warmth-100 text-cp-warmth-700 flex items-center justify-center flex-shrink-0">
          <FiTruck size={14} />
        </span>
        <p className="font-cp-head font-semibold text-[13px] text-cp-text-primary">ডেলিভারি স্ট্যাটাস</p>
      </div>

      <div className="px-3.5 py-3">
        <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold', st.color)}>
          <st.Icon size={12} /> {st.label}
        </span>

        <div className="mt-2.5 space-y-1 text-[12.5px]">
          {itemCount !== null && (
            <p className="text-cp-text-secondary">{itemCount} ধরনের পণ্য · {taka(payload.total_amount)}</p>
          )}
          {payload.delivery_person && <p className="text-cp-text-secondary">ডেলিভারি: {payload.delivery_person}</p>}
          {timestamp && <p className="text-cp-text-muted">{clockTime(timestamp)}</p>}
        </div>
      </div>
    </div>
  )
}
