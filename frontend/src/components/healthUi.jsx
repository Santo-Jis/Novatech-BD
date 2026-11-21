import { FiAlertTriangle, FiAlertCircle, FiInfo } from 'react-icons/fi'

// ড্যাশবোর্ডের "স্বাস্থ্য" কার্ডগুলোর ছোট সাধারণ অংশ (Receivables / SR Performance / Action List)

export const fmtMoney = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('bn-BD')}`
export const fmtNum = (n) => (Number(n) || 0).toLocaleString('bn-BD')

const SEV = {
  danger:  { cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',         Icon: FiAlertCircle },
  warning: { cls: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800', Icon: FiAlertTriangle },
  info:    { cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',   Icon: FiInfo },
}

export function Shell({ icon, title, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-bold text-gray-800 dark:text-white text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, tone }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-800 dark:text-white'
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function MiniList({ title, rows, empty }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-700 dark:text-gray-200">{r.left}</span>
              <span className="flex-shrink-0 font-semibold text-gray-500 dark:text-gray-400">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AlertList({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const { cls, Icon } = SEV[a.severity] || SEV.info
        return (
          <li key={i} className={`flex items-start gap-2 text-xs border rounded-xl p-2.5 ${cls}`}>
            <Icon className="flex-shrink-0 mt-0.5" />
            <span>{a.message}</span>
          </li>
        )
      })}
    </ul>
  )
}
