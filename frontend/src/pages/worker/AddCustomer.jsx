// frontend/src/pages/worker/AddCustomer.jsx
//
// ⬇️ নতুন — Phase 3 অংশ ২। আগে এই পুরো wizard (photo/GPS/ফর্ম/email OTP/
// WhatsApp handoff) CustomerList.jsx-এর ভেতরে একটা modal ছিল। এখন dedicated
// route (`/worker/customers/new`) — browser/hardware back button স্বাভাবিকভাবে
// কাজ করে, আর CustomerList.jsx-এর সাথে state জড়িয়ে থাকার (showAddModal, step,
// RHF, gps, photo — সব) দরকার নেই।
//
// ⚠️ একটা ছোট, ইচ্ছাকৃত উন্নতি (pure move না): "রুট" ড্রপডাউন এখন ডিফল্টভাবে
// SR-এর বর্তমান সিলেক্ট করা রুট দেখায় (`selectedRoute?.id`), আগে খালি থাকত।
// যৌক্তিক কারণ: SR প্রায় সবসময় নিজের চলমান রুটেই কাস্টমার যোগ করে; কোনো
// validation/behavior বদলায়নি, শুধু ডিফল্ট মান।
//
// CustomerList.jsx-এর cache-কে জানানো: এই পেজ নিজের route থেকে সরাসরি সেই
// component-এর state ছুঁতে পারে না (আলাদা route/page), তাই
// useInvalidateCustomers() (Phase 1-এ বানানো) ব্যবহার হচ্ছে — কাস্টমার তৈরি
// হওয়ার পর সংশ্লিষ্ট route-এর React Query cache invalidate হয়, তাই
// ব্যবহারকারী "কাস্টমার তালিকা"-য় ফিরলে fresh ডেটা refetch হয়।

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { useRoutes } from '../../hooks/useRoutes'
import { useInvalidateCustomers } from '../../hooks/useCustomers'
import {
  FiChevronLeft, FiPlus, FiCamera, FiNavigation, FiCheck, FiMail, FiChevronRight
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import EmailOTPVerify from '../../components/EmailOTPVerify'

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

export default function AddCustomer() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const { routes } = useRoutes()
  const invalidateCustomers = useInvalidateCustomers()

  const [saving,        setSaving]        = useState(false)
  const [gpsLoading,    setGpsLoading]    = useState(false)
  const [step,          setStep]          = useState('form')
  const [waUrl,         setWaUrl]         = useState(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [gps,   setGps]   = useState({ lat: null, lng: null })
  const [photo, setPhoto] = useState(null)
  const fileRef = useRef()

  const [defaultCreditLimit, setDefaultCreditLimit] = useState('0')

  const { register, handleSubmit, watch, setValue, getValues } = useForm({
    defaultValues: {
      shop_name: '', owner_name: '', business_type: '',
      whatsapp: '', sms_phone: '', email: '',
      credit_limit: '0', route_id: selectedRoute?.id || ''
    }
  })
  const watchedEmail       = watch('email')
  const watchedCreditLimit = watch('credit_limit')

  useEffect(() => {
    if (!navigator.onLine) return
    api.get('/settings/public')
      .then(res => {
        const limit = res.data.data?.default_credit_limit || '0'
        setDefaultCreditLimit(limit)
        setValue('credit_limit', limit)
      })
      .catch(() => {})
  }, [])

  const getGPS = () => {
    setGpsLoading(true)
    if (!navigator.geolocation) { toast.error('GPS সাপোর্ট নেই'); setGpsLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude })
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
    setPhoto(file)
    toast.success('ছবি সিলেক্ট হয়েছে ✅')
  }

  // ⚠️ ক্রম ও মেসেজ CustomerList.jsx-এর পুরনো ফর্মের সাথে অবিকল মেলানো:
  // shop_name → whatsapp → GPS, একটাই toast।
  const onFormInvalid = (errs) => {
    if (errs.shop_name) return toast.error(errs.shop_name.message)
    if (errs.whatsapp)  return toast.error(errs.whatsapp.message)
  }

  const onFormValid = (data) => {
    if (!gps.lat) return toast.error('GPS লোকেশন নিন')
    if (data.email?.trim() && !emailVerified) { setStep('email_otp') } else { submitCustomer(data) }
  }

  const submitCustomer = async (data) => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('shop_name',    data.shop_name.trim())
      formData.append('owner_name',   data.owner_name.trim())
      formData.append('whatsapp',     data.whatsapp.trim())
      formData.append('sms_phone',    data.sms_phone.trim() || data.whatsapp.trim())
      formData.append('credit_limit', Math.min(
        parseFloat(data.credit_limit) || 0,
        parseFloat(defaultCreditLimit) || 0
      ))
      formData.append('latitude',     gps.lat)
      formData.append('longitude',    gps.lng)
      if (data.business_type) formData.append('business_type', data.business_type)
      if (data.email.trim())  formData.append('email',         data.email.trim())
      if (data.route_id)      formData.append('route_id',      data.route_id)
      if (photo)               formData.append('shop_photo',    photo)

      const createRes = await api.post('/customers', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      // ⬅️ আগে CustomerList.jsx-এর নিজের refetchCustomers() সরাসরি কল হতো (একই
      // component-এর ভেতরে ছিল বলে)। এখন আলাদা পেজ, তাই cache invalidate করে
      // রাখা হচ্ছে — "কাস্টমার তালিকা"-য় ফিরলে React Query নিজেই fresh ডেটা আনবে।
      invalidateCustomers(data.route_id || selectedRoute?.id)

      const newCustomerId = createRes.data?.data?.id
      if (newCustomerId) {
        try {
          const linkRes = await api.post(`/portal/send-link/${newCustomerId}`)
          const url = linkRes.data?.data?.whatsapp_url
          if (url) { setWaUrl(url); setStep('whatsapp_success'); return }
        } catch (linkErr) {
          console.warn('WhatsApp link তৈরি হয়নি:', linkErr.message)
        }
      }
      navigate('/worker/customers')
    } catch (err) {
      toast.error(err.response?.data?.message || 'কাস্টমার যোগ হয়নি')
      setStep('form')
    } finally {
      setSaving(false)
    }
  }

  const handleOTPVerified = () => { setEmailVerified(true); submitCustomer(getValues()) }
  const handleSkipEmail   = () => { setValue('email', ''); submitCustomer(getValues()) }

  return (
    <div className="min-h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 bg-gray-50 sticky top-0 z-10">
        <button onClick={() => navigate('/worker/customers')}
          className="p-2 -ml-2 rounded-full active:bg-gray-200 transition-colors flex-shrink-0">
          <FiChevronLeft className="text-2xl text-gray-600" />
        </button>
        <div>
          <h2 className="font-bold text-lg text-gray-800">নতুন কাস্টমার</h2>
          <StepBadge step={step} />
        </div>
      </div>

      <div className="px-4 pb-10">

        {step === 'form' && (
          <form onSubmit={handleSubmit(onFormValid, onFormInvalid)}>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">দোকানের ছবি</label>
              <div onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors
                  ${photo ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-primary/40 bg-white'}`}>
                {photo
                  ? <div className="flex items-center gap-2 text-green-600"><FiCheck className="text-xl" /><span className="text-sm font-medium">{photo.name}</span></div>
                  : <><FiCamera className="text-2xl text-gray-400" /><span className="text-sm text-gray-400">ছবি তুলুন বা গ্যালারি থেকে বেছে নিন</span></>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                GPS লোকেশন <span className="text-red-500">*</span>
              </label>
              <button type="button" onClick={getGPS} disabled={gpsLoading}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-colors
                  ${gps.lat ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                {gpsLoading
                  ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  : <FiNavigation />}
                {gps.lat
                  ? `✅ লোকেশন নেওয়া হয়েছে (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`
                  : 'GPS লোকেশন নিন'}
              </button>
              {gps.lat && (
                <a href={`https://maps.google.com/?q=${gps.lat},${gps.lng}`} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-500 mt-1 block text-center">Google Maps এ দেখুন →</a>
              )}
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-gray-700 mb-1 block">রুট</label>
              <select {...register('route_id')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white">
                <option value="">-- রুট বেছে নিন --</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-gray-700 mb-1 block">ব্যবসার ধরন</label>
              <select {...register('business_type')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white">
                <option value="">-- ব্যবসার ধরন বেছে নিন --</option>
                {['মুদি','ফার্মেসি','হার্ডওয়্যার','কসমেটিক্স','ইলেকট্রনিক্স','কাপড়','খাদ্য ও পানীয়','স্টেশনারি','অন্যান্য'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {[
              { label: 'দোকানের নাম',      required: true,  key: 'shop_name',    placeholder: 'যেমন: আল-আমিন স্টোর', type: 'text', rules: { required: 'দোকানের নাম দিন' } },
              { label: 'মালিকের নাম',        required: true,  key: 'owner_name',   placeholder: 'মালিকের নাম',           type: 'text', rules: {} },
              { label: 'WhatsApp নম্বর',     required: true,  key: 'whatsapp',     placeholder: '01XXXXXXXXX',            type: 'tel',  rules: { required: 'WhatsApp নম্বর দিন' } },
              { label: 'SMS নম্বর',          required: false, key: 'sms_phone',    placeholder: 'আলাদা হলে দিন',          type: 'tel',  rules: {} },
            ].map(f => (
              <div key={f.key} className="mt-5">
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <input type={f.type} {...register(f.key, f.rules)}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white" />
              </div>
            ))}

            <div className="mt-5">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                ক্রেডিট লিমিট (৳)
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  সর্বোচ্চ ৳{parseFloat(defaultCreditLimit || 0).toLocaleString()}
                </span>
              </label>
              <input
                type="number"
                min={0}
                max={parseFloat(defaultCreditLimit) || 0}
                {...register('credit_limit')}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0
                  const max = parseFloat(defaultCreditLimit) || 0
                  setValue('credit_limit', String(Math.min(val, max)))
                }}
                placeholder={defaultCreditLimit || '0'}
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 bg-white ${
                  parseFloat(watchedCreditLimit) > parseFloat(defaultCreditLimit || 0)
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200'
                }`}
              />
              {parseFloat(defaultCreditLimit || 0) === 0 && (
                <p className="text-xs text-amber-500 mt-1">⚠️ Admin কোনো ডিফল্ট লিমিট সেট করেননি। Manager পরে সেট করবেন।</p>
              )}
            </div>

            <div className="mt-5">
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
                  {...register('email')}
                  onChange={e => { setValue('email', e.target.value); setEmailVerified(false) }}
                  placeholder="example@gmail.com"
                  className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors
                    ${emailVerified ? 'border-green-400 bg-green-50 pr-10' : 'border-gray-200 bg-white focus:border-blue-400'}`}
                />
                {emailVerified && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <FiCheck size={12} className="text-white" />
                  </div>
                )}
              </div>
              {watchedEmail && !emailVerified && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <FiMail size={12} />
                  পরের ধাপে OTP দিয়ে Email যাচাই করতে হবে
                  <FiChevronRight size={12} className="ml-auto" />
                </div>
              )}
            </div>

            <button type="submit" disabled={saving}
              className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold
                flex items-center justify-center gap-2 text-sm mt-5
                disabled:opacity-60 active:scale-95 transition-transform shadow-sm">
              {saving
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : watchedEmail && !emailVerified
                  ? <><FiMail /> পরের ধাপ: Email যাচাই →</>
                  : <><FiPlus /> কাস্টমার যোগ করুন</>
              }
            </button>
            <p className="text-center text-xs text-gray-400 mt-5">* চিহ্নিত তথ্য অবশ্যই দিতে হবে</p>
          </form>
        )}

        {step === 'email_otp' && (
          <EmailOTPVerify
            email={watchedEmail}
            onVerified={handleOTPVerified}
            onSkip={handleSkipEmail}
            onBack={() => setStep('form')}
            skipLabel="Email বাদ দিয়ে যোগ করুন"
          />
        )}

        {step === 'whatsapp_success' && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ width: 72, height: 72, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: 36 }}>✅</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>কাস্টমার যোগ হয়েছে!</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}><strong>{getValues('shop_name')}</strong> সফলভাবে তৈরি হয়েছে।</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>নিচের বাটনে চাপুন — WhatsApp খুলবে, শুধু <strong>Send</strong> করুন।</p>
            <a href={waUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#25d366', color: '#fff', borderRadius: 14, padding: '14px 24px', fontWeight: 700, fontSize: 16, textDecoration: 'none', marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp-এ পাঠান
            </a>
            <button onClick={() => navigate('/worker/customers')}
              style={{ width: '100%', padding: '11px', background: 'transparent', border: '1.5px solid #e5e7eb', borderRadius: 12, color: '#6b7280', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              এখন নয়
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
