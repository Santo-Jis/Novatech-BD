import clsx from 'clsx'

const baseInput = 'w-full border rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white dark:bg-slate-800 dark:text-gray-100 dark:border-slate-600 dark:focus:border-blue-500 border-gray-200 text-gray-800 placeholder-gray-400 dark:placeholder-gray-500'

export default function Input({ label, hint, error, icon, className = '', ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}
        <input className={clsx(baseInput, icon && 'pl-9', error && 'border-red-400 focus:border-red-400')} {...props} />
      </div>
      {hint  && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error?.message || String(error)}</p>}
    </div>
  )
}

export function Select({ label, hint, error, options = [], className = '', ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <select className={clsx(baseInput, 'cursor-pointer', error && 'border-red-400')} {...props}>
        <option value="">— বেছে নিন —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint  && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error?.message || String(error)}</p>}
    </div>
  )
}

export function Textarea({ label, hint, error, className = '', rows = 3, ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <textarea rows={rows} className={clsx(baseInput, 'resize-none', error && 'border-red-400')} {...props} />
      {hint  && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error?.message || String(error)}</p>}
    </div>
  )
}
