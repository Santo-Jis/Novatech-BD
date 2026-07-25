import { useState, useEffect } from 'react'
import api from '../api/axios'
import { FiUsers, FiAlertTriangle, FiClock } from 'react-icons/fi'

// ============================================================
// SeatUsage — Admin-কে দেখায় কোন role-এ কতটা সিট ব্যবহৃত/বাকি আছে
// (GET /api/employees/seats থেকে ডেটা আসে — backend/src/controllers/
// employee.controller.js-এর getSeatStatus)
//
// ব্যবহার: <SeatUsage />  — কোনো prop লাগে না, নিজেই fetch করে।
// ============================================================
export default function SeatUsage() {
  const [seats, setSeats]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/employees/seats')
      .then(res => { if (mounted) setSeats(res.data?.data?.seats || []) })
      .catch(() => { if (mounted) setError(true) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  if (loading) {
    return <div className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />
  }

  // Admin এই widget না দেখতে পেলেও (403/permission না থাকলে) পুরো পেজ
  // ভাঙবে না — চুপচাপ কিছু না দেখিয়ে বাদ দেওয়া হয়
  if (error || seats.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <FiUsers className="text-primary" />
        <h2 className="text-sm font-semibold text-gray-700">সিট ব্যবহার (রোল অনুযায়ী)</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {seats.map((seat) => (
          <SeatCard key={seat.role} seat={seat} />
        ))}
      </div>
    </div>
  )
}

function SeatCard({ seat }) {
  const { label, used, limit, remaining, unlimited, live } = seat

  // এখনো লাইভ না এমন role (shop_keeper, stock_keeper) — ধূসর, "শীঘ্রই আসছে"
  if (!live) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <div className="flex items-center gap-1 mt-1 text-gray-400">
          <FiClock size={12} />
          <span className="text-xs">শীঘ্রই আসছে</span>
        </div>
      </div>
    )
  }

  if (unlimited) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-700 mt-1">{used}</p>
        <p className="text-[11px] text-gray-400">সীমাহীন</p>
      </div>
    )
  }

  const pct     = limit > 0 ? Math.min((used / limit) * 100, 100) : 100
  const isFull  = remaining <= 0
  const barColor  = isFull ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = isFull ? 'text-red-600' : 'text-gray-700'

  return (
    <div className={`rounded-xl border p-3 ${isFull ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${textColor}`}>
        {used}/{limit}
      </p>
      <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {isFull ? (
        <div className="flex items-center gap-1 mt-1 text-red-600">
          <FiAlertTriangle size={12} />
          <span className="text-[11px]">সিট শেষ</span>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 mt-1">{remaining} টা বাকি</p>
      )}
    </div>
  )
}
