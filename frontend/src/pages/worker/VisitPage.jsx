import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import {
  FiUser, FiPhone, FiMapPin, FiShoppingCart,
  FiNavigation, FiAlertTriangle, FiCheckCircle, FiLoader
} from 'react-icons/fi'
import toast from 'react-hot-toast'

// GPS নেওয়ার helper
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('এই ডিভাইসে GPS নেই'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error('GPS পাওয়া যায়নি। Location permission দিন।')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

// দূরত্ব badge
function DistanceBadge({ distance }) {
  if (distance === null) return null
  const isClose = distance <= 50
  const isMedium = distance <= 200

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
      isClose  ? 'bg-green-100 text-green-700'  :
      isMedium ? 'bg-amber-100 text-amber-700'  :
                 'bg-red-100 text-red-700'
    }`}>
      {isClose
        ? <FiCheckCircle size={13} />
        : <FiAlertTriangle size={13} />
      }
      {isClose
        ? `✅ দোকানের কাছে (${distance}m)`
        : `⚠️ দোকান থেকে ${distance}m দূরে`
      }
    </div>
  )
}

export default function VisitPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [customer,    setCustomer]    = useState(null)
  const [loading,     setLoading]     = useState(true)

  // GPS state
  const [gpsState,    setGpsState]    = useState('idle') // idle | loading | done | error
  const [location,    setLocation]    = useState(null)   // { latitude, longitude }
  const [distance,    setDistance]    = useState(null)   // মিটার (backend থেকে আসবে)
  const [gpsError,    setGpsError]    = useState(null)

  // Visit state
  const [visiting,    setVisiting]    = useState(false)
  const [visited,     setVisited]     = useState(false)

  // No-sell state
  const [showNoSell,  setShowNoSell]  = useState(false)
  const [noSellReason, setNoSellReason] = useState('')

  useEffect(() => {
    api.get(`/customers/${id}`)
      .then(res => setCustomer(res.data.data))
      .finally(() => setLoading(false))
  }, [id])

  // পেজ লোড হলেই GPS নেওয়া শুরু
  useEffect(() => {
    handleGetGPS()
  }, [])

  const handleGetGPS = async () => {
    setGpsState('loading')
    setGpsError(null)
    try {
      const loc = await getGPS()
      setLocation(loc)
      setGpsState('done')
    } catch (err) {
      setGpsError(err.message)
      setGpsState('error')
    }
  }

  // ভিজিট রেকর্ড (দোকানে ছিল, বিক্রি হয়নি)
  const handleNoSellVisit = async () => {
    if (!noSellReason.trim()) {
      toast.error('কারণ লিখুন')
      return
    }
    await submitVisit({ will_sell: false, no_sell_reason: noSellReason })
    setShowNoSell(false)
  }

  // মূল submit function
  const submitVisit = async ({ will_sell = true, no_sell_reason = null } = {}) => {
    setVisiting(true)
    try {
      const payload = {
        customer_id:    id,
        will_sell,
        no_sell_reason: no_sell_reason || undefined,
      }

      // GPS থাকলে পাঠাও
      if (location) {
        payload.latitude  = location.latitude
        payload.longitude = location.longitude
      }

      const res = await api.post('/sales/visit', payload)
      const data = res.data.data

      // Backend থেকে distance আসলে দেখাও
      if (data?.distance !== undefined) {
        setDistance(data.distance)
      }

      if (data?.warning) {
        toast(data.warning, { icon: '⚠️', duration: 4000 })
      } else {
        toast.success('ভিজিট রেকর্ড হয়েছে ✅')
      }

      setVisited(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setVisiting(false)
    }
  }

  if (loading) return (
    <div className="p-4">
      <div className="h-64 bg-white rounded-2xl animate-pulse" />
    </div>
  )

  if (!customer) return (
    <div className="p-4 text-center text-gray-500">কাস্টমার পাওয়া যায়নি</div>
  )

  return (
    <div className="p-4 space-y-4">

      {/* ── Customer Info Card ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{customer.shop_name}</h2>
            <p className="text-sm text-gray-500">{customer.owner_name}</p>
          </div>
          {/* GPS দূরত্ব badge */}
          <DistanceBadge distance={distance} />
        </div>

        <div className="mt-3 space-y-2">
          {customer.phone && (
            <p className="text-sm flex items-center gap-2">
              <FiPhone className="text-gray-400" />
              {customer.phone}
            </p>
          )}
          {customer.address && (
            <p className="text-sm flex items-center gap-2">
              <FiMapPin className="text-gray-400" />
              {customer.address}
            </p>
          )}
        </div>

        {parseFloat(customer.current_credit || 0) > 0 && (
          <div className="mt-3 bg-red-50 rounded-xl p-3">
            <p className="text-sm text-red-600 font-medium">
              বকেয়া: ৳{parseInt(customer.current_credit).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* ── GPS Status Bar ── */}
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-sm ${
        gpsState === 'done'    ? 'bg-green-50 border border-green-200' :
        gpsState === 'loading' ? 'bg-blue-50 border border-blue-200'  :
        gpsState === 'error'   ? 'bg-red-50 border border-red-200'    :
                                 'bg-gray-50 border border-gray-200'
      }`}>
        {gpsState === 'loading' && (
          <>
            <FiNavigation className="text-blue-500 animate-spin flex-shrink-0" />
            <span className="text-blue-600">GPS লোকেশন নেওয়া হচ্ছে...</span>
          </>
        )}
        {gpsState === 'done' && (
          <>
            <FiCheckCircle className="text-green-500 flex-shrink-0" />
            <span className="text-green-700">
              লোকেশন নেওয়া হয়েছে ({location?.latitude?.toFixed(4)}, {location?.longitude?.toFixed(4)})
            </span>
          </>
        )}
        {gpsState === 'error' && (
          <>
            <FiAlertTriangle className="text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-600 text-xs">{gpsError}</p>
            </div>
            <button
              onClick={handleGetGPS}
              className="text-xs text-red-600 underline flex-shrink-0"
            >
              আবার চেষ্টা
            </button>
          </>
        )}
      </div>

      {/* ── Action Buttons ── */}
      {!visited ? (
        <div className="space-y-3">
          {/* বিক্রয় করুন */}
          <button
            onClick={() => navigate(`/worker/sales/${id}`)}
            className="w-full bg-primary text-white rounded-2xl p-4 flex items-center justify-center gap-3 font-semibold text-base active:scale-95 transition-transform"
          >
            <FiShoppingCart className="text-xl" />
            বিক্রয় করুন
          </button>

          {/* ভিজিট (বিক্রি হয়নি) */}
          {/* GPS না থাকলে warning বার */}
          {(gpsState === 'error' || gpsState === 'idle' || (!location && gpsState !== 'loading')) && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <FiMapPin className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 font-medium">
                📍 লোকেশন পাওয়া যাচ্ছে না — ভিজিট বা রাখেনি করা যাবে না।
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => submitVisit({ will_sell: true })}
              disabled={visiting || gpsState !== 'done' || !location}
              className="bg-white border-2 border-gray-200 text-gray-700 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {visiting
                ? <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <FiUser className="text-2xl" />
              }
              <span className="text-sm font-semibold">ভিজিট (আসবে)</span>
            </button>

            <button
              onClick={() => setShowNoSell(true)}
              disabled={visiting || gpsState !== 'done' || !location}
              className="bg-amber-50 border-2 border-amber-200 text-amber-700 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiAlertTriangle className="text-2xl" />
              <span className="text-sm font-semibold">রাখেনি</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── Visit Confirmed ── */
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-3">
          <FiCheckCircle className="text-green-500 text-4xl mx-auto" />
          <p className="font-bold text-green-700">ভিজিট রেকর্ড হয়েছে!</p>
          <button
            onClick={() => navigate('/worker/customers')}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold"
          >
            পরের কাস্টমার →
          </button>
        </div>
      )}

      {/* ── No Sell Modal ── */}
      {showNoSell && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="font-bold text-lg text-gray-800">রাখেনি — কারণ লিখুন</h3>
            <p className="text-xs text-gray-500">কেন বিক্রি হলো না সেটা জানান</p>

            {/* Quick reason buttons */}
            <div className="flex flex-wrap gap-2">
              {['দোকান বন্ধ', 'মালিক নেই', 'বাকি বেশি', 'পণ্য নেওয়া নেই', 'অন্য কারণ'].map(r => (
                <button
                  key={r}
                  onClick={() => setNoSellReason(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    noSellReason === r
                      ? 'bg-amber-100 border-amber-400 text-amber-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <textarea
              value={noSellReason}
              onChange={e => setNoSellReason(e.target.value)}
              placeholder="বিস্তারিত লিখুন..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowNoSell(false); setNoSellReason('') }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleNoSellVisit}
                disabled={visiting || !noSellReason.trim()}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {visiting
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : null
                }
                রেকর্ড করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
