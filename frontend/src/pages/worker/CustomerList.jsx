// frontend/src/pages/worker/CustomerList.jsx
// Worker: কাস্টমার তালিকা + নতুন কাস্টমার (Email OTP যাচাই সহ)

import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api, { isNetworkError } from '../../api/axios'
import { saveCache, getCache } from '../../api/offlineQueue'
import {
  FiSearch, FiPlus, FiX, FiUser,
  FiCamera, FiNavigation, FiCheck, FiEdit2, FiMail, FiChevronRight
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import CustomerEditModal from '../../components/CustomerEditModal'
import EmailOTPVerify   from '../../components/EmailOTPVerify'

// ── Step Indicator ────────────────────────────────────────────
function StepBadge({ step }) {
  const steps  = ['form', 'email_otp']
  const labels = { form: 'তথ্য পূরণ', email_otp: 'Email যাচাই', whatsapp_success: 'সম্পন্ন' }
  return (
    <div className="flex items-center gap-1 mt-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center transition-all
            ${step === s ? 'bg-primary text-white'
              : i < steps.indexOf(step) ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-400'}`}>
            {i < steps.indexOf(step) ? '✓' : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-0.5 ${steps.indexOf(step) > i ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className="text-xs text-gray-400 ml-1">{labels[step]}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function CustomerList() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [customers,    setCustomers]    = useState([])
  const [routes,       setRoutes]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editModal,    setEditModal]    = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [gpsLoading,   setGpsLoading]   = useState(false)
  const [step,         setStep]         = useState('form') // 'form' | 'email_otp' | 'whatsapp_success'
  const [waUrl,         setWaUrl]         = useState(null)
  const [sendingLink,   setSendingLink]   = useState(null) // customer id যার link পাঠানো হচ্ছে
  const [emailVerified, setEmailVerified] = useState(false)
  const fileRef = useRef()
  const [userLocation, setUserLocation] = useState(null)

  // ── Haversine: দুই পয়েন্টের মধ্যে দূরত্ব (মিটার) ────────────
  const calcDistance = (lat1, lng1, lat2, lng2) => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2)**2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
  }

  const formatDistance = (meters) => {
    if (meters == null) return null
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} কিমি`
    return `${meters} মি`
  }

  const emptyForm = {
    shop_name: '', owner_name: '', business_type: '',
    whatsapp: '', sms_phone: '',
    email: '', credit_limit: '5000', route_id: '',
    lat: null, lng: null, photo: null
  }
  const [newCustomer, setNewCustomer] = useState(emptyForm)

  const resetForm = () => {
    setNewCustomer(emptyForm)
    setStep('form')
    setEmailVerified(false)
  }

  const loadCustomers = async () => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute.id)

    // অফলাইনে cache থেকে দেখাও
    if (!navigator.onLine) {
      const cacheKey = `customers_route_${selectedRoute?.id || 'all'}`
      const cached = await getCache(cacheKey)
      if (cached?.isToday) {
        setCustomers(cached.data)
      } else {
        // আজকের cache নেই
        toast.error('আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।', { duration: 5000 })
      }
      setLoading(false)
      return
    }

    const fetchWithParams = async (extraParams = '') => {
      try {
        const res = await api.get(`/customers?${params}${extraParams}`)
        const data = res.data.data || []
        setCustomers(data)
        // online-এ সফল হলে cache-এ রাখো
        const cacheKey = `customers_route_${selectedRoute?.id || 'all'}`
        saveCache(cacheKey, data)
      } catch (err) {
        // Slow internet / timeout → cache থেকে দেখাও
        if (isNetworkError(err)) {
          const cacheKey = `customers_route_${selectedRoute?.id || 'all'}`
          const cached = await getCache(cacheKey)
          if (cached?.isToday) {
            setCustomers(cached.data)
            toast('নেটওয়ার্ক ধীর — আজকের সংরক্ষিত তালিকা দেখানো হচ্ছে', {
              icon: '📶', duration: 3000
            })
          } else {
            toast.error('আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।', { duration: 5000 })
          }
        }
      } finally {
        setLoading(false)
      }
    }

    // GPS পাঠাই — visit_order না থাকলে কাছের দোকান আগে দেখাবে
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          fetchWithParams(
            `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          )
        },
        () => fetchWithParams(), // GPS ব্যর্থ হলে শুধু route filter
        { enableHighAccuracy: true, timeout: 8000 }
      )
    } else {
      fetchWithParams()
    }
  }

  useEffect(() => {
    loadCustomers()

    // routes — online হলে fetch ও cache করো, offline বা slow হলে cache থেকে
    if (navigator.onLine) {
      api.get('/routes')
        .then(res => {
          const data = res.data.data || []
          setRoutes(data)
          saveCache('routes_list', data)
        })
        .catch(async err => {
          if (isNetworkError(err)) {
            const cached = await getCache('routes_list')
            if (cached?.isToday) setRoutes(cached.data)
          }
        })
    } else {
      getCache('routes_list').then(cached => { if (cached?.isToday) setRoutes(cached.data) })
    }

    // ── Live GPS watch — প্রতি মুভমেন্টে distance আপডেট ──────
    let watchId = null
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId) }
  }, [selectedRoute])

  // ── GPS ──────────────────────────────────────────────────────
  const getGPS = () => {
    setGpsLoading(true)
    if (!navigator.geolocation) { toast.error('GPS সাপোর্ট নেই'); setGpsLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setNewCustomer(p => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }))
        toast.success('GPS নেওয়া হয়েছে ✅')
        setGpsLoading(false)
      },
      () => { toast.error('GPS পাওয়া যায়নি'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  // ── Photo ────────────────────────────────────────────────────
  const handlePhoto = e => {
    const file = e.target.files[0]
    if (!file) return
    setNewCustomer(p => ({ ...p, photo: file }))
    toast.success('ছবি সিলেক্ট হয়েছে ✅')
  }

  // ── পুরাতন কাস্টমারকে WhatsApp Portal Link পাঠাও ──────────
  const sendPortalLinkToCustomer = async (customer) => {
    if (!customer.whatsapp) return toast.error('এই কাস্টমারের WhatsApp নম্বর নেই।')
    setSendingLink(customer.id)
    try {
      const linkRes = await api.post(`/portal/send-link/${customer.id}`)
      const url = linkRes.data?.data?.whatsapp_url
      if (url) {
        setWaUrl(url)
        setStep('whatsapp_success')
        setShowAddModal(true) // success screen দেখাতে modal খুলি
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'লিংক তৈরিতে সমস্যা হয়েছে।')
    } finally {
      setSendingLink(null)
    }
  }

  // ── Form → Next Step ─────────────────────────────────────────
  const handleFormNext = () => {
    if (!newCustomer.shop_name.trim()) return toast.error('দোকানের নাম দিন')
    if (!newCustomer.whatsapp.trim())  return toast.error('WhatsApp নম্বর দিন')
    if (!newCustomer.lat)              return toast.error('GPS লোকেশন নিন')

    if (newCustomer.email.trim() && !emailVerified) {
      setStep('email_otp')
    } else {
      submitCustomer()
    }
  }

  // ── Submit ───────────────────────────────────────────────────
  const submitCustomer = async () => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('shop_name',    newCustomer.shop_name.trim())
      formData.append('owner_name',   newCustomer.owner_name.trim())
      formData.append('whatsapp',     newCustomer.whatsapp.trim())
      formData.append('sms_phone',    newCustomer.sms_phone.trim() || newCustomer.whatsapp.trim())
      formData.append('credit_limit', newCustomer.credit_limit || 5000)
      formData.append('latitude',     newCustomer.lat)
      formData.append('longitude',    newCustomer.lng)
      if (newCustomer.business_type) formData.append('business_type', newCustomer.business_type)
      if (newCustomer.email.trim())  formData.append('email',         newCustomer.email.trim())
      if (newCustomer.route_id)      formData.append('route_id',      newCustomer.route_id)
      if (newCustomer.photo)         formData.append('shop_photo',    newCustomer.photo)

      const createRes = await api.post('/customers', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      loadCustomers()

      // ✅ Portal Link তৈরি করে WhatsApp Success Screen দেখাও
      const newCustomerId = createRes.data?.data?.id
      if (newCustomerId) {
        try {
          const linkRes = await api.post(`/portal/send-link/${newCustomerId}`)
          const url = linkRes.data?.data?.whatsapp_url
          if (url) {
            setWaUrl(url)
            setStep('whatsapp_success')
            return // modal বন্ধ করব না, success screen দেখাব
          }
        } catch (linkErr) {
          console.warn('WhatsApp link তৈরি হয়নি:', linkErr.message)
        }
      }

      // link না পেলে সরাসরি modal বন্ধ
      setShowAddModal(false)
      resetForm()
    } catch (err) {
      toast.error(err.response?.data?.message || 'কাস্টমার যোগ হয়নি')
      setStep('form')
    } finally {
      setSaving(false)
    }
  }

  const handleOTPVerified = () => {
    setEmailVerified(true)
    submitCustomer()
  }

  const handleSkipEmail = () => {
    setNewCustomer(p => ({ ...p, email: '' }))
    submitCustomer()
  }

  // ── একবারেই সব কাস্টমারের দূরত্ব হিসাব — userLocation বা customers বদলালেই আপডেট ──
  const distanceMap = useMemo(() => {
    const map = {}
    if (!userLocation) return map
    customers.forEach(c => {
      map[c.id] = calcDistance(
        userLocation.lat, userLocation.lng,
        parseFloat(c.latitude), parseFloat(c.longitude)
      )
    })
    return map
  }, [userLocation, customers])

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search)
  )

  if (loading) return (
    <div className="p-4 space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">কাস্টমার তালিকা</h2>
          <p className="text-xs text-gray-500">
            {customers.filter(c => c.visited_today).length}/{customers.length} ভিজিট সম্পন্ন
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm active:scale-95 transition-transform"
        >
          <FiPlus /> নতুন
        </button>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="দোকান বা মালিকের নাম..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm focus:outline-none focus:border-primary/40"
        />
      </div>

      {/* ── Customer Cards ── */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <FiUser className="text-4xl mx-auto mb-2" />
            <p>কোনো কাস্টমার নেই</p>
          </div>
        )}
        {filtered.map(c => (
          <div key={c._id || c.id}
            className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all
              ${c.visited_today ? 'border-green-400' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0" onClick={() => navigate(`/worker/visit/${c._id || c.id}`)}>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Visit ক্রম নম্বর */}
                  {c.visit_order != null && (
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary
                                     text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {c.visit_order}
                    </span>
                  )}
                  <h3 className="font-semibold text-gray-800">{c.shop_name}</h3>
                  {c.has_pending_edit && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">⏳ pending</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{c.owner_name}</p>

                {/* ── ফোন নম্বর ── */}
                {(c.whatsapp || c.sms_phone) && (
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    📞 {c.whatsapp || c.sms_phone}
                  </p>
                )}

                {/* ── রুট ── */}
                {c.route_name && (
                  <p className="text-xs text-gray-400 mt-0.5">🗺 {c.route_name}</p>
                )}

                {/* ── Email ── */}
                {c.email && (
                  <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                    <FiMail size={10} /> {c.email}
                  </p>
                )}

                {/* ── দূরত্ব ── */}
                {formatDistance(distanceMap[c.id]) && (
                  <p className="text-xs text-blue-500 font-medium mt-0.5 flex items-center gap-1">
                    <FiNavigation size={10} /> {formatDistance(distanceMap[c.id])} দূরে
                  </p>
                )}

                {/* ── ক্রেডিট লিমিট ── */}
                {(() => {
                  const limit = parseFloat(c.credit_limit || 0)
                  const used  = parseFloat(c.current_credit || 0)
                  const pct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                  const isFull = limit > 0 && used >= limit
                  const isHigh = pct >= 80 && !isFull
                  if (limit === 0 && used === 0) return null
                  return (
                    <div className="mt-2 space-y-1">
                      {limit > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-gray-400">বাকির লিমিট</span>
                            <span className={`text-[10px] font-bold ${isFull ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-gray-500'}`}>
                              {pct}% ব্যবহার
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[10px] text-gray-400">বাকি: <span className={`font-semibold ${isFull ? 'text-red-500' : 'text-gray-600'}`}>৳{parseInt(used).toLocaleString()}</span></span>
                            <span className="text-[10px] text-gray-400">লিমিট: ৳{parseInt(limit).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                      {isFull && (
                        <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                          <span className="text-[11px]">🚫</span>
                          <span className="text-[11px] text-red-700 font-bold">লিমিট শেষ — আর বাকি দেওয়া যাবে না</span>
                        </div>
                      )}
                      {isHigh && (
                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                          <span className="text-[11px]">⚠️</span>
                          <span className="text-[11px] text-amber-700 font-semibold">লিমিটের কাছাকাছি</span>
                        </div>
                      )}
                      {!isFull && !isHigh && used > 0 && (
                        <p className="text-[10px] text-gray-400">আরো দিতে পারবেন: <span className="text-emerald-600 font-semibold">৳{parseInt(limit - used).toLocaleString()}</span></p>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
                {c.visited_today
                  ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ ভিজিট</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">বাকি</span>
                }
                {/* WhatsApp Portal Link বাটন */}
                {c.whatsapp && (
                  <button
                    onClick={e => { e.stopPropagation(); sendPortalLinkToCustomer(c) }}
                    disabled={sendingLink === c.id}
                    title="WhatsApp-এ Portal Link পাঠান"
                    className="p-1.5 rounded-lg bg-green-50 text-green-600 active:scale-90 transition-transform disabled:opacity-50"
                  >
                    {sendingLink === c.id
                      ? <span style={{fontSize:12}}>...</span>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    }
                  </button>
                )}
                {!c.has_pending_edit && (
                  <button onClick={e => { e.stopPropagation(); setEditModal(c) }}
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-500 active:scale-90 transition-transform">
                    <FiEdit2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <CustomerEditModal
          customer={editModal}
          onClose={() => setEditModal(null)}
          onUpdate={updated => {
            setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
            setEditModal(null)
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          ADD CUSTOMER MODAL
      ══════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[95vh] overflow-y-auto">

            {/* Sticky Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 pt-5 pb-4 z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">নতুন কাস্টমার</h3>
                  <StepBadge step={step} />
                </div>
                <button onClick={() => { setShowAddModal(false); resetForm() }}
                  className="p-2 rounded-full bg-gray-100 active:bg-gray-200 transition-colors mt-0.5">
                  <FiX className="text-gray-600" />
                </button>
              </div>
            </div>

            <div className="px-6 pb-8 pt-4 space-y-5">

              {/* ════════ STEP 1: FORM ════════ */}
              {step === 'form' && (
                <>
                  {/* দোকানের ছবি */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">দোকানের ছবি</label>
                    <div onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors
                        ${newCustomer.photo ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-primary/40'}`}>
                      {newCustomer.photo
                        ? <div className="flex items-center gap-2 text-green-600"><FiCheck className="text-xl" /><span className="text-sm font-medium">{newCustomer.photo.name}</span></div>
                        : <><FiCamera className="text-2xl text-gray-400" /><span className="text-sm text-gray-400">ছবি তুলুন বা গ্যালারি থেকে বেছে নিন</span></>
                      }
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                  </div>

                  {/* GPS */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      GPS লোকেশন <span className="text-red-500">*</span>
                    </label>
                    <button onClick={getGPS} disabled={gpsLoading}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-colors
                        ${newCustomer.lat ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                      {gpsLoading
                        ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        : <FiNavigation />}
                      {newCustomer.lat
                        ? `✅ লোকেশন নেওয়া হয়েছে (${newCustomer.lat.toFixed(4)}, ${newCustomer.lng.toFixed(4)})`
                        : 'GPS লোকেশন নিন'}
                    </button>
                    {newCustomer.lat && (
                      <a href={`https://maps.google.com/?q=${newCustomer.lat},${newCustomer.lng}`} target="_blank" rel="noreferrer"
                        className="text-xs text-blue-500 mt-1 block text-center">Google Maps এ দেখুন →</a>
                    )}
                  </div>

                  {/* রুট */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">রুট</label>
                    <select value={newCustomer.route_id} onChange={e => setNewCustomer(p => ({ ...p, route_id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white">
                      <option value="">-- রুট বেছে নিন --</option>
                      {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>

                  {/* ব্যবসার ধরন */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">ব্যবসার ধরন</label>
                    <select value={newCustomer.business_type}
                      onChange={e => setNewCustomer(p => ({ ...p, business_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white">
                      <option value="">-- ব্যবসার ধরন বেছে নিন --</option>
                      <option value="মুদি">মুদি</option>
                      <option value="ফার্মেসি">ফার্মেসি</option>
                      <option value="হার্ডওয়্যার">হার্ডওয়্যার</option>
                      <option value="কসমেটিক্স">কসমেটিক্স</option>
                      <option value="ইলেকট্রনিক্স">ইলেকট্রনিক্স</option>
                      <option value="কাপড়">কাপড়</option>
                      <option value="খাদ্য ও পানীয়">খাদ্য ও পানীয়</option>
                      <option value="স্টেশনারি">স্টেশনারি</option>
                      <option value="অন্যান্য">অন্যান্য</option>
                    </select>
                  </div>

                  {/* Text Fields */}
                  {[
                    { label: 'দোকানের নাম',      required: true,  key: 'shop_name',    placeholder: 'যেমন: আল-আমিন স্টোর', type: 'text'   },
                    { label: 'মালিকের নাম',        required: true,  key: 'owner_name',   placeholder: 'মালিকের নাম',           type: 'text'   },
                    { label: 'WhatsApp নম্বর',     required: true,  key: 'whatsapp',     placeholder: '01XXXXXXXXX',            type: 'tel'    },
                    { label: 'SMS নম্বর',          required: false, key: 'sms_phone',    placeholder: 'আলাদা হলে দিন, না হলে ফাঁকা রাখুন', type: 'tel' },
                    { label: 'ক্রেডিট লিমিট (৳)', required: false, key: 'credit_limit', placeholder: '5000',                   type: 'number' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        {f.label} {f.required && <span className="text-red-500">*</span>}
                      </label>
                      <input type={f.type} value={newCustomer[f.key]}
                        onChange={e => setNewCustomer(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60" />
                    </div>
                  ))}

                  {/* ── Email Field ── */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <FiMail size={14} className="text-blue-500" />
                      Email
                      <span className="text-xs font-normal text-gray-400">(ঐচ্ছিক)</span>
                      {emailVerified && (
                        <span className="ml-auto text-xs text-green-600 font-semibold flex items-center gap-1">
                          <FiCheck size={12} /> যাচাই হয়েছে
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={newCustomer.email}
                        onChange={e => {
                          setNewCustomer(p => ({ ...p, email: e.target.value }))
                          setEmailVerified(false)
                        }}
                        placeholder="example@gmail.com"
                        className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors
                          ${emailVerified ? 'border-green-400 bg-green-50 pr-10' : 'border-gray-200 focus:border-blue-400'}`}
                      />
                      {emailVerified && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <FiCheck size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                    {newCustomer.email && !emailVerified && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <FiMail size={12} />
                        পরের ধাপে OTP দিয়ে Email যাচাই করতে হবে
                        <FiChevronRight size={12} className="ml-auto" />
                      </div>
                    )}
                    {emailVerified && (
                      <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                        <FiCheck size={11} /> Email সফলভাবে যাচাই হয়েছে
                      </p>
                    )}
                  </div>

                  {/* Submit / Next Button */}
                  <button onClick={handleFormNext} disabled={saving}
                    className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold
                      flex items-center justify-center gap-2 text-sm
                      disabled:opacity-60 active:scale-95 transition-transform shadow-sm">
                    {saving
                      ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : newCustomer.email && !emailVerified
                        ? <><FiMail /> পরের ধাপ: Email যাচাই →</>
                        : <><FiPlus /> কাস্টমার যোগ করুন</>
                    }
                  </button>
                  <p className="text-center text-xs text-gray-400">* চিহ্নিত তথ্য অবশ্যই দিতে হবে</p>
                </>
              )}

              {/* ════════ STEP 2: EMAIL OTP ════════ */}
              {step === 'email_otp' && (
                <EmailOTPVerify
                  email={newCustomer.email}
                  onVerified={handleOTPVerified}
                  onSkip={handleSkipEmail}
                  onBack={() => setStep('form')}
                  skipLabel="Email বাদ দিয়ে যোগ করুন"
                />
              )}

              {/* ════════ STEP 3: WHATSAPP SUCCESS ════════ */}
              {step === 'whatsapp_success' && (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  {/* সবুজ চেক আইকন */}
                  <div style={{ width: 72, height: 72, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <span style={{ fontSize: 36 }}>✅</span>
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                    কাস্টমার যোগ হয়েছে!
                  </h3>
                  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                    <strong>{newCustomer.shop_name}</strong> সফলভাবে তৈরি হয়েছে।
                  </p>
                  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
                    নিচের বাটনে চাপুন — WhatsApp খুলবে, শুধু <strong>Send</strong> করুন।
                  </p>

                  {/* WhatsApp বাটন */}
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      background: '#25d366', color: '#fff', borderRadius: 14,
                      padding: '14px 24px', fontWeight: 700, fontSize: 16,
                      textDecoration: 'none', marginBottom: 12, width: '100%', boxSizing: 'border-box'
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp-এ পাঠান
                  </a>

                  {/* বাদ দিন বাটন */}
                  <button
                    onClick={() => { setShowAddModal(false); resetForm() }}
                    style={{ width: '100%', padding: '11px', background: 'transparent', border: '1.5px solid #e5e7eb', borderRadius: 12, color: '#6b7280', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                  >
                    এখন নয়
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
