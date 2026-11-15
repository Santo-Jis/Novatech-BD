// frontend/src/pages/worker/SettlementDetailView.jsx
//
// SR-এর নিজের জমা দেওয়া হিসাবের সম্পূর্ণ বিস্তারিত — ম্যানেজার যা দেখে, SR-ও তা-ই দেখে
// (শুধু পড়া)। GET /settlements/:id (SR শুধু নিজেরটা পায়)।

import { useEffect, useState } from 'react'
import api from '../../api/axios'
import SettlementBreakdown from '../manager/SettlementBreakdown'

const taka = (n) => '৳' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const bnDate = (d) => d
  ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
  : ''

export const STATUS = {
  approved: { label: '✅ অনুমোদিত',        cls: 'bg-emerald-100 text-emerald-700' },
  disputed: { label: '⚠️ ঘাটতি চিহ্নিত',    cls: 'bg-red-100 text-red-700' },
  pending:  { label: '⏳ অপেক্ষমান',        cls: 'bg-amber-100 text-amber-700' },
}

const Stat = ({ label, value, color = 'text-gray-800', bg = 'bg-gray-50' }) => (
  <div className={`${bg} rounded-xl p-3 text-center`}>
    <p className="text-[10px] text-gray-400">{label}</p>
    <p className={`text-base font-extrabold ${color}`}>{value}</p>
  </div>
)

export default function SettlementDetailView({ settlementId }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    api.get(`/settlements/${settlementId}`)
      .then(r => { if (alive) setData(r.data.data) })
      .catch(e => { if (alive) setError(e.response?.data?.message || 'বিস্তারিত আনতে সমস্যা হয়েছে') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [settlementId])

  if (loading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
  if (error)   return <p className="text-sm text-red-600 text-center py-6">{error}</p>
  if (!data)   return null

  const s     = data.settlement
  const items = Array.isArray(s.items_taken) ? s.items_taken : []
  const st    = STATUS[s.status] || STATUS.pending
  const diff  = parseFloat(s.cash_difference || 0)
  const short = parseFloat(s.shortage_qty_value || 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{bnDate(s.settlement_date)}</p>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="মোট বিক্রয়"  value={taka(s.total_sales_amount)} color="text-secondary" />
        <Stat label="নগদ জমা"     value={taka(s.cash_collected)}     color="text-primary" />
        <Stat label="বাকি দেওয়া"   value={taka(s.credit_given)}       color="text-amber-600" bg="bg-amber-50" />
        <Stat label="নগদ পার্থক্য"
              value={`${diff > 0 ? '+' : ''}${taka(diff)}`}
              color={diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-600' : 'text-gray-700'}
              bg={diff < 0 ? 'bg-red-50' : 'bg-gray-50'} />
      </div>

      {short > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-700">
          পণ্য ঘাটতি {taka(short)}
          {s.shortage_note && <span className="block text-[11px] text-red-500 mt-0.5">{s.shortage_note}</span>}
        </div>
      )}

      {(s.mismatch_explanation || s.manager_note) && (
        <div className="space-y-1.5">
          {s.mismatch_explanation && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-gray-400">আপনার ব্যাখ্যা</p>
              <p className="text-xs text-gray-700">{s.mismatch_explanation}</p>
            </div>
          )}
          {s.manager_note && (
            <div className="bg-blue-50 rounded-xl px-3 py-2">
              <p className="text-[10px] text-blue-400">ম্যানেজারের মন্তব্য{s.manager_name ? ` (${s.manager_name})` : ''}</p>
              <p className="text-xs text-blue-800">{s.manager_note}</p>
            </div>
          )}
        </div>
      )}

      {/* পণ্যভিত্তিক হিসাব */}
      {items.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <p className="text-xs font-bold text-gray-700 px-3 py-2.5 bg-gray-50">📦 পণ্যভিত্তিক হিসাব</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400">
                  {['পণ্য', 'হাতে ছিল', 'বিক্রি', 'ফেরত', 'হাতে থাকছে', 'ঘাটতি'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={`border-t border-gray-50 ${it.shortage_qty > 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-2 py-1.5 font-medium text-gray-700 min-w-[110px]">{it.name}</td>
                    <td className="px-2 py-1.5">{it.taken_qty}</td>
                    <td className="px-2 py-1.5 text-emerald-600">{it.sold_qty}</td>
                    <td className="px-2 py-1.5 text-blue-600">{it.returned_qty}</td>
                    <td className="px-2 py-1.5 text-violet-600 font-bold">{it.carry_forward_qty}</td>
                    <td className="px-2 py-1.5">{it.shortage_qty > 0
                      ? <span className="text-red-600 font-bold">{it.shortage_qty} ({taka(it.shortage_value)})</span>
                      : <span className="text-emerald-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-3 py-2 border-t border-gray-50">
            "হাতে ছিল" = জমার সময় আপনার স্টক (বিক্রি আগেই বাদ)। যা ফেরত দেননি তা "হাতে থাকছে" — আপনার স্টকেই আছে। বিক্রি শুধু তথ্য।
          </p>
        </div>
      )}

      {/* নগদ, দিনভিত্তিক, দোকানভিত্তিক, পণ্যের প্রবাহ, রিপ্লেস, রিটার্ন রসিদ */}
      <SettlementBreakdown breakdown={data.breakdown} />

      {data.shortage_payments?.length > 0 && (
        <div className="border border-gray-100 rounded-xl p-3">
          <p className="text-xs font-bold text-gray-700 mb-1.5">💳 ঘাটতির টাকা পরিশোধ</p>
          {data.shortage_payments.map(p => (
            <div key={p.id} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-500">{bnDate(p.created_at)}</span>
              <span className="font-semibold text-emerald-600">{taka(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
