import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { FiArrowLeft, FiLifeBuoy } from 'react-icons/fi'
import platformApi from './api/platformApi'
import { usePlatformAuthStore } from './store/platformAuth.store'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState } from './components/PanelStates'

export default function TenantDetail() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const staff = usePlatformAuthStore((s) => s.staff)
  const isFull = staff?.scope === 'full'

  const [tenant, setTenant] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await platformApi.get(`/tenants/${tenantId}`)
      setTenant(res.data.data.tenant)
      setStats(res.data.data.stats)
    } catch (err) {
      if (err.response?.status === 404) setError('এই টেন্যান্ট পাওয়া যায়নি।')
      else if (!err._toastShown) setError('টেন্যান্ট বিস্তারিত লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [tenantId])

  if (loading) return <LoadingState label="টেন্যান্ট বিস্তারিত লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />
  if (!tenant) return null

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/platform/tenants')}
        className="flex items-center gap-1.5 text-sm font-medium text-pf-text-secondary hover:text-pf-primary-700"
      >
        <FiArrowLeft /> টেন্যান্ট তালিকায় ফিরুন
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">{tenant.company_name}</h1>
          <p className="text-pf-text-secondary text-sm mt-1">{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={tenant.status} />
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-pf-accent-100 text-pf-accent-600">
            {tenant.plan}
          </span>
        </div>
      </div>

      {/* Support scope: শুধু "Ticket তৈরি করুন" — Frontend Spec §২.৪ */}
      {!isFull && (
        <Link
          to={`/platform/tickets?new=1&tenant_id=${tenant.id}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
        >
          <FiLifeBuoy /> Ticket তৈরি করুন (এই tenant সংক্রান্ত)
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="কর্মী" value={stats.employees} />
        <StatCard label="কাস্টমার" value={stats.customers} />
        <StatCard label="মোট বিক্রয়" value={stats.total_sales} />
        <StatCard label="মোট রাজস্ব" value={`৳${Number(stats.total_revenue).toLocaleString('bn-BD')}`} />
      </div>

      {/* Fields */}
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-pf-border">
          <h2 className="font-pf-head font-semibold text-pf-primary-700 text-sm">টেন্যান্ট তথ্য</h2>
        </div>
        <dl className="divide-y divide-pf-border">
          <Field label="কোম্পানি নাম (বাংলা)" value={tenant.company_name_bn} />
          <Field label="ঠিকানা" value={tenant.company_address} />
          <Field label="ফোন" value={tenant.company_phone} />
          <Field label="ইমেইল" value={tenant.company_email} />
          <Field label="সর্বোচ্চ কর্মী" value={tenant.max_employees} />
          <Field label="সর্বোচ্চ কাস্টমার" value={tenant.max_customers} />
          <Field
            label="ট্রায়াল শেষ"
            value={tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('bn-BD') : '—'}
          />
          <Field
            label="সাবস্ক্রিপশন শেষ"
            value={tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at).toLocaleDateString('bn-BD') : '—'}
          />

          {/* ✅ Full scope only — Security Doc §২, billing ফিল্ড support-এ backend থেকেই আসে না */}
          {isFull && (
            <>
              <Field label="Billing Email" value={tenant.billing_email} />
              <Field label="Billing Name" value={tenant.billing_name} />
            </>
          )}
        </dl>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
      <p className="text-xs text-pf-text-muted font-medium mb-1">{label}</p>
      <p className="font-pf-mono text-lg font-semibold text-pf-primary-700">{value ?? '—'}</p>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="flex px-4 py-3 gap-4">
      <dt className="w-40 flex-shrink-0 text-xs font-medium text-pf-text-muted">{label}</dt>
      <dd className="text-sm text-pf-text-primary break-words">{value || '—'}</dd>
    </div>
  )
}
