// frontend/src/pages/worker/CustomerHistory.jsx
//
// SR: একটি কাস্টমারের পূর্ণ ইতিহাস — লেনদেন, পেমেন্ট/আদায়, রিটার্ন/রিপ্লেসমেন্ট, ভিজিট।
// একই ম্যানেজারের টিমের সব SR টিমের সব কাস্টমারের ইতিহাস দেখতে পায়
// (সার্ভার টিম-চেক করে; অন্য টিমের কাস্টমারে 403)।
//
// API:
//   GET /customers/:id/history            → sales, credit_payments, visits,
//                                           customer_return_requests, sr_return_requests, customer
//   GET /collections/customer/:id?limit=  → নতুন আদায় ফ্লো (collections টেবিল)
// Route: /worker/customers/:id/history

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiRefreshCw } from 'react-icons/fi'
import api from '../../api/axios'
import toast from 'react-hot-toast'

// ── ছোট helper ────────────────────────────────────────────────
const taka = (n) => `৳${Math.round(parseFloat(n) || 0).toLocaleString('bn-BD')}`

const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return dt.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
}

const fmtTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return dt.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
}

const parseItems = (items) => {
  if (!items) return []
  if (Array.isArray(items)) return items
  try { return JSON.parse(items) } catch { return [] }
}

const SALE_STATUS = {
  verified: { label: 'যাচাইকৃত',      color: 'bg-green-100 text-green-700' },
  skipped:  { label: 'মেমো ছবি',      color: 'bg-amber-100 text-amber-700' },
  pending:  { label: 'OTP বাকি',      color: 'bg-gray-100 text-gray-600' },
}

const PAY_METHOD = {
  cash: 'নগদ', credit: 'বাকি', bkash: 'বিকাশ', nagad: 'নগদ (Nagad)', cheque: 'চেক', mixed: 'মিশ্র',
}

const COLLECTION_STATUS = {
  pending:   { label: 'অপেক্ষমাণ',   color: 'bg-yellow-100 text-yellow-700' },
  submitted: { label: 'জমা হয়েছে',   color: 'bg-blue-100 text-blue-700' },
  verified:  { label: 'যাচাইকৃত',     color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'বাতিল',        color: 'bg-red-100 text-red-600' },
}

const RETURN_STATUS = {
  pending:   { label: 'অপেক্ষমাণ',  color: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'অনুমোদিত',   color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'বাতিল',       color: 'bg-red-100 text-red-600' },
  completed: { label: 'সম্পন্ন',     color: 'bg-blue-100 text-blue-700' },
}

const TABS = [
  { key: 'sales',   label: 'লেনদেন' },
  { key: 'pay',     label: 'পেমেন্ট' },
  { key: 'returns', label: 'রিটার্ন/রিপ্লেসমেন্ট' },
  { key: 'visits',  label: 'ভিজিট' },
]

function Badge({ cls, children }) {
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cls || 'bg-gray-100 text-gray-600'}`}>{children}</span>
}

function Empty({ text }) {
  return <div className="text-center text-sm text-gray-400 py-10">{text}</div>
}

// ── প্রতিটি ট্যাবের সারি ──────────────────────────────────────
function SaleRow({ s }) {
  const st = SALE_STATUS[s.sale_status] || SALE_STATUS.pending
  const credit = parseFloat(s.credit_used || 0)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {s.invoice_number || `#${String(s.id).slice(0, 8)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(s.created_at)} • {fmtTime(s.created_at)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {PAY_METHOD[s.payment_method] || s.payment_method || '—'}
            {s.worker_name ? ` • SR: ${s.worker_name}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-indigo-700 text-sm">{taka(s.net_amount)}</p>
          {credit > 0 && <p className="text-[11px] text-red-500 font-semibold">বাকি {taka(credit)}</p>}
          <div className="mt-1"><Badge cls={st.color}>{st.label}</Badge></div>
        </div>
      </div>
    </div>
  )
}

function PaymentRow({ p }) {
  const isCollection = p.source === 'collection'
  const st = isCollection ? COLLECTION_STATUS[p.status] : null
  const [sending, setSending] = useState(false)
  // বাতিল (rejected) আদায়ের রসিদ হয় না
  const canResend = !!p.id && p.status !== 'rejected'

  // কাস্টমারকে রসিদ (PDF) আবার পাঠায় — WhatsApp, না হলে ইমেইল
  const resendReceipt = async () => {
    if (sending) return
    setSending(true)
    try {
      const res = await api.post(`/collections/${p.source}/${p.id}/resend-receipt`)
      toast.success(res.data?.message || 'রসিদ পাঠানো হয়েছে।')
    } catch (e) {
      toast.error(e.response?.data?.message || 'রসিদ পাঠানো যায়নি।')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            {isCollection ? `আদায় • ${PAY_METHOD[p.payment_mode] || p.payment_mode || 'নগদ'}` : 'বাকি পরিশোধ'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(p.created_at)} • {fmtTime(p.created_at)}
          </p>
          {p.by && <p className="text-xs text-gray-500 mt-0.5">SR: {p.by}</p>}
          {p.note && <p className="text-xs text-gray-400 mt-0.5 italic truncate">{p.note}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-bold text-sm ${p.status === 'rejected' ? 'text-gray-400 line-through' : 'text-green-700'}`}>
            {taka(p.amount)}
          </p>
          {st && <div className="mt-1"><Badge cls={st.color}>{st.label}</Badge></div>}
        </div>
      </div>
      {canResend && (
        <button
          type="button"
          onClick={resendReceipt}
          disabled={sending}
          className="mt-2 w-full text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl py-2 disabled:opacity-60"
        >
          {sending ? 'পাঠানো হচ্ছে…' : '🧾 রসিদ আবার পাঠান'}
        </button>
      )}
    </div>
  )
}

function ReturnRow({ r }) {
  const [open, setOpen] = useState(false)
  const st = RETURN_STATUS[r.status] || {}
  const items = parseItems(r.items)
  const isReplacement = r.type === 'replacement'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-start justify-between gap-2 text-left" onClick={() => setOpen(v => !v)}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">
              {isReplacement ? '🔄 রিপ্লেসমেন্ট' : '↩️ পণ্য ফেরত'}
            </span>
            <Badge cls={st.color}>{st.label || r.status}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(r.created_at)}
            {r.invoice_number ? ` • ইনভয়েস ${r.invoice_number}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {r.origin === 'customer' ? 'কাস্টমারের অনুরোধ' : `SR জমা দিয়েছে${r.sr_name ? `: ${r.sr_name}` : ''}`}
            {items.length ? ` • ${items.length.toLocaleString('bn-BD')}টি পণ্য` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="font-bold text-indigo-700 text-sm">{taka(r.value)}</span>
          {open ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-50 space-y-2">
          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{it.product_name || it.name || 'পণ্য'} × {Number(it.qty ?? it.quantity ?? 0).toLocaleString('bn-BD')}</span>
                  {(it.subtotal != null) && <span className="text-gray-500">{taka(it.subtotal)}</span>}
                </div>
              ))}
            </div>
          )}
          {r.reason && <p className="text-xs text-gray-500">কারণ: {r.reason}</p>}
          {r.note && <p className="text-xs text-gray-500">নোট: {r.note}</p>}
          {r.review_note && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500 font-semibold mb-0.5">রিভিউ নোট:</p>
              <p className="text-sm text-gray-700">{r.review_note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VisitRow({ v }) {
  const sold = v.will_sell === true || v.will_sell === 'true'
  const noSell = v.will_sell === false || v.will_sell === 'false'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">{fmtDate(v.visit_time || v.created_at)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtTime(v.visit_time || v.created_at)}</p>
          {v.worker_name && <p className="text-xs text-gray-500 mt-0.5">SR: {v.worker_name}</p>}
          {noSell && v.no_sell_reason && (
            <p className="text-xs text-gray-500 mt-0.5">বিক্রি হয়নি: {v.no_sell_reason}</p>
          )}
        </div>
        {(sold || noSell) && (
          <Badge cls={sold ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
            {sold ? 'বিক্রির ইচ্ছা' : 'বিক্রি নয়'}
          </Badge>
        )}
      </div>
    </div>
  )
}

// ── মূল পেজ ──────────────────────────────────────────────────
export default function CustomerHistory() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState('sales')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)       // { forbidden, message }
  const [data, setData] = useState(null)
  const [collections, setCollections] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [hist, coll] = await Promise.allSettled([
        api.get(`/customers/${id}/history`),
        api.get(`/collections/customer/${id}`, { params: { limit: 50 } }),
      ])

      if (hist.status === 'rejected') {
        const status = hist.reason?.response?.status
        setError({
          forbidden: status === 403,
          message: status === 403
            ? 'এই কাস্টমার আপনার টিমে নেই।'
            : (navigator.onLine ? 'তথ্য লোড হয়নি।' : 'ইন্টারনেট নেই — ইতিহাস দেখতে অনলাইনে আসুন।'),
        })
        setData(null)
      } else {
        setData(hist.value.data?.data || {})
      }
      // collections না এলেও বাকি ইতিহাস দেখাও
      setCollections(coll.status === 'fulfilled' ? (coll.value.data?.data || []) : [])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const sales  = data?.sales || []
  const visits = data?.visits || []

  // পেমেন্ট = পুরনো credit_payments + নতুন collections, নতুন আগে
  const payments = useMemo(() => {
    const a = (data?.credit_payments || []).map(p => ({
      key: `cp-${p.id}`, id: p.id, source: 'credit_payment', amount: p.amount, created_at: p.created_at,
      by: p.collected_by_name, note: p.notes,
    }))
    const b = collections.map(c => ({
      key: `col-${c.id}`, id: c.id, source: 'collection', amount: c.amount, created_at: c.created_at,
      by: c.sr_name, note: c.note, payment_mode: c.payment_mode, status: c.status,
    }))
    return [...a, ...b].sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
  }, [data, collections])

  // রিটার্ন/রিপ্লেসমেন্ট = কাস্টমারের অনুরোধ + SR-এর জমা, নতুন আগে
  const returns = useMemo(() => {
    const a = (data?.customer_return_requests || []).map(r => ({
      key: `crr-${r.id}`, origin: 'customer', type: r.type, status: r.status,
      created_at: r.created_at, invoice_number: r.invoice_number, items: r.items,
      value: r.total_return_value, note: r.note, review_note: r.admin_note,
    }))
    const b = (data?.sr_return_requests || []).map(r => ({
      key: `rr-${r.id}`, origin: 'sr', type: r.type, status: r.status,
      created_at: r.created_at, items: r.items, value: r.total_value,
      reason: r.reason, note: r.note, review_note: r.review_note, sr_name: r.sr_name,
    }))
    return [...a, ...b].sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
  }, [data])

  const counts = { sales: sales.length, pay: payments.length, returns: returns.length, visits: visits.length }

  const cust = data?.customer
  const due = parseFloat(cust?.current_credit || 0)
  const limit = parseFloat(cust?.credit_limit || 0)

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* হেডার */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-white shadow-sm active:scale-95 transition-transform" aria-label="ফিরে যান">
          <FiArrowLeft />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-lg text-gray-800 truncate">{cust?.shop_name || 'কাস্টমার ইতিহাস'}</h2>
          <p className="text-xs text-gray-400">লেনদেন • পেমেন্ট • রিটার্ন/রিপ্লেসমেন্ট • ভিজিট</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-xl bg-white shadow-sm active:scale-95 transition-transform disabled:opacity-50" aria-label="রিফ্রেশ">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && (
        <div className="space-y-3">
          <div className="h-20 bg-white rounded-2xl animate-pulse" />
          <div className="h-16 bg-white rounded-2xl animate-pulse" />
          <div className="h-16 bg-white rounded-2xl animate-pulse" />
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">{error.message}</p>
          {!error.forbidden && (
            <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:scale-95 transition-transform">
              আবার চেষ্টা করুন
            </button>
          )}
        </div>
      )}

      {!error && data && (
        <>
          {/* বাকির সারসংক্ষেপ */}
          <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">বর্তমান বাকি</p>
              <p className={`text-xl font-bold ${due > 0 ? 'text-red-600' : 'text-green-600'}`}>{taka(due)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">ক্রেডিট লিমিট</p>
              <p className="text-xl font-bold text-gray-700">{taka(limit)}</p>
            </div>
          </div>

          {/* ট্যাব */}
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors
                  ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'}`}
              >
                {t.label} <span className={tab === t.key ? 'text-indigo-200' : 'text-gray-400'}>({counts[t.key].toLocaleString('bn-BD')})</span>
              </button>
            ))}
          </div>

          {/* তালিকা */}
          <div className="space-y-2.5">
            {tab === 'sales' && (sales.length
              ? sales.map(s => <SaleRow key={s.id} s={s} />)
              : <Empty text="কোনো লেনদেন নেই" />)}
            {tab === 'pay' && (payments.length
              ? payments.map(p => <PaymentRow key={p.key} p={p} />)
              : <Empty text="কোনো পেমেন্ট নেই" />)}
            {tab === 'returns' && (returns.length
              ? returns.map(r => <ReturnRow key={r.key} r={r} />)
              : <Empty text="কোনো রিটার্ন বা রিপ্লেসমেন্ট নেই" />)}
            {tab === 'visits' && (visits.length
              ? visits.map(v => <VisitRow key={v.id} v={v} />)
              : <Empty text="কোনো ভিজিট নেই" />)}
          </div>

          {tab === 'sales' && sales.length >= 50 && (
            <p className="text-center text-[11px] text-gray-400">সর্বশেষ ৫০টি লেনদেন দেখানো হচ্ছে।</p>
          )}
          {tab === 'visits' && visits.length >= 30 && (
            <p className="text-center text-[11px] text-gray-400">সর্বশেষ ৩০টি ভিজিট দেখানো হচ্ছে।</p>
          )}
        </>
      )}
    </div>
  )
}
