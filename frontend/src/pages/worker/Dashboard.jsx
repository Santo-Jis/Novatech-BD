import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { ProgressBar }  from '../../components/charts/Charts'
import {
  FiMapPin, FiShoppingBag, FiDollarSign,
  FiRefreshCw, FiAlertTriangle, FiCheckCircle,
  FiChevronDown, FiChevronUp, FiPackage
} from 'react-icons/fi'

export default function WorkerDashboard() {
  const navigate            = useNavigate()
  const { user }            = useAuthStore()
  const { setTodaySummary } = useAppStore()
  const [summary,   setSummary]   = useState(null)
  const [order,     setOrder]     = useState(null)
  const [allOrders, setAllOrders] = useState([])
  const [remainingSlots, setRemainingSlots] = useState(3)
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showOrderDetail, setShowOrderDetail] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState(null)

  const fetchData = async () => {
    try {
      const [summRes, orderRes] = await Promise.all([
        api.get('/sales/today-summary'),
        api.get('/orders/today')
      ])
      setSummary(summRes.data.data)
      setTodaySummary(summRes.data.data)
      setOrder(orderRes.data.data)
      setAllOrders(orderRes.data.all_orders || [])
      setRemainingSlots(orderRes.data.remaining_slots ?? 3)
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
            <p className="text-red-600 text-xs">৳{dues.toLocaleString()} পরিশোধ করুন</p>
          </div>
        </div>
      )}

      {/* Order Status */}
      {allOrders.length > 0 ? (
        <div className="space-y-3">
          {/* অর্ডার কাউন্টার + নতুন অর্ডার বাটন */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700">
              আজকের অর্ডার ({allOrders.filter(o => o.status !== 'rejected').length}/৩)
            </p>
            {remainingSlots > 0 && (
              <button
                onClick={() => navigate('/worker/order')}
                className="px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-semibold"
              >
                + আবার অর্ডার ({remainingSlots} বাকি)
              </button>
            )}
          </div>

          {/* প্রতিটি অর্ডার কার্ড */}
          {allOrders.map((ord, idx) => (
            <div key={ord.id} className={`rounded-2xl border overflow-hidden ${
              ord.status === 'approved' ? 'border-emerald-200' :
              ord.status === 'pending'  ? 'border-amber-200'   :
              'border-red-200'
            }`}>
              {/* Header */}
              <div className={`p-4 ${
                ord.status === 'approved' ? 'bg-emerald-50' :
                ord.status === 'pending'  ? 'bg-amber-50'   :
                'bg-red-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-gray-800">
                      অর্ডার #{allOrders.length - idx}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(ord.requested_at).toLocaleString('bn-BD')}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    ord.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    ord.status === 'pending'  ? 'bg-amber-100 text-amber-700'     :
                    'bg-red-100 text-red-700'
                  }`}>
                    {ord.status === 'approved' ? '✅ অনুমোদিত' :
                     ord.status === 'pending'  ? '⏳ অপেক্ষায়' : '❌ বাতিল'}
                  </div>
                </div>

                <button
                  onClick={() => setExpandedOrderId(expandedOrderId === ord.id ? null : ord.id)}
                  className="mt-2 flex items-center gap-1 text-xs text-primary font-medium"
                >
                  {expandedOrderId === ord.id ? <FiChevronUp size={13}/> : <FiChevronDown size={13}/>}
                  {expandedOrderId === ord.id ? 'কম দেখুন' : 'বিস্তারিত দেখুন'}
                </button>
              </div>

              {/* Detail Table */}
              {expandedOrderId === ord.id && (
                <div className="bg-white">
                  <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="col-span-5 text-xs font-semibold text-gray-500">পণ্য</p>
                    <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">দাম</p>
                    <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">চাহিদা</p>
                    <p className="col-span-1 text-xs font-semibold text-gray-500 text-center">অনু.</p>
                    <p className="col-span-2 text-xs font-semibold text-gray-500 text-right">মোট</p>
                  </div>
                  {(Array.isArray(ord.items) ? ord.items : []).map((item, i) => (
                    <div key={i} className={`grid grid-cols-12 px-4 py-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FiPackage className="text-primary" size={12}/>
                        </div>
                        <p className="text-xs font-medium text-gray-800 leading-tight">{item.product_name}</p>
                      </div>
                      <p className="col-span-2 text-xs text-gray-600 text-center">৳{parseFloat(item.price || 0).toLocaleString()}</p>
                      <p className="col-span-2 text-xs font-semibold text-amber-600 text-center">{item.requested_qty || 0}</p>
                      <p className="col-span-1 text-xs font-semibold text-emerald-600 text-center">{item.approved_qty ?? '—'}</p>
                      <p className="col-span-2 text-xs font-bold text-primary text-right">
                        ৳{(parseFloat(item.price || 0) * (item.approved_qty || item.requested_qty || 0)).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm font-bold text-gray-700">মোট</p>
                    <p className="text-sm font-bold text-primary">৳{parseFloat(ord.total_amount || 0).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* রুটে যান বাটন — শুধু approved অর্ডারে */}
              {ord.status === 'approved' && (
                <div className="px-4 pb-4 bg-white">
                  <button
                    onClick={() => navigate('/worker/customers')}
                    className="w-full py-2.5 bg-secondary text-white rounded-xl text-sm font-semibold"
                  >
                    রুটে যান →
                  </button>
                </div>
              )}
            </div>
          ))}
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
          { label: 'মোট বিক্রয়',      value: `৳${parseInt(sales.total_amount || 0).toLocaleString()}`, icon: '💰', color: 'bg-primary/10 text-primary' },
          { label: 'নগদ সংগ্রহ',       value: `৳${parseInt(sales.cash_received || 0).toLocaleString()}`, icon: '💵', color: 'bg-secondary/10 text-secondary' },
          { label: 'বাকি দেওয়া',       value: `৳${parseInt(sales.credit_given || 0).toLocaleString()}`, icon: '📋', color: 'bg-amber-50 text-amber-600' },
          { label: 'রিপ্লেসমেন্ট',    value: `৳${parseInt(sales.replacement_value || 0).toLocaleString()}`, icon: '🔄', color: 'bg-purple-50 text-purple-600' },
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
