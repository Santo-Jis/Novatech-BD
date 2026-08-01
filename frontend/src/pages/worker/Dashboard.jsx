import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { ProgressBar }  from '../../components/charts/Charts'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import PullToRefreshIndicator from '../../components/PullToRefreshIndicator'
import {
  FiMapPin, FiShoppingBag, FiDollarSign,
  FiRefreshCw, FiAlertTriangle, FiCheckCircle,
  FiChevronDown, FiChevronUp, FiPackage,
  FiTarget, FiAward, FiTag, FiZap
} from 'react-icons/fi'

export default function WorkerDashboard() {
  const navigate            = useNavigate()
  const { user }            = useAuthStore()
  const { setTodaySummary, notifications, markNotificationRead, selectedRoute } = useAppStore()

  // অনুমোদন/বাতিল নোটিফিকেশন যেগুলো এখনো পড়া হয়নি
  const approvalNotifs = notifications.filter(n => n.type === 'approval' && !n.read)
  const [summary,   setSummary]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState(null)

  // ✅ একটাই aggregate কল — আগে today-summary + orders/today + my-progress +
  // commission/live + leaderboard/my-rank + promotions/active + notices — এই ৭টা
  // আলাদা কল লাগতো। ফিল্ডে নেটওয়ার্ক দুর্বল থাকে বলে সব এখন এক round-trip-এ।
  const fetchData = async () => {
    try {
      const res = await api.get('/sales/dashboard-summary')
      setSummary(res.data.data)
      setTodaySummary(res.data.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleRefresh = async () => { await fetchData() }
  const { containerRef, isRefreshing, pullDistance, pullProgress } =
    usePullToRefresh({ onRefresh: handleRefresh })

  const refresh = () => { setRefreshing(true); fetchData() }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  const sales    = summary?.sales    || {}
  const visits   = summary?.visits   || {}
  const dues     = parseFloat(summary?.dues?.outstanding_dues || 0)
  const cashDues = parseFloat(summary?.dues?.cash_dues        || 0)
  const prodDues = Math.max(0, dues - cashDues)
  const checkedIn = summary?.checked_in ?? false  // ✅ API fail হলে false — true রাখলে চেক-ইন ছাড়াই সব করা যেত

  const allOrders      = summary?.orders?.all_orders || []
  const remainingSlots = summary?.orders?.remaining_slots ?? 3

  const target      = summary?.target      || { target: 0, achieved: 0, pct: 0, days_left: 0 }
  const commission  = summary?.commission  || { rate: 0, amount: 0, next_slab: null }
  const rank        = summary?.rank        || { has_team: false }
  const stockAlerts = summary?.stock_alerts || []
  const activePromotion = summary?.active_promotion || null
  const notice          = summary?.notice          || null

  return (
    <div ref={containerRef} className="p-4 space-y-4 animate-fade-in overflow-y-auto">
      <PullToRefreshIndicator
        progress={pullProgress}
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />

      {/* ✅ অর্ডার Approval/Reject Notification Banner */}
      {approvalNotifs.length > 0 && (
        <div className="space-y-2">
          {approvalNotifs.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-2xl p-4 border ${
                n.data?.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <span className="text-2xl flex-shrink-0">
                {n.data?.status === 'approved' ? '✅' : '❌'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${
                  n.data?.status === 'approved' ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {n.title}
                </p>
                <p className={`text-xs mt-0.5 ${
                  n.data?.status === 'approved' ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {n.message}
                </p>
              </div>
              <button
                onClick={() => markNotificationRead(n.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-lg leading-none"
                aria-label="বন্ধ করুন"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Greeting */}
      <div className="bg-gradient-to-r from-primary to-primary-light rounded-2xl p-4 text-white">
        <p className="text-white/70 text-sm">আস্‌সালামু আলাইকুম</p>
        <p className="font-bold text-lg">{user?.name_bn}</p>
        <p className="text-white/60 text-xs mt-0.5">{user?.employee_code}</p>
        <p className="text-white/70 text-xs mt-2">
          {new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ✅ চেক-ইন না করলে Warning Banner */}
      {!checkedIn && (
        <div className="bg-orange-50 border border-orange-300 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-3xl">👆</span>
          <div className="flex-1">
            <p className="text-orange-700 font-bold text-sm">এখনো চেক-ইন করা হয়নি!</p>
            <p className="text-orange-600 text-xs mt-0.5">ভিজিট, বিক্রয় ও অর্ডার করতে আগে চেক-ইন করুন।</p>
          </div>
          <button
            onClick={() => navigate('/worker/attendance')}
            className="px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold flex-shrink-0"
          >
            চেক-ইন
          </button>
        </div>
      )}

      {/* SR নিজের বকেয়া Alert — settlement ঘাটতি থেকে আসা, কাস্টমারের বাকির সাথে সম্পর্ক নেই */}
      {dues > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="text-red-500 text-xl flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-red-700 font-bold text-sm">আপনার নিজের বকেয়া আছে</p>
              <p className="text-red-500 text-xs mt-0.5">
                পণ্য/নগদ ঘাটতি থেকে জমা হয়েছে — বেতন বা কমিশন থেকে কাটা হবে
              </p>

              {/* Breakdown */}
              <div className="flex gap-3 mt-2.5">
                {cashDues > 0 && (
                  <div className="bg-white border border-red-100 rounded-xl px-3 py-1.5 text-center">
                    <p className="text-[10px] text-red-400">নগদ ঘাটতি</p>
                    <p className="text-xs font-bold text-red-600">৳{cashDues.toLocaleString()}</p>
                  </div>
                )}
                {prodDues > 0 && (
                  <div className="bg-white border border-red-100 rounded-xl px-3 py-1.5 text-center">
                    <p className="text-[10px] text-red-400">পণ্য ঘাটতি</p>
                    <p className="text-xs font-bold text-red-600">৳{prodDues.toLocaleString()}</p>
                  </div>
                )}
                <div className="bg-red-100 rounded-xl px-3 py-1.5 text-center ml-auto">
                  <p className="text-[10px] text-red-500">মোট বকেয়া</p>
                  <p className="text-sm font-bold text-red-700">৳{dues.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/worker/settlement')}
            className="mt-3 w-full py-2 bg-red-600 text-white rounded-xl text-xs font-bold"
          >
            হিসাব পেজে যান →
          </button>
        </div>
      )}

      {/* ✨ নতুন — আজকের প্ল্যান (রুট + ভিজিট প্রোগ্রেস একসাথে) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiMapPin className="text-primary" />
            <p className="font-semibold text-sm text-gray-800">
              আজকের প্ল্যান{selectedRoute ? ` — ${selectedRoute.name}` : ''}
            </p>
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
        {!selectedRoute && (
          <button
            onClick={() => navigate('/worker/route')}
            className="mt-3 w-full py-2 bg-secondary text-white rounded-xl text-xs font-semibold"
          >
            রুট সিলেক্ট করুন →
          </button>
        )}
      </div>

      {/* ✨ নতুন — মাসিক টার্গেট + আজকের কমিশন (একটা কম্প্যাক্ট কার্ডে) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="pr-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FiTarget className="text-primary" size={14} />
              <p className="text-xs font-semibold text-gray-500">মাসিক টার্গেট</p>
            </div>
            {target.target > 0 ? (
              <>
                <p className="text-lg font-bold text-gray-800">
                  {target.achieved}<span className="text-xs font-medium text-gray-400"> / {target.target} কাস্টমার</span>
                </p>
                <div className="mt-1.5">
                  <ProgressBar value={target.achieved} max={target.target} showPercent={false} color="accent" />
                </div>
                <p className="text-xs text-gray-400 mt-1">{target.pct}% · আর {target.days_left} দিন বাকি</p>
              </>
            ) : (
              <p className="text-xs text-gray-400 mt-2">এই মাসে টার্গেট সেট করা হয়নি</p>
            )}
          </div>
          <div className="pl-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FiDollarSign className="text-secondary" size={14} />
              <p className="text-xs font-semibold text-gray-500">আজকের কমিশন</p>
            </div>
            <p className="text-lg font-bold text-secondary">৳{Math.round(commission.amount || 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1.5">বর্তমান রেট: {commission.rate || 0}%</p>
          </div>
        </div>
        {commission.next_slab && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-2.5 flex items-center gap-2">
            <FiZap className="text-amber-500 flex-shrink-0" size={16} />
            <p className="text-xs text-amber-700">
              আর <span className="font-bold">৳{Math.round(commission.next_slab.needed_sales).toLocaleString()}</span> বিক্রি করলে রেট{' '}
              <span className="font-bold">{commission.next_slab.rate}%</span> হবে
              {commission.next_slab.bonus_if_reached > 0 && (
                <> — বোনাস <span className="font-bold">+৳{commission.next_slab.bonus_if_reached.toLocaleString()}</span></>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ✨ নতুন — টিম র‍্যাংক */}
      {rank.has_team && rank.my_rank && (
        <button
          onClick={() => navigate('/worker/leaderboard')}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3 bg-white shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-2.5">
            <FiAward className="text-amber-500" size={18} />
            <p className="text-sm text-gray-700">
              এই মাসে টিমে <span className="font-bold text-gray-900">#{rank.my_rank}</span> — {rank.total_members} জনের মধ্যে
            </p>
          </div>
          <span className="text-xs text-primary font-semibold">লিডারবোর্ড →</span>
        </button>
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

      {/* Sales Summary (+ ✨ নতুন ৫ম কার্ড: বকেয়া আদায়) */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'মোট বিক্রয়',   value: `৳${parseInt(sales.total_amount || 0).toLocaleString()}`,     icon: '💰', color: 'bg-primary/10 text-primary',     span: false },
          { label: 'নগদ সংগ্রহ',    value: `৳${parseInt(sales.cash_received || 0).toLocaleString()}`,    icon: '💵', color: 'bg-secondary/10 text-secondary', span: false },
          { label: 'বাকি দেওয়া',    value: `৳${parseInt(sales.credit_given || 0).toLocaleString()}`,     icon: '📋', color: 'bg-amber-50 text-amber-600',     span: false },
          { label: 'রিপ্লেসমেন্ট', value: `৳${parseInt(sales.replacement_value || 0).toLocaleString()}`, icon: '🔄', color: 'bg-purple-50 text-purple-600', span: false },
          { label: 'বকেয়া আদায় (পুরনো দেনা)', value: `৳${parseInt(sales.credit_collected || 0).toLocaleString()}`, icon: '🧾', color: 'bg-teal-50 text-teal-700', span: true },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl p-3 ${item.color} ${item.span ? 'col-span-2' : ''}`}>
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

      {/* ✨ নতুন — স্টক কম সতর্কতা (শর্তসাপেক্ষ) */}
      {stockAlerts.length > 0 && (
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <FiPackage className="text-orange-500 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">কিছু পণ্যের স্টক কম</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {stockAlerts.map(s => s.product_name).join(', ')} — পরের বিক্রির আগে দেখে নাও
            </p>
          </div>
          <button onClick={() => navigate('/worker/stock-status')} className="text-xs text-primary font-semibold flex-shrink-0">
            দেখুন →
          </button>
        </div>
      )}

      {/* ✨ নতুন — চলমান অফার রিমাইন্ডার (শর্তসাপেক্ষ) */}
      {activePromotion && (
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <FiTag className="text-secondary flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">আজ চলছে</p>
            <p className="text-xs text-gray-500 mt-0.5">{activePromotion.name}</p>
          </div>
        </div>
      )}

      {/* ✨ নতুন — নোটিশ প্রিভিউ (শর্তসাপেক্ষ) */}
      {notice && (
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <span className="text-xl flex-shrink-0">📢</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{notice.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{notice.message}</p>
          </div>
          <button onClick={() => navigate('/worker/notices')} className="text-xs text-primary font-semibold flex-shrink-0">
            সব →
          </button>
        </div>
      )}

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
        <button
          onClick={() => navigate('/worker/monthly-ledger')}
          className="col-span-2 flex items-center justify-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="text-2xl">📋</span>
          <span className="text-xs font-semibold text-gray-700">মাসিক লেজার (বিক্রয়, বেতন, উপস্থিতি, বাকি)</span>
        </button>
      </div>
    </div>
  )
}
