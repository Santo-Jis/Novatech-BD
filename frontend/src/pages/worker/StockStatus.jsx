import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { FiRefreshCw, FiList } from 'react-icons/fi'

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function ProductCard({ item, index }) {
  const allSold  = item.in_hand_qty === 0 && item.sold_qty > 0
  const noneSold = item.sold_qty === 0
  const totalTaken = (item.total_in_qty || 0)

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${
      allSold ? 'border-emerald-200' : noneSold ? 'border-gray-100' : 'border-amber-100'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              allSold ? 'bg-emerald-100 text-emerald-600'
              : noneSold ? 'bg-gray-100 text-gray-400'
              : 'bg-amber-100 text-amber-600'
            }`}>{index + 1}</div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-800 truncate">{item.product_name}</p>
              <p className="text-xs text-gray-400 font-mono">{taka(item.price)} / পিস</p>
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${
            allSold  ? 'bg-emerald-100 text-emerald-700'
            : noneSold ? 'bg-gray-100 text-gray-500'
            : 'bg-amber-100 text-amber-700'
          }`}>
            {allSold ? '✅ শেষ' : noneSold ? '○ শুরু হয়নি' : `${item.sell_percent}% বিক্রি`}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-blue-500 font-medium mb-0.5">মোট নেওয়া</p>
            <p className="text-lg font-bold text-blue-700">{totalTaken}</p>
            <p className="text-[9px] text-blue-400">পিস</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-emerald-500 font-medium mb-0.5">বিক্রি</p>
            <p className="text-lg font-bold text-emerald-700">{item.sold_qty}</p>
            <p className="text-[9px] text-emerald-400">পিস</p>
          </div>
          <div className={`rounded-xl p-2.5 text-center ${item.in_hand_qty > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
            <p className={`text-[10px] font-medium mb-0.5 ${item.in_hand_qty > 0 ? 'text-orange-500' : 'text-gray-400'}`}>হাতে</p>
            <p className={`text-lg font-bold ${item.in_hand_qty > 0 ? 'text-orange-700' : 'text-gray-400'}`}>{item.in_hand_qty}</p>
            <p className={`text-[9px] ${item.in_hand_qty > 0 ? 'text-orange-400' : 'text-gray-300'}`}>পিস</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10 text-right">বিক্রি</span>
            <div className="flex-1"><MiniBar value={item.sold_qty} max={totalTaken} color="#16a34a" /></div>
            <span className="text-[10px] font-semibold text-emerald-600 w-8 text-right">{item.sell_percent}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10 text-right">হাতে</span>
            <div className="flex-1"><MiniBar value={item.in_hand_qty} max={totalTaken} color="#f97316" /></div>
            <span className="text-[10px] font-semibold text-orange-500 w-8 text-right">
              {totalTaken > 0 ? Math.round((item.in_hand_qty / totalTaken) * 100) : 0}%
            </span>
          </div>
        </div>

        {item.price > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-50 flex justify-between text-xs">
            <span className="text-gray-400">হাতে মূল্য</span>
            <span className="font-bold text-orange-600">{taka(item.in_hand_qty * item.price)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StockStatus() {
  const navigate = useNavigate()
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [filter,     setFilter]     = useState('all')

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await api.get('/ledger/stock')
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

  if (!data?.has_stock) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-4xl">📦</div>
        <div className="text-center">
          <p className="font-bold text-gray-700 text-base">হাতে কোনো পণ্য নেই</p>
          <p className="text-sm text-gray-400 mt-1">অর্ডার অনুমোদিত হলে এখানে দেখাবে।</p>
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

  const totalTaken = (summary.total_in_hand || 0) + (summary.total_sold || 0)
  const overallPct = totalTaken > 0 ? Math.round(((summary.total_sold || 0) / totalTaken) * 100) : 0

  return (
    <div className="p-4 space-y-4 pb-8">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/worker/ledger-history')}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold"
          >
            <FiList size={13} /> ইতিহাস
          </button>
          <button
            onClick={() => fetchStatus(true)}
            className={`w-9 h-9 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-500 shadow-sm ${refreshing ? 'opacity-50' : ''}`}
            disabled={refreshing}
          >
            <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-br from-primary to-primary-light rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/80 text-sm font-medium">বিক্রয় অগ্রগতি</p>
          <p className="text-2xl font-bold">{overallPct}%</p>
        </div>
        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'মোট নেওয়া', value: totalTaken },
            { label: 'বিক্রি হয়েছে', value: summary.total_sold },
            { label: 'হাতে আছে', value: summary.total_in_hand },
          ].map(col => (
            <div key={col.label} className="bg-white/15 rounded-xl p-3 text-center">
              <p className="text-white/70 text-[10px] font-medium mb-1">{col.label}</p>
              <p className="text-xl font-bold">{col.value ?? 0}</p>
              <p className="text-white/60 text-[9px] mt-0.5">পিস</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/20 grid grid-cols-2 gap-3">
          <div>
            <p className="text-white/60 text-[10px]">বিক্রয় মূল্য</p>
            <p className="text-sm font-bold">{taka(summary.sold_amount)}</p>
          </div>
          <div>
            <p className="text-white/60 text-[10px]">হাতে মূল্য</p>
            <p className="text-sm font-bold">{taka(summary.in_hand_amount)}</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        {[
          { key: 'all',       label: `সব (${items.length})` },
          { key: 'remaining', label: `হাতে (${items.filter(i => i.in_hand_qty > 0).length})` },
          { key: 'sold',      label: `বিক্রি (${items.filter(i => i.sold_qty > 0).length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              filter === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Products */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-sm">কোনো পণ্য নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item, idx) => (
            <ProductCard key={item.product_id} item={item} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
