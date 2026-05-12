// frontend/src/pages/manager/SalesOrderLedger.jsx
// Manager/Admin — Customer Order Requests Ledger
// Filter: status, route, date | Stock info | Approve/Reject | Admin notify

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiFilter, FiRefreshCw, FiCheck, FiX, FiAlertTriangle,
  FiBell, FiPackage, FiCalendar, FiMapPin, FiChevronDown,
  FiChevronUp, FiClock
} from 'react-icons/fi'

// ── Status config ────────────────────────────────────────────
const STATUS_MAP = {
  pending:   { label: 'অপেক্ষায়',   cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  confirmed: { label: 'কনফার্ম',    cls: 'bg-blue-100   text-blue-700   border-blue-200'   },
  assigned:  { label: 'SR অ্যাসাইন', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  delivered: { label: 'ডেলিভারি',   cls: 'bg-green-100  text-green-700  border-green-200'  },
  cancelled: { label: 'বাতিল',      cls: 'bg-red-100    text-red-700    border-red-200'    },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ── Single Order Card ────────────────────────────────────────
function OrderCard({ order, onUpdate, onStockWarn, processing }) {
  const [expanded, setExpanded] = useState(false)
  const [noteModal, setNoteModal] = useState(null) // 'confirm' | 'cancel'
  const [note, setNote] = useState('')
  const [warning, setWarning] = useState(false)

  const dt = new Date(order.created_at)
  const dateStr = dt.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })

  const items = Array.isArray(order.items) ? order.items : []
  const lowStockItems = items.filter(i => !i.stock_ok)

  const handleAction = async (status) => {
    if (status === 'confirmed' || status === 'cancelled') {
      setNoteModal(status)
    } else {
      await onUpdate(order.id, { status }, order.customer_id)
    }
  }

  const submitWithNote = async () => {
    await onUpdate(order.id, { status: noteModal, admin_note: note }, order.customer_id)
    setNoteModal(null)
    setNote('')
  }

  const handleStockWarn = async () => {
    setWarning(true)
    await onStockWarn(order.id, lowStockItems)
    setWarning(false)
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden
      ${order.has_stock_issue ? 'border-orange-200' : 'border-gray-100'}`}>

      {/* Stock warning banner */}
      {order.has_stock_issue && (
        <div className="flex items-center justify-between gap-2 bg-orange-50 px-4 py-2 border-b border-orange-100">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="text-orange-500 flex-shrink-0" size={14} />
            <p className="text-xs text-orange-700 font-medium">
              {lowStockItems.length}টি পণ্যের স্টক কম
            </p>
          </div>
          <button
            onClick={handleStockWarn}
            disabled={warning || processing[order.id]}
            className="flex items-center gap-1 text-[11px] font-semibold bg-orange-500 text-white px-2.5 py-1 rounded-lg disabled:opacity-60"
          >
            <FiBell size={11} />
            {warning ? 'পাঠানো হচ্ছে...' : 'Admin জানান'}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-800 truncate">{order.shop_name}</p>
            <p className="text-xs text-gray-500">{order.customer_code} • {order.owner_name}</p>
            {order.route_name && (
              <div className="flex items-center gap-1 mt-0.5">
                <FiMapPin size={10} className="text-gray-400" />
                <p className="text-[11px] text-gray-400">{order.route_name}</p>
              </div>
            )}
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 mt-2">
          <FiClock size={11} className="text-gray-400" />
          <p className="text-[11px] text-gray-400">{dateStr} {timeStr}</p>
        </div>

        {/* Items summary */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between mt-3 pt-3 border-t border-gray-50"
        >
          <div className="flex items-center gap-1.5">
            <FiPackage size={13} className="text-gray-500" />
            <span className="text-sm text-gray-700 font-medium">{items.length}টি পণ্য</span>
          </div>
          {expanded ? <FiChevronUp size={14} className="text-gray-400" /> : <FiChevronDown size={14} className="text-gray-400" />}
        </button>

        {/* Expanded items */}
        {expanded && (
          <div className="mt-2 space-y-2">
            {items.map((item, i) => (
              <div key={i} className={`flex items-center justify-between rounded-xl px-3 py-2
                ${item.stock_ok ? 'bg-gray-50' : 'bg-orange-50 border border-orange-100'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-500">চাহিদা: {item.qty} পিস</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-bold ${item.stock_ok ? 'text-green-600' : 'text-orange-600'}`}>
                    {item.stock_ok ? '✅' : '⚠️'} স্টক: {item.available_stock}
                  </p>
                  {!item.stock_ok && (
                    <p className="text-[10px] text-orange-500">
                      ঘাটতি: {item.qty - item.available_stock}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {order.note && (
              <div className="bg-blue-50 rounded-xl px-3 py-2 mt-1">
                <p className="text-xs text-blue-600">📝 {order.note}</p>
              </div>
            )}
            {order.admin_note && (
              <div className="bg-purple-50 rounded-xl px-3 py-2">
                <p className="text-xs text-purple-600">👤 ম্যানেজার নোট: {order.admin_note}</p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons — pending only */}
        {order.status === 'pending' && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
            <button
              onClick={() => handleAction('confirmed')}
              disabled={processing[order.id]}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              <FiCheck size={14} /> অনুমোদন
            </button>
            <button
              onClick={() => handleAction('cancelled')}
              disabled={processing[order.id]}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-100 text-red-600 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              <FiX size={14} /> বাতিল
            </button>
          </div>
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={e => e.target === e.currentTarget && setNoteModal(null)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-4">
            <h3 className="font-bold text-lg">
              {noteModal === 'confirmed' ? '✅ অর্ডার অনুমোদন' : '❌ অর্ডার বাতিল'}
            </h3>
            <p className="text-sm text-gray-500">{order.shop_name} — {items.length}টি পণ্য</p>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">নোট (ঐচ্ছিক)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={noteModal === 'confirmed' ? 'কোনো নির্দেশনা থাকলে লিখুন...' : 'বাতিলের কারণ লিখুন...'}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm">
                বাতিল
              </button>
              <button
                onClick={submitWithNote}
                disabled={processing[order.id]}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-60
                  ${noteModal === 'confirmed' ? 'bg-green-500' : 'bg-red-500'}`}
              >
                {processing[order.id] ? 'হচ্ছে...' : 'নিশ্চিত করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function SalesOrderLedger() {
  const today   = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [orders,     setOrders]     = useState([])
  const [routes,     setRoutes]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [processing, setProcessing] = useState({})
  const [total,      setTotal]      = useState(0)
  const [showFilter, setShowFilter] = useState(false)

  const [filters, setFilters] = useState({
    status:   'pending',
    route_id: '',
    from:     weekAgo,
    to:       today,
  })

  // রুট তালিকা
  useEffect(() => {
    api.get('/routes').then(r => setRoutes(r.data.data || [])).catch(() => {})
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...filters }
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
      const res = await api.get('/customer-order-requests', { params })
      setOrders(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleUpdate = async (id, body, customerId) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/customer-order-requests/${id}`, body)
      toast.success(body.status === 'confirmed' ? '✅ অর্ডার অনুমোদন হয়েছে।' : '❌ অর্ডার বাতিল হয়েছে।')
      fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const handleStockWarn = async (id, lowItems) => {
    try {
      await api.post(`/customer-order-requests/${id}/stock-warning`, { items: lowItems })
      toast.success('⚠️ Admin কে স্টক সতর্কতা পাঠানো হয়েছে।')
    } catch {
      toast.error('সতর্কতা পাঠাতে সমস্যা হয়েছে।')
    }
  }

  const stockIssueCount = orders.filter(o => o.has_stock_issue).length

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">অর্ডার লেজার</h2>
          <p className="text-xs text-gray-500">মোট {total}টি অর্ডার</p>
        </div>
        <div className="flex items-center gap-2">
          {stockIssueCount > 0 && (
            <span className="flex items-center gap-1 bg-orange-100 text-orange-600 border border-orange-200 text-xs font-bold px-2.5 py-1 rounded-full">
              ⚠️ {stockIssueCount} স্টক সমস্যা
            </span>
          )}
          <button onClick={() => setShowFilter(v => !v)}
            className={`p-2 rounded-xl border text-sm ${showFilter ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 text-gray-600'}`}>
            <FiFilter size={16} />
          </button>
          <button onClick={fetchOrders} disabled={loading}
            className="p-2 rounded-xl border border-gray-200 bg-white text-gray-600">
            <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          {/* Status tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { v: 'pending',   l: 'অপেক্ষায়' },
              { v: 'confirmed', l: 'কনফার্ম' },
              { v: 'delivered', l: 'ডেলিভারি' },
              { v: 'cancelled', l: 'বাতিল' },
              { v: 'all',       l: 'সব' },
            ].map(s => (
              <button key={s.v}
                onClick={() => setFilters(f => ({ ...f, status: s.v }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors
                  ${filters.status === s.v ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {s.l}
              </button>
            ))}
          </div>

          {/* Route filter */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
              <FiMapPin size={11} /> রুট
            </label>
            <select
              value={filters.route_id}
              onChange={e => setFilters(f => ({ ...f, route_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">সব রুট</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                <FiCalendar size={11} /> শুরু
              </label>
              <input type="date" value={filters.from}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                <FiCalendar size={11} /> শেষ
              </label>
              <input type="date" value={filters.to}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FiPackage className="text-5xl mx-auto mb-3" />
          <p className="font-medium">কোনো অর্ডার নেই</p>
          <p className="text-xs mt-1">ফিল্টার পরিবর্তন করে আবার দেখুন</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdate={handleUpdate}
              onStockWarn={handleStockWarn}
              processing={processing}
            />
          ))}
        </div>
      )}
    </div>
  )
}
