import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiTarget } from 'react-icons/fi'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import useHealth from './useHealth'
import { Shell, Stat, fmtMoney, fmtNum } from './healthUi'

// লক্ষ্য ও পরিকল্পনা: খরচ তুলতে কত বিক্রি লাগবে + SR-ভিত্তিক টার্গেট প্রস্তাব
// ডেটা: GET /reports/plan-targets  (backend: planning.service.js)
// বিশ্লেষণ-জানালা: প্রথম বিক্রি থেকে ১ → ২ → ৩ মাস (নতুন প্রতিষ্ঠানেও একই নিয়ম)।
const STATUS = {
  reached:  { text: 'ব্রেক-ইভেন পূর্ণ হয়েছে 🎉', cls: 'text-green-600' },
  on_track: { text: 'এই গতিতে ব্রেক-ইভেন হবে', cls: 'text-green-600' },
  behind:   { text: 'এই গতিতে ব্রেক-ইভেন হবে না — গতি বাড়াতে হবে', cls: 'text-red-600' },
  no_margin:{ text: 'মার্জিন শূন্য/ঋণাত্মক', cls: 'text-red-600' },
}

export default function TargetPlanCard() {
  const { user } = useAuthStore()
  const [profit, setProfit] = useState('')
  const [rev, setRev] = useState(0)
  const [busy, setBusy] = useState(false)
  const { data, loading, failed } = useHealth('/reports/plan-targets', { desired_profit: profit || undefined, _r: rev })

  if (loading && !data) return <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || data.restricted) return null

  const { window: w, breakeven: b, sr_targets: sr = [], warnings = [] } = data
  const st = b && STATUS[b.status]
  const changed = sr.some(r => r.suggested_target !== r.current_target)

  const apply = async () => {
    if (!window.confirm(`${fmtNum(sr.length)} জন SR-এর মাসিক টার্গেট প্রস্তাবিত অঙ্কে বদলাবে। নিশ্চিত?`)) return
    setBusy(true)
    try {
      const r = await api.post('/reports/plan-targets/apply', { targets: sr.map(x => ({ id: x.id, target: x.suggested_target })) })
      toast.success(r.data?.message || 'টার্গেট আপডেট হয়েছে')
      setRev(v => v + 1)
    } catch (e) {
      toast.error(e.response?.data?.message || 'টার্গেট আপডেট করা যায়নি')
    } finally { setBusy(false) }
  }

  return (
    <Shell icon={<FiTarget className="text-primary" />} title="লক্ষ্য ও পরিকল্পনা">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{w.stage}</span>
        <span className="text-gray-500 dark:text-gray-400">{w.note}</span>
      </div>

      {!b ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="মাসে ব্রেক-ইভেন বিক্রি" value={b.feasible ? fmtMoney(b.breakeven_revenue) : '—'}
                  sub={`মাসের খরচ ${fmtMoney(b.monthly_cost)} · মার্জিন ${b.gross_margin_pct}%`} />
            <Stat label="এ মাসে এ পর্যন্ত" value={fmtMoney(b.mtd_revenue)} sub={b.feasible ? `বাকি ${fmtMoney(b.remaining)}` : undefined} />
            <Stat label="বাকি দিনে প্রতিদিন দরকার" value={b.feasible ? fmtMoney(b.per_day_needed) : '—'}
                  sub={`বর্তমান গতি ${fmtMoney(b.daily_pace)}/দিন · বাকি ${fmtNum(b.days_left)} দিন`}
                  tone={b.status === 'behind' ? 'bad' : b.feasible ? 'good' : undefined} />
            <Stat label="মাস শেষে আনুমানিক" value={b.feasible ? fmtMoney(b.projected) : '—'}
                  sub={b.gap > 0 ? `ঘাটতি ${fmtMoney(b.gap)}` : undefined} tone={b.status === 'behind' ? 'bad' : undefined} />
          </div>

          {st && <p className={`text-xs font-semibold ${st.cls}`}>{st.text}</p>}
          {b.message && <p className="text-xs text-red-600">{b.message}</p>}
          {warnings.map((m, i) => <p key={i} className="text-[11px] text-yellow-700">⚠️ {m}</p>)}

          <label className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            কাঙ্ক্ষিত মাসিক মুনাফা (ঐচ্ছিক):
            <input type="number" min="0" inputMode="numeric" defaultValue={profit} placeholder="৳ 0"
                   onBlur={e => setProfit(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                   className="w-32 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white" />
            <span>দিলে ব্রেক-ইভেনের ওপর এই মুনাফাও ধরা হবে</span>
          </label>

          {sr.length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">SR-ভিত্তিক মাসিক টার্গেট প্রস্তাব</p>
                {user?.role === 'admin' && changed && (
                  <button type="button" disabled={busy} onClick={apply}
                          className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-primary text-white disabled:opacity-50">
                    {busy ? 'হচ্ছে…' : 'প্রস্তাব প্রয়োগ করুন'}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 dark:text-gray-400">
                    <th className="text-left py-1 pr-2 font-semibold">SR</th>
                    <th className="text-right py-1 px-2 font-semibold">এখনকার টার্গেট</th>
                    <th className="text-right py-1 px-2 font-semibold">প্রস্তাবিত</th>
                    <th className="text-right py-1 px-2 font-semibold">বর্তমান গতিতে মাসে</th>
                    <th className="text-right py-1 pl-2 font-semibold">এ মাসে এ পর্যন্ত</th>
                  </tr></thead>
                  <tbody>
                    {sr.map(r => (
                      <tr key={r.id} className="border-t border-gray-100 dark:border-slate-600 text-gray-700 dark:text-gray-200">
                        <td className="py-1.5 pr-2">{r.name}{r.is_new && <span className="ml-1 text-[10px] text-gray-400">(বিক্রি নেই)</span>}</td>
                        <td className="py-1.5 px-2 text-right">{r.current_target > 0 ? fmtMoney(r.current_target) : '—'}</td>
                        <td className="py-1.5 px-2 text-right font-bold">{fmtMoney(r.suggested_target)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtMoney(r.monthly_pace)}</td>
                        <td className="py-1.5 pl-2 text-right">{fmtMoney(r.mtd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">প্রত্যেকের ভাগ = জানালায় তার বিক্রির অনুপাত। নতুন/বিক্রিহীন SR গড় ভাগের অর্ধেক পায়। মোট প্রস্তাব {fmtMoney(data.sr_total_suggested)}।</p>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
