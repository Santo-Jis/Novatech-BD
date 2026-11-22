import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiAlertCircle, FiInfo, FiX, FiSearch, FiChevronRight } from 'react-icons/fi'
import api from '../api/axios'

// ড্যাশবোর্ডের "স্বাস্থ্য" কার্ডগুলোর ছোট সাধারণ অংশ (Receivables / SR Performance / Action List)

export const fmtMoney = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('bn-BD')}`
export const fmtNum = (n) => (Number(n) || 0).toLocaleString('bn-BD')

const SEV = {
  danger:  { cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',         Icon: FiAlertCircle },
  warning: { cls: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800', Icon: FiAlertTriangle },
  info:    { cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',   Icon: FiInfo },
}

// সতর্কতার code → বিস্তারিত type (backend: healthDetail.service.js ALERT_DETAIL-এর সাথে মিলিয়ে রাখুন)
export const ALERT_DETAIL = {
  budget_exceeded: 'expense_budget', budget_80: 'expense_budget', pending_sr_expense: 'pending_expense_reports',
  profit_without_cash: 'cash_daily', missing_cost: 'stock_nocost', expense_ratio_up: 'expense_list', sr_expense_spike: 'expense_list',
  out_of_stock_demand: 'stock_out', low_stock: 'stock_low', dead_stock: 'stock_dead',
  return_rate_high: 'returns', return_rate: 'returns', return_loss: 'returns_loss', return_pending: 'returns_pending', sr_return_spike: 'returns',
  overdue_heavy: 'dues', overdue: 'dues', unexplained_due: 'dues', over_limit: 'dues', near_limit: 'dues',
  collections_in_transit: 'transit', sr_owes: 'sr_dues',
  payable_overdue: 'payable_pos', payable_due_soon: 'payable_pos', payable_old: 'payable_pos', supplier_advance: 'payables', payable_gt_receivable: 'payables',
  sr_absent: 'sr_today', sr_zero_visit: 'sr_today', sr_zero_sales: 'sr_today', sr_behind_target: 'sr_today', commission_unpaid: 'commissions_unpaid',
}

const cell = (type, v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (type === 'money') return fmtMoney(v)
  if (type === 'num') return fmtNum(v)
  if (type === 'pct') return `${fmtNum(Math.round(Number(v) * 10) / 10)}%`
  if (type === 'date') return String(v).slice(0, 10)
  return String(v)
}

// বিস্তারিত তালিকা পপআপ: GET /reports/health-detail/:type
export function DetailModal({ type, from, to, onClose }) {
  const [state, setState] = useState({ data: null, loading: true, error: false })
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    setState({ data: null, loading: true, error: false }); setQ('')
    api.get(`/reports/health-detail/${type}`, { params: { from, to } })
      .then(r => { if (alive) setState({ data: r.data?.data || null, loading: false, error: false }) })
      .catch(() => { if (alive) setState({ data: null, loading: false, error: true }) })
    return () => { alive = false }
  }, [type, from, to])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { data, loading, error } = state
  const rows = useMemo(() => {
    if (!data) return []
    const t = q.trim().toLowerCase()
    return t ? data.rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(t))) : data.rows
  }, [data, q])

  // টাকার কলামের যোগফল (শেষে মোট সারি)
  const totals = useMemo(() => {
    if (!data || data.rows.length < 2) return null
    const t = {}
    data.columns.filter(c => c.type === 'money').forEach(c => { t[c.key] = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) })
    return Object.keys(t).length && data.type !== 'forecast' ? t : null
  }, [data, rows])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-4xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white">{data?.title || 'বিস্তারিত'}</h3>
            {data?.note && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{data.note}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="বন্ধ করুন" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"><FiX /></button>
        </div>

        {data && data.rows.length > 8 && (
          <div className="px-4 pt-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="খুঁজুন…"
                     className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white" />
            </div>
          </div>
        )}

        <div className="p-4 overflow-auto">
          {loading && <div className="h-32 bg-gray-50 dark:bg-slate-700/50 rounded-xl animate-pulse" />}
          {error && <p className="text-xs text-red-600">তালিকা আনা যায়নি। আবার চেষ্টা করুন।</p>}
          {data && !loading && (rows.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">{data.rows.length === 0 ? 'কিছু নেই 👍' : 'কোনো মিল পাওয়া যায়নি'}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700">
                  {data.columns.map(c => (
                    <th key={c.key} className={`py-2 px-2 font-semibold whitespace-nowrap ${c.type === 'text' || c.type === 'date' ? 'text-left' : 'text-right'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-slate-700/50 text-gray-700 dark:text-gray-200">
                    {data.columns.map(c => (
                      <td key={c.key} className={`py-2 px-2 ${c.type === 'text' || c.type === 'date' ? 'text-left' : 'text-right whitespace-nowrap'}`}>{cell(c.type, r[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="font-bold text-gray-800 dark:text-white">
                    {data.columns.map((c, i) => (
                      <td key={c.key} className={`py-2 px-2 ${c.type === 'text' || c.type === 'date' ? 'text-left' : 'text-right whitespace-nowrap'}`}>
                        {i === 0 ? 'মোট' : c.type === 'money' ? fmtMoney(totals[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          ))}
          {data?.truncated && <p className="text-[11px] text-yellow-700 mt-3">সর্বোচ্চ {fmtNum(data.limit)}টি সারি দেখানো হয়েছে — তারিখের সীমা ছোট করুন।</p>}
        </div>
      </div>
    </div>
  )
}

export function Shell({ icon, title, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-bold text-gray-800 dark:text-white text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// onClick দিলে কার্ডটি ক্লিক করা যায় (বিস্তারিত তালিকা খোলে)
export function Stat({ label, value, sub, tone, onClick }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-800 dark:text-white'
  const body = (
    <>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-1">
        <span>{label}</span>{onClick && <FiChevronRight className="flex-shrink-0 text-gray-400" />}
      </p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </>
  )
  if (!onClick) return <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">{body}</div>
  return (
    <button type="button" onClick={onClick}
            className="text-left w-full bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-slate-700 active:scale-[0.99] transition">
      {body}
    </button>
  )
}

export function MiniList({ title, rows, empty, onMore }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{title}</p>
        {onMore && <button type="button" onClick={onMore} className="flex-shrink-0 text-[11px] font-semibold text-primary hover:underline">সব দেখুন ›</button>}
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-700 dark:text-gray-200">{r.left}</span>
              <span className="flex-shrink-0 font-semibold text-gray-500 dark:text-gray-400">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AlertList({ alerts, onOpen }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const { cls, Icon } = SEV[a.severity] || SEV.info
        const type = onOpen ? ALERT_DETAIL[a.code] : null
        return (
          <li key={i}>
            {type ? (
              <button type="button" onClick={() => onOpen(type)}
                      className={`w-full text-left flex items-start gap-2 text-xs border rounded-xl p-2.5 hover:brightness-95 transition ${cls}`}>
                <Icon className="flex-shrink-0 mt-0.5" />
                <span className="flex-1">{a.message}</span>
                <span className="flex-shrink-0 font-semibold underline">বিস্তারিত ›</span>
              </button>
            ) : (
              <div className={`flex items-start gap-2 text-xs border rounded-xl p-2.5 ${cls}`}>
                <Icon className="flex-shrink-0 mt-0.5" />
                <span>{a.message}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
