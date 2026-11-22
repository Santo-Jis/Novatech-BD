import { useState } from 'react'
import { FiCreditCard } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, MiniList, AlertList, DetailModal, fmtMoney, fmtNum } from './healthUi'

// সাপ্লাইয়ারের পাওনা: কাকে কত দিতে হবে, কত দিনের পুরোনো, মেয়াদ পেরিয়েছে কি না, কাস্টমারের পাওনার সাথে তুলনা
// ডেটা: GET /reports/payables-health  (backend: payablesHealth.service.js)
const BAR = { d0_30: 'bg-green-500', d31_60: 'bg-yellow-400', d61_90: 'bg-orange-500', d90p: 'bg-red-600' }

export default function PayablesCard() {
  const [detail, setDetail] = useState(null)
  const { data, loading, failed } = useHealth('/reports/payables-health')
  if (loading) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || data.restricted) return null

  const { totals: t, buckets, receivable, net_position: net, top, alerts = [] } = data

  return (
    <Shell icon={<FiCreditCard className="text-primary" />} title="সাপ্লাইয়ারের পাওনা (আপনার দেনা)">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="মোট দেনা" value={fmtMoney(t.total)} sub={`${fmtNum(t.supplier_count)} জন সাপ্লাইয়ার`} onClick={() => setDetail('payables')} />
        <Stat label="মেয়াদ পেরিয়েছে" value={fmtMoney(t.overdue)} tone={t.overdue > 0 ? 'bad' : 'good'}
              sub={t.overdue > 0 ? `${fmtNum(t.overdue_suppliers)} জনের` : t.terms_unknown > 0 ? `${fmtNum(t.terms_unknown)} জনের শর্ত অজানা` : undefined}
              onClick={t.total > 0 ? () => setDetail('payable_pos') : undefined} />
        <Stat label="আগামী ৭ দিনে দিতে হবে" value={fmtMoney(t.due_soon)} tone={t.due_soon > 0 ? 'bad' : undefined} />
        <Stat label="গত ৩০ দিনে দিয়েছেন" value={fmtMoney(t.paid_30d)} />
      </div>

      {t.total > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">দেনার বয়স</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-700">
            {buckets.map(b => b.amount > 0 && <div key={b.key} className={BAR[b.key]} style={{ width: `${(b.amount / t.total) * 100}%` }} title={`${b.label}: ${fmtMoney(b.amount)}`} />)}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
            {buckets.map(b => (
              <div key={b.key} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                <span className={`w-2 h-2 rounded-full ${BAR[b.key]}`} />{b.label}: <b>{fmtMoney(b.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Stat label="কাস্টমারের কাছে পাওনা − সাপ্লাইয়ারের দেনা" value={fmtMoney(net)} tone={net < 0 ? 'bad' : 'good'}
              sub={`পাওনা ${fmtMoney(receivable)} · দেনা ${fmtMoney(t.total)}`} />
        <MiniList onMore={t.total > 0 ? () => setDetail('payables') : undefined} title="সবচেয়ে বেশি দেনা" empty="কোনো দেনা নেই 👍"
                  rows={top.map(s => ({ left: s.name, right: `${fmtMoney(s.total)}${s.overdue > 0 ? ' · ⚠️ মেয়াদ পেরিয়েছে' : ''}` }))} />
      </div>

      <AlertList alerts={alerts} onOpen={setDetail} />
      {detail && <DetailModal type={detail} onClose={() => setDetail(null)} />}
    </Shell>
  )
}
