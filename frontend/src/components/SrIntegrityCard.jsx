import { useState } from 'react'
import { FiEye } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, Stat, DetailModal, fmtNum } from './healthUi'

// SR-দের ওপর নজর: কার আচরণ বাকিদের থেকে অস্বাভাবিক (লোকেশন, রিটার্ন, ছাড়, খরচ, দেরি, জমা বাকি)
// পতাকা মানে "দেখুন", "দোষী" নয়।  ডেটা: GET /reports/sr-integrity  (backend: srIntegrity.service.js)
const SEV = {
  danger:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
}

export default function SrIntegrityCard() {
  const [open, setOpen] = useState(false)
  const { data, loading, failed } = useHealth('/reports/sr-integrity')
  if (loading) return <div className="h-32 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data || data.checked === 0) return null

  return (
    <Shell icon={<FiEye className="text-primary" />} title={`SR-দের ওপর নজর (গত ${fmtNum(data.window_days)} দিন)`}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="যাচাই করা SR" value={fmtNum(data.checked)} onClick={() => setOpen(true)} />
        <Stat label="দেখা দরকার" value={fmtNum(data.flagged.length)} tone={data.flagged.length > 0 ? 'bad' : 'good'} />
        <Stat label="গুরুতর" value={fmtNum(data.danger_count)} tone={data.danger_count > 0 ? 'bad' : 'good'} />
      </div>

      {data.notes.map(n => <p key={n.code} className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5">ℹ️ {n.message}</p>)}

      {data.flagged.length === 0 ? (
        <p className="text-xs text-gray-400">কারো আচরণ অস্বাভাবিক নয় 👍</p>
      ) : data.flagged.map(s => (
        <div key={s.id} className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1.5">{s.name}</p>
          <ul className="space-y-1">
            {s.flags.map(f => (
              <li key={f.code} className="flex items-start gap-2 text-[11px]">
                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded font-semibold ${SEV[f.severity]}`}>{f.label}</span>
                <span className="text-gray-600 dark:text-gray-300">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-primary hover:underline">সব SR-এর সূচক দেখুন ›</button>
      {!data.has_peers && <p className="text-[10px] text-gray-400">৩ জনের কম SR — তুলনা ছাড়া শুধু নিরঙ্কুশ সীমা দিয়ে যাচাই।</p>}
      {open && <DetailModal type="sr_integrity" onClose={() => setOpen(false)} />}
    </Shell>
  )
}
