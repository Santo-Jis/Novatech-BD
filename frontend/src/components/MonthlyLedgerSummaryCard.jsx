// MonthlyLedgerSummaryCard.jsx
// SR মাসিক লেজার — বিভাগ ১: সারসংক্ষেপ কার্ড
// মোট বিক্রয়, কর্মদিবস, মোট কমিশন, নেট পাওনা, টার্গেট প্রগ্রেস, টপ ১০ পণ্য
// Usage: <MonthlyLedgerSummaryCard />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import {
  FiTrendingUp, FiCalendar, FiAward, FiDollarSign,
  FiTarget, FiChevronLeft, FiChevronRight, FiBox
} from 'react-icons/fi'

const fmt = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

export default function MonthlyLedgerSummaryCard() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/monthly-ledger/summary?month=${month}&year=${year}`)
      .then(res => setData(res.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [month, year])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)
    if (isCurrentOrFuture) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const monthName = new Date(year, month - 1, 1).toLocaleString('bn-BD', { month: 'long', year: 'numeric' })

  const stats = [
    { icon: <FiTrendingUp />, label: 'মোট বিক্রয়', value: `৳${fmt(data?.total_sales)}`,      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
    { icon: <FiCalendar />,   label: 'কর্মদিবস',    value: `${fmt(data?.working_days)} দিন`,  color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    { icon: <FiAward />,      label: 'মোট কমিশন',   value: `৳${fmt(data?.total_commission)}`, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  ]

  const targetPercent = data?.target_percent ?? null
  const barPercent    = targetPercent != null ? Math.min(targetPercent, 100) : 0
  const barColor      = (targetPercent != null && targetPercent >= 100)
    ? 'from-emerald-500 to-green-500'
    : 'from-blue-500 to-indigo-500'

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
            <FiTrendingUp className="text-blue-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">মাসিক সারসংক্ষেপ</h3>
            <p className="text-xs text-gray-400">{monthName}</p>
          </div>
        </div>
        {/* Month Navigator */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronLeft size={14} />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          </>
        ) : (
          <>
            {/* মোট বিক্রয় | কর্মদিবস | মোট কমিশন */}
            <div className="grid grid-cols-3 gap-2">
              {stats.map(s => (
                <div key={s.label} className={`${s.color} rounded-xl p-2.5`}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-current opacity-70" style={{ fontSize: 11 }}>{s.icon}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{s.label}</span>
                  </div>
                  <p className="font-bold text-gray-800 dark:text-gray-100 text-xs leading-tight">{s.value}</p>
                </div>
              ))}
            </div>

            {/* নেট পাওনা — হাইলাইট বক্স */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-4 py-3 flex items-center gap-2">
              <FiDollarSign className="text-white/80 flex-shrink-0" size={18} />
              <div>
                <p className="text-xs text-white/80">নেট পাওনা</p>
                <p className="text-xl font-bold text-white">৳{fmt(data?.net_payable)}</p>
              </div>
            </div>

            {/* টার্গেট vs অর্জন প্রগ্রেস বার */}
            {targetPercent != null ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <FiTarget className="text-gray-400" size={13} />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">মাসিক টার্গেট</span>
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmt(targetPercent)}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all`}
                    style={{ width: `${barPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  ৳{fmt(data?.total_sales)} / ৳{fmt(data?.monthly_target)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-1">কোনো মাসিক টার্গেট সেট করা নেই</p>
            )}

            {/* এই মাসের টপ ১০ পণ্য */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FiBox className="text-gray-400" size={13} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">এই মাসের টপ পণ্য</span>
              </div>
              {(!data?.top_products || data.top_products.length === 0) ? (
                <p className="text-xs text-gray-400 text-center py-2">এই মাসে এখনো কোনো বিক্রয় নেই</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {data.top_products.map((p, i) => (
                    <div key={p.product_id || i} className="flex-shrink-0 min-w-[104px] bg-gray-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">#{i + 1}</p>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate" title={p.product_name}>
                        {p.product_name}
                      </p>
                      <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmt(p.qty)} পিস</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
