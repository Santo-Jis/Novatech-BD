import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FiBriefcase, FiUsers, FiUserCheck, FiPlusCircle, FiTrendingUp, FiShoppingBag } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState } from './components/PanelStates'

// ✅ Phase 4 আপডেট: আগে এখানে /tenants?limit=100 টেনে client-side এ
// aggregate করা হতো (১০০+ টেন্যান্ট হলে ভুল সংখ্যা দেখাত)। এখন
// backend-এর dedicated /dashboard-stats endpoint ব্যবহার করা হচ্ছে —
// tenant সংখ্যা যতই হোক, খরচ সবসময় একই (single aggregate SQL query)।
export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/dashboard-stats')
      setStats(res.data.data)
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
  if (!stats) return null

  const total = parseInt(stats.total_tenants || 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">ড্যাশবোর্ড</h1>
          <p className="text-pf-text-secondary text-sm mt-1">প্ল্যাটফর্মের সব টেন্যান্টের সারসংক্ষেপ</p>
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
        <StatCard icon={<FiUserCheck />} label="সক্রিয়" value={stats.active} accent="text-pf-success" />
        <StatCard icon={<FiUsers />} label="মোট কর্মী" value={stats.total_employees} />
        <StatCard icon={<FiUsers />} label="মোট কাস্টমার" value={stats.total_customers} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FiShoppingBag />} label="মোট বিক্রয় (লেনদেন)" value={stats.total_sales} />
        <StatCard
          icon={<FiTrendingUp />}
          label="মোট রাজস্ব"
          value={`৳${Number(stats.total_revenue || 0).toLocaleString('bn-BD')}`}
        />
        <MiniStat label="ট্রায়াল" value={stats.trial} tone="info" />
        <MiniStat label="স্থগিত/বাতিল" value={parseInt(stats.suspended || 0) + parseInt(stats.cancelled || 0)} tone="warning" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickLink
          to="/superadmin/tenants"
          title="সব টেন্যান্ট"
          description="তালিকা, সার্চ, স্ট্যাটাস/প্ল্যান পরিবর্তন, admin password reset"
        />
        <QuickLink
          to="/superadmin/staff"
          title="Platform Staff"
          description="Support Panel-এর স্টাফ অ্যাকাউন্ট তৈরি ও ব্যবস্থাপনা"
        />
        <QuickLink
          to="/superadmin/audit-log"
          title="Audit Log"
          description="সব Super Admin ও Support Staff action-এর ইতিহাস"
        />
      </div>
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
      <p className={`font-pf-mono text-2xl font-semibold ${accent}`}>{value ?? 0}</p>
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
    <div className={`rounded-xl px-4 py-3 flex items-center justify-between h-full ${TONE_CLS[tone]}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="font-pf-mono text-lg font-semibold">{value}</span>
    </div>
  )
}

function QuickLink({ to, title, description }) {
  return (
    <Link
      to={to}
      className="block bg-pf-bg-surface border border-pf-border rounded-xl p-5 hover:border-pf-primary-700 transition-colors"
    >
      <p className="font-pf-head font-semibold text-pf-primary-700">{title} →</p>
      <p className="text-pf-text-secondary text-sm mt-1">{description}</p>
    </Link>
  )
}
