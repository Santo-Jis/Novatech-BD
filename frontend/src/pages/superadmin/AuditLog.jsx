import { useEffect, useState, useCallback } from 'react'
import { FiChevronLeft, FiChevronRight, FiFilter } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const inputCls = 'px-3 py-2 rounded-lg border border-pf-border bg-pf-bg-surface text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700'

// action নাম অনুযায়ী রঙ — শুধু scanning সহজ করার জন্য, কোনো লজিক না
function actionTone(action = '') {
  if (action.includes('delete')) return 'bg-pf-error-bg text-pf-error'
  if (action.includes('create')) return 'bg-pf-success-bg text-pf-success'
  if (action.includes('reset_password') || action.includes('status')) return 'bg-pf-warning-bg text-pf-warning'
  return 'bg-pf-info-bg text-pf-info'
}

export default function AuditLog() {
  const [rows, setRows] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [actionFilter, setActionFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [pendingStaff, setPendingStaff] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/audit-log', {
        params: { page, limit: 30, action: actionFilter || undefined, staff_email: staffFilter || undefined },
      })
      setRows(res.data.data)
      setPagination(res.data.pagination)
    } catch (err) {
      if (!err._toastShown) setError('Audit log লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, staffFilter])

  useEffect(() => {
    load()
  }, [load])

  const applyFilters = (e) => {
    e.preventDefault()
    setPage(1)
    setActionFilter(pendingAction)
    setStaffFilter(pendingStaff)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">Audit Log</h1>
        <p className="text-pf-text-secondary text-sm mt-1">
          সব Super Admin ও Support Staff action-এর ইতিহাস — কে, কখন, কী করেছে
        </p>
      </div>

      <form onSubmit={applyFilters} className="flex flex-col sm:flex-row gap-3">
        <input
          value={pendingAction}
          onChange={(e) => setPendingAction(e.target.value)}
          placeholder="action দিয়ে ফিল্টার (যেমন tenant.delete)"
          className={`${inputCls} flex-1`}
        />
        <input
          value={pendingStaff}
          onChange={(e) => setPendingStaff(e.target.value)}
          placeholder="staff email দিয়ে ফিল্টার"
          className={`${inputCls} flex-1`}
        />
        <button
          type="submit"
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
        >
          <FiFilter /> ফিল্টার করুন
        </button>
      </form>

      {loading && <LoadingState label="Audit log লোড হচ্ছে..." />}
      {!loading && error && <ErrorState description={error} onRetry={load} />}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো লগ পাওয়া যায়নি" description="ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।" />
        </div>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${actionTone(r.action)}`}>
                    {r.action}
                  </span>
                  <span className="text-xs text-pf-text-muted font-pf-mono">
                    {new Date(r.created_at).toLocaleString('bn-BD')}
                  </span>
                </div>
                <p className="text-sm text-pf-text-secondary">
                  <span className="font-medium text-pf-text-primary">{r.staff_email || 'অজানা'}</span>
                  {r.target_type && <> · {r.target_type} {r.target_id ? `(${String(r.target_id).slice(0, 8)}...)` : ''}</>}
                </p>
                {r.details && (
                  <pre className="text-[11px] text-pf-text-muted mt-2 bg-pf-bg-alt rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words">
                    {typeof r.details === 'string' ? r.details : JSON.stringify(r.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between text-sm text-pf-text-secondary">
              <span>
                পৃষ্ঠা {pagination.page} / {pagination.total_pages} · মোট {pagination.total} এন্ট্রি
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
