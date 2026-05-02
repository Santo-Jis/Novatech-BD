import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { FiArrowLeft, FiRefreshCw, FiFilter } from 'react-icons/fi'

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

const TXN = {
  order_in:   { label: 'অর্ডার নেওয়া', color: '#2563eb', bg: '#eff6ff',  sign: '+' },
  sale_out:   { label: 'বিক্রয়',        color: '#16a34a', bg: '#f0fdf4',  sign: '−' },
  return_out: { label: 'ফেরত/ঘাটতি',   color: '#d97706', bg: '#fffbeb',  sign: '−' },
  adjustment: { label: 'সংশোধন',        color: '#7c3aed', bg: '#f5f3ff',  sign: '±' },
}

function TxnRow({ row }) {
  const t   = TXN[row.txn_type] || { label: row.txn_type, color: '#6b7280', bg: '#f9fafb', sign: '' }
  const qty = parseInt(row.qty || 0)
  const dt  = new Date(row.created_at)
  const dateStr = dt.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
  const timeStr = dt.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: t.bg, color: t.color }}>
        {t.sign}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{row.product_name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{t.label} · {row.note || ''}</p>
        {row.done_by && (
          <p className="text-[10px] text-gray-300 mt-0.5">👤 {row.done_by}</p>
        )}
      </div>

      {/* Qty + Date */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold" style={{ color: t.color }}>
          {t.sign}{qty} পিস
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{dateStr}</p>
        <p className="text-[10px] text-gray-300">{timeStr}</p>
      </div>
    </div>
  )
}

function SummaryCard({ item }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100">
      <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="text-blue-600 font-medium">+{item.total_in} নেওয়া</span>
        <span className="text-emerald-600 font-medium">−{item.total_out} বিক্রি/ফেরত</span>
        <span className={`font-bold ${item.in_hand > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
          হাতে: {item.in_hand}
        </span>
      </div>
    </div>
  )
}

export default function LedgerHistory() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [rows,    setRows]    = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [from,    setFrom]    = useState(weekAgo)
  const [to,      setTo]      = useState(today)
  const [tab,     setTab]     = useState('txn') // txn | summary

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/ledger/history', { params: { from, to } })
      setRows(res.data.data || [])
      setSummary(res.data.summary || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-500">
          <FiArrowLeft size={16} />
        </button>
        <div>
          <h2 className="font-bold text-gray-800 text-base">স্টক ইতিহাস</h2>
          <p className="text-xs text-gray-400">{rows.length}টি এন্ট্রি</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3">
        <div className="flex items-center gap-2 mb-2">
          <FiFilter size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-600">তারিখ ফিল্টার</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 mb-1">শুরু</p>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 mb-1">শেষ</p>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary" />
          </div>
          <div className="flex items-end">
            <button onClick={fetchData}
              className="h-9 px-3 bg-primary text-white rounded-xl text-xs font-semibold">
              খুঁজুন
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        <button onClick={() => setTab('txn')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'txn' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
          লেনদেন ({rows.length})
        </button>
        <button onClick={() => setTab('summary')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
          পণ্য সারসংক্ষেপ ({summary.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}
        </div>
      ) : tab === 'txn' ? (
        rows.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-10 text-center">
            <p className="text-gray-400 text-sm">এই সময়ে কোনো লেনদেন নেই</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 px-4">
            {rows.map(row => <TxnRow key={row.id} row={row} />)}
          </div>
        )
      ) : (
        summary.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-10 text-center">
            <p className="text-gray-400 text-sm">কোনো তথ্য নেই</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map(item => <SummaryCard key={item.product_id} item={item} />)}
          </div>
        )
      )}
    </div>
  )
}
