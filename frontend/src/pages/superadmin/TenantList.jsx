import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { FiSearch, FiChevronLeft, FiChevronRight, FiPlusCircle } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const STATUS_FILTERS = [
  { value: '', label: 'সব' },
  { value: 'active', label: 'সক্রিয়' },
  { value: 'trial', label: 'ট্রায়াল' },
  { value: 'suspended', label: 'স্থগিত' },
  { value: 'cancelled', label: 'বাতিল' },
]

export default function TenantList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/tenants', {
        params: { page, limit: 20, search: search || undefined, status: status || undefined },
      })
      setRows(res.data.data)
      setPagination(res.data.pagination)
    } catch (err) {
      if (!err._toastShown) setError('টেন্যান্ট তালিকা লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => {
    load()
  }, [load])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}) })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">সব টেন্যান্ট</h1>
          <p className="text-pf-text-secondary text-sm mt-1">টেন্যান্ট কোম্পানি — অবস্থা, প্ল্যান পরিবর্তন ও ব্যবস্থাপনা</p>
        </div>
        <Link
          to="/superadmin/tenants/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-900 text-white text-sm font-semibold hover:brightness-110 whitespace-nowrap"
        >
          <FiPlusCircle /> নতুন টেন্যান্ট
        </Link>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="কোম্পানির নাম বা slug দিয়ে খুঁজুন"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
              focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
        >
          খুঁজুন
        </button>
      </form>

      {loading && <LoadingState label="টেন্যান্ট তালিকা লোড হচ্ছে..." />}
      {!loading && error && <ErrorState description={error} onRetry={load} />}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো টেন্যান্ট পাওয়া যায়নি" description="সার্চ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।" />
        </div>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <>
          <div className="bg-pf-bg-surface border border-pf-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pf-bg-alt text-pf-text-secondary text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">কোম্পানি</th>
                  <th className="text-left px-4 py-2.5 font-semibold">প্ল্যান</th>
                  <th className="text-left px-4 py-2.5 font-semibold">স্ট্যাটাস</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">কর্মী/কাস্টমার</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">তৈরি হয়েছে</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pf-border">
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/superadmin/tenants/${t.id}`)}
                    className="cursor-pointer hover:bg-pf-bg-alt transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-pf-text-primary">{t.company_name}</p>
                      <p className="text-xs text-pf-text-muted">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-pf-accent-100 text-pf-accent-600">
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-pf-text-secondary text-xs font-pf-mono">
                      {t.employee_count} / {t.customer_count}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-pf-text-muted font-pf-mono text-xs">
                      {new Date(t.created_at).toLocaleDateString('bn-BD')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between text-sm text-pf-text-secondary">
              <span>
                পৃষ্ঠা {pagination.page} / {pagination.total_pages} · মোট {pagination.total} টেন্যান্ট
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
