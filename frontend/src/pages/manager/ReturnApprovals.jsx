// frontend/src/pages/manager/ReturnApprovals.jsx
import { useState, useEffect } from 'react'
import { FiFilter, FiChevronDown, FiChevronUp, FiCheck, FiX } from 'react-icons/fi'
import api from '../../api/axios'
import { toast } from 'react-hot-toast'

const STATUS_COLOR = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-600 border-red-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
}
const STATUS_LABEL = {
  pending:'অপেক্ষমাণ', approved:'অনুমোদিত', rejected:'বাতিল', completed:'সম্পন্ন'
}
const REASON_LABEL = {
  damaged:'ক্ষতিগ্রস্ত', wrong_item:'ভুল পণ্য',
  expired:'মেয়াদোত্তীর্ণ', customer_reject:'কাস্টমার অস্বীকার', other:'অন্যান্য'
}

function ReviewModal({ rr, onClose, onDone }) {
  const [status,      setStatus]      = useState('')
  const [reviewNote,  setReviewNote]  = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  const handleReview = async () => {
    if (!status) { toast.error('সিদ্ধান্ত বেছে নিন।'); return }
    setSubmitting(true)
    try {
      await api.patch(`/return/${rr.id}/review`, { status, review_note: reviewNote })
      toast.success(status === 'approved' ? 'অনুমোদিত হয়েছে!' : 'বাতিল করা হয়েছে!')
      onDone()
    } catch (e) {
      toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-bold text-gray-800 text-lg">রিভিউ করুন</h3>

        <div className="bg-gray-50 rounded-2xl p-3 space-y-1">
          <p className="text-sm font-semibold text-gray-700">{rr.sr_name}</p>
          <p className="text-xs text-gray-500">{rr.shop_name || rr.customer_name}</p>
          <p className="text-xs text-gray-500">
            {rr.type === 'return' ? '↩️ রিটার্ন' : '🔄 রিপ্লেসমেন্ট'} •
            ৳{parseFloat(rr.total_value).toLocaleString('bn-BD')}
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStatus('approved')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all
              ${status === 'approved' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600'}`}>
            <FiCheck /> অনুমোদন
          </button>
          <button onClick={() => setStatus('rejected')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all
              ${status === 'rejected' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600'}`}>
            <FiX /> বাতিল
          </button>
        </div>

        <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
          rows={3} placeholder="নোট লিখুন (ঐচ্ছিক)..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none" />

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm">
            বাতিল
          </button>
          <button onClick={handleReview} disabled={submitting || !status}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
            {submitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReturnCard({ rr, onReview }) {
  const [open, setOpen] = useState(false)
  const items = typeof rr.items === 'string' ? JSON.parse(rr.items) : (rr.items || [])
  const photos = typeof rr.photos === 'string' ? JSON.parse(rr.photos) : (rr.photos || [])
  const st = STATUS_COLOR[rr.status] || ''

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-start justify-between gap-2 text-left"
        onClick={() => setOpen(v => !v)}>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">
              {rr.type === 'return' ? '↩️' : '🔄'} {rr.sr_name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${st}`}>
              {STATUS_LABEL[rr.status]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{rr.shop_name || rr.customer_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {REASON_LABEL[rr.reason]} • {new Date(rr.created_at).toLocaleDateString('bn-BD')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-bold text-indigo-700 text-sm whitespace-nowrap">
            ৳{parseFloat(rr.total_value).toLocaleString('bn-BD')}
          </span>
          {open ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                <span className="text-gray-500">৳{parseFloat(item.subtotal||0).toLocaleString('bn-BD')}</span>
              </div>
            ))}
          </div>

          {rr.note && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500 font-semibold mb-0.5">SR নোট:</p>
              <p className="text-sm text-gray-700">{rr.note}</p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {photos.map((p, i) => (
                <img key={i} src={p} alt="" className="w-16 h-16 object-cover rounded-xl border" />
              ))}
            </div>
          )}

          {rr.review_note && (
            <div className={`rounded-xl px-3 py-2 ${rr.status === 'approved' ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-0.5">আপনার নোট:</p>
              <p className="text-sm text-gray-700">{rr.review_note}</p>
            </div>
          )}

          {rr.status === 'pending' && (
            <button onClick={() => onReview(rr)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95">
              ⚖️ রিভিউ করুন
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReturnApprovals() {
  const now = new Date()
  const [returns,   setReturns]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [status,    setStatus]    = useState('pending')
  const [type,      setType]      = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [reviewing, setReviewing] = useState(null)
  const [showFilter,setShowFilter]= useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status)   params.append('status',    status)
      if (type)     params.append('type',      type)
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo)   params.append('date_to',   dateTo)
      const res = await api.get(`/return/team?${params}`)
      setReturns(res.data?.data || [])
    } catch { toast.error('তথ্য লোড হয়নি।') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [status, type, dateFrom, dateTo])

  const pendingCount = returns.filter(r => r.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800">রিটার্ন অনুমোদন</h1>
          <p className="text-xs text-gray-400">
            {returns.length}টি রিকোয়েস্ট
            {pendingCount > 0 && <span className="text-orange-500 font-semibold"> • {pendingCount}টি অপেক্ষমাণ</span>}
          </p>
        </div>
        <button onClick={() => setShowFilter(v => !v)}
          className="flex items-center gap-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600">
          <FiFilter /> ফিল্টার
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { value: '',          label: 'সব' },
            { value: 'pending',   label: '⏳ অপেক্ষমাণ' },
            { value: 'approved',  label: '✅ অনুমোদিত' },
            { value: 'rejected',  label: '❌ বাতিল' },
            { value: 'completed', label: '🏁 সম্পন্ন' },
          ].map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
              className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex-shrink-0
                ${status === s.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Extra Filter */}
        {showFilter && (
          <div className="bg-gray-50 rounded-2xl p-3 space-y-3">
            <div className="flex gap-2">
              <select value={type} onChange={e => setType(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white">
                <option value="">সব ধরন</option>
                <option value="return">↩️ রিটার্ন</option>
                <option value="replacement">🔄 রিপ্লেসমেন্ট</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white" />
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : returns.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold">কোনো রিকোয়েস্ট নেই</p>
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map(rr => (
              <ReturnCard key={rr.id} rr={rr} onReview={setReviewing} />
            ))}
          </div>
        )}
      </div>

      {reviewing && (
        <ReviewModal
          rr={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); load() }}
        />
      )}
    </div>
  )
}
