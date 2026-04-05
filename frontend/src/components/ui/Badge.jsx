import clsx from 'clsx'

const badgeVariants = {
  active:    'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  pending:   'bg-amber-100  text-amber-700  border border-amber-200  dark:bg-amber-900/30  dark:text-amber-300  dark:border-amber-800',
  suspended: 'bg-red-100    text-red-700    border border-red-200    dark:bg-red-900/30    dark:text-red-300    dark:border-red-800',
  archived:  'bg-gray-100   text-gray-600   border border-gray-200   dark:bg-slate-700     dark:text-gray-400',
  rejected:  'bg-red-100    text-red-700    border border-red-200    dark:bg-red-900/30    dark:text-red-300',
  approved:  'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
  disputed:  'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300',
  present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  late:    'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',
  absent:  'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300',
  leave:   'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  cash:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  credit:      'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  replacement: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  info:     'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  warning:  'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',
  critical: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300',
  primary:   'bg-primary/10  text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  gray:      'bg-gray-100   text-gray-600   dark:bg-slate-700 dark:text-gray-300',
}

const banglaLabels = {
  active:'সক্রিয়', pending:'পেন্ডিং', suspended:'বরখাস্ত', archived:'আর্কাইভ',
  rejected:'বাতিল', approved:'অনুমোদিত', disputed:'বিতর্কিত',
  present:'উপস্থিত', late:'দেরি', absent:'অনুপস্থিত', leave:'ছুটি',
  cash:'নগদ', credit:'বাকি', replacement:'রিপ্লেসমেন্ট',
  info:'তথ্য', warning:'সতর্কতা', critical:'জরুরি',
  worker:'SR', manager:'ম্যানেজার', admin:'অ্যাডমিন',
  supervisor:'সুপারভাইজার', asm:'ASM', rsm:'RSM', accountant:'হিসাবরক্ষক'
}

export default function Badge({ variant = 'gray', label, children, size = 'sm', dot = false }) {
  const text = label || banglaLabels[variant] || children || variant
  const sizes = { xs: 'text-xs px-2 py-0.5', sm: 'text-xs px-2.5 py-1', md: 'text-sm px-3 py-1.5' }
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-medium', badgeVariants[variant] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300', sizes[size])}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {text}
    </span>
  )
}

export function Card({ children, title, subtitle, action, className = '', padding = true }) {
  return (
    <div className={clsx('bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            {title    && <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padding ? 'p-6' : ''}>{children}</div>
    </div>
  )
}

export function KPICard({ title, value, subtitle, icon, color = 'primary', trend }) {
  const colors = {
    primary:   { bg: 'bg-primary/10',   text: 'text-primary',     icon: 'bg-primary' },
    secondary: { bg: 'bg-secondary/10', text: 'text-secondary',   icon: 'bg-secondary' },
    accent:    { bg: 'bg-accent/10',    text: 'text-accent',      icon: 'bg-accent' },
    danger:    { bg: 'bg-danger/10',    text: 'text-danger',      icon: 'bg-danger' },
    success:   { bg: 'bg-emerald-50',   text: 'text-emerald-600', icon: 'bg-emerald-500' }
  }
  const c = colors[color] || colors.primary
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${c.text}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% গত সপ্তাহের তুলনায়
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-12 h-12 ${c.icon} rounded-xl flex items-center justify-center text-white text-xl flex-shrink-0`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
