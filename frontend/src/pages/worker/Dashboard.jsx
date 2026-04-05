import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { ProgressBar }  from '../../components/charts/Charts'
import {
  FiMapPin, FiShoppingBag, FiDollarSign,
  FiRefreshCw, FiAlertTriangle, FiCheckCircle
} from 'react-icons/fi'

export default function WorkerDashboard() {
  const navigate            = useNavigate()
  const { user }            = useAuthStore()
  const { setTodaySummary } = useAppStore()
  const [summary,   setSummary]   = useState(null)
  const [order,     setOrder]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [summRes, orderRes] = await Promise.all([
        api.get('/sales/today-summary'),
        api.get('/orders/today')
      ])
      setSummary(summRes.data.data)
      setTodaySummary(summRes.data.data)
      setOrder(orderRes.data.data)
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
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  const sales    = summary?.sales    || {}
  const visits   = summary?.visits   || {}
  const dues     = parseFloat(summary?.outstanding_dues || 0)
  const todayAtt = summary?.today_order

  return (
    <div className="p-4 space-y-4 animate-fade-in">

      {/* Greeting */}
      <div className="bg-gradient-to-r from-primary to-primary-light rounded-2xl p-4 text-white">
        <p className="text-white/70 text-sm">আস্‌সালামু আলাইকুম</p>
        <p className="font-bold text-lg">{user?.name_bn}</p>
        <p className="text-white/60 text-xs mt-0.5">{user?.employee_code}</p>
        <p className="text-white/70 text-xs mt-2">
          {new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Outstanding Dues Alert */}
      {dues > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-3">
          <FiAlertTriangle className="text-red-500 text-xl flex-shrink-0" />
          <div>
            <p className="text-red-700 font-semibold text-sm">বকেয়া আছে</p>
            <p className="text-red-600 text-xs">৳{dues.toLocaleString('bn-BD')} পরিশোধ করুন</p>
          </div>
        </div>
      )}

      {/* Order Status */}
      {order ? (
        <div className={`rounded-2xl p-4 border ${
          order.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
          order.status === 'pending'  ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-gray-800">আজকের অর্ডার</p>
              <p className="text-xs text-gray-500 mt-0.5">
                মোট: ৳{parseInt(order.total_amount || 0).toLocaleString('bn-BD')}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
              order.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
              order.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {order.status === 'approved' ? '✅ অনুমোদিত' :
               order.status === 'pending'  ? '⏳ অপেক্ষায়' : '❌ বাতিল'}
            </div>
          </div>
          {order.status === 'approved' && (
            <button
              onClick={() => navigate('/worker/customers')}
              className="mt-3 w-full py-2 bg-secondary text-white rounded-xl text-sm font-semibold"
            >
              রুটে যান →
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-4 text-center">
          <p className="text-gray-500 text-sm">আজকের অর্ডার দেওয়া হয়নি</p>
          <button
            onClick={() => navigate('/worker/order')}
            className="mt-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold"
          >
            অর্ডার দিন
          </button>
        </div>
      )}

      {/* Visit Progress */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiMapPin className="text-primary" />
            <p className="font-semibold text-sm text-gray-800">আজকের ভিজিট</p>
          </div>
          <button onClick={refresh} className="text-gray-400 hover:text-gray-600">
            <FiRefreshCw className={`text-sm ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <ProgressBar
          value={parseInt(visits.total_visits || 0)}
          max={parseInt(visits.total_customers || 1)}
          label={`${visits.total_visits || 0} / ${visits.total_customers || 0} দোকান`}
          color="primary"
        />
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            বিক্রি: {visits.sold_visits || 0}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-400 rounded-full" />
            রাখেনি: {visits.no_sell_visits || 0}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-gray-300 rounded-full" />
            বাকি: {Math.max(0, (visits.total_customers || 0) - (visits.total_visits || 0))}
          </span>
        </div>
      </div>

      {/* Sales Summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'মোট বিক্রয়',      value: `৳${parseInt(sales.total_amount || 0).toLocaleString('bn-BD')}`, icon: '💰', color: 'bg-primary/10 text-primary' },
          { label: 'নগদ সংগ্রহ',       value: `৳${parseInt(sales.cash_received || 0).toLocaleString('bn-BD')}`, icon: '💵', color: 'bg-secondary/10 text-secondary' },
          { label: 'বাকি দেওয়া',       value: `৳${parseInt(sales.credit_given || 0).toLocaleString('bn-BD')}`, icon: '📋', color: 'bg-amber-50 text-amber-600' },
          { label: 'রিপ্লেসমেন্ট',    value: `৳${parseInt(sales.replacement_value || 0).toLocaleString('bn-BD')}`, icon: '🔄', color: 'bg-purple-50 text-purple-600' },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl p-3 ${item.color}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-xs opacity-70">{item.label}</p>
                <p className="font-bold text-sm">{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/worker/attendance')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="text-3xl">👆</span>
          <span className="text-xs font-semibold text-gray-700">চেক-ইন/আউট</span>
        </button>
        <button
          onClick={() => navigate('/worker/settlement')}
          className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="text-3xl">📊</span>
          <span className="text-xs font-semibold text-gray-700">হিসাব দিন</span>
        </button>
      </div>
    </div>
  )
}
