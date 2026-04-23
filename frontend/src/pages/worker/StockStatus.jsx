import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { FiRefreshCw, FiPackage, FiShoppingBag, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

// ── Progress bar component ─────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Single product row ─────────────────────────────────────
function ProductRow({ item, index }) {
  const soldPct    = item.ordered_qty > 0 ? Math.round((item.sold_qty / item.ordered_qty) * 100) : 0
  const inHandPct  = item.ordered_qty > 0 ? Math.round((item.in_hand_qty / item.ordered_qty) * 100) : 0
  const allSold    = item.in_hand_qty === 0 && item.sold_qty > 0
  const noneSold   = item.sold_qty === 0

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all ${
      allSold ? 'border-emerald-200' : noneSold ? 'border-gray-100' : 'border-amber-100'
    }`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
              allSold ? 'bg-emerald-100 text-emerald-600' :
              noneSold ? 'bg-gray-100 text-gray-400' :
              'bg-amber-100 text-amber-600'
            }`}>
              {index + 1}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-800 leading-tight truncate">{item.product_name}</p>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">৳{item.price.toLocaleString()} / পিস</p>
            </div>
          </div>

          {/* Status badge */}
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${
            allSold  ? 'bg-emerald-100 text-emerald-700' :
            noneSold ? 'bg-gray-100 text-gray-500' :
            'bg-amber-100 text-amber-700'
          }`}>
            {allSold ? '✅ শেষ' : noneSold ? '○ শুরু হয়নি' : `${soldPct}% বিক্রি`}
          </div>
        </div>

        {/* 3-column counts */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {/* অর্ডার */}
          <div className="bg-blue-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-blue-500 font-medium mb-0.5">অর্ডার</p>
            <p className="text-lg font-bold text-blue-700 leading-none">{item.ordered_qty}</p>
            <p className="text-[9px] text-blue-400 mt-0.5">পিস</p>
          </div>

          {/* বিক্রি */}
          <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-emerald-500 font-medium mb-0.5">বিক্রি</p>
            <p className="text-lg font-bold text-emerald-700 leading-none">{item.sold_qty}</p>
            <p className="text-[9px] text-emerald-400 mt-0.5">পিস</p>
          </div>

          {/* হাতে */}
          <div className={`rounded-xl p-2.5 text-center ${
            item.in_hand_qty > 0 ? 'bg-orange-50' : 'bg-gray-50'
          }`}>
            <p className={`text-[10px] font-medium mb-0.5 ${item.in_hand_qty > 0 ? 'text-orange-500' : 'text-gray-400'}`}>হাতে</p>
            <p className={`text-lg font-bold leading-none ${item.in_hand_qty > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
              {item.in_hand_qty}
            </p>
            <p className={`text-[9px] mt-0.5 ${item.in_hand_qty > 0 ? 'text-orange-400' : 'text-gray-300'}`}>পিস</p>
          </div>
        </div>

        {/* Progress bars */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10 text-right flex-shrink-0">বিক্রি</span>
            <div className="flex-1">
              <MiniBar value={item.sold_qty} max={item.ordered_qty} color="bg-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-600 w-8 text-right">{soldPct}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10 text-right flex-shrink-0">হাতে</span>
            <div className="flex-1">
              <MiniBar value={item.in_hand_qty} max={item.ordered_qty} color="bg-orange-300" />
            </div>
            <span className="text-[10px] font-semibold text-orange-500 w-8 text-right">{inHandPct}%</span>
          </div>
        </div>

        {/* Amount row */}
        {item.price > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-50 flex justify-between text-xs">
            <span className="text-gray-400">বিক্রয় মূল্য</span>
            <span className="font-bold text-emerald-600">
              ৳{(item.sold_qty * item.price).toLocaleString('en', { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function StockStatus() {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [filter,     setFilter]     = useState('all') // all | remaining | sold

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await api.get('/orders/stock-status')
      setData(res.data)
      setLastUpdate(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Auto refresh প্রতি ২ মিনিটে
  useEffect(() => {
    const t = setInterval(() => fetchStatus(true), 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [fetchStatus])

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  // অনুমোদিত অর্ডার নেই
  if (!data?.has_approved_order) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] gap-4 animate-fade-in">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-4xl">📦</div>
        <div className="text-center">
          <p className="font-bold text-gray-700 text-base">আজকের অনুমোদিত অর্ডার নেই</p>
          <p className="text-sm text-gray-400 mt-1">ম্যানেজার অনুমোদ দিলে এখানে স্টক দেখাবে।</p>
        </div>
        <button
          onClick={() => fetchStatus(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          রিফ্রেশ করুন
        </button>
      </div>
    )
  }

  const summary = data.summary || {}
  const items   = data.items   || []

  const filteredItems = filter === 'remaining'
    ? items.filter(i => i.in_hand_qty > 0)
    : filter === 'sold'
    ? items.filter(i => i.sold_qty > 0)
    : items

  const overallPct = summary.total_ordered > 0
    ? Math.round((summary.total_sold / summary.total_ordered) * 100)
    : 0

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-base">স্টক অবস্থা</h2>
          {lastUpdate && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              আপডেট: {lastUpdate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchStatus(true)}
          className={`w-9 h-9 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-500 shadow-sm ${refreshing ? 'opacity-50' : ''}`}
          disabled={refreshing}
        >
          <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-gradient-to-br from-primary to-primary-light rounded-2xl p-4 text-white shadow-lg">
        {/* Overall progress */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/80 text-sm font-medium">আজকের বিক্রয় অগ্রগতি</p>
          <p className="text-2xl font-bold">{overallPct}%</p>
        </div>
        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-white rounded-full transition-all duration-700"
            style={{ width: `${overallPct}%` }}
          />
        </div>

        {/* 3 columns */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-white/70 text-[10px] font-medium mb-1">মোট অর্ডার</p>
            <p className="text-xl font-bold text-white">{summary.total_ordered}</p>
            <p className="text-white/60 text-[9px] mt-0.5">পিস</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-white/70 text-[10px] font-medium mb-1">বিক্রি হয়েছে</p>
            <p className="text-xl font-bold text-white">{summary.total_sold}</p>
            <p className="text-white/60 text-[9px] mt-0.5">পিস</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-white/70 text-[10px] font-medium mb-1">হাতে আছে</p>
            <p className="text-xl font-bold text-white">{summary.total_in_hand}</p>
            <p className="text-white/60 text-[9px] mt-0.5">পিস</p>
          </div>
        </div>

        {/* Amount row */}
        <div className="mt-3 pt-3 border-t border-white/20 grid grid-cols-2 gap-3">
          <div>
            <p className="text-white/60 text-[10px]">বিক্রয় মূল্য</p>
            <p className="text-sm font-bold text-white">৳{Math.round(summary.sold_amount || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-white/60 text-[10px]">হাতে মূল্য</p>
            <p className="text-sm font-bold text-white">৳{Math.round(summary.in_hand_amount || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        {[
          { key: 'all',       label: `সব (${items.length})` },
          { key: 'remaining', label: `হাতে (${items.filter(i => i.in_hand_qty > 0).length})` },
          { key: 'sold',      label: `বিক্রি (${items.filter(i => i.sold_qty > 0).length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              filter === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product list */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-sm">কোনো পণ্য নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item, idx) => (
            <ProductRow key={item.product_id} item={item} index={idx} />
          ))}
        </div>
      )}

      {/* Order info footer */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
        <p className="text-[10px] text-gray-400">অর্ডার #{data.order_id} • অনুমোদিত: {
          data.approved_at
            ? new Date(data.approved_at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
            : '—'
        }</p>
      </div>
    </div>
  )
}
