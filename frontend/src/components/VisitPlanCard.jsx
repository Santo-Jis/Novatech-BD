import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiMapPin } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, DetailModal, fmtMoney, fmtNum } from './healthUi'

// আজকের ভিজিট তালিকা: কোন দোকানের কাছে আগে যেতে হবে (অর্ডারের সময় / আদায় / হারিয়ে যাচ্ছে)
// mine=true → SR নিজের দোকান (GET /reports/my-visit-plan); নইলে অ্যাডমিন/ম্যানেজার, SR অনুযায়ী (GET /reports/visit-plan)
// backend: visitPlan.service.js
const BADGE = {
  reorder: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  collect: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  both:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  lapsed:  'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-200',
  new:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}
const LABEL = { reorder: 'অর্ডারের সময়', collect: 'আদায়', both: 'অর্ডার + আদায়', lapsed: 'হারিয়ে যাচ্ছে', new: 'নতুন' }

function Row({ r, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
         className={`w-full text-left py-2 border-t border-gray-100 dark:border-slate-600 first:border-t-0 ${onClick ? 'hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg px-1' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE[r.category]}`}>{LABEL[r.category]}</span>
          <span className="truncate font-semibold text-gray-800 dark:text-white">{r.name}</span>
        </span>
        {r.due > 0 && <span className="flex-shrink-0 font-semibold text-red-600">{fmtMoney(r.due)}</span>}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{r.reason}</p>
    </Tag>
  )
}

export default function VisitPlanCard({ mine = false }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, loading, failed } = useHealth(mine ? '/reports/my-visit-plan' : '/reports/visit-plan')

  if (loading) return <div className="h-32 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null
  const { window: w, summary: s, groups = [] } = data
  if (!w.ready) return null              // ডেটা জমার আগে লুকানো — টার্গেট কার্ডে কারণ লেখা থাকে

  return (
    <Shell icon={<FiMapPin className="text-primary" />} title={mine ? 'আজ কার কাছে যাবেন' : 'আজকের ভিজিট তালিকা'}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="যাওয়া দরকার" value={`${fmtNum(s.total)}টি দোকান`} onClick={!mine && s.total > 0 ? () => setOpen(true) : undefined} />
        <Stat label="অর্ডারের সময় হয়েছে" value={fmtNum(s.reorder + s.both)} />
        <Stat label="বকেয়া আদায়" value={fmtNum(s.collect + s.both)} sub={s.due_total > 0 ? `মোট ${fmtMoney(s.due_total)}` : undefined} tone={s.due_total > 0 ? 'bad' : undefined} />
        <Stat label="হারিয়ে যাচ্ছে" value={fmtNum(s.lapsed)} sub={s.new > 0 ? `নতুন, অর্ডার নেই ${fmtNum(s.new)}` : undefined} />
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-gray-400">আজ বিশেষ কোনো দোকান নেই 👍</p>
      ) : groups.map(g => (
        <div key={g.sr_id || 'none'} className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
          {!mine && (
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{g.sr_name} <span className="font-normal text-gray-400">· {fmtNum(g.total)}টি</span></p>
              {g.due_total > 0 && <span className="text-[11px] font-semibold text-red-600">বকেয়া {fmtMoney(g.due_total)}</span>}
            </div>
          )}
          {g.rows.map(r => <Row key={r.customer_id} r={r} onClick={mine ? () => navigate(`/worker/customers/${r.customer_id}/history`) : undefined} />)}
          {!mine && g.total > g.rows.length && (
            <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[11px] font-semibold text-primary hover:underline">আরও {fmtNum(g.total - g.rows.length)}টি — সব দেখুন ›</button>
          )}
        </div>
      ))}
      {open && <DetailModal type="visit_plan" onClose={() => setOpen(false)} />}
    </Shell>
  )
}
