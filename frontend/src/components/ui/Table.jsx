import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

export default function Table({ columns = [], data = [], loading = false, emptyText = 'কোনো তথ্য নেই।', compact = false }) {
  if (loading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
    </div>
  )

  const py = compact ? 'py-2' : 'py-3'

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-slate-700/50">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 ${py} text-left text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap`}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">{emptyText}</td></tr>
          ) : data.map((row, ri) => (
            <tr key={ri} className="border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
              {columns.map((col, ci) => (
                <td key={ci} className={`px-4 ${py} text-gray-700 dark:text-gray-200`}>
                  {col.render ? col.render(row[col.dataIndex], row) : (row[col.dataIndex] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-colors">
        <FiChevronLeft />
      </button>
      <span className="text-sm text-gray-600 dark:text-gray-300 px-3">
        {page} / {totalPages}
      </span>
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-colors">
        <FiChevronRight />
      </button>
    </div>
  )
}
