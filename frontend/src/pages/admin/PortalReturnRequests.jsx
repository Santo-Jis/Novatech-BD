import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Input, { Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiRotateCcw, FiFilter, FiRefreshCw, FiEye, FiCheckCircle,
  FiXCircle, FiChevronLeft, FiChevronRight, FiPackage,
  FiUser, FiCalendar, FiMessageSquare
} from 'react-icons/fi'

// ─── Helpers ─────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_MAP = {
  pending:   { label: 'পেন্ডিং',     variant: 'pending' },
  approved:  { label: 'অনুমোদিত',   variant: 'approved' },
  rejected:  { label: 'বাতিল',       variant: 'rejected' },
  completed: { label: 'সম্পন্ন',     variant: 'active' },
}

const fmt = (n) => parseFloat(n || 0).toLocaleString('bn-BD')

// ─── Summary Cards ────────────────────────────────────────────
function SummaryCards({ summary }) {
  const cards = [
    { label: 'পেন্ডিং',   value: summary.pending,   color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800' },
    { label: 'অনুমোদিত', value: summary.approved,  color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
    { label: 'বাতিল',     value: summary.rejected,  color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800' },
    { label: 'সম্পন্ন',   value: summary.completed, color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-800' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
          <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
          <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value ?? '—'}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Item List inside detail modal ───────────────────────────
function ItemsList({ items }) {
  let parsed = []
  try { parsed = typeof items === 'string' ? JSON.parse(items) : (items || []) } catch {}
  if (!parsed.length) return <p className="text-sm text-gray-400">পণ্যের তালিকা নেই।</p>

  return (
    <div className="space-y-2">
      {parsed.map((item, i) => (
        <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-slate-700/50 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.product_name || item.name || `পণ্য #${i+1}`}</p>
            {item.sku && <p className="text-xs text-gray-400 font-mono">{item.sku}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">×{item.quantity}</p>
            {item.price && <p className="text-xs text-gray-400">৳{fmt(item.price)}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail + Review Modal ────────────────────────────────────
function ReviewModal({ req, onClose, onDone }) {
  const [adminNote, setAdminNote] = useState('')
  const [loading, setLoading]    = useState(false)

  useEffect(() => {
    setAdminNote(req?.admin_note || '')
  }, [req])

  if (!req) return null

  const st = STATUS_MAP[req.status] || { label: req.status, variant: 'gray' }

  const doAction = async (action) => {
    setLoading(true)
    try {
      if (action === 'complete') {
        await api.patch(`/admin/portal-returns/${req.id}/complete`, { admin_note: adminNote })
        toast.success('রিটার্ন রিকোয়েস্ট সম্পন্ন করা হয়েছে।')
      } else {
        await api.patch(`/admin/portal-returns/${req.id}/review`, { decision: action, admin_note: adminNote })
        toast.success(action === 'approved' ? 'অনুমোদন দেওয়া হয়েছে।' : 'বাতিল করা হয়েছে।')
      }
      onDone()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={!!req}
      onClose={onClose}
      title="পোর্টাল রিটার্ন রিকোয়েস্ট"
      size="lg"
      footer={
        req.status === 'pending' ? (
          <>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              বাতিল
            </button>
            <button
              onClick={() => doAction('rejected')}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              <FiXCircle className="inline mr-1.5" />প্রত্যাখ্যান
            </button>
            <button
              onClick={() => doAction('approved')}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              <FiCheckCircle className="inline mr-1.5" />অনুমোদন
            </button>
          </>
        ) : req.status === 'approved' ? (
          <>
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">বাতিল</button>
            <button
              onClick={() => doAction('complete')}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              <FiCheckCircle className="inline mr-1.5" />পণ্য পেয়েছি (Complete)
            </button>
          </>
        ) : (
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">বন্ধ করুন</button>
        )
      }
    >
      <div className="space-y-5">
        {/* Customer Info */}
        <div className="flex items-start gap-4 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
            <FiUser className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800 dark:text-gray-100">{req.customer_name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{req.shop_name}</p>
            <div className="flex gap-3 mt-1 text-xs text-gray-400">
              <span>{req.customer_code}</span>
              <span>{req.phone}</span>
            </div>
          </div>
          <Badge variant={st.variant} label={st.label} />
        </div>

        {/* Invoice + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">ইনভয়েস নম্বর</p>
            <p className="font-mono font-semibold text-sm text-gray-700 dark:text-gray-200">{req.invoice_number || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-slate-700/40 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><FiCalendar size={10} /> তারিখ</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmtDate(req.created_at)}</p>
          </div>
        </div>

        {/* Customer Note */}
        {req.note && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <FiMessageSquare size={11} /> কাস্টমারের নোট
            </p>
            <p className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 text-sm text-gray-700 dark:text-gray-200 rounded-xl px-4 py-3">
              {req.note}
            </p>
          </div>
        )}

        {/* Items */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
            <FiPackage size={11} /> পণ্য তালিকা
          </p>
          <ItemsList items={req.items} />
        </div>

        {/* Admin Note Input (only when actionable) */}
        {['pending', 'approved'].includes(req.status) && (
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">
              অ্যাডমিন নোট (ঐচ্ছিক)
            </label>
            <textarea
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              rows={3}
              placeholder="কোনো বিশেষ নোট থাকলে লিখুন…"
              className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        )}

        {/* Reviewed By / Completed */}
        {req.reviewed_by_name && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            রিভিউ করেছেন: <span className="font-medium text-gray-600 dark:text-gray-300">{req.reviewed_by_name}</span>
            {req.reviewed_at && ` · ${fmtDate(req.reviewed_at)}`}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function PortalReturnRequests() {
  const [requests,  setRequests]  = useState([])
  const [summary,   setSummary]   = useState({ pending: 0, approved: 0, rejected: 0, completed: 0 })
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selected,  setSelected]  = useState(null)
  const [filters,   setFilters]   = useState({ status: '', from: '', to: '' })

  const fetchData = useCallback(async (f = filters, p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, limit: 20 })
      if (f.status) params.set('status', f.status)
      if (f.from)   params.set('date_from', f.from)
      if (f.to)     params.set('date_to', f.to)
      const res = await api.get(`/admin/portal-returns?${params}`)
      setRequests(res.data.data || [])
      setSummary(res.data.summary || {})
      setTotalPages(res.data.pagination?.totalPages || 1)
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { fetchData() }, [page]) // eslint-disable-line

  const applyFilters = () => { setPage(1); fetchData(filters, 1) }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <FiRotateCcw className="text-primary" /> পোর্টাল রিটার্ন রিকোয়েস্ট
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">কাস্টমার পোর্টাল থেকে পাঠানো পণ্য ফেরতের আবেদন</p>
        </div>
        <button
          onClick={() => fetchData(filters, page)}
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          রিফ্রেশ
        </button>
      </div>

      {/* Summary */}
      <SummaryCards summary={summary} />

      {/* Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-40">
              <Select
                label="স্ট্যাটাস"
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                options={[
                  { value: '', label: 'সব' },
                  { value: 'pending', label: 'পেন্ডিং' },
                  { value: 'approved', label: 'অনুমোদিত' },
                  { value: 'rejected', label: 'বাতিল' },
                  { value: 'completed', label: 'সম্পন্ন' },
                ]}
              />
            </div>
            <Input label="শুরুর তারিখ" type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            <Input label="শেষ তারিখ"  type="date" value={filters.to}   onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            <Button onClick={applyFilters} icon={<FiFilter size={14} />}>ফিল্টার</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center">
            <FiRotateCcw className="mx-auto text-4xl text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">কোনো রিটার্ন রিকোয়েস্ট নেই।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">কাস্টমার</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">ইনভয়েস</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">তারিখ</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">স্ট্যাটাস</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const st = STATUS_MAP[r.status] || { label: r.status, variant: 'gray' }
                  let itemCount = 0
                  try { itemCount = (typeof r.items === 'string' ? JSON.parse(r.items) : r.items || []).length } catch {}
                  return (
                    <tr key={r.id} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-gray-100">{r.customer_name}</p>
                        <p className="text-xs text-gray-400">{r.shop_name} · {r.customer_code}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {r.invoice_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {fmtDate(r.created_at)}
                        <p className="text-gray-300 dark:text-slate-600">{itemCount} পণ্য</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.variant} label={st.label} size="xs" />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(r)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <FiEye size={12} /> দেখুন
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <p className="text-xs text-gray-400">পেজ {page} / {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Review Modal */}
      <ReviewModal req={selected} onClose={() => setSelected(null)} onDone={() => fetchData(filters, page)} />
    </div>
  )
}
