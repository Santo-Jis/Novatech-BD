import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FiBriefcase, FiUsers, FiUserCheck, FiPlusCircle } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState } from './components/PanelStates'

// ⚠️ Backend-এ কোনো dedicated /superadmin/api/dashboard-stats endpoint নেই
// (শুধু getAllTenants আছে) — তাই এখানে বড় limit দিয়ে সব tenant একবারে এনে
// client-side aggregate করা হচ্ছে। Tenant সংখ্যা কয়েকশোর বেশি হলে এটা
// একটা dedicated stats endpoint দিয়ে replace করা উচিত (backend TODO)।
export default function SuperAdminDashboard() {
  const [tenants, setTenants] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/tenants', { params: { limit: 100 } })
      setTenants(res.data.data)
    } catch (err) {
      if (!err._toastShown) setError('ড্যাশবোর্ড লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label="ড্যাশবোর্ড লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />

  const total = tenants?.length || 0
  const byStatus = (tenants || []).reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})
  const totalEmployees = (tenants || []).reduce((sum, t) => sum + parseInt(t.employee_count || 0), 0)
  const totalCustomers = (tenants || []).reduce((sum, t) => sum + parseInt(t.customer_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">ড্যাশবোর্ড</h1>
          <p className="text-pf-text-secondary text-sm mt-1">
            প্ল্যাটফর্মের সব টেন্যান্টের সারসংক্ষেপ {total >= 100 && '(প্রথম ১০০টা)'}
          </p>
        </div>
        <Link
          to="/superadmin/tenants/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-900 text-white text-sm font-semibold hover:brightness-110"
        >
          <FiPlusCircle /> নতুন টেন্যান্ট
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FiBriefcase />} label="মোট টেন্যান্ট" value={total} />
        <StatCard icon={<FiUserCheck />} label="সক্রিয়" value={byStatus.active || 0} accent="text-pf-success" />
        <StatCard icon={<FiUsers />} label="মোট কর্মী" value={totalEmployees} />
        <StatCard icon={<FiUsers />} label="মোট কাস্টমার" value={totalCustomers} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStat label="ট্রায়াল" value={byStatus.trial || 0} tone="info" />
        <MiniStat label="স্থগিত" value={byStatus.suspended || 0} tone="warning" />
        <MiniStat label="বাতিল" value={byStatus.cancelled || 0} tone="muted" />
      </div>

      <Link
        to="/superadmin/tenants"
        className="block bg-pf-bg-surface border border-pf-border rounded-xl p-5 hover:border-pf-primary-700 transition-colors"
      >
        <p className="font-pf-head font-semibold text-pf-primary-700">সব টেন্যান্ট দেখুন →</p>
        <p className="text-pf-text-secondary text-sm mt-1">তালিকা, সার্চ, স্ট্যাটাস/প্ল্যান পরিবর্তন, admin password reset</p>
      </Link>
    </div>
  )
}

function StatCard({ icon, label, value, accent = 'text-pf-primary-700' }) {
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-pf-text-muted">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`font-pf-mono text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  )
}

const TONE_CLS = {
  info:    'bg-pf-info-bg text-pf-info',
  warning: 'bg-pf-warning-bg text-pf-warning',
  muted:   'bg-pf-bg-sunken text-pf-text-muted',
}

function MiniStat({ label, value, tone }) {
  return (
    <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${TONE_CLS[tone]}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="font-pf-mono text-lg font-semibold">{value}</span>
    </div>
  )
}
