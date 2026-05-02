import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { FiRefreshCw, FiFilter, FiUser } from 'react-icons/fi'

const TXN = {
  order_in:   { label: 'অর্ডার নেওয়া', color: '#2563eb', bg: '#eff6ff', sign: '+' },
  sale_out:   { label: 'বিক্রয়',        color: '#16a34a', bg: '#f0fdf4', sign: '−' },
  return_out: { label: 'ফেরত/ঘাটতি',   color: '#d97706', bg: '#fffbeb', sign: '−' },
  adjustment: { label: 'সংশোধন',        color: '#7c3aed', bg: '#f5f3ff', sign: '±' },
}

function TxnRow({ row }) {
  const t   = TXN[row.txn_type] || { label: row.txn_type, color: '#6b7280', bg: '#f9fafb', sign: '' }
  const qty = parseInt(row.qty || 0)
  const dt  = new Date(row.created_at)

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: t.bg, color: t.color }}>{t.sign}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{row.product_name}</p>
        <p className="text-xs text-gray-400">{t.label} · {row.note || ''}</p>
        {row.done_by && <p className="text-[10px] text-gray-300">👤 {row.done_by}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold" style={{ color: t.color }}>{t.sign}{qty} পিস</p>
        <p className="text-[10px] text-gray-400">
          {dt.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })}
        </p>
      </div>
    </div>
  )
}

export default function SRLedger() {
  const today   = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [workers,    setWorkers]    = useState([])
  const [workerId,   setWorkerId]   = useState('')
  const [rows,       setRows]       = useState([])
  const [summary,    setSummary]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [from,       setFrom]       = useState(weekAgo)
  const [to,         setTo]         = useState(today)
  const [tab,        setTab]        = useState('txn')
  const [adjustMode, setAdjustMode] = useState(false)
  const [adjForm,    setAdjForm]    = useState({ product_id: '', product_name: '', qty: '', direction: '1', note: '' })

  // SR তালিকা আনো
  useEffect(() => {
    api.get('/employees?role=worker&limit=100')
      .then(r => setWorkers(r.data.data || r.data.employees || []))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (!workerId) return
    setLoading(true)
    try {
      const res = await api.get('/ledger/history', { params: { worker_id: workerId, from, to } })
      setRows(res.data.data || [])
      setSummary(res.data.summary || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [workerId, from, to])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdjust = async () => {
    if (!workerId || !adjForm.product_id || !adjForm.qty) return
    try {
      await api.post('/ledger/adjust', {
        worker_id:    parseInt(workerId),
        product_id:   parseInt(adjForm.product_id),
        product_name: adjForm.product_name,
        qty:          parseInt(adjForm.qty),
        direction:    parseInt(adjForm.direction),
        note:         adjForm.note,
      })
      setAdjustMode(false)
      setAdjForm({ product_id: '', product_name: '', qty: '', direction: '1', note: '' })
      fetchData()
    } catch (err) {
      alert('সংশোধন ব্যর্থ হয়েছে')
    }
  }

  const selectedWorker = workers.find(w => String(w.id) === String(workerId))

  return (
    <div className="p-4 space-y-4 pb-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-base">SR স্টক লেজার</h2>
          <p className="text-xs text-gray-400">পণ্য ইতিহাস ও সংশোধন</p>
        </div>
        <button onClick={fetchData} className="w-9 h-9 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-400">
          <FiRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* SR সিলেক্ট */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FiUser size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-600">SR সিলেক্ট করুন</span>
        </div>
        <select value={workerId} onChange={e => setWorkerId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
          <option value="">-- SR বেছে নিন --</option>
          {workers.map(w => (
            <option key={w.id} value={w.id}>{w.name_bn || w.name} ({w.phone})</option>
          ))}
        </select>

        {/* তারিখ */}
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
              দেখুন
            </button>
          </div>
        </div>
      </div>

      {/* SR এর হাতে এখন */}
      {workerId && summary.length > 0 && (
        <div className="bg-blue-50 rounded-2xl p-3 space-y-2">
          <p className="text-xs font-bold text-blue-700">
            {selectedWorker?.name_bn} এর হাতে এখন:
          </p>
          {summary.filter(s => s.in_hand > 0).length === 0 ? (
            <p className="text-xs text-blue-400">হাতে কিছু নেই</p>
          ) : (
            summary.filter(s => s.in_hand > 0).map(s => (
              <div key={s.product_id} className="flex justify-between items-center bg-white rounded-xl px-3 py-2">
                <span className="text-sm text-gray-700">{s.product_name}</span>
                <span className="text-sm font-bold text-orange-600">{s.in_hand} পিস</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ম্যানুয়াল সংশোধন বাটন */}
      {workerId && (
        <button onClick={() => setAdjustMode(!adjustMode)}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition-all ${
            adjustMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
          {adjustMode ? '✕ বাতিল করুন' : '✏️ ম্যানুয়াল সংশোধন'}
        </button>
      )}

      {/* সংশোধন ফর্ম */}
      {adjustMode && (
        <div className="bg-purple-50 rounded-2xl border border-purple-100 p-4 space-y-3">
          <p className="text-sm font-bold text-purple-700">স্টক সংশোধন</p>
          <input placeholder="পণ্য ID" type="number" value={adjForm.product_id}
            onChange={e => setAdjForm(p => ({...p, product_id: e.target.value}))}
            className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <input placeholder="পণ্যের নাম" value={adjForm.product_name}
            onChange={e => setAdjForm(p => ({...p, product_name: e.target.value}))}
            className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <div className="flex gap-2">
            <input placeholder="পরিমাণ" type="number" value={adjForm.qty}
              onChange={e => setAdjForm(p => ({...p, qty: e.target.value}))}
              className="flex-1 border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <select value={adjForm.direction} onChange={e => setAdjForm(p => ({...p, direction: e.target.value}))}
              className="border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
              <option value="1">+ যোগ</option>
              <option value="-1">− বিয়োগ</option>
            </select>
          </div>
          <input placeholder="কারণ লিখুন" value={adjForm.note}
            onChange={e => setAdjForm(p => ({...p, note: e.target.value}))}
            className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <button onClick={handleAdjust}
            className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold">
            সংশোধন করুন
          </button>
        </div>
      )}

      {/* Tabs */}
      {workerId && (
        <>
          <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
            <button onClick={() => setTab('txn')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'txn' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              লেনদেন ({rows.length})
            </button>
            <button onClick={() => setTab('summary')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              পণ্য ({summary.length})
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-white rounded-xl animate-pulse" />)}
            </div>
          ) : tab === 'txn' ? (
            rows.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-10 text-center">
                <p className="text-gray-400 text-sm">কোনো লেনদেন নেই</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 px-4">
                {rows.map(row => <TxnRow key={row.id} row={row} />)}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {summary.map(item => (
                <div key={item.product_id} className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                  <div className="flex gap-4 mt-1.5 text-xs">
                    <span className="text-blue-600">+{item.total_in} নেওয়া</span>
                    <span className="text-emerald-600">−{item.total_out} বিক্রি/ফেরত</span>
                    <span className={`font-bold ${item.in_hand > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      হাতে: {item.in_hand}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!workerId && (
        <div className="bg-gray-50 rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">👆</p>
          <p className="text-gray-400 text-sm">উপর থেকে একজন SR বেছে নিন</p>
        </div>
      )}
    </div>
  )
}
