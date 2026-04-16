import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import {
  FiMapPin, FiSearch, FiPlus, FiX, FiUser, FiPhone,
  FiCamera, FiNavigation, FiCheck, FiEdit2, FiMail, FiShield
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import CustomerEditModal from '../../components/CustomerEditModal'

// ── Email OTP Step ──────────────────────────────────────────
function EmailOTPStep({ email, onVerified, onSkip }) {
  const [otp, setOtp]         = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [timer, setTimer]     = useState(0)

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(t => t - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [timer])

  const sendOTP = async () => {
    if (!email) return toast.error('আগে Email দিন')
    setLoading(true)
    try {
      await api.post('/customers/verify-email/send', { email })
      setSent(true)
      setTimer(60)
      toast.success('OTP পাঠানো হয়েছে 📧')
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP পাঠানো যায়নি')
    } finally {
      setLoading(false)
    }
  }

  const confirmOTP = async () => {
    if (!otp || otp.length < 6) return toast.error('৬ সংখ্যার OTP দিন')
    setLoading(true)
    try {
      await api.post('/customers/verify-email/confirm', { email, otp })
      toast.success('Email যাচাই সফল ✅')
      onVerified()
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP ভুল')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-semibold flex items-center gap-1 mb-1">
          <FiMail size={12} /> Email যাচাই করুন
        </p>
        <p className="text-xs text-blue-600">{email}-এ OTP পাঠানো হবে</p>
      </div>

      {!sent ? (
        <button onClick={sendOTP} disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiMail />}
          OTP পাঠান
        </button>
      ) : (
        <>
          <input
            type="number" value={otp} onChange={e => setOtp(e.target.value)}
            placeholder="৬ সংখ্যার OTP"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-center tracking-widest text-lg font-bold focus:outline-none focus:border-blue-400"
            maxLength={6}
          />
          <button onClick={confirmOTP} disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiShield />}
            যাচাই করুন
          </button>
          <button onClick={sendOTP} disabled={timer > 0 || loading}
            className="w-full text-xs text-blue-500 py-1 disabled:text-gray-400">
            {timer > 0 ? `পুনরায় পাঠান (${timer}s)` : 'OTP আসেনি? আবার পাঠান'}
          </button>
        </>
      )}

      <button onClick={onSkip}
        className="w-full text-xs text-gray-400 py-1 underline">
        Email নেই / এখন বাদ দিন
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────
export default function CustomerList() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [customers, setCustomers]     = useState([])
  const [routes, setRoutes]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editModal, setEditModal]     = useState(null)
  const [saving, setSaving]           = useState(false)
  const [gpsLoading, setGpsLoading]   = useState(false)
  const [step, setStep]               = useState('form') // 'form' | 'email_otp'
  const [emailVerified, setEmailVerified] = useState(false)
  const fileRef = useRef()

  const [newCustomer, setNewCustomer] = useState({
    shop_name: '', owner_name: '', phone: '', address: '',
    email: '', credit_limit: '5000', route_id: '',
    lat: null, lng: null, photo: null
  })

  const resetForm = () => {
    setNewCustomer({
      shop_name: '', owner_name: '', phone: '', address: '',
      email: '', credit_limit: '5000', route_id: '',
      lat: null, lng: null, photo: null
    })
    setStep('form')
    setEmailVerified(false)
  }

  const loadCustomers = async () => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute.id)
    try {
      const res = await api.get(`/customers?${params}`)
      setCustomers(res.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
    api.get('/routes').then(res => setRoutes(res.data.data || []))
  }, [selectedRoute])

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

  const handlePhoto = e => {
    const file = e.target.files[0]
    if (!file) return
    setNewCustomer(p => ({ ...p, photo: file }))
    toast.success('ছবি সিলেক্ট হয়েছে ✅')
  }

  // Email ফিল্ড আছে → OTP step-এ যাও। না থাকলে সরাসরি submit
  const handleFormNext = () => {
    if (!newCustomer.shop_name) return toast.error('দোকানের নাম দিন')
    if (!newCustomer.phone)     return toast.error('ফোন নম্বর দিন')
    if (!newCustomer.lat)       return toast.error('GPS লোকেশন নিন')

    if (newCustomer.email && !emailVerified) {
      setStep('email_otp')
    } else {
      submitCustomer()
    }
  }

  const submitCustomer = async () => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('shop_name',    newCustomer.shop_name)
      formData.append('owner_name',   newCustomer.owner_name)
      formData.append('whatsapp',     newCustomer.phone)
      formData.append('sms_phone',    newCustomer.phone)
      formData.append('address',      newCustomer.address)
      formData.append('credit_limit', newCustomer.credit_limit || 5000)
      formData.append('latitude',     newCustomer.lat)
      formData.append('longitude',    newCustomer.lng)
      if (newCustomer.email)    formData.append('email',    newCustomer.email)
      if (newCustomer.route_id) formData.append('route_id', newCustomer.route_id)
      if (newCustomer.photo)    formData.append('shop_photo', newCustomer.photo)

      await api.post('/customers', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      setShowAddModal(false)
      resetForm()
      loadCustomers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'কাস্টমার যোগ হয়নি')
    } finally {
      setSaving(false)
    }
  }

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search)
  )

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">কাস্টমার তালিকা</h2>
          <p className="text-xs text-gray-500">{customers.filter(c => c.visited_today).length}/{customers.length} ভিজিট</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <FiPlus /> নতুন
        </button>
      </div>

      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="দোকান বা মালিকের নাম..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm focus:outline-none" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <FiUser className="text-4xl mx-auto mb-2" />
            <p>কোনো কাস্টমার নেই</p>
          </div>
        )}
        {filtered.map(c => (
          <div key={c._id || c.id}
            className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${c.visited_today ? 'border-green-400' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1" onClick={() => navigate(`/worker/visit/${c._id || c.id}`)}>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">{c.shop_name}</h3>
                  {c.has_pending_edit && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">⏳ pending</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{c.owner_name}</p>
                <p className="text-xs text-gray-400 mt-1">{c.address}</p>
                {c.email && <p className="text-xs text-blue-400 mt-0.5">📧 {c.email}</p>}
                {parseFloat(c.current_credit || 0) > 0 && (
                  <p className="text-xs text-red-500 mt-1">বকেয়া: ৳{parseInt(c.current_credit).toLocaleString()}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {c.visited_today
                  ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ ভিজিট</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">বাকি</span>
                }
                {!c.has_pending_edit && (
                  <button onClick={e => { e.stopPropagation(); setEditModal(c) }}
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-500">
                    <FiEdit2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

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

      {/* ── ADD MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[95vh] overflow-y-auto">

            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">নতুন কাস্টমার</h3>
                {step === 'email_otp' && (
                  <p className="text-xs text-blue-600 mt-0.5">ধাপ ২: Email যাচাই</p>
                )}
              </div>
              <button onClick={() => { setShowAddModal(false); resetForm() }}>
                <FiX className="text-xl" />
              </button>
            </div>

            {/* ── STEP: Email OTP ── */}
            {step === 'email_otp' ? (
              <>
                <EmailOTPStep
                  email={newCustomer.email}
                  onVerified={() => { setEmailVerified(true); submitCustomer() }}
                  onSkip={() => { setNewCustomer(p => ({ ...p, email: '' })); submitCustomer() }}
                />
                <button onClick={() => setStep('form')}
                  className="w-full text-xs text-gray-400 py-1">← ফর্মে ফিরে যান</button>
              </>
            ) : (
            /* ── STEP: Form ── */
            <>
              {/* ছবি */}
              <div>
                <label className="text-sm text-gray-600 mb-2 block">দোকানের ছবি</label>
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer">
                  {newCustomer.photo
                    ? <div className="flex items-center gap-2 text-green-600"><FiCheck /><span className="text-sm">{newCustomer.photo.name}</span></div>
                    : <><FiCamera className="text-2xl text-gray-400" /><span className="text-sm text-gray-400">ছবি তুলুন বা গ্যালারি থেকে বেছে নিন</span></>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              </div>

              {/* GPS */}
              <div>
                <label className="text-sm text-gray-600 mb-2 block">GPS লোকেশন *</label>
                <button onClick={getGPS} disabled={gpsLoading}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm ${newCustomer.lat ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                  {gpsLoading
                    ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    : <FiNavigation />}
                  {newCustomer.lat
                    ? `✅ লোকেশন নেওয়া হয়েছে (${newCustomer.lat.toFixed(4)}, ${newCustomer.lng.toFixed(4)})`
                    : 'GPS লোকেশন নিন'}
                </button>
                {newCustomer.lat && (
                  <a href={`https://maps.google.com/?q=${newCustomer.lat},${newCustomer.lng}`} target="_blank"
                    className="text-xs text-blue-500 mt-1 block text-center">Google Maps এ দেখুন →</a>
                )}
              </div>

              {/* রুট */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">রুট সিলেক্ট করুন</label>
                <select value={newCustomer.route_id} onChange={e => setNewCustomer(p => ({ ...p, route_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none">
                  <option value="">-- রুট বেছে নিন --</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* Fields */}
              {[
                { label: 'দোকানের নাম *',    key: 'shop_name',    placeholder: 'যেমন: আল-আমিন স্টোর' },
                { label: 'মালিকের নাম',       key: 'owner_name',   placeholder: 'মালিকের নাম' },
                { label: 'ফোন *',             key: 'phone',        placeholder: '01XXXXXXXXX', type: 'tel' },
                { label: 'ঠিকানা',            key: 'address',      placeholder: 'দোকানের ঠিকানা' },
                { label: 'ক্রেডিট লিমিট (৳)', key: 'credit_limit', placeholder: '5000', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                  <input type={f.type || 'text'} value={newCustomer[f.key]}
                    onChange={e => setNewCustomer(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                </div>
              ))}

              {/* Email field */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block flex items-center gap-1">
                  <FiMail size={13} /> Email (ঐচ্ছিক — OTP যাচাই হবে)
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={e => { setNewCustomer(p => ({ ...p, email: e.target.value })); setEmailVerified(false) }}
                    placeholder="example@gmail.com"
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none pr-10
                      ${emailVerified ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
                  />
                  {emailVerified && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-xs font-bold">✅</span>
                  )}
                </div>
                {newCustomer.email && !emailVerified && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ পরের ধাপে OTP দিয়ে যাচাই করতে হবে</p>
                )}
              </div>

              <button onClick={handleFormNext} disabled={saving}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : newCustomer.email && !emailVerified ? <><FiMail /> পরের ধাপ →</> : <><FiPlus /> যোগ করুন</>
                }
              </button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
