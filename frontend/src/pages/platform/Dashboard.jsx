import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiBriefcase, FiSearch, FiPlusCircle, FiLifeBuoy } from 'react-icons/fi'
import platformApi from './api/platformApi'
import { usePlatformAuthStore } from './store/platformAuth.store'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const QUICK_ACTIONS = [
  { to: '/platform/tenants', icon: <FiBriefcase />, label: 'টেন্যান্ট খুঁজুন' },
  { to: '/platform/users', icon: <FiSearch />, label: 'ইউজার লুকআপ' },
  { to: '/platform/tickets?new=1', icon: <FiPlusCircle />, label: 'নতুন টিকেট' },
]

export default function PlatformDashboard() {
  const staff = usePlatformAuthStore((s) => s.staff)
  const [summary, setSummary] = useState(null)
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tenantsRes, ticketsRes] = await Promise.all([
        platformApi.get('/tenants', { params: { limit: 100 } }),
        platformApi.get('/support/tickets', { params: { mine: true } }),
      ])

      const rows = tenantsRes.data.data
      setSummary({
        total: tenantsRes.data.pagination?.total ?? rows.length,
        active: rows.filter((t) => t.status === 'active').length,
        suspended: rows.filter((t) => t.status === 'suspended').length,
        trial: rows.filter((t) => t.status === 'trial').length,
      })
      setTickets(ticketsRes.data.data.slice(0, 5))
    } catch (err) {
      if (!err._toastShown) setError('ড্যাশবোর্ড ডেটা লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <LoadingState label="ড্যাশবোর্ড লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">
          স্বাগতম, {staff?.name?.split(' ')[0] || 'Staff'}
        </h1>
        <p className="text-pf-text-secondary text-sm mt-1">
          {staff?.scope === 'full' ? 'Full scope' : 'Support scope'} হিসেবে লগইন করা আছেন
        </p>
      </div>

      {/* Tenant summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="মোট টেন্যান্ট" value={summary.total} />
        <SummaryCard label="সক্রিয়" value={summary.active} tone="success" />
        <SummaryCard label="স্থগিত" value={summary.suspended} tone="warning" />
        <SummaryCard label="ট্রায়াল" value={summary.trial} tone="info" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-pf-head text-base font-semibold text-pf-primary-700 mb-3">দ্রুত অ্যাকশন</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center gap-3 bg-pf-bg-surface border border-pf-border rounded-xl px-4 py-3.5
                hover:border-pf-primary-500 hover:shadow-sm transition-all text-sm font-medium text-pf-text-primary"
            >
              <span className="text-pf-primary-700 text-lg">{a.icon}</span>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent tickets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-pf-head text-base font-semibold text-pf-primary-700">আমার সাম্প্রতিক টিকেট</h2>
          <Link to="/platform/tickets" className="text-xs font-semibold text-pf-primary-700 hover:underline">
            সব দেখুন
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
            <EmptyState
              title="কোনো টিকেট নেই"
              description="আপনার নামে কোনো টিকেট বরাদ্দ নেই।"
              action={
                <Link
                  to="/platform/tickets?new=1"
                  className="mt-2 text-sm font-semibold text-pf-primary-700 hover:underline inline-flex items-center gap-1.5"
                >
                  <FiLifeBuoy /> নতুন টিকেট তৈরি করুন
                </Link>
              }
            />
          </div>
        ) : (
          <div className="bg-pf-bg-surface border border-pf-border rounded-xl divide-y divide-pf-border overflow-hidden">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/platform/tickets?ticket=${t.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-pf-bg-alt transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pf-text-primary truncate">{t.subject}</p>
                  <p className="text-xs text-pf-text-muted truncate">{t.company_name || 'কোনো টেন্যান্ট যুক্ত নেই'}</p>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  const toneCls = {
    success: 'text-pf-success',
    warning: 'text-pf-warning',
    info: 'text-pf-info',
  }[tone] || 'text-pf-primary-700'

  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
      <p className="text-xs text-pf-text-muted font-medium mb-1">{label}</p>
      <p className={`font-pf-mono text-2xl font-semibold ${toneCls}`}>{value}</p>
    </div>
  )
}
