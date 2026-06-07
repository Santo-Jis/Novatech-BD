// frontend/src/pages/manager/PortalReturnRequests.jsx
// Manager: Customer Portal থেকে আসা Return Requests দেখা ও Approve/Reject করা
// Backend: /api/admin/portal-returns (manager already allowed)

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiRefreshCw, FiArrowLeft, FiCheckCircle, FiXCircle,
         FiPackage, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

const STATUS_OPTIONS = [
  { value: '',          label: 'সব'         },
  { value: 'pending',   label: '⏳ পেন্ডিং' },
  { value: 'approved',  label: '✅ অনুমোদিত' },
  { value: 'rejected',  label: '❌ বাতিল'    },
  { value: 'completed', label: '📦 সম্পন্ন'  },
]

const STATUS_STYLE = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
}

function ReturnCard({ item, onAction }) {
  const [expanded,  setExpanded]  = useState(false)
  const [note,      setNote]      = useState('')
  const [acting,    setActing]    = useState(false)
  const items = typeof item.items === 'string' ? JSON.parse(item.items) : (item.items || [])

  const handleAction = async (action) => {
    if (!note.trim() && action !== 'complete') {
      toast.error('একটি নোট দিন')
      return
    }
    setActing(true)
    try {
      if (action === 'complete') {
        await api.patch(`/admin/portal-returns/${item.id}/complete`, { admin_note: note })
        toast.success('সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে')
      } else {
        await api.patch(`/admin/portal-returns/${item.id}/review`, { action, admin_note: note })
        toast.success(action === 'approve' ? 'অনুমোদিত হয়েছে' : 'বাতিল করা হয়েছে')
      }
      onAction()
    } catch {
      toast.error('কাজ সম্পন্ন হয়নি')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[item.status]}`}>
              {STATUS_OPTIONS.find(s => s.value === item.status)?.label || item.status}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(item.created_at).toLocaleDateString('bn-BD')}
            </span>
          </div>
          <p className="text-sm font-bold text-gray-800 truncate">{item.shop_name || item.customer_name}</p>
          <p className="text-xs text-gray-400">Invoice: {item.invoice_number || '—'}</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-gray-500">{items.length}টি পণ্য</span>
          {expanded ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
          {/* Items list */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">ফেরত পণ্যসমূহ</p>
            <div className="space-y-2">
              {items.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-white rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{p.product_name || p.name}</p>
                    <p className="text-xs text-gray-400">পরিমাণ: {p.quantity}</p>
                  </div>
                  {p.reason && <p className="text-xs text-gray-400 italic">"{p.reason}"</p>}
                </div>
              ))}
            </div>
          </div>

          {item.note && (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-700">কাস্টমারের নোট: {item.note}</p>
            </div>
          )}

          {item.admin_note && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-700">Manager-এর নোট: {item.admin_note}</p>
            </div>
          )}

          {/* Actions — only for pending */}
          {item.status === 'pending' && (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="সিদ্ধান্তের কারণ লিখুন..."
                rows={2}
                className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleAction('approve')}
                  loading={acting}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-xs py-2"
                >
                  <FiCheckCircle className="mr-1" /> অনুমোদন
                </Button>
                <Button
                  onClick={() => handleAction('reject')}
                  loading={acting}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-xs py-2"
                >
                  <FiXCircle className="mr-1" /> বাতিল
                </Button>
              </div>
            </div>
          )}

          {/* Complete action for approved */}
          {item.status === 'approved' && (
            <Button
              onClick={() => handleAction('complete')}
              loading={acting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-xs py-2"
            >
              <FiPackage className="mr-1" /> পণ্য হাতে পেয়েছি — সম্পন্ন করুন
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ManagerPortalReturnRequests() {
  const navigate    = useNavigate()
  const [status,  setStatus]   = useState('')
  const [data,    setData]     = useState([])
  const [loading, setLoading]  = useState(false)
  const [counts,  setCounts]   = useState({ pending: 0 })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = status ? `?status=${status}` : ''
      const res    = await api.get(`/admin/portal-returns${params}`)
      const rows   = res.data.data?.requests || res.data.data || []
      setData(rows)
      setCounts({ pending: rows.filter(r => r.status === 'pending').length })
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <FiArrowLeft className="text-xl" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-800">↩️ পোর্টাল রিটার্ন</h1>
            {counts.pending > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {counts.pending}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">Customer Portal থেকে আসা রিটার্ন রিকোয়েস্ট</p>
        </div>
        <button onClick={fetchData} className="text-gray-400 hover:text-primary">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter */}
      <Select
        label="স্ট্যাটাস"
        options={STATUS_OPTIONS}
        value={status}
        onChange={e => setStatus(e.target.value)}
      />

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FiRefreshCw className="text-4xl mx-auto mb-3 opacity-30" />
          <p className="text-sm">কোনো রিটার্ন রিকোয়েস্ট নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(item => (
            <ReturnCard key={item.id} item={item} onAction={fetchData} />
          ))}
        </div>
      )}
    </div>
  )
}
