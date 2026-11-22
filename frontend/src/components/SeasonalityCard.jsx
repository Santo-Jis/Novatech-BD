import { useState } from 'react'
import { FiCalendar } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, DetailModal, fmtMoney, fmtNum } from './healthUi'

// বার্ষিক মৌসুম: মাসিক বিক্রির রেকর্ড + কোন মাসে কোন পণ্য বেশি চলে (পুরো বছরের ডেটা জমলে)
// ডেটা: GET /reports/seasonality  (backend: seasonality.service.js)
const ymLabel = (ym) => `${['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'][parseInt(ym.slice(5), 10) - 1]} ${ym.slice(2, 4)}`

export default function SeasonalityCard() {
  const [open, setOpen] = useState(false)
  const { data, loading, failed } = useHealth('/reports/seasonality')
  if (loading) return <div className="h-32 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || data.restricted) return null

  const d = data
  const maxRev = Math.max(1, ...d.monthly.map(m => m.revenue))
  const maxIdx = Math.max(1.5, ...d.company_index.map(m => m.index || 0))

  return (
    <Shell icon={<FiCalendar className="text-primary" />} title="বার্ষিক মৌসুম">
      <div>
        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
          <span>মৌসুম ধরার জন্য ডেটা: {fmtNum(d.calendar_months_seen)}/১২ মাস</span><span>{fmtNum(d.progress_pct)}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${d.progress_pct}%` }} /></div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">{d.note}</p>
      </div>

      {d.monthly.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">মাসিক বিক্রি (পূর্ণ মাস, সর্বশেষ ২৪টি)</p>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-5">
            {d.monthly.map(m => (
              <div key={m.ym} className="flex flex-col items-center justify-end flex-shrink-0 w-9 h-full relative" title={`${ymLabel(m.ym)}: ${fmtMoney(m.revenue)}`}>
                <div className="w-5 rounded-t bg-primary/70" style={{ height: `${Math.max((m.revenue / maxRev) * 100, 2)}%` }} />
                <span className="absolute -bottom-5 text-[9px] text-gray-400 whitespace-nowrap">{ymLabel(m.ym)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.reliable && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="বেশি চলে" value={d.peak_months.length ? d.peak_months.join(', ') : 'স্পষ্ট মৌসুম নেই'} tone={d.peak_months.length ? 'good' : undefined} />
            <Stat label="কম চলে" value={d.low_months.length ? d.low_months.join(', ') : 'স্পষ্ট মৌসুম নেই'} tone={d.low_months.length ? 'bad' : undefined} />
            <Stat label={`আগামী মাস (${d.next_month.label})`} value={d.next_month.index === null ? '—' : `${d.next_month.index}×`}
                  sub={d.next_month.index >= 1.25 ? 'বিক্রি বেশি হবে — স্টক রাখুন' : d.next_month.index <= 0.75 ? 'বিক্রি কম হবে' : 'স্বাভাবিক'} />
            <Stat label="মৌসুমি পণ্য" value={`${fmtNum(d.products_with_season)}টি`} onClick={() => setOpen(true)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">মাস অনুযায়ী সূচক (১.০ = স্বাভাবিক)</p>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {d.company_index.map(m => (
                <div key={m.month} className="text-center">
                  <div className="h-14 flex items-end justify-center">
                    <div className={`w-4 rounded-t ${m.index >= 1.25 ? 'bg-green-500' : m.index !== null && m.index <= 0.75 ? 'bg-red-400' : 'bg-gray-300 dark:bg-slate-500'}`}
                         style={{ height: `${m.index === null ? 4 : Math.max((m.index / maxIdx) * 100, 4)}%` }} />
                  </div>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">{m.label.slice(0, 4)}</p>
                  <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">{m.index === null ? '—' : m.index}</p>
                </div>
              ))}
            </div>
          </div>

          {d.top_products.length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">সবচেয়ে বেশি বিক্রির পণ্য — কখন চলে</p>
                <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-primary hover:underline">সব দেখুন ›</button>
              </div>
              <ul className="space-y-1.5">
                {d.top_products.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-gray-700 dark:text-gray-200">{p.name}</span>
                    <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
                      {p.peak_months.length ? <b className="text-green-600">বেশি: {p.peak_months.join(', ')}</b> : 'স্পষ্ট মৌসুম নেই'}
                      {p.low_months.length > 0 && <span className="text-red-500"> · কম: {p.low_months.join(', ')}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {open && <DetailModal type="season_products" onClose={() => setOpen(false)} />}
    </Shell>
  )
}
