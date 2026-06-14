// DailyLedgerList.jsx
// SR মাসিক লেজার — বিভাগ ২: দৈনিক বিক্রয় লেজার (এক্সপ্যান্ডেবল)
// রো: তারিখ | বিক্রয় | নগদ | বাকি | ঘাটতি | কমিশন | স্ট্যাটাস
// ট্যাপ করলে DailyLedgerDetail খুলবে (দোকান, পণ্য, ভিজিট, খরচ, উপস্থিতি)
// Usage: <DailyLedgerList />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import DailyLedgerDetail from './DailyLedgerDetail'
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiList } from 'react-icons/fi'

const fmt = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

const STATUS_MAP = {
  approved: { label: 'অনুমোদিত',  icon: '✅', cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
  pending:  { label: 'অপেক্ষমান', icon: '⏳', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  disputed: { label: 'বিরোধ',     icon: '⚠️', cls: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
}

const STAT_FIELDS = [
  { key: 'sales',      label: 'বিক্রয়' },
  { key: 'cash',       label: 'নগদ' },
  { key: 'due',        label: 'বাকি' },
  { key: 'shortage',   label: 'ঘাটতি' },
  { key: 'commission', label: 'কমিশন' },
]

function formatDateBn(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
}

export default function DailyLedgerList() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [days,  setDays]  = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    setLoading(true)
    setExpanded(null)
    api.get(`/monthly-ledger/daily?month=${month}&year=${year}`)
      .then(res => setDays(res.data.data?.days || []))
      .catch(() => setDays([]))
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center">
            <FiList className="text-indigo-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">দৈনিক লেজার</h3>
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

      {/* Body */}
      <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">এই মাসে কোনো এন্ট্রি নেই</p>
        ) : (
          days.map(day => {
            const st = STATUS_MAP[day.status] || { label: day.status, icon: '•', cls: 'text-gray-500 bg-gray-50 dark:bg-slate-700' }
            const isOpen = expanded === day.date

            return (
              <div key={day.date}>
                <button
                  onClick={() => setExpanded(isOpen ? null : day.date)}
                  className="w-full px-4 py-3 text-left active:bg-gray-50 dark:active:bg-slate-700/40 transition-colors"
                >
                  {/* তারিখ + স্ট্যাটাস */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{formatDateBn(day.date)}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${st.cls}`}>
                        {st.icon} {st.label}
                      </span>
                      <FiChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* বিক্রয় | নগদ | বাকি | ঘাটতি | কমিশন */}
                  <div className="grid grid-cols-5 gap-1">
                    {STAT_FIELDS.map(f => (
                      <div key={f.key} className="text-center">
                        <p className="text-[10px] text-gray-400">{f.label}</p>
                        <p className={`text-xs font-bold ${
                          f.key === 'shortage' && day.shortage > 0
                            ? 'text-red-500'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}>
                          ৳{fmt(day[f.key])}
                        </p>
                      </div>
                    ))}
                  </div>
                </button>

                {isOpen && <DailyLedgerDetail date={day.date} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
