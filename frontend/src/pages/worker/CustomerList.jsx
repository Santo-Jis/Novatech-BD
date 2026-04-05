import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAppStore } from '../../store/app.store'
import { ProgressBar } from '../../components/charts/Charts'
import { FiMapPin, FiSearch, FiNavigation } from 'react-icons/fi'
import toast from 'react-hot-toast'

// ============================================================
// Customer List Page
// ============================================================
export function CustomerList() {
  const navigate            = useNavigate()
  const { selectedRoute }   = useAppStore()
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [location,  setLocation]  = useState(null)

  // GPS নিন
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute.id)
    if (location) { params.append('lat', location.lat); params.append('lng', location.lng) }

    api.get(`/customers?${params}`)
      .then(res => setCustomers(res.data.data))
      .finally(() => setLoading(false))
  }, [selectedRoute, location])

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search)
  )

  const visited   = customers.filter(c => c.visited_today).length
  const total     = customers.length

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4 animate-fade-in">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">কাস্টমার তালিকা</h2>
        {selectedRoute && <p className="text-xs text-gray-500 mt-0.5">রুট: {selectedRoute.name}</p>}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <ProgressBar value={visited} max={total} label={`${visited}/${total} ভিজিট সম্পন্ন`} color="secondary" />
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="দোকান বা মালিকের নাম"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-primary"
        />
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {filtered.map(customer => (
          <button
            key={customer.id}
            onClick={() => navigate(`/worker/visit/${customer.id}`)}
            className={`w-full bg-white rounded-2xl p-4 border shadow-sm text-left active:scale-[0.98] transition-all ${
              customer.visited_today ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100 hover:border-primary/30'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Photo */}
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-amber-100 flex items-center justify-center flex-shrink-0">
                {customer.shop_photo
                  ? <img src={customer.shop_photo} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xl">🏪</span>
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm truncate">{customer.shop_name}</p>
                    <p className="text-xs text-gray-500">{customer.owner_name}</p>
                  </div>
                  {customer.visited_today && (
                    <span className="text-emerald-500 text-lg flex-shrink-0">✅</span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {customer.distance_meters !== null && customer.distance_meters !== undefined && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <FiNavigation className="text-xs" />
                      {customer.distance_meters < 1000
                        ? `${customer.distance_meters}মি`
                        : `${(customer.distance_meters / 1000).toFixed(1)}কি.মি`
                      }
                    </span>
                  )}
                  {parseFloat(customer.current_credit) > 0 && (
                    <span className="text-xs text-red-500 font-medium">
                      বকেয়া: ৳{parseFloat(customer.current_credit).toLocaleString('bn-BD')}
                    </span>
                  )}
                  {parseFloat(customer.credit_balance) > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">
                      ব্যালেন্স: ৳{parseFloat(customer.credit_balance).toLocaleString('bn-BD')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Visit Page — মাল রাখবে / রাখবে না
// ============================================================
export function VisitPage() {
  const navigate       = useNavigate()
  const customerId     = window.location.pathname.split('/').pop()
  const [customer, setCustomer] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [noSellReason, setNoSellReason] = useState('')
  const [showNoSell,   setShowNoSell]   = useState(false)

  useEffect(() => {
    api.get(`/customers/${customerId}`)
      .then(res => setCustomer(res.data.data))
      .finally(() => setLoading(false))
  }, [customerId])

  const recordVisit = async (willSell, reason = null) => {
    setDeciding(true)
    try {
      // GPS নিন
      let lat = null, lng = null
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch {}

      const res = await api.post('/sales/visit', {
        customer_id: customerId,
        will_sell:   willSell,
        no_sell_reason: reason,
        latitude:    lat,
        longitude:   lng
      })

      const data = res.data.data

      // লোকেশন warning
      if (data.warning) toast(data.warning, { icon: '⚠️' })

      if (willSell) {
        navigate(`/worker/sales/${customerId}?visit_id=${data.visit_id}`)
      } else {
        toast.success('ভিজিট রেকর্ড হয়েছে।')
        navigate('/worker/customers')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setDeciding(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>
  if (!customer) return <div className="p-4 text-center text-gray-400">কাস্টমার পাওয়া যায়নি।</div>

  return (
    <div className="p-4 space-y-4 animate-fade-in">

      {/* Customer Info */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-amber-100 flex items-center justify-center flex-shrink-0">
            {customer.shop_photo
              ? <img src={customer.shop_photo} alt="" className="w-full h-full object-cover" />
              : <span className="text-2xl">🏪</span>
            }
          </div>
          <div>
            <p className="font-bold text-gray-800">{customer.shop_name}</p>
            <p className="text-sm text-gray-600">{customer.owner_name}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{customer.customer_code}</p>
            {customer.business_type && (
              <p className="text-xs text-gray-400">{customer.business_type}</p>
            )}
          </div>
        </div>

        {/* Credit Info */}
        {(parseFloat(customer.current_credit) > 0 || parseFloat(customer.credit_balance) > 0) && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
            {parseFloat(customer.current_credit) > 0 && (
              <div className="bg-red-50 rounded-xl p-2 text-center">
                <p className="text-xs text-gray-500">বকেয়া</p>
                <p className="font-bold text-red-600 text-sm">৳{parseFloat(customer.current_credit).toLocaleString('bn-BD')}</p>
              </div>
            )}
            {parseFloat(customer.credit_balance) > 0 && (
              <div className="bg-emerald-50 rounded-xl p-2 text-center">
                <p className="text-xs text-gray-500">ব্যালেন্স</p>
                <p className="font-bold text-emerald-600 text-sm">৳{parseFloat(customer.credit_balance).toLocaleString('bn-BD')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Decision */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700 text-center">মাল রাখবেন?</p>

        <button
          onClick={() => recordVisit(true)}
          disabled={deciding}
          className="w-full py-4 bg-secondary text-white rounded-2xl font-bold text-lg shadow-lg shadow-secondary/30 active:scale-95 transition-transform disabled:opacity-60"
        >
          ⭐ মাল রাখব
        </button>

        <button
          onClick={() => setShowNoSell(true)}
          disabled={deciding}
          className="w-full py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold text-lg active:scale-95 transition-transform disabled:opacity-60"
        >
          ❌ মাল রাখব না
        </button>
      </div>

      {/* No sell reason */}
      {showNoSell && (
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
          <p className="font-semibold text-sm text-gray-700">কারণ লিখুন:</p>
          <div className="grid grid-cols-2 gap-2">
            {['দোকান বন্ধ', 'মাল নেবে না', 'পরে নেবে', 'অন্য কারণ'].map(reason => (
              <button
                key={reason}
                onClick={() => setNoSellReason(reason)}
                className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                  noSellReason === reason ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            value={noSellReason}
            onChange={e => setNoSellReason(e.target.value)}
            placeholder="বিস্তারিত লিখুন..."
            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-primary"
            rows={2}
          />
          <button
            onClick={() => recordVisit(false, noSellReason)}
            disabled={!noSellReason || deciding}
            className="w-full py-3 bg-gray-700 text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {deciding ? 'রেকর্ড হচ্ছে...' : 'জমা দিন'}
          </button>
        </div>
      )}
    </div>
  )
}

export default CustomerList
