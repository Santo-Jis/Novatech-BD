import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiCheckCircle, FiXCircle, FiEye, FiFileText,
  FiTruck, FiCoffee, FiMoreHorizontal, FiCalendar,
  FiFilter, FiRefreshCw, FiAlertCircle
} from 'react-icons/fi'

// ─── Transport label ───────────────────────────────────────
const TRANSPORT_LABELS = {
  rickshaw:    '🛺 রিকশা',
  bus:         '🚌 বাস',
  cng:         '🚗 সিএনজি',
  bike:        '🏍️ মোটরসাইকেল',
  own_vehicle: '🚙 নিজস্ব গাড়ি',
  other:       '🚶 অন্যান্য',
}

// ─── Status Badge ──────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  'pending',
    approved: 'approved',
    rejected: 'rejected',
  }
  return <Badge variant={map[status] || 'gray'} />
}

// ─── Money display ─────────────────────────────────────────
function Taka({ amount, className = '' }) {
  return (
    <span className={`font-bold ${className}`}>
      ৳{parseFloat(amount || 0).toLocaleString('bn-BD')}
    </span>
  )
}

export default function ExpenseApprovals() {
  const [reports,  setReports]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('pending')  // pending | all
  const [modal,    setModal]    = useState(null)        // null | 'detail'
  const [selected, setSelected] = useState(null)
  const [note,     setNote]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0]
  )
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().split('T')[0]
  )

  const fetchReports = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo })
      if (filter === 'pending') params.set('status', 'pending')
      const res = await api.get(`/expense/team?${params}`)
      setReports(res.data.data || [])
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReports() }, [filter, dateFrom, dateTo])

  const openDetail = (r) => {
    setSelected(r)
    setNote('')
    setModal('detail')
  }

  const handleReview = async (status) => {
    if (!selected) return
    setSaving(true)
    try {
      await api.patch(`/expense/${selected.id}/review`, { status, review_note: note })
      toast.success(status === 'approved' ? '✅ অনুমোদন দেওয়া হয়েছে' : '❌ বাতিল করা হয়েছে')
      setModal(null)
      fetchReports()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSaving(false)
    }
  }

  // ── Summary stats ──────────────────────────────────────
  const stats = reports.reduce((acc, r) => {
    acc.total++
    acc.amount += parseFloat(r.total_amount || 0)
    if (r.status === 'pending')  acc.pending++
    if (r.status === 'approved') acc.approved++
    if (r.status === 'rejected') acc.rejected++
    return acc
  }, { total: 0, amount: 0, pending: 0, approved: 0, rejected: 0 })

  return (
    <div className="p-4 space-y-4 animate-fade-in">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800 dark:text-white text-lg">খরচ অনুমোদন</h1>
          <p className="text-xs text-gray-400 mt-0.5">SR-দের দৈনিক খরচ রিভিউ করুন</p>
        </div>
        <button
          onClick={fetchReports}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-slate-700 text-gray-500 hover:text-primary transition-colors"
        >
          <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Stats Row ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'মোট',       value: stats.total,    color: 'text-gray-700' },
          { label: 'অপেক্ষমাণ', value: stats.pending,  color: 'text-yellow-600' },
          { label: 'অনুমোদিত', value: stats.approved, color: 'text-green-600' },
          { label: 'বাতিল',    value: stats.rejected, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-2xl p-3 text-center shadow-sm border border-gray-100 dark:border-slate-700">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-slate-700 space-y-3">
        {/* Status Filter */}
        <div className="flex gap-2">
          {[
            { key: 'pending', label: '⏳ অপেক্ষমাণ' },
            { key: 'all',     label: '📋 সব' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all
                ${filter === f.key
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        <div className="flex gap-2 items-center">
          <FiCalendar size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-primary dark:text-white"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-primary dark:text-white"
          />
        </div>
      </div>

      {/* ── List ───────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center shadow-sm border border-gray-100 dark:border-slate-700">
          <FiFileText className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">কোনো রিপোর্ট নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-gray-800 dark:text-white truncate">
                      {r.worker_name || r.worker?.name_bn || '—'}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.employee_code || r.worker?.employee_code} •{' '}
                    {new Date(r.report_date).toLocaleDateString('bn-BD', {
                      day: 'numeric', month: 'long'
                    })}
                  </p>

                  {/* খরচের সারাংশ */}
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {parseFloat(r.transport_cost) > 0 && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <FiTruck size={11} className="text-primary" />
                        <Taka amount={r.transport_cost} className="text-gray-700 dark:text-gray-200 font-semibold" />
                      </span>
                    )}
                    {parseFloat(r.food_cost) > 0 && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <FiCoffee size={11} className="text-secondary" />
                        <Taka amount={r.food_cost} className="text-gray-700 dark:text-gray-200 font-semibold" />
                      </span>
                    )}
                    {parseFloat(r.misc_cost) > 0 && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <FiMoreHorizontal size={11} className="text-accent" />
                        <Taka amount={r.misc_cost} className="text-gray-700 dark:text-gray-200 font-semibold" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-primary">
                    ৳{parseFloat(r.total_amount || 0).toLocaleString('bn-BD')}
                  </p>
                  <button
                    onClick={() => openDetail(r)}
                    className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
                  >
                    <FiEye size={12} /> বিস্তারিত
                  </button>
                </div>
              </div>

              {/* Quick approve/reject for pending */}
              {r.status === 'pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-dashed border-gray-100 dark:border-slate-700">
                  <button
                    onClick={() => { setSelected(r); setNote(''); handleReviewQuick(r.id, 'approved') }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-xs font-bold hover:bg-green-100 transition-colors"
                  >
                    <FiCheckCircle size={13} /> অনুমোদন
                  </button>
                  <button
                    onClick={() => openDetail(r)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors"
                  >
                    <FiXCircle size={13} /> বাতিল / রিভিউ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────── */}
      <Modal
        isOpen={modal === 'detail'}
        onClose={() => setModal(null)}
        title="খরচের বিস্তারিত"
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            {/* Worker info */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                {(selected.worker_name || selected.worker?.name_bn || '?')[0]}
              </div>
              <div>
                <p className="font-bold text-sm text-gray-800 dark:text-white">
                  {selected.worker_name || selected.worker?.name_bn}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.employee_code || selected.worker?.employee_code} •{' '}
                  {new Date(selected.report_date).toLocaleDateString('bn-BD', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={selected.status} />
              </div>
            </div>

            {/* যানবাহন */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-xs text-blue-500 font-semibold mb-1">যানবাহন</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white">
                  {TRANSPORT_LABELS[selected.transport_type] || '—'}
                </p>
              </div>
              <div className="p-3 bg-primary/5 rounded-xl">
                <p className="text-xs text-primary font-semibold mb-1">মোট খরচ</p>
                <p className="text-lg font-bold text-primary">
                  ৳{parseFloat(selected.total_amount || 0).toLocaleString('bn-BD')}
                </p>
              </div>
            </div>

            {/* খরচের বিবরণ */}
            <div className="space-y-2">
              {[
                { label: '🛺 যাতায়াত', value: selected.transport_cost, icon: <FiTruck size={14} /> },
                { label: '☕ খাবার',   value: selected.food_cost,      icon: <FiCoffee size={14} /> },
                { label: '📦 অন্যান্য', value: selected.misc_cost,     icon: <FiMoreHorizontal size={14} /> },
              ].map(item => (
                parseFloat(item.value) > 0 && (
                  <div key={item.label} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                    <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      {item.icon} {item.label}
                    </span>
                    <Taka amount={item.value} className="text-gray-800 dark:text-white" />
                  </div>
                )
              ))}
              {selected.misc_note && (
                <p className="text-xs text-gray-500 italic px-1">অন্যান্য: {selected.misc_note}</p>
              )}
            </div>

            {/* রিসিট ছবি */}
            {selected.receipt_url && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">রিসিট</p>
                <img
                  src={selected.receipt_url}
                  alt="রিসিট"
                  className="w-full rounded-xl max-h-48 object-cover border border-gray-200"
                />
              </div>
            )}

            {/* আগের review note */}
            {selected.review_note && selected.status !== 'pending' && (
              <div className={`p-3 rounded-xl text-xs ${selected.status === 'approved' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
                <p className="font-semibold mb-0.5">রিভিউ মন্তব্য:</p>
                <p>{selected.review_note}</p>
              </div>
            )}

            {/* Approve/Reject UI — pending only */}
            {selected.status === 'pending' && (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500">মন্তব্য (ঐচ্ছিক)</p>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="অনুমোদন বা বাতিলের কারণ লিখুন..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600
                             rounded-xl text-sm focus:outline-none focus:border-primary dark:text-white resize-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReview('rejected')}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-red-600 transition-colors"
                  >
                    <FiXCircle /> বাতিল
                  </button>
                  <button
                    onClick={() => handleReview('approved')}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-green-600 transition-colors"
                  >
                    {saving
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <FiCheckCircle />
                    }
                    অনুমোদন
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )

  // Quick approve without modal (no note)
  async function handleReviewQuick(id, status) {
    try {
      await api.patch(`/expense/${id}/review`, { status, review_note: '' })
      toast.success('✅ অনুমোদন দেওয়া হয়েছে')
      fetchReports()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    }
  }
}
