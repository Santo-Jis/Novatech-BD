import { useEffect, useState, useCallback } from 'react'
import { FiClock, FiChevronLeft, FiChevronRight, FiFilter, FiDownload, FiLoader } from 'react-icons/fi'
import platformApi from './api/platformApi'
import { usePlatformAuthStore } from './store/platformAuth.store'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const TARGET_TYPES = [
  { value: '', label: 'সব ধরনের' },
  { value: 'user', label: 'Staff/User' },
  { value: 'customer', label: 'কাস্টমার' },
  { value: 'ticket', label: 'টিকেট' },
  { value: 'platform_staff', label: 'Platform Staff' },
]

// কোনো ব্যাকএন্ড এন্ডপয়েন্ট লাগে না — বর্তমান ফিল্টার অনুযায়ী একটা
// বড় ব্যাচ (সর্বোচ্চ ১০০০) ফেচ করে ব্রাউজারেই CSV বানিয়ে ডাউনলোড হয়।
function downloadCSV(rows, columns, filename) {
  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => c.label).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(c.get(row))).join(','))
  const csv = '\uFEFF' + [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AuditLog() {
  const staff = usePlatformAuthStore((s) => s.staff)
  const isFull = staff?.scope === 'full'

  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await platformApi.get('/support/audit-log', {
        params: { page, limit: 25, action: action || undefined, target_type: targetType || undefined },
      })
      setRows(res.data.data)
      setPagination(res.data.pagination)
    } catch (err) {
      if (!err._toastShown) setError('Audit log লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [page, action, targetType])

  useEffect(() => {
    load()
  }, [load])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await platformApi.get('/support/audit-log', {
        params: { page: 1, limit: 1000, action: action || undefined, target_type: targetType || undefined },
      })
      downloadCSV(
        res.data.data,
        [
          { label: 'Staff Email', get: (r) => r.staff_email },
          { label: 'Action', get: (r) => r.action },
          { label: 'Target Type', get: (r) => r.target_type },
          { label: 'Target ID', get: (r) => r.target_id },
          { label: 'Created At', get: (r) => new Date(r.created_at).toISOString() },
        ],
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      )
    } catch {
      setError('Export করা যায়নি।')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">Audit Log</h1>
          <p className="text-pf-text-secondary text-sm mt-1">
            {isFull ? 'সব Platform Staff-এর অ্যাকশন হিস্ট্রি' : 'আপনার নিজের অ্যাকশন হিস্ট্রি'}
          </p>
        </div>
        {rows && rows.length > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-pf-border text-pf-text-primary text-sm font-semibold hover:border-pf-primary-500 disabled:opacity-60"
          >
            {exporting ? <FiLoader className="animate-spin" /> : <FiDownload />}
            CSV Export
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
          <input
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            placeholder="action দিয়ে ফিল্টার করুন (যেমন: unblock)"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
              focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
          />
        </div>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
        >
          {TARGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState label="Audit log লোড হচ্ছে..." />}
      {!loading && error && <ErrorState description={error} onRetry={load} />}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো এন্ট্রি নেই" description="ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।" />
        </div>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <>
          <div className="bg-pf-bg-surface border border-pf-border rounded-xl divide-y divide-pf-border overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pf-text-primary font-pf-mono">{r.action}</p>
                    <p className="text-xs text-pf-text-muted mt-0.5">
                      {isFull && <span className="font-medium">{r.staff_email}</span>}
                      {isFull && r.target_type && ' · '}
                      {r.target_type && `${r.target_type}${r.target_id ? ` (${r.target_id.slice(0, 8)}…)` : ''}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-pf-text-muted flex-shrink-0">
                    <FiClock /> {new Date(r.created_at).toLocaleString('bn-BD')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between text-sm text-pf-text-secondary">
              <span>
                পৃষ্ঠা {pagination.page} / {pagination.total_pages} · মোট {pagination.total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-pf-border disabled:opacity-40"
                >
                  <FiChevronLeft />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={page >= pagination.total_pages}
                  className="p-2 rounded-lg border border-pf-border disabled:opacity-40"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
