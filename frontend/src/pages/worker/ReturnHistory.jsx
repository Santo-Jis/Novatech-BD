// frontend/src/pages/worker/ReturnHistory.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiPlus, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import api from '../../api/axios'
import { toast } from 'react-hot-toast'

const STATUS_LABEL = {
  pending:   { label: 'অপেক্ষমাণ',  color: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'অনুমোদিত',   color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'বাতিল',       color: 'bg-red-100 text-red-600' },
  completed: { label: 'সম্পন্ন',     color: 'bg-blue-100 text-blue-700' },
}

const REASON_LABEL = {
  damaged:         'ক্ষতিগ্রস্ত পণ্য',
  wrong_item:      'ভুল পণ্য',
  expired:         'মেয়াদোত্তীর্ণ',
  customer_reject: 'কাস্টমার অস্বীকার',
  other:           'অন্যান্য',
}

function ReturnCard({ rr, onComplete }) {
  const [open, setOpen] = useState(false)
  const st = STATUS_LABEL[rr.status] || {}
  const items = typeof rr.items === 'string' ? JSON.parse(rr.items) : (rr.items || [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-start justify-between gap-2"
        onClick={() => setOpen(v => !v)}>
        <div className="text-left flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">
              {rr.type === 'return' ? '↩️ রিটার্ন' : '🔄 রিপ্লেসমেন্ট'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${st.color}`}>
              {st.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {rr.shop_name || rr.customer_name} • {items.length}টি পণ্য
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(rr.created_at).toLocaleDateString('bn-BD')} •
            কারণ: {REASON_LABEL[rr.reason] || rr.reason}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-bold text-indigo-700 text-sm">
            ৳{parseFloat(rr.total_value).toLocaleString('bn-BD')}
          </span>
          {open ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
          {/* পণ্য তালিকা */}
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                <span className="text-gray-500">৳{parseFloat(item.subtotal || 0).toLocaleString('bn-BD')}</span>
              </div>
            ))}
          </div>

          {/* Manager নোট */}
          {rr.review_note && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500 font-semibold mb-0.5">ম্যানেজার নোট:</p>
              <p className="text-sm text-gray-700">{rr.review_note}</p>
            </div>
          )}

          {/* ছবি */}
          {rr.photos && JSON.parse(typeof rr.photos === 'string' ? rr.photos : JSON.stringify(rr.photos)).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {JSON.parse(typeof rr.photos === 'string' ? rr.photos : JSON.stringify(rr.photos)).map((p, i) => (
                <img key={i} src={p} alt="" className="w-16 h-16 object-cover rounded-xl border" />
              ))}
            </div>
          )}

          {/* Complete বাটন — approved হলে */}
          {rr.status === 'approved' && (
            <button onClick={() => onComplete(rr.id)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95">
              ✅ পণ্য ফেরত নিয়েছি — সম্পন্ন করুন
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReturnHistory() {
  const navigate = useNavigate()
  const now = new Date()

  const [returns,  setReturns]  = useState([])
  const [summary,  setSummary]  = useState({})
  const [loading,  setLoading]  = useState(true)
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [status,   setStatus]   = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ year, month })
      if (status) params.append('status', status)
      const res = await api.get(`/return/my?${params}`)
      setReturns(res.data?.data || [])
      setSummary(res.data?.summary || {})
    } catch { toast.error('তথ্য লোড হয়নি।') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year, month, status])

  const handleComplete = async (id) => {
    try {
      await api.patch(`/return/${id}/complete`)
      toast.success('সম্পন্ন হয়েছে!')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।')
    }
  }

  const months = ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে']

  return (
    <div className="max-w-lg mx-auto pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
            <FiArrowLeft className="text-xl text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800">রিটার্ন ইতিহাস</h1>
            <p className="text-xs text-gray-400">{summary.total || 0}টি রিকোয়েস্ট</p>
          </div>
        </div>
        <button onClick={() => navigate('/worker/return-form')}
          className="flex items-center gap-1 bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-xl">
          <FiPlus /> নতুন
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* ফিল্টার */}
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
            {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
            <option value="">সব</option>
            <option value="pending">অপেক্ষমাণ</option>
            <option value="approved">অনুমোদিত</option>
            <option value="rejected">বাতিল</option>
            <option value="completed">সম্পন্ন</option>
          </select>
        </div>

        {/* Summary */}
        {summary.total > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'মোট',      value: summary.total,     color: 'text-gray-700' },
              { label: 'অপেক্ষা', value: summary.pending,   color: 'text-yellow-600' },
              { label: 'অনুমোদ', value: summary.approved,  color: 'text-green-600' },
              { label: 'বাতিল',  value: summary.rejected,  color: 'text-red-500' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-2 text-center">
                <p className={`font-bold text-lg ${s.color}`}>{s.value || 0}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
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
            <p className="font-semibold">কোনো রিটার্ন রিকোয়েস্ট নেই</p>
            <button onClick={() => navigate('/worker/return-form')}
              className="mt-4 text-indigo-600 font-semibold text-sm">
              + নতুন রিকোয়েস্ট দিন
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map(rr => (
              <ReturnCard key={rr.id} rr={rr} onComplete={handleComplete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
