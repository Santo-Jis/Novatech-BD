import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { KPICard, Card } from '../../components/ui/Badge'
import { SalesChart, AttendancePieChart } from '../../components/charts/Charts'
import Badge from '../../components/ui/Badge'
import { useAuthStore } from '../../store/auth.store'
import {
  FiUsers, FiShoppingBag, FiCheckSquare,
  FiAlertTriangle, FiRefreshCw, FiDollarSign, FiMapPin
} from 'react-icons/fi'

export default function ManagerDashboard() {
  const navigate       = useNavigate()
  const { user }       = useAuthStore()
  const [kpi,      setKPI]      = useState(null)
  const [sales,    setSales]    = useState([])
  const [insights, setInsights] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [kpiRes, salesRes, insightRes] = await Promise.all([
        api.get('/reports/kpi'),
        api.get('/reports/sales?group_by=day'),
        api.get('/ai/insights?limit=3')
      ])
      setKPI(kpiRes.data.data)
      setSales(salesRes.data.data?.records || [])
      setInsights(insightRes.data.data?.insights || [])
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
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-gray-100" />
        ))}
      </div>
    )
  }

  const pending = kpi?.pending_settlements || 0

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            আস্‌সালামু আলাইকুম, {user?.name_bn}!
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
          <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
          রিফ্রেশ
        </button>
      </div>

      {/* Pending Settlement Alert */}
      {pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="text-amber-500 text-xl" />
            <p className="font-semibold text-amber-700 text-sm">
              {pending}টি হিসাব অনুমোদনের অপেক্ষায়
            </p>
          </div>
          <button onClick={() => navigate('/manager/settlements')}
            className="text-sm bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600">
            দেখুন
          </button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="আজকের বিক্রয়"
          value={`৳${parseInt(kpi?.sales?.total_sales || 0).toLocaleString('bn-BD')}`}
          subtitle={`${kpi?.sales?.total_invoices || 0}টি Invoice`}
          icon={<FiShoppingBag />}
          color="primary"
        />
        <KPICard
          title="সক্রিয় SR"
          value={kpi?.attendance?.present || 0}
          subtitle={`${kpi?.attendance?.absent || 0} অনুপস্থিত`}
          icon={<FiUsers />}
          color="secondary"
        />
        <KPICard
          title="মোট বকেয়া"
          value={`৳${parseInt(kpi?.credit?.total_outstanding || 0).toLocaleString('bn-BD')}`}
          subtitle={`${kpi?.credit?.customers_with_dues || 0}টি দোকান`}
          icon={<FiDollarSign />}
          color="accent"
        />
        <KPICard
          title="পেন্ডিং অর্ডার"
          value={kpi?.pending_orders || 0}
          subtitle="অনুমোদন প্রয়োজন"
          icon={<FiCheckSquare />}
          color="danger"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="বিক্রয় ট্রেন্ড (৭ দিন)" className="lg:col-span-2">
          <SalesChart
            data={sales.slice(0, 7).map(s => ({
              date:  new Date(s.date).toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' }),
              total: parseFloat(s.total_amount || 0)
            })).reverse()}
          />
        </Card>

        <Card title="আজকের হাজিরা">
          <AttendancePieChart
            data={{
              present: parseInt(kpi?.attendance?.present || 0),
              late:    parseInt(kpi?.attendance?.late    || 0),
              absent:  parseInt(kpi?.attendance?.absent  || 0)
            }}
          />
          <button
            onClick={() => navigate('/manager/attendance')}
            className="mt-3 w-full text-center text-sm text-primary hover:underline"
          >
            বিস্তারিত দেখুন →
          </button>
        </Card>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <Card title="🤖 AI ইনসাইটস">
          <div className="space-y-3">
            {insights.map(insight => (
              <div key={insight.id}
                className={`p-3 rounded-xl border-l-4 ${
                  insight.severity === 'critical' ? 'bg-red-50 border-red-500' :
                  insight.severity === 'warning'  ? 'bg-amber-50 border-amber-500' :
                  'bg-blue-50 border-blue-500'
                }`}
              >
                <p className="font-semibold text-sm text-gray-800">{insight.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{insight.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="দ্রুত কার্যক্রম">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'অর্ডার অনুমোদন', icon: '📦', path: '/manager/orders',      color: 'bg-primary/10 text-primary' },
            { label: 'হিসাব অনুমোদন',  icon: '✅', path: '/manager/settlements', color: 'bg-secondary/10 text-secondary' },
            { label: 'টিম হাজিরা',     icon: '📅', path: '/manager/attendance',  color: 'bg-amber-50 text-amber-600' },
            { label: 'রুট ম্যানেজ',    icon: '🗺️', path: '/manager/routes',     color: 'bg-gray-100 text-gray-600' },
          ].map(action => (
            <button key={action.path} onClick={() => navigate(action.path)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl ${action.color} hover:opacity-80 transition-opacity`}>
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-semibold text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
