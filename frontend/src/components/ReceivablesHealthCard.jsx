import { useState } from 'react'
import { FiDollarSign } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, MiniList, AlertList, DetailModal, fmtMoney, fmtNum } from './healthUi'

// বকেয়া ও আদায়: বকেয়ার বয়স, ক্রেডিট সীমা, SR-এর হাতে অজমা আদায়
// ডেটা: GET /reports/receivables-health  (backend: opsHealth.service.js)
// বয়স = বিক্রির তারিখ থেকে আজ (আলাদা due-date নেই)।
const BAR = { d0_30: 'bg-green-500', d31_60: 'bg-yellow-400', d61_90: 'bg-orange-500', d90p: 'bg-red-600' }

export default function ReceivablesHealthCard() {
  const { data, loading, failed } = useHealth('/reports/receivables-health')
  const [detail, setDetail] = useState(null)
  if (loading) return <div className="h-48 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null

  const { aging, credit_limits: lim, collections_in_transit: tr, today_collected, sr_owes, alerts = [] } = data

  return (
    <Shell icon={<FiDollarSign className="text-primary" />} title="বকেয়া ও আদায়">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {aging && <Stat label="মোট বকেয়া" value={fmtMoney(aging.total)} sub={`৬০ দিনের বেশি ${fmtMoney(aging.over_60_total)}`}
                        tone={aging.over_60_pct >= 25 ? 'bad' : undefined} onClick={() => setDetail('dues')} />}
        <Stat label="আজ আদায় (কালেকশন)" value={fmtMoney(today_collected)} onClick={() => setDetail('collections_today')} />
        <Stat label="SR-এর হাতে, জমা হয়নি" value={fmtMoney(tr.total)} tone={tr.total > 0 && tr.oldest_days >= 3 ? 'bad' : undefined} onClick={() => setDetail('transit')}
              sub={tr.count > 0 ? `${fmtNum(tr.count)}টি · সবচেয়ে পুরোনো ${fmtNum(tr.oldest_days ?? 0)} দিন` : undefined} />
        <Stat label="SR-এর কাছে কোম্পানির পাওনা" value={fmtMoney(sr_owes.total)} sub={`${fmtNum(sr_owes.count)} জন`} tone={sr_owes.total > 0 ? 'bad' : undefined} onClick={() => setDetail('sr_dues')} />
      </div>

      {aging && aging.total > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">বকেয়ার বয়স</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-700">
            {aging.buckets.map(b => b.amount > 0 && (
              <div key={b.key} className={BAR[b.key]} style={{ width: `${(b.amount / aging.total) * 100}%` }} title={`${b.label}: ${fmtMoney(b.amount)}`} />
            ))}
            {aging.unexplained > 0 && <div className="bg-gray-400" style={{ width: `${(aging.unexplained / aging.total) * 100}%` }} title="বয়স অজানা" />}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1">
            {aging.buckets.map(b => (
              <div key={b.key} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                <span className={`w-2 h-2 rounded-full ${BAR[b.key]}`} />{b.label}: <b>{fmtMoney(b.amount)}</b>
              </div>
            ))}
            {aging.unexplained > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                <span className="w-2 h-2 rounded-full bg-gray-400" />বয়স অজানা: <b>{fmtMoney(aging.unexplained)}</b>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {aging && <MiniList onMore={() => setDetail('dues')} title="সবচেয়ে পুরোনো বকেয়া (৬০ দিনের বেশি)" empty="কোনোটি নেই 👍"
                            rows={aging.overdue_top.map(c => ({ left: c.name, right: `${fmtMoney(c.over60)} · ${fmtNum(c.oldest_days)} দিন` }))} />}
        {lim && <MiniList onMore={() => setDetail('dues')} title={`ক্রেডিট সীমার কাছে/ছাড়ানো (${fmtNum(lim.over_count + lim.near_count)}টি)`} empty="কোনো দোকান নেই 👍"
                          rows={lim.top.map(c => ({ left: `${c.used_pct > 100 ? '🔴 ' : '🟠 '}${c.name}`, right: `${c.used_pct}%` }))} />}
        <MiniList onMore={() => setDetail('transit')} title="জমা বাকি আদায় (SR অনুযায়ী)" empty="সব জমা হয়েছে 👍"
                  rows={tr.by_sr.map(s => ({ left: s.name || '—', right: `${fmtMoney(s.amount)}${s.oldest_days !== null ? ` · ${fmtNum(s.oldest_days)} দিন` : ''}` }))} />
      </div>

      <AlertList alerts={alerts} onOpen={setDetail} />
      {detail && <DetailModal type={detail} onClose={() => setDetail(null)} />}
    </Shell>
  )
}
