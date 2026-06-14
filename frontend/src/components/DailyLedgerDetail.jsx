// DailyLedgerDetail.jsx
// SR মাসিক লেজার — বিভাগ ২: একটি দিনের বিস্তারিত (এক্সপ্যান্ড করলে)
// দোকান-ভিত্তিক বিক্রয় (৭) + পণ্য চলাচল/ফেরত (৮) + ভিজিট (১০) + খরচ (৯) + উপস্থিতি (১৩)
// Usage: <DailyLedgerDetail date="2026-04-03" />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import {
  FiClock, FiMapPin, FiShoppingBag, FiPackage, FiCreditCard
} from 'react-icons/fi'

const fmt = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

const ATT_STATUS = {
  present: { label: 'উপস্থিত',   icon: '✅', cls: 'text-emerald-600' },
  late:    { label: 'দেরি',       icon: '⚠️', cls: 'text-amber-600' },
  absent:  { label: 'অনুপস্থিত', icon: '❌', cls: 'text-red-500' },
}

const RETURN_TYPE = {
  return:      { label: 'ফেরত',        cls: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
  replacement: { label: 'রিপ্লেসমেন্ট', cls: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function DailyLedgerDetail({ date }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get(`/monthly-ledger/daily/${date}`)
      .then(res => { if (active) setData(res.data.data) })
      .catch(() => { if (active) setData(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date])

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-2 bg-gray-50/60 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 py-4 text-xs text-gray-400 text-center bg-gray-50/60 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700">
        তথ্য লোড করা যায়নি।
      </div>
    )
  }

  const { shops, stock, returns, visits, expense, attendance } = data
  const att = attendance ? (ATT_STATUS[attendance.status] || { label: attendance.status, icon: '•', cls: 'text-gray-500' }) : null

  const hasAnything = (shops?.length) || (stock?.length) || (visits?.total > 0) || expense || attendance

  return (
    <div className="px-4 py-4 space-y-4 bg-gray-50/60 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700">

      {/* ১৩. উপস্থিতি / চেক-ইন-আউট */}
      {attendance && (
        <Section icon={<FiClock size={13} />} title="উপস্থিতি">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`flex items-center gap-1 font-medium ${att.cls}`}>{att.icon} {att.label}</span>
            {attendance.check_in  && <span className="text-gray-500 dark:text-gray-400">ইন: {attendance.check_in.slice(0, 5)}</span>}
            {attendance.check_out && <span className="text-gray-500 dark:text-gray-400">আউট: {attendance.check_out.slice(0, 5)}</span>}
            {attendance.late_minutes > 0 && (
              <span className="text-amber-600">দেরি {fmt(attendance.late_minutes)} মিনিট</span>
            )}
          </div>
          {attendance.deduction > 0 && (
            <p className="text-[11px] text-red-500 mt-1">উপস্থিতি কর্তন: ৳{fmt(attendance.deduction)}</p>
          )}
        </Section>
      )}

      {/* ১০. ভিজিট / রুট রিপোর্ট */}
      {visits?.total > 0 && (
        <Section icon={<FiMapPin size={13} />} title="ভিজিট">
          <div className="flex gap-3 text-xs mb-1.5">
            <span className="text-gray-600 dark:text-gray-300">মোট <b>{fmt(visits.total)}</b></span>
            <span className="text-emerald-600">বিক্রি <b>{fmt(visits.sold)}</b></span>
            {visits.not_sold > 0 && (
              <span className="text-gray-400">বিক্রি হয়নি <b>{fmt(visits.not_sold)}</b></span>
            )}
          </div>
          {visits.no_sale_list?.length > 0 && (
            <div className="space-y-1">
              {visits.no_sale_list.map((v, i) => (
                <p key={i} className="text-[11px] text-gray-400 dark:text-gray-500">
                  • {v.shop_name} — {v.reason || 'কারণ উল্লেখ নেই'}
                </p>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ৭. দোকান-ভিত্তিক বিক্রয় */}
      {shops?.length > 0 && (
        <Section icon={<FiShoppingBag size={13} />} title="দোকান-ভিত্তিক বিক্রয়">
          <div className="space-y-2">
            {shops.map(shop => (
              <div key={shop.id} className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{shop.shop_name}</span>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-100 flex-shrink-0 ml-2">৳{fmt(shop.total)}</span>
                </div>
                {shop.items.length > 0 && (
                  <div className="space-y-0.5">
                    {shop.items.map((it, i) => (
                      <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between gap-2">
                        <span className="truncate">{it.product_name} × {fmt(it.qty)}</span>
                        <span className="flex-shrink-0">৳{fmt(it.subtotal)}</span>
                      </p>
                    ))}
                  </div>
                )}
                {(shop.cash > 0 || shop.due > 0) && (
                  <div className="flex gap-3 mt-1.5 pt-1.5 border-t border-gray-50 dark:border-slate-700 text-[11px]">
                    {shop.cash > 0 && <span className="text-emerald-600">নগদ ৳{fmt(shop.cash)}</span>}
                    {shop.due  > 0 && <span className="text-red-500">বাকি ৳{fmt(shop.due)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ৮. পণ্য চলাচল ও ফেরত */}
      {stock?.length > 0 && (
        <Section icon={<FiPackage size={13} />} title="পণ্য চলাচল">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="grid grid-cols-4 px-2.5 py-1.5 text-[10px] text-gray-400 border-b border-gray-50 dark:border-slate-700">
              <span className="col-span-2">প্রোডাক্ট</span>
              <span className="text-right">নিল/বিক্রি</span>
              <span className="text-right">ফেরত</span>
            </div>
            {stock.map((s, i) => (
              <div key={i} className="grid grid-cols-4 px-2.5 py-1.5 text-[11px] border-b border-gray-50 dark:border-slate-700 last:border-0">
                <span className="col-span-2 text-gray-700 dark:text-gray-200 truncate">{s.product_name}</span>
                <span className="text-right text-gray-500 dark:text-gray-400">{fmt(s.taken)}/{fmt(s.sold)}</span>
                <span className={`text-right ${s.returned > 0 ? 'text-orange-600 font-medium' : 'text-gray-300 dark:text-gray-600'}`}>
                  {fmt(s.returned)}
                </span>
              </div>
            ))}
          </div>
          {returns?.length > 0 && (
            <div className="mt-2 space-y-1">
              {returns.map((r, i) => {
                const rt = RETURN_TYPE[r.type] || { label: r.type, cls: 'text-gray-600 bg-gray-50 dark:bg-slate-700' }
                return (
                  <p key={i} className={`text-[11px] rounded-lg px-2 py-1.5 ${rt.cls}`}>
                    <span className="font-medium">{rt.label}</span> — {r.reason}{r.note ? ` (${r.note})` : ''} · ৳{fmt(r.total_value)}
                  </p>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {/* ৯. দৈনিক খরচ */}
      {expense && (
        <Section icon={<FiCreditCard size={13} />} title="দৈনিক খরচ">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs">
              <div className="flex flex-wrap gap-3 text-gray-500 dark:text-gray-400">
                <span>যাতায়াত ৳{fmt(expense.transport)}</span>
                <span>খাবার ৳{fmt(expense.food)}</span>
                {expense.misc > 0 && <span>অন্যান্য ৳{fmt(expense.misc)}</span>}
              </div>
              <span className="font-bold text-gray-800 dark:text-gray-100 flex-shrink-0 ml-2">৳{fmt(expense.total)}</span>
            </div>
            {expense.misc_note && (
              <p className="text-[11px] text-gray-400 mt-1">{expense.misc_note}</p>
            )}
          </div>
        </Section>
      )}

      {!hasAnything && (
        <p className="text-xs text-gray-400 text-center py-2">এই দিনের কোনো বিস্তারিত তথ্য পাওয়া যায়নি।</p>
      )}
    </div>
  )
}
