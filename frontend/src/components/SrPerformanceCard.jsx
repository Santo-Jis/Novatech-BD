import { useState } from 'react'
import { FiUsers } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, MiniList, AlertList, DetailModal, fmtMoney, fmtNum } from './healthUi'

// SR পারফরম্যান্স: আজকের উপস্থিতি/ভিজিট/বিক্রি + মাসিক টার্গেটের গতি
// ডেটা: GET /reports/sr-performance  (backend: opsHealth.service.js)
// সময়ভিত্তিক: ১০টার পর অনুপস্থিত, ১২টার পর ভিজিট শূন্য, ৩টার পর বিক্রি শূন্য ধরা হয়।
export default function SrPerformanceCard() {
  const { data, loading, failed } = useHealth('/reports/sr-performance')
  const [detail, setDetail] = useState(null)
  if (loading) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null

  const { counts: c, target: t, absent, zero_visit, zero_sales, commission, alerts = [] } = data

  return (
    <Shell icon={<FiUsers className="text-primary" />} title="SR পারফরম্যান্স">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="আজ উপস্থিত" value={`${fmtNum(c.present)} / ${fmtNum(c.total)}`}
              sub={`দেরি ${fmtNum(c.late)} · ছুটি ${fmtNum(c.on_leave)}${c.absent > 0 ? ` · অনুপস্থিত ${fmtNum(c.absent)}` : ''}`}
              tone={c.absent > 0 ? 'bad' : undefined} onClick={() => setDetail('sr_today')} />
        <Stat label="মাসিক টার্গেট অর্জন" value={t.team_achieved_pct === null ? 'টার্গেট নেই' : `${t.team_achieved_pct}%`}
              sub={t.team_target > 0 ? `${fmtMoney(t.team_achieved)} / ${fmtMoney(t.team_target)} · প্রত্যাশিত ${t.expected_pct}%` : 'SR-এর মাসিক টার্গেট সেট করুন'}
              tone={t.team_achieved_pct !== null && t.team_achieved_pct < t.expected_pct * 0.7 ? 'bad' : undefined} onClick={() => setDetail('sr_today')} />
        <Stat label="টার্গেটে পিছিয়ে" value={`${fmtNum(t.behind_count)} জন`} tone={t.behind_count > 0 ? 'bad' : 'good'} onClick={() => setDetail('sr_today')} />
        <Stat label="কমিশন পরিশোধ বাকি" value={fmtMoney(commission.total)} sub={`${fmtNum(commission.count)}টি`} onClick={() => setDetail('commissions_unpaid')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MiniList onMore={() => setDetail('sr_today')} title="আজ হাজিরা দেননি" empty="সবাই হাজির/ছুটিতে 👍" rows={absent.map(n => ({ left: n, right: '' }))} />
        <MiniList onMore={() => setDetail('sr_today')} title="উপস্থিত, কিন্তু ভিজিট শূন্য" empty="নেই 👍" rows={zero_visit.map(n => ({ left: n, right: '' }))} />
        <MiniList onMore={() => setDetail('sr_today')} title="উপস্থিত, কিন্তু আজ বিক্রি শূন্য" empty="নেই 👍" rows={zero_sales.map(n => ({ left: n, right: '' }))} />
      </div>

      {t.behind.length > 0 && (
        <MiniList title="টার্গেটের গতিতে পিছিয়ে (এ পর্যন্ত যতটা হওয়া উচিত তার তুলনায়)" empty=""
                  rows={t.behind.map(b => ({ left: b.name, right: `${fmtMoney(b.achieved)} / ${fmtMoney(b.target)} (${b.achieved_pct}%)` }))} />
      )}

      <AlertList alerts={alerts} onOpen={setDetail} />
      {detail && <DetailModal type={detail} onClose={() => setDetail(null)} />}
    </Shell>
  )
}
