// CommissionSummaryCard.jsx
// Admin Dashboard-এ মাসিক কমিশন সারসংক্ষেপ কার্ড
// Usage: <CommissionSummaryCard />

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { FiDollarSign, FiTrendingUp, FiUsers, FiAward, FiChevronRight, FiChevronLeft } from 'react-icons/fi'

const fmt = (n) => parseFloat(n || 0).toLocaleString('bn-BD')

export default function CommissionSummaryCard() {
  const navigate = useNavigate()

  const now   = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/commission/summary?month=${month}&year=${year}`)
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

  const metrics = [
    { icon: <FiUsers />,     label: 'মোট কর্মী', value: data?.total_workers || 0,                   color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    { icon: <FiTrendingUp />, label: 'মোট বিক্রয়', value: `৳${fmt(data?.total_sales)}`,              color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
    { icon: <FiDollarSign />, label: 'কমিশন',       value: `৳${fmt(data?.total_commission)}`,         color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
    { icon: <FiAward />,      label: 'বোনাস',        value: `৳${fmt(data?.total_bonus)}`,              color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
  ]

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
            <FiDollarSign className="text-amber-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">কমিশন সারসংক্ষেপ</h3>
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

      {/* Metrics Grid */}
      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {metrics.map(m => (
              <div key={m.label} className={`${m.color} rounded-xl p-3`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-current opacity-70" style={{ fontSize: 12 }}>{m.icon}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{m.label}</span>
                </div>
                <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grand Total */}
      {!loading && data && (
        <div className="mx-4 mb-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/80">সর্বমোট পরিশোধযোগ্য</p>
            <p className="text-xl font-bold text-white">৳{fmt(data.grand_total)}</p>
          </div>
          <button
            onClick={() => navigate('/admin/commission-pay')}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            পরিশোধ করুন <FiChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
