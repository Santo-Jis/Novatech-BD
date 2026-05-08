import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import {
  FiTruck, FiCoffee, FiMoreHorizontal, FiPlus,
  FiCheckCircle, FiClock, FiXCircle, FiChevronDown,
  FiChevronUp, FiFileText, FiCalendar
} from 'react-icons/fi'

// ─── Status Badge ──────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  { label: 'অপেক্ষমাণ', bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <FiClock size={11} /> },
    approved: { label: 'অনুমোদিত',  bg: 'bg-green-100',  text: 'text-green-700',  icon: <FiCheckCircle size={11} /> },
    rejected: { label: 'বাতিল',     bg: 'bg-red-100',    text: 'text-red-700',    icon: <FiXCircle size={11} /> },
  }
  const s = map[status] || map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      {s.icon} {s.label}
    </span>
  )
}

// ─── Single expense card ───────────────────────────────────
function ExpenseCard({ r, onEdit }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-800 dark:text-white">
              {new Date(r.report_date).toLocaleDateString('bn-BD', {
                weekday: 'short', day: 'numeric', month: 'long'
              })}
            </span>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            মোট: <span className="font-bold text-primary text-sm">৳{parseFloat(r.total_amount || 0).toLocaleString('bn-BD')}</span>
          </p>
        </div>
        <span className="text-gray-400 ml-2">
          {expanded ? <FiChevronUp /> : <FiChevronDown />}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-dashed border-gray-100 dark:border-slate-700 pt-3">
          {/* Cost breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'যাতায়াত', value: r.transport_cost, icon: <FiTruck size={14} />, color: 'text-blue-500' },
              { label: 'খাবার',   value: r.food_cost,      icon: <FiCoffee size={14} />,  color: 'text-green-500' },
              { label: 'অন্যান্য',value: r.misc_cost,      icon: <FiMoreHorizontal size={14} />, color: 'text-orange-500' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 dark:bg-slate-700 rounded-xl p-2">
                <span className={`${item.color} flex justify-center mb-1`}>{item.icon}</span>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  ৳{parseFloat(item.value || 0).toLocaleString('bn-BD')}
                </p>
                <p className="text-xs text-gray-400">{item.label}</p>
              </div>
            ))}
          </div>

          {/* misc note */}
          {r.misc_note && (
            <p className="text-xs text-gray-500 italic">অন্যান্য: {r.misc_note}</p>
          )}

          {/* review note */}
          {r.review_note && (
            <div className={`text-xs p-2 rounded-xl ${r.status === 'approved' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'}`}>
              💬 {r.review_note}
            </div>
          )}

          {/* receipt */}
          {r.receipt_url && (
            <img
              src={r.receipt_url}
              alt="রিসিট"
              className="w-full rounded-xl max-h-36 object-cover border border-gray-200"
            />
          )}

          {/* Edit button for pending/rejected */}
          {(r.status === 'pending' || r.status === 'rejected') && (
            <button
              onClick={() => onEdit(r)}
              className="w-full py-2 text-xs font-bold text-primary border-2 border-primary/20 rounded-xl hover:bg-primary/5 transition-colors"
            >
              ✏️ সম্পাদনা করুন
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExpenseHistory() {
  const navigate = useNavigate()
  const [reports,    setReports]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [month,      setMonth]      = useState(String(new Date().getMonth() + 1))
  const [year,       setYear]       = useState(String(new Date().getFullYear()))
  const [summary,    setSummary]    = useState(null)
  const [hasToday,   setHasToday]   = useState(false)

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2024, i).toLocaleString('bn-BD', { month: 'long' })
  }))
  const years = ['2024', '2025', '2026']

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/expense/my?year=${year}&month=${month}`)
      const data = res.data.data || []
      setReports(data)

      // today check
      const today = new Date().toISOString().split('T')[0]
      setHasToday(data.some(r => r.report_date === today))

      // summary
      const s = data.reduce((acc, r) => {
        acc.total     += parseFloat(r.total_amount     || 0)
        acc.transport += parseFloat(r.transport_cost   || 0)
        acc.food      += parseFloat(r.food_cost        || 0)
        acc.misc      += parseFloat(r.misc_cost        || 0)
        if (r.status === 'approved') acc.approved += parseFloat(r.total_amount || 0)
        if (r.status === 'pending')  acc.pending++
        return acc
      }, { total: 0, transport: 0, food: 0, misc: 0, approved: 0, pending: 0 })
      setSummary(s)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [month, year])

  const handleEdit = (r) => {
    navigate('/worker/expense', { state: { existing: r } })
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800 dark:text-white text-lg">খরচের ইতিহাস</h1>
          <p className="text-xs text-gray-400 mt-0.5">মাসভিত্তিক দৈনিক খরচ</p>
        </div>
        {!hasToday && (
          <button
            onClick={() => navigate('/worker/expense')}
            className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all"
          >
            <FiPlus size={14} /> আজকের খরচ
          </button>
        )}
      </div>

      {/* ── Month/Year filter ──────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600
                       rounded-xl text-sm focus:outline-none focus:border-primary dark:text-white transition-colors"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600
                       rounded-xl text-sm focus:outline-none focus:border-primary dark:text-white transition-colors"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Monthly summary ────────────────────────────── */}
      {summary && !loading && (
        <div className="bg-gradient-to-r from-primary to-primary-light rounded-2xl p-4 text-white">
          <p className="text-white/70 text-xs mb-2">মাসিক সারাংশ</p>
          <p className="text-3xl font-bold">৳{summary.total.toLocaleString('bn-BD')}</p>
          <div className="flex gap-4 mt-3 text-xs text-white/80">
            <span>🛺 ৳{summary.transport.toLocaleString('bn-BD')}</span>
            <span>☕ ৳{summary.food.toLocaleString('bn-BD')}</span>
            <span>📦 ৳{summary.misc.toLocaleString('bn-BD')}</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="bg-white/20 px-2 py-0.5 rounded-full">
              অনুমোদিত: ৳{summary.approved.toLocaleString('bn-BD')}
            </span>
            {summary.pending > 0 && (
              <span className="bg-yellow-400/30 text-yellow-100 px-2 py-0.5 rounded-full">
                ⏳ {summary.pending}টি অপেক্ষমাণ
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── List ───────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center shadow-sm border border-gray-100 dark:border-slate-700">
          <FiFileText className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">এই মাসে কোনো খরচ নেই</p>
          <button
            onClick={() => navigate('/worker/expense')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold"
          >
            এখনই যোগ করুন
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <ExpenseCard key={r.id} r={r} onEdit={handleEdit} />
          ))}
        </div>
      )}
    </div>
  )
}
