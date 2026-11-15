// frontend/src/pages/worker/SettlementHistory.jsx
//
// SR-এর আগের হিসাবের তালিকা (মাস ধরে) — যেকোনোটায় ট্যাপ করলে সম্পূর্ণ বিস্তারিত খোলে।

import { useEffect, useState } from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import SettlementDetailView, { STATUS } from './SettlementDetailView'

const taka = (n) => '৳' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const monthLabel = (y, m) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('bn-BD', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function SettlementHistory({ excludeId }) {
  const now = new Date(Date.now() + 6 * 60 * 60 * 1000)          // BD সময়
  const [ym, setYm]           = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 })
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId]   = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get('/settlements/my', { params: { year: ym.y, month: ym.m } })
      .then(r => { if (alive) setList(r.data.data || []) })
      .catch(() => { if (alive) setList([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [ym])

  const shift = (d) => setYm(({ y, m }) => {
    const t = new Date(Date.UTC(y, m - 1 + d, 1))
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }
  })
  const isCurrent = ym.y === now.getUTCFullYear() && ym.m === now.getUTCMonth() + 1
  const rows = list.filter(s => s.id !== excludeId)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">আমার জমা দেওয়া হিসাব</p>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><FiChevronLeft size={14} /></button>
          <span className="text-xs font-semibold text-gray-600 min-w-[90px] text-center">{monthLabel(ym.y, ym.m)}</span>
          <button onClick={() => shift(1)} disabled={isCurrent}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30"><FiChevronRight size={14} /></button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">এই মাসে কোনো জমা দেওয়া হিসাব নেই</p>
      ) : (
        <div className="space-y-2">
          {rows.map(s => {
            const st   = STATUS[s.status] || STATUS.pending
            const diff = parseFloat(s.cash_difference || 0)
            return (
              <button key={s.id} onClick={() => setOpenId(s.id)}
                      className="w-full text-left border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">
                    {new Date(String(s.settlement_date).slice(0, 10) + 'T00:00:00')
                      .toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <span>নগদ জমা <b className="text-primary">{taka(s.cash_collected)}</b></span>
                  <span>পার্থক্য <b className={diff < 0 ? 'text-red-600' : 'text-gray-700'}>{diff > 0 ? '+' : ''}{taka(diff)}</b></span>
                  {parseFloat(s.shortage_qty_value) > 0 &&
                    <span>ঘাটতি <b className="text-red-600">{taka(s.shortage_qty_value)}</b></span>}
                </div>
                <p className="text-[10px] text-primary mt-1">বিস্তারিত দেখুন →</p>
              </button>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!openId} onClose={() => setOpenId(null)} title="হিসাবের বিস্তারিত" size="lg">
        {openId && <SettlementDetailView settlementId={openId} />}
      </Modal>
    </div>
  )
}
