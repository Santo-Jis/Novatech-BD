// SalarySlipCard.jsx
// SR মাসিক লেজার — বিভাগ ৪: বেতন স্লিপ + পরিশোধ স্ট্যাটাস
// মূল বেতন → মোট মাসিক বিক্রি (তথ্য) → + কমিশন/বোনাস → − কর্তন = নেট পাওনা
// ফুটার: পরিশোধ তারিখ | অনুমোদনকারী | রেফারেন্স নম্বর
// Usage: <SalarySlipCard />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import { FiFileText, FiChevronLeft, FiChevronRight, FiCheckCircle, FiClock } from 'react-icons/fi'

const fmt = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

const formatDate = (ts) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SalarySlipCard() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/monthly-ledger/salary-slip?month=${month}&year=${year}`)
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

  const rows = data ? [
    { key: 'basic',  label: 'মূল বেতন',          value: data.basic_salary,         sign: null },
    { key: 'sales',  label: 'মোট মাসিক বিক্রি',   value: data.total_sales,          info: true },
    { key: 'comm',   label: 'বিক্রয় কমিশন',       value: data.sales_commission,     sign: '+' },
    { key: 'bonus',  label: 'উপস্থিতি বোনাস',     value: data.attendance_bonus,     sign: '+' },
    { key: 'attded', label: 'উপস্থিতি কর্তন',     value: data.attendance_deduction, sign: '−' },
    { key: 'dues',   label: 'বকেয়া কর্তন',        value: data.dues_deduction,       sign: '−' },
  ] : []

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
            <FiFileText className="text-purple-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">বেতন স্লিপ</h3>
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

      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-7 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-xs text-gray-400 text-center py-4">তথ্য পাওয়া যায়নি।</p>
        ) : (
          <>
            {/* হিসাবের ধাপ */}
            <div className="space-y-2">
              {rows.map(r => (
                <div
                  key={r.key}
                  className={`flex items-center justify-between text-sm ${
                    r.info ? 'pb-2 mb-1 border-b border-dashed border-gray-100 dark:border-slate-700' : ''
                  }`}
                >
                  <span className={r.info ? 'text-[11px] text-gray-400' : 'text-gray-600 dark:text-gray-300'}>
                    {r.label}
                  </span>
                  <span className={`font-medium ${
                    r.info
                      ? 'text-[11px] text-gray-400'
                      : r.sign === '+' ? 'text-emerald-600'
                      : r.sign === '−' ? 'text-red-500'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}>
                    {!r.info && r.sign && parseFloat(r.value || 0) > 0 ? `${r.sign} ` : ''}৳{fmt(r.value)}
                  </span>
                </div>
              ))}
            </div>

            {/* নেট পাওনা */}
            <div className="border-t-2 border-gray-100 dark:border-slate-700 mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">নেট পাওনা</span>
              <span className="text-lg font-bold text-blue-600">৳{fmt(data.net_payable)}</span>
            </div>

            {/* বেতন পরিশোধ স্ট্যাটাস (ফুটার) */}
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
              {data.payment ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                    <FiCheckCircle size={13} /> পরিশোধিত
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <p className="text-gray-400 mb-0.5">পরিশোধ তারিখ</p>
                      <p className="text-gray-700 dark:text-gray-200 font-medium">{formatDate(data.payment.paid_at)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">অনুমোদনকারী</p>
                      <p className="text-gray-700 dark:text-gray-200 font-medium truncate">{data.payment.approved_by_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">রেফারেন্স নম্বর</p>
                      <p className="text-gray-700 dark:text-gray-200 font-medium truncate">{data.payment.payment_reference || '—'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                  <FiClock size={13} /> এখনো পরিশোধ হয়নি
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
