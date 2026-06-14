// DuesLedgerCard.jsx
// SR মাসিক লেজার — বিভাগ ৫: বাকি লেজার (২ ট্যাব)
// ট্যাব ১: আমার বকেয়া — পণ্য/নগদ ঘাটতি ইতিহাস + কর্তন
// ট্যাব ২: গ্রাহকের বাকি — কোন দোকানে এ মাসে বাকি কত বাড়ল/কমল
// Usage: <DuesLedgerCard />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import {
  FiAlertTriangle, FiChevronLeft, FiChevronRight, FiCheckCircle, FiShoppingBag
} from 'react-icons/fi'

const fmt = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

const formatDate = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
}

const TYPE_CLS = {
  cash_mismatch:    'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  product_shortage: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
}

export default function DuesLedgerCard() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('my') // 'my' | 'customer'

  useEffect(() => {
    setLoading(true)
    api.get(`/monthly-ledger/dues?month=${month}&year=${year}`)
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

  const myDues   = data?.my_dues
  const custDues = data?.customer_dues || []

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
            <FiAlertTriangle className="text-orange-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">বাকি লেজার</h3>
            <p className="text-xs text-gray-400">{monthName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronLeft size={14} />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ট্যাব সুইচার */}
      <div className="flex px-4 pt-3 gap-2">
        {[
          { key: 'my',       label: 'আমার বকেয়া' },
          { key: 'customer', label: 'গ্রাহকের বাকি' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-50 dark:bg-slate-700/50 text-gray-500 dark:text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tab === 'my' ? (
          /* ───── ট্যাব ১: আমার বকেয়া ───── */
          <>
            {myDues?.current_balance > 0 ? (
              <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl px-4 py-3 mb-3">
                <p className="text-xs text-white/80">বর্তমান মোট বকেয়া</p>
                <p className="text-xl font-bold text-white">৳{fmt(myDues.current_balance)}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3 mb-3">
                <FiCheckCircle className="text-emerald-600 flex-shrink-0" size={16} />
                <p className="text-xs text-emerald-600 font-medium">কোনো বকেয়া নেই</p>
              </div>
            )}

            {myDues?.deducted_this_month > 0 && (
              <p className="text-[11px] text-gray-400 mb-3">
                এই মাসে বেতন থেকে কর্তন হয়েছে: <span className="font-medium text-gray-600 dark:text-gray-300">৳{fmt(myDues.deducted_this_month)}</span>
              </p>
            )}

            {myDues?.history?.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">এ মাসে যা যোগ হয়েছে</p>
                {myDues.history.map((h, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 bg-gray-50 dark:bg-slate-900/40 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_CLS[h.type] || 'text-gray-500 bg-gray-100'}`}>
                          {h.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatDate(h.date)}</span>
                      </div>
                      {h.note && <p className="text-[11px] text-gray-400 truncate">{h.note}</p>}
                    </div>
                    <span className="text-xs font-bold text-red-500 flex-shrink-0">৳{fmt(h.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">এ মাসে নতুন কোনো বকেয়া যোগ হয়নি</p>
            )}
          </>
        ) : (
          /* ───── ট্যাব ২: গ্রাহকের বাকি ───── */
          <>
            {custDues.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">কোনো দোকানে বাকি নেই</p>
            ) : (
              <div className="space-y-2">
                {custDues.map(c => (
                  <div key={c.id} className="bg-gray-50 dark:bg-slate-900/40 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 truncate">
                        <FiShoppingBag size={12} className="text-gray-400 flex-shrink-0" />
                        {c.shop_name}
                      </span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-shrink-0 ml-2">৳{fmt(c.current_due)}</span>
                    </div>
                    {(c.increased > 0 || c.collected > 0) && (
                      <div className="flex gap-3 text-[11px] pl-[18px]">
                        {c.increased > 0 && <span className="text-orange-500">+৳{fmt(c.increased)} এ মাসে</span>}
                        {c.collected > 0 && <span className="text-emerald-600">−৳{fmt(c.collected)} আদায়</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
