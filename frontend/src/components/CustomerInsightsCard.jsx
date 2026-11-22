import { useState } from 'react'
import { FiUsers } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, MiniList, AlertList, DetailModal, fmtMoney, fmtNum } from './healthUi'

// কাস্টমার-কেন্দ্রিক চিত্র: নির্ভরতা (শীর্ষ দোকান), সক্রিয়/নতুন/হারানো, রুট অনুযায়ী বিক্রি
// ডেটা: GET /reports/customer-insights  (backend: customerInsights.service.js)
export default function CustomerInsightsCard() {
  const [detail, setDetail] = useState(null)
  const { data, loading, failed } = useHealth('/reports/customer-insights')
  if (loading) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || !data.ready) return null

  const { window: w, concentration: c, activity: a, routes = [], alerts = [], idle_routes: idle } = data

  return (
    <Shell icon={<FiUsers className="text-primary" />} title="কাস্টমার চিত্র">
      <p className="text-[11px] text-gray-500 dark:text-gray-400"><span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold mr-2">{w.stage}</span>{w.note}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="সক্রিয় দোকান" value={`${fmtNum(a.active)}/${fmtNum(a.total_customers)}`} sub={`সক্রিয়তা ${a.active_pct}%`} onClick={() => setDetail('customers_top')} />
        <Stat label="নতুন দোকান কিনছে" value={fmtNum(a.new_ordering)} sub={`এ সময়ে নিবন্ধন ${fmtNum(a.registered)}`} />
        <Stat label="শীর্ষ ৫ দোকানের অংশ" value={`${c.top5_pct}%`} tone={c.risk ? 'bad' : undefined} sub={`শীর্ষ ১: ${c.top1_pct}%`} onClick={() => setDetail('customers_top')} />
        <Stat label={a.retention_pct === null ? 'হারিয়ে যাওয়া' : 'ধরে রাখা'} value={a.retention_pct === null ? fmtNum(a.lapsed) : `${a.retention_pct}%`}
              tone={a.retention_pct !== null && a.retention_pct < 70 ? 'bad' : undefined}
              sub={a.retention_pct === null ? 'আগের সময়ের ডেটা এখনো নেই' : `আগের ${fmtNum(a.prior_customers)}টির মধ্যে ${fmtNum(a.retained)}টি, হারিয়েছে ${fmtNum(a.lapsed)}`}
              onClick={a.lapsed > 0 ? () => setDetail('customers_lapsed') : undefined} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MiniList onMore={() => setDetail('customers_top')} title="সবচেয়ে বড় দোকান" empty="এ সময়ে বিক্রি নেই"
                  rows={c.top5.map(x => ({ left: x.name, right: `${fmtMoney(x.amount)} · ${x.pct}%` }))} />
        <MiniList onMore={() => setDetail('routes_perf')} title={`রুট অনুযায়ী বিক্রি${idle > 0 ? ` (${fmtNum(idle)}টি নিষ্ক্রিয়)` : ''}`} empty="রুট নেই"
                  rows={routes.map(r => ({ left: r.name, right: `${fmtMoney(r.sales)} · সক্রিয় ${fmtNum(r.active)}/${fmtNum(r.customers)}` }))} />
      </div>

      <AlertList alerts={alerts} onOpen={setDetail} />
      {detail && <DetailModal type={detail} onClose={() => setDetail(null)} />}
    </Shell>
  )
}
