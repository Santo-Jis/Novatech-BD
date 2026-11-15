import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Input from '../ui/Input'
import toast from 'react-hot-toast'
import { fmtMoney, todayBD } from './expenseConstants'

// ক্যাটাগরি অনুযায়ী মাসিক বাজেট বনাম আসল খরচ।
// "প্রতি মাস" বাজেট সব মাসে প্রযোজ্য; "শুধু এই মাস" দিলে ওই মাসে সেটাই প্রাধান্য পায়।
export default function BudgetTab() {
  const [month, setMonth] = useState(todayBD().slice(0, 7))
  const [data, setData] = useState({ data: [], unbudgeted: [], totals: { budget: 0, actual: 0 } })
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({}) // { [category_id]: string }
  const [scope, setScope] = useState('default') // 'default' | 'month'

  const load = useCallback(async () => {
    setLoading(true)
    try { setData((await api.get('/expense/company/budgets', { params: { month } })).data); setDraft({}) }
    catch (e) { toast.error(e.response?.data?.message || 'বাজেটের তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  const save = async (row) => {
    const raw = draft[row.category_id]
    if (raw === undefined) return
    try {
      const { data: res } = await api.put('/expense/company/budgets', {
        category_id: row.category_id, amount: raw === '' ? null : parseFloat(raw), month: scope === 'month' ? month : null,
      })
      toast.success(res.message)
      load()
    } catch (e) { toast.error(e.response?.data?.message || 'সংরক্ষণ করা যায়নি।') }
  }

  const { totals } = data
  const overall = totals.budget > 0 ? Math.round((totals.actual / totals.budget) * 100) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <Input label="মাস" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">বাজেট বদলালে প্রযোজ্য হবে</span>
          <div className="flex rounded-xl border border-gray-200 dark:border-slate-600 overflow-hidden text-sm">
            {[['default', 'প্রতি মাস'], ['month', 'শুধু এই মাস']].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)}
                className={`px-3 py-2.5 ${scope === k ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="text-xs text-gray-500">মোট বাজেট</div>
          <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{fmtMoney(totals.budget)}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="text-xs text-gray-500">মোট আসল খরচ (SR ও রাইট-অফসহ)</div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{fmtMoney(totals.actual)}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="text-xs text-gray-500">বাজেটের ব্যবহার</div>
          <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{overall === null ? '—' : `${overall.toLocaleString('bn-BD')}%`}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
        {loading && <div className="p-6 text-center text-sm text-gray-400">লোড হচ্ছে...</div>}
        {!loading && data.data.map(r => {
          const pct = r.used_pct
          const over = r.budget !== null && r.actual > r.budget
          const bar = over ? 'bg-red-500' : pct !== null && pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
          const val = draft[r.category_id] ?? (r.budget ?? '')
          return (
            <div key={r.category_id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1.6fr] gap-3 items-center">
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{r.name}</div>
                {r.budget_source && <div className="text-xs text-gray-400">{r.budget_source === 'month' ? 'শুধু এই মাসের বাজেট' : 'প্রতি মাসের বাজেট'}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" step="1" value={val} placeholder="বাজেট ৳"
                  onChange={e => setDraft(d => ({ ...d, [r.category_id]: e.target.value }))}
                  onBlur={() => save(r)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-gray-300">খরচ {fmtMoney(r.actual)}</span>
                  <span className={over ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                    {r.budget === null ? 'বাজেট নেই' : over ? `${fmtMoney(-r.diff)} বেশি` : `${fmtMoney(r.diff)} বাকি`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct ?? (r.actual > 0 ? 100 : 0))}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {data.unbudgeted.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm">
          <div className="font-semibold text-amber-800 dark:text-amber-300 mb-2">ক্যাটাগরি-বহির্ভূত খরচ (বাজেট ধরা যায় না)</div>
          {data.unbudgeted.map(u => (
            <div key={u.name} className="flex justify-between text-gray-700 dark:text-gray-300"><span>{u.name}</span><span>{fmtMoney(u.actual)}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}
