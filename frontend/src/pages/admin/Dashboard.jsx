import BroadcastEmailModal from '../../components/BroadcastEmailModal';
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { KPICard, Card } from '../../components/ui/Badge'
import { SalesChart, WorkerSalesChart, AttendancePieChart } from '../../components/charts/Charts'
import Badge from '../../components/ui/Badge'
import {
  FiUsers, FiShoppingBag, FiDollarSign,
  FiAlertTriangle, FiCheckSquare, FiTrendingUp,
  FiPackage, FiCpu, FiRefreshCw
} from 'react-icons/fi'

export default function AdminDashboard() {
  const navigate        = useNavigate()
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [kpi,      setKPI]      = useState(null)
  const [sales,    setSales]    = useState([])
  const [insights, setInsights] = useState([])
  const [topProds, setTopProds] = useState([])
  const [topShops, setTopShops] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
  const [kpiRes, salesRes, insightRes, prodRes, shopRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/reports/sales?group_by=day'),
        api.get('/ai/insights?unread_only=false&limit=5'),
        api.get('/reports/top-products?limit=5'),
        api.get('/reports/top-shops?limit=5')
      ])
      setKPI(kpiRes.data.data)
      setSales(salesRes.data.data?.records || [])
      setInsights(insightRes.data.data?.insights || [])
      setTopProds(prodRes.data.data || [])
      setTopShops(shopRes.data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const refresh = () => { setRefreshing(true); fetchData() }

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-gray-100" />
        ))}
      </div>
    )
  }

  const pending = kpi?.pending || {}
  const totalPending = (
    parseInt(pending.pending_orders       || 0) +
    parseInt(pending.pending_settlements  || 0) +
    parseInt(pending.pending_employees    || 0) +
    parseInt(pending.pending_edits        || 0)
  )

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">অ্যাডমিন ড্যাশবোর্ড</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            আজকের সারসংক্ষেপ — {new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
          রিফ্রেশ
        </button>
      </div>

      {/* Pending Alert */}
      {totalPending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="text-amber-500 text-xl flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-700 text-sm">
                {totalPending}টি অনুমোদন অপেক্ষায় আছে
              </p>
              <div className="flex gap-3 mt-1 text-xs text-amber-600">
                {pending.pending_employees > 0 && <span>কর্মচারী: {pending.pending_employees}</span>}
                {pending.pending_orders > 0 && <span>অর্ডার: {pending.pending_orders}</span>}
                {pending.pending_settlements > 0 && <span>হিসাব: {pending.pending_settlements}</span>}
                {pending.pending_edits > 0 && <span>এডিট: {pending.pending_edits}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/admin/pending')}
            className="text-sm bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition-colors"
          >
            দেখুন
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="সক্রিয় SR"
          value={kpi?.workers?.active || 0}
          subtitle={`${kpi?.workers?.pending || 0} পেন্ডিং`}
          icon={<FiUsers />}
          color="primary"
        />
        <KPICard
          title="আজকের বিক্রয়"
          value={`৳${parseInt(kpi?.today_sales?.total_sales || 0).toLocaleString()}`}
          subtitle={`${kpi?.today_sales?.invoice_count || 0}টি Invoice`}
          icon={<FiShoppingBag />}
          color="secondary"
        />
        <KPICard
          title="মোট বকেয়া"
          value={`৳${parseInt(kpi?.customers?.total_outstanding || 0).toLocaleString()}`}
          subtitle={`${kpi?.customers?.customers_with_dues || 0}টি দোকান`}
          icon={<FiDollarSign />}
          color="accent"
        />
        <KPICard
          title="মোট পণ্য"
          value={kpi?.products?.active || 0}
          subtitle={`স্টক: ${kpi?.products?.total_stock || 0} পিস`}
          icon={<FiPackage />}
          color="success"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend */}
        <Card title="বিক্রয় ট্রেন্ড" className="lg:col-span-2">
          <SalesChart
            data={sales.slice(0, 14).map(s => ({
              date:  new Date(s.date).toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' }),
              total: parseFloat(s.total_amount || 0)
            })).reverse()}
          />
        </Card>

        {/* Attendance */}
        <Card title="আজকের হাজিরা">
          <AttendancePieChart
            data={{
              present: parseInt(kpi?.attendance?.present  || 0),
              late:    parseInt(kpi?.attendance?.late     || 0),
              absent:  parseInt(kpi?.attendance?.absent   || 0)
            }}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-emerald-700 font-bold">{kpi?.attendance?.present || 0}</p>
              <p className="text-xs text-gray-500">উপস্থিত</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2">
              <p className="text-amber-700 font-bold">{kpi?.attendance?.late || 0}</p>
              <p className="text-xs text-gray-500">দেরি</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-red-700 font-bold">{kpi?.attendance?.absent || 0}</p>
              <p className="text-xs text-gray-500">অনুপস্থিত</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <Card
          title="AI ইনসাইটস"
          action={
            <button
              onClick={() => navigate('/admin/ai-insights')}
              className="text-sm text-primary hover:underline"
            >
              সব দেখুন →
            </button>
          }
        >
          <div className="space-y-3">
            {insights.slice(0, 3).map(insight => (
              <div
                key={insight.id}
                className={`p-4 rounded-xl border-l-4 ${
                  insight.severity === 'critical' ? 'bg-red-50 border-red-500' :
                  insight.severity === 'warning'  ? 'bg-amber-50 border-amber-500' :
                  'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{insight.title}</p>
                    <p className="text-xs text-gray-600 mt-1">{insight.description}</p>
                  </div>
                  <Badge variant={insight.severity} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="দ্রুত কার্যক্রম">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'নতুন কর্মচারী',   icon: '👤', path: '/admin/employees/new',  color: 'bg-primary/10 text-primary' },
            { label: 'পেন্ডিং অনুমোদন', icon: '✅', path: '/admin/pending',        color: 'bg-amber-50 text-amber-600' },
            { label: 'রিপোর্ট দেখুন',   icon: '📊', path: '/admin/reports',        color: 'bg-secondary/10 text-secondary' },
            { label: 'সেটিংস',          icon: '⚙️', path: '/admin/settings',       color: 'bg-gray-100 text-gray-600' },
          ].map(action => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl ${action.color} hover:opacity-80 transition-opacity`}
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-semibold">{action.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Top Products & Shops */}
      {(topProds.length > 0 || topShops.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topProds.length > 0 && (
            <Card title="🏆 শীর্ষ পণ্য (এই মাস)"
              action={<button onClick={() => navigate('/admin/reports')} className="text-xs text-primary hover:underline">সব →</button>}>
              <div className="space-y-2">
                {topProds.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{p.product_name}</p>
                      <p className="text-xs text-gray-400">{parseInt(p.total_qty || 0)} পিস</p>
                    </div>
                    <span className="text-sm font-bold text-secondary">৳{parseInt(p.total_revenue || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {topShops.length > 0 && (
            <Card title="🏪 শীর্ষ দোকান (এই মাস)"
              action={<button onClick={() => navigate('/admin/reports')} className="text-xs text-primary hover:underline">সব →</button>}>
              <div className="space-y-2">
                {topShops.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{s.shop_name}</p>
                      <p className="text-xs text-gray-400">{s.route_name} · {s.order_count} অর্ডার</p>
                    </div>
                    <span className="text-sm font-bold text-secondary">৳{parseInt(s.total_purchase || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      <div className="fixed bottom-20 right-4">
      <button onClick={() => setBroadcastOpen(true)}
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-white shadow-lg text-sm font-semibold">
        ✉️ সবাইকে Email
      </button>
    </div>
    <BroadcastEmailModal isOpen={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
  </div>
  )
}
