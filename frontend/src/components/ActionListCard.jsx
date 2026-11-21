import { useNavigate } from 'react-router-dom'
import { FiCheckSquare, FiChevronRight } from 'react-icons/fi'
import useHealth from './useHealth'
import { Shell, fmtMoney, fmtNum } from './healthUi'

// "আজ কী করতে হবে" — সব অপেক্ষমাণ অনুমোদন/অনুরোধ এক জায়গায়, জরুরি আগে।
// ডেটা: GET /reports/action-list  (backend: opsHealth.service.js)
export default function ActionListCard() {
  const navigate = useNavigate()
  const { data, loading, failed } = useHealth('/reports/action-list')

  if (loading) return <div className="h-24 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null

  return (
    <Shell icon={<FiCheckSquare className="text-primary" />} title={`আজ কী করতে হবে${data.total > 0 ? ` (${fmtNum(data.total)})` : ''}`}>
      {data.items.length === 0 ? (
        <p className="text-sm text-green-600">✅ কোনো অপেক্ষমাণ কাজ নেই।</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-700">
          {data.items.map(it => {
            const old = it.oldest_days >= 3
            const body = (
              <div className="flex items-center gap-3 py-2.5">
                <span className={`min-w-[2rem] text-center text-xs font-bold rounded-full px-2 py-1 ${old ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'}`}>
                  {fmtNum(it.count)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{it.label}</p>
                  <p className="text-[11px] text-gray-400">
                    {it.value ? `${fmtMoney(it.value)} · ` : ''}
                    {it.oldest_days > 0 ? `সবচেয়ে পুরোনোটি ${fmtNum(it.oldest_days)} দিনের` : 'আজকের'}
                  </p>
                </div>
                {it.link && <FiChevronRight className="text-gray-300 flex-shrink-0" />}
              </div>
            )
            return (
              <li key={it.key}>
                {it.link
                  ? <button type="button" onClick={() => navigate(it.link)} className="w-full text-left hover:bg-gray-50 dark:hover:bg-slate-700/40 rounded-lg px-1">{body}</button>
                  : <div className="px-1">{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
