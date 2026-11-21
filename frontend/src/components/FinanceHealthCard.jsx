import { useEffect, useState } from 'react'
import api from '../api/axios'
import { FiAlertTriangle, FiAlertCircle, FiInfo, FiTrendingUp } from 'react-icons/fi'

// আয়-ব্যয় স্বাস্থ্য: মুনাফা (accrual) + নগদ প্রবাহ + সম্ভাব্য খরচ + সতর্কতা + পূর্বাভাস
// ডেটা: GET /reports/finance-health  (backend: financeHealth.service.js)

const fmt = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('bn-BD')}`

const SEV = {
  danger:  { cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',         Icon: FiAlertCircle },
  warning: { cls: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800', Icon: FiAlertTriangle },
  info:    { cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',   Icon: FiInfo },
}

function Stat({ label, value, sub, tone }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-800 dark:text-white'
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function FinanceHealthCard({ from, to }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed]   = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setFailed(false)
    api.get('/reports/finance-health', { params: { from, to } })
      .then(r => { if (alive) setData(r.data?.data || null) })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [from, to])

  if (loading) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null   // ড্যাশবোর্ডের বাকি অংশ আটকাবে না

  const { profit, cash, pending_expenses: pend, forecast, alerts = [] } = data

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
      <div className="flex items-center gap-2">
        <FiTrendingUp className="text-primary" />
        <h2 className="font-bold text-gray-800 dark:text-white text-sm">আয়-ব্যয়ের স্বাস্থ্য</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="নিট মুনাফা (প্রাপ্য ভিত্তিতে)" value={fmt(profit.net_profit)}
              tone={profit.net_profit < 0 ? 'bad' : 'good'}
              sub={`মার্জিন ${Number(profit.profit_margin || 0).toFixed(1)}%`} />
        {cash && (
          <Stat label="নগদ প্রবাহ (আদায় − খরচ)" value={fmt(cash.net_cash)}
                tone={cash.net_cash < 0 ? 'bad' : 'good'}
                sub={cash.collections_in_transit > 0 ? `জমার পথে ${fmt(cash.collections_in_transit)}` : `আদায় ${fmt(cash.cash_in)}`} />
        )}
        <Stat label="অনুমোদনের অপেক্ষায় খরচ" value={fmt(pend.total)} sub={`${pend.count}টি SR রিপোর্ট`} />
        {forecast && (
          <Stat label="পরের মাসের আনুমানিক খরচ" value={fmt(forecast.total)}
                sub={`নির্দিষ্ট ${fmt(forecast.recurring_fixed + forecast.prepaid_install)} + গড় ${fmt(forecast.variable_avg)}`} />
        )}
      </div>

      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a, i) => {
            const { cls, Icon } = SEV[a.severity] || SEV.info
            return (
              <li key={i} className={`flex items-start gap-2 text-xs border rounded-xl p-2.5 ${cls}`}>
                <Icon className="flex-shrink-0 mt-0.5" />
                <span>{a.message}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
