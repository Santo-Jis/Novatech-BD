// frontend/src/pages/worker/CustomerList.jsx
// Worker: কাস্টমার তালিকা + নতুন কাস্টমার (Email OTP যাচাই সহ)

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
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
  const labels = { form: 'তথ্য পূরণ', email_otp: 'Email যাচাই' }
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
  const [step,         setStep]         = useState('form') // 'form' | 'email_otp'
  const [emailVerified, setEmailVerified] = useState(false)
  const fileRef = useRef()

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

      await api.post('/customers', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      setShowAddModal(false)
      resetForm()
      loadCustomers()
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
                  <h3 className="font-semibold text-gray-800">{c.shop_name}</h3>
                  {c.has_pending_edit && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">⏳ pending</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{c.owner_name}</p>
                {c.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{c.address}</p>}
                {c.email && (
                  <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                    <FiMail size={10} /> {c.email}
                  </p>
                )}
                {parseFloat(c.current_credit || 0) > 0 && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    বকেয়া: ৳{parseInt(c.current_credit).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
                {c.visited_today
                  ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ ভিজিট</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">বাকি</span>
                }
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

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
