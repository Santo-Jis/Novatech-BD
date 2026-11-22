import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiShoppingCart } from 'react-icons/fi'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import useHealth from './useHealth'
import { Shell, Stat, DetailModal, fmtMoney, fmtNum } from './healthUi'

// ক্রয় পরামর্শ: কোন পণ্য কত কিনতে হবে (বিক্রির গতি − হাতের স্টক − পথের মাল)
// ডেটা: GET /reports/purchase-plan  (backend: purchasePlan.service.js)
const BADGE = {
  out:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  urgent:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  soon:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  reorder: 'bg-gray-100 text-gray-600 dark:bg-slate-600 dark:text-gray-200',
}

export default function PurchasePlanCard() {
  const { user } = useAuthStore()
  const [rev, setRev] = useState(0)
  const [open, setOpen] = useState(false)
  const [lead, setLead] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data, loading, failed } = useHealth('/reports/purchase-plan', { _r: rev })

  if (loading && !data) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || data.restricted) return null

  const { window: w, settings: cfg, rows = [], summary: s } = data
  const leadV = lead ?? cfg.lead, bufV = buffer ?? cfg.buffer

  const save = async () => {
    setBusy(true)
    try {
      await api.post('/reports/purchase-plan/settings', { lead_days: Number(leadV), buffer_days: Number(bufV) })
      toast.success('সেভ হয়েছে'); setLead(null); setBuffer(null); setRev(v => v + 1)
    } catch (e) { toast.error(e.response?.data?.message || 'সেভ করা যায়নি') } finally { setBusy(false) }
  }

  return (
    <Shell icon={<FiShoppingCart className="text-primary" />} title="ক্রয় পরামর্শ — কী কিনতে হবে">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{w.stage}</span>
        <span className="text-gray-500 dark:text-gray-400">{w.note}</span>
        {s.season_active && <span className="text-green-600 font-semibold">· মৌসুম সমন্বয় চালু</span>}
      </div>

      {w.ready && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="কেনা দরকার" value={`${fmtNum(s.count)}টি পণ্য`} onClick={s.count > 0 ? () => setOpen(true) : undefined} />
            <Stat label="আনুমানিক মোট খরচ" value={fmtMoney(s.total_cost)} sub="ক্রয়মূল্যে" />
            <Stat label="জরুরি (শেষ/শীঘ্রই শেষ)" value={`${fmtNum(s.urgent_count)}টি`} tone={s.urgent_count > 0 ? 'bad' : 'good'} sub={s.urgent_count > 0 ? `খরচ ${fmtMoney(s.urgent_cost)}` : undefined} />
            <Stat label="ক্রয়মূল্য নেই" value={`${fmtNum(s.without_cost)}টি`} tone={s.without_cost > 0 ? 'bad' : undefined} sub={s.without_cost > 0 ? 'খরচ ধরা হয়নি' : undefined} />
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-gray-400">এখন কিছু কেনার দরকার নেই 👍</p>
          ) : (
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">আগে কিনুন (জরুরি, তারপর বেশি মুনাফার)</p>
                <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-primary hover:underline">সব দেখুন ›</button>
              </div>
              <ul className="space-y-1.5">
                {rows.slice(0, 8).map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE[r.urgency]}`}>{r.urgency_label}</span>
                      <span className="truncate text-gray-700 dark:text-gray-200">{r.name}</span>
                    </span>
                    <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
                      <b className="text-gray-800 dark:text-white">{fmtNum(r.need)} পিস</b>{r.cost_known ? ` · ${fmtMoney(r.cost)}` : ' · ক্রয়মূল্য নেই'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            সাপ্লাইয়ারের ডেলিভারি
            <input type="number" min="1" max="120" value={leadV} disabled={user?.role !== 'admin'} onChange={e => setLead(e.target.value)}
                   className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white" /> দিন, নিরাপত্তা
            <input type="number" min="0" max="120" value={bufV} disabled={user?.role !== 'admin'} onChange={e => setBuffer(e.target.value)}
                   className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white" /> দিন
            {user?.role === 'admin' && (lead !== null || buffer !== null) && (
              <button type="button" disabled={busy} onClick={save} className="font-semibold px-3 py-1 rounded-lg bg-primary text-white disabled:opacity-50">সেভ</button>
            )}
          </div>
        </>
      )}
      {open && <DetailModal type="purchase_plan" onClose={() => setOpen(false)} />}
    </Shell>
  )
}
