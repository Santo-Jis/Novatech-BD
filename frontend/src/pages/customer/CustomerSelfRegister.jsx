// pages/customer/CustomerSelfRegister.jsx
// কাস্টমার নিজে সাইন-আপ করার পাবলিক পেজ — কোনো auth লাগে না
//
// ফ্লো: ৬ ধাপের wizard (FB/Instagram-স্টাইল)
//   ১. দোকানের পরিচিতি   (shop_name, business_type — দুটোই আবশ্যক)
//   ২. মালিকের তথ্য      (owner_name, date_of_birth — দুটোই আবশ্যক, ন্যূনতম বয়স ১৫)
//   ৩. যোগাযোগ তথ্য      (whatsapp আবশ্যক, sms_phone/email ঐচ্ছিক)
//   ৪. প্রোফাইল ছবি       (ঐচ্ছিক, স্কিপ করা যায়)
//   ৫. দোকানের ছবি        (ঐচ্ছিক, স্কিপ করা যায়)
//   ৬. রিভিউ ও সাবমিট     (সব তথ্য দেখিয়ে চূড়ান্ত সাবমিট)
//
// সাবমিট হলে POST /portal/self-register (multipart/form-data — ছবিসহ)
// → নতুন customer_code পায় → /customer-login?c=CODE-এ নিয়ে যায়
// (পুরনো, টেস্টেড CustomerPortal ফ্লো — Google login → Dashboard)
//
// GPS/route_id এখানে নেই — SR পরে "Edit Customer" থেকে বসাবে।
//
// ডিজাইন নোট: এই পেজটা ইচ্ছাকৃতভাবে Landing/Welcome/Login পেজের চেয়ে
// আলাদা লেআউটে বানানো — উপরে গাঢ় নেভি অ্যাপ-বার + প্রগ্রেস বার,
// নিচে bg-alt ব্যাকগ্রাউন্ডে সাদা কার্ড। কালার/ফন্ট টোকেন design.html
// অনুযায়ী অপরিবর্তিত।

import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BACKEND } from './utils/api'

// ── ডিজাইন সিস্টেম টোকেন (design.html অনুযায়ী) ──────────────
const C = {
  bgBase: '#FAF8F3', bgSurface: '#FFFFFF', bgAlt: '#F3F1EA', bgSunken: '#EFEDE4',
  primary900: '#0F1B2E', primary700: '#16253D', primary500: '#2C4870', primary300: '#6B85A8', primary100: '#DCE3EC',
  accent600: '#9C6B2E', accent300: '#C99B5A', accent100: '#F3E6D0',
  textPrimary: '#1F2937', textSecondary: '#5B6472', textMuted: '#8B8F98',
  borderDefault: '#E4E1D8', borderStrong: '#D0CCC0',
  error: '#B3452C', errorBg: '#F5E4DF',
}
const FONT_HEAD = "'Source Serif 4','Noto Sans Bengali',Georgia,serif"
const FONT_BODY = "'IBM Plex Sans','Noto Sans Bengali','Hind Siliguri',sans-serif"

const BUSINESS_TYPES = ['মুদি', 'ফার্মেসি', 'হার্ডওয়্যার', 'কসমেটিক্স', 'ইলেকট্রনিক্স', 'কাপড়', 'খাদ্য ও পানীয়', 'স্টেশনারি', 'অন্যান্য']

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

const MIN_AGE = 15
const STEP_TITLES = ['দোকানের পরিচিতি', 'মালিকের তথ্য', 'যোগাযোগ তথ্য', 'প্রোফাইল ছবি', 'দোকানের ছবি', 'রিভিউ ও সাবমিট']
const TOTAL_STEPS = STEP_TITLES.length

// ── ছোট রিইউজেবল উপাদান ─────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 10,
  background: C.bgSurface,
  border: `1px solid ${C.borderDefault}`,
  color: C.textPrimary,
  fontSize: 15,
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  color: C.textSecondary,
  fontSize: 12.5,
  marginBottom: 7,
  display: 'block',
  fontFamily: FONT_BODY,
  fontWeight: 600,
  letterSpacing: 0.2,
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: C.error }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ color: C.textMuted, fontSize: 11.5, margin: '6px 0 0', fontFamily: FONT_BODY }}>{hint}</p>}
    </div>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div style={{
      width: '100%', background: C.errorBg, border: `1px solid ${C.error}33`, borderRadius: 10,
      padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <p style={{ color: C.error, fontSize: 13, margin: 0, lineHeight: 1.5, fontFamily: FONT_BODY }}>{message}</p>
    </div>
  )
}

// ── প্রোফাইল / দোকান ছবি আপলোড বক্স ──────────────────────────
function PhotoPicker({ shape, preview, onPick, placeholderIcon, label }) {
  const inputRef = useRef(null)
  const isCircle = shape === 'circle'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: isCircle ? 160 : '100%',
          maxWidth: isCircle ? 160 : 340,
          height: isCircle ? 160 : 220,
          borderRadius: isCircle ? '50%' : 16,
          background: preview ? `url(${preview}) center/cover no-repeat` : C.bgSunken,
          border: `2px dashed ${C.borderStrong}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {!preview && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <span style={{ fontSize: 30, display: 'block', marginBottom: 6 }}>{placeholderIcon}</span>
            <span style={{ color: C.textMuted, fontSize: 11.5, fontFamily: FONT_BODY }}>{label}</span>
          </div>
        )}
        {/* ক্যামেরা bubble */}
        <div style={{
          position: 'absolute',
          bottom: isCircle ? 6 : 10,
          right: isCircle ? 6 : 10,
          width: 36, height: 36, borderRadius: '50%',
          background: C.primary900, border: `2px solid ${C.bgSurface}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          📷
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }}
      />
    </div>
  )
}

// ── Progress bar (উপরে নেভি অ্যাপ-বারে) ──────────────────────
function ProgressHeader({ step, onBack }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div style={{ background: C.primary900, padding: '18px 20px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {step > 0 ? (
          <button
            onClick={onBack}
            aria-label="পেছনে"
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}
          >←</button>
        ) : <div style={{ width: 34 }} />}
        <div style={{ flex: 1 }}>
          <p style={{ color: C.accent300, fontSize: 11, margin: 0, fontFamily: FONT_BODY, fontWeight: 600, letterSpacing: 0.5 }}>
            ধাপ {step + 1} / {TOTAL_STEPS}
          </p>
          <h2 style={{ color: '#fff', fontSize: 18, margin: '2px 0 0', fontFamily: FONT_HEAD, fontWeight: 600 }}>
            {STEP_TITLES[step]}
          </h2>
        </div>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: C.accent300, borderRadius: 4, transition: 'width 0.25s ease' }} />
      </div>
    </div>
  )
}

function NextButton({ label = 'পরবর্তী', onClick, disabled, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '15px', borderRadius: 10,
        background: (disabled || loading) ? C.primary300 : C.primary900,
        border: 'none', color: '#fff', fontSize: 15.5, fontWeight: 700,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        fontFamily: FONT_BODY, marginTop: 6,
      }}
    >
      {loading ? 'পাঠানো হচ্ছে...' : label}
    </button>
  )
}

function SkipButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 13.5, fontFamily: FONT_BODY, textDecoration: 'underline', cursor: 'pointer', marginTop: 14 }}
    >
      এখন থাক, পরে যোগ করব
    </button>
  )
}

export default function CustomerSelfRegister() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    shop_name: '', business_type: '',
    owner_name: '', dob_day: '', dob_month: '', dob_year: '',
    whatsapp: '', sms_phone: '', email: '',
  })
  const [profileFile, setProfileFile] = useState(null)
  const [shopFile, setShopFile] = useState(null)
  const [profilePreview, setProfilePreview] = useState(null)
  const [shopPreview, setShopPreview] = useState(null)

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }))

  const currentYear = new Date().getFullYear()
  const years  = useMemo(() => Array.from({ length: 90 }, (_, i) => currentYear - MIN_AGE - i), [currentYear])
  const days   = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), [])

  const pickProfile = (file) => { setProfileFile(file); setProfilePreview(URL.createObjectURL(file)) }
  const pickShop     = (file) => { setShopFile(file); setShopPreview(URL.createObjectURL(file)) }

  const calcAge = () => {
    const d = parseInt(form.dob_day, 10), m = parseInt(form.dob_month, 10), y = parseInt(form.dob_year, 10)
    if (!d || !m || !y) return null
    const dob = new Date(y, m - 1, d)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const monthDiff = today.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--
    return age
  }

  // ── প্রতি ধাপের ভ্যালিডেশন ──────────────────────────────────
  const validateStep = () => {
    setError('')
    if (step === 0) {
      if (!form.shop_name.trim()) return 'দোকানের নাম দিন।'
      if (!form.business_type) return 'ব্যবসার ধরন নির্বাচন করুন।'
    }
    if (step === 1) {
      if (!form.owner_name.trim()) return 'মালিকের নাম দিন।'
      if (!form.dob_day || !form.dob_month || !form.dob_year) return 'পুরো জন্মতারিখ দিন।'
      const age = calcAge()
      if (age === null) return 'সঠিক জন্মতারিখ দিন।'
      if (age < MIN_AGE) return `রেজিস্ট্রেশনের জন্য ন্যূনতম বয়স ${MIN_AGE} বছর হতে হবে।`
      if (age > 110) return 'সঠিক জন্মতারিখ দিন।'
    }
    if (step === 2) {
      if (!/^01[0-9]{9}$/.test(form.whatsapp.trim())) return 'সঠিক WhatsApp নম্বর দিন (01XXXXXXXXX)।'
    }
    return ''
  }

  const goNext = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  }
  const goBack = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  const dobString = () => {
    const d = String(form.dob_day).padStart(2, '0')
    const m = String(form.dob_month).padStart(2, '0')
    return `${form.dob_year}-${m}-${d}`
  }

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('shop_name', form.shop_name.trim())
      fd.append('business_type', form.business_type)
      fd.append('owner_name', form.owner_name.trim())
      fd.append('date_of_birth', dobString())
      fd.append('whatsapp', form.whatsapp.trim())
      if (form.sms_phone.trim()) fd.append('sms_phone', form.sms_phone.trim())
      if (form.email.trim()) fd.append('email', form.email.trim())
      if (profileFile) fd.append('profile_photo', profileFile)
      if (shopFile) fd.append('shop_photo', shopFile)

      const res = await fetch(`${BACKEND}/portal/self-register`, { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.message || 'রেজিস্ট্রেশন করতে সমস্যা হয়েছে।')
        setSubmitting(false)
        return
      }

      // ✅ রেজিস্ট্রেশন সফল — Welcome/Login স্ক্রিনে দোকানের তথ্য ও
      // সফল-বার্তা দেখানোর জন্য state দিয়ে পাঠানো হচ্ছে (tokenInfo আগে
      // কখনো সেট হতো না, তাই কার্ডটা দেখাই যেত না — এখন সরাসরি এখান
      // থেকেই দিয়ে দিচ্ছি, আলাদা API কলের দরকার নেই)
      navigate(`/customer-login?c=${encodeURIComponent(data.customer_code)}`, {
        state: {
          justRegistered: true,
          shopName: form.shop_name.trim(),
          ownerName: form.owner_name.trim(),
          customerCode: data.customer_code,
        },
      })
    } catch {
      setError('নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bgAlt }}>
      <ProgressHeader step={step} onBack={goBack} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <ErrorBanner message={error} />

          <div style={{ background: C.bgSurface, border: `1px solid ${C.borderDefault}`, borderRadius: 16, padding: 24, boxSizing: 'border-box' }}>

            {/* ── ধাপ ১: দোকানের পরিচিতি ── */}
            {step === 0 && (
              <>
                <Field label="দোকানের নাম" required>
                  <input style={inputStyle} value={form.shop_name} onChange={set('shop_name')} placeholder="যেমন: আল-আমিন স্টোর" />
                </Field>
                <Field label="ব্যবসার ধরন" required>
                  <select style={inputStyle} value={form.business_type} onChange={set('business_type')}>
                    <option value="">-- বেছে নিন --</option>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </>
            )}

            {/* ── ধাপ ২: মালিকের তথ্য ── */}
            {step === 1 && (
              <>
                <Field label="মালিকের নাম" required>
                  <input style={inputStyle} value={form.owner_name} onChange={set('owner_name')} placeholder="আপনার নাম" />
                </Field>
                <Field label="জন্মতারিখ" required hint={`ন্যূনতম বয়স ${MIN_AGE} বছর হতে হবে`}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select style={inputStyle} value={form.dob_day} onChange={set('dob_day')}>
                      <option value="">দিন</option>
                      {days.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select style={inputStyle} value={form.dob_month} onChange={set('dob_month')}>
                      <option value="">মাস</option>
                      {BN_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select style={inputStyle} value={form.dob_year} onChange={set('dob_year')}>
                      <option value="">বছর</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </Field>
              </>
            )}

            {/* ── ধাপ ৩: যোগাযোগ তথ্য ── */}
            {step === 2 && (
              <>
                <Field label="WhatsApp নম্বর" required>
                  <input style={inputStyle} type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="01XXXXXXXXX" />
                </Field>
                <Field label="SMS নম্বর (ঐচ্ছিক)">
                  <input style={inputStyle} type="tel" value={form.sms_phone} onChange={set('sms_phone')} placeholder="আলাদা হলে দিন" />
                </Field>
                <Field label="Email (ঐচ্ছিক)">
                  <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
                </Field>
              </>
            )}

            {/* ── ধাপ ৪: প্রোফাইল ছবি ── */}
            {step === 3 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: C.textSecondary, fontSize: 13.5, margin: '0 0 20px', fontFamily: FONT_BODY, lineHeight: 1.6 }}>
                  আপনার একটা ছবি দিন — কাস্টমার সাপোর্ট টিম সহজে চিনতে পারবে।
                </p>
                <PhotoPicker shape="circle" preview={profilePreview} onPick={pickProfile} placeholderIcon="🧑" label="প্রোফাইল ছবি দিন" />
                <SkipButton onClick={goNext} />
              </div>
            )}

            {/* ── ধাপ ৫: দোকানের ছবি ── */}
            {step === 4 && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: C.textSecondary, fontSize: 13.5, margin: '0 0 20px', fontFamily: FONT_BODY, lineHeight: 1.6 }}>
                  দোকানের সামনের একটা ছবি দিন — SR দোকান খুঁজে পেতে সাহায্য করবে।
                </p>
                <PhotoPicker shape="square" preview={shopPreview} onPick={pickShop} placeholderIcon="🏪" label="দোকানের ছবি দিন" />
                <SkipButton onClick={goNext} />
              </div>
            )}

            {/* ── ধাপ ৬: রিভিউ ও সাবমিট ── */}
            {step === 5 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                    background: profilePreview ? `url(${profilePreview}) center/cover no-repeat` : C.bgSunken,
                    border: `1px solid ${C.borderDefault}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    {!profilePreview && '🧑'}
                  </div>
                  <div>
                    <p style={{ color: C.primary700, fontSize: 16, fontWeight: 700, margin: 0, fontFamily: FONT_HEAD }}>{form.owner_name}</p>
                    <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0', fontFamily: FONT_BODY }}>
                      জন্মতারিখ: {form.dob_day}/{form.dob_month}/{form.dob_year}
                    </p>
                  </div>
                </div>

                <ReviewRow label="দোকানের নাম" value={form.shop_name} onEdit={() => setStep(0)} />
                <ReviewRow label="ব্যবসার ধরন" value={form.business_type} onEdit={() => setStep(0)} />
                <ReviewRow label="WhatsApp" value={form.whatsapp} onEdit={() => setStep(2)} />
                {form.sms_phone && <ReviewRow label="SMS নম্বর" value={form.sms_phone} onEdit={() => setStep(2)} />}
                {form.email && <ReviewRow label="Email" value={form.email} onEdit={() => setStep(2)} />}

                {shopPreview && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ ...labelStyle, marginBottom: 8 }}>দোকানের ছবি</p>
                    <div style={{ width: '100%', height: 140, borderRadius: 12, background: `url(${shopPreview}) center/cover no-repeat`, border: `1px solid ${C.borderDefault}` }} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 18, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
                  <p style={{ color: C.textMuted, fontSize: 11.5, margin: 0, lineHeight: 1.5, fontFamily: FONT_BODY }}>
                    দোকানের লোকেশন এখন লাগবে না — আমাদের প্রতিনিধি (SR) শীঘ্রই দোকানে গিয়ে যুক্ত করে দেবেন।
                  </p>
                </div>
              </div>
            )}

            <NextButton
              label={step === TOTAL_STEPS - 1 ? 'রেজিস্ট্রেশন করুন' : 'পরবর্তী'}
              onClick={step === TOTAL_STEPS - 1 ? handleSubmit : goNext}
              loading={submitting}
            />
          </div>

          <button
            type="button"
            onClick={() => navigate('/customer-login')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'block', margin: '20px auto 0', color: C.textMuted, fontSize: 13, textAlign: 'center', fontFamily: FONT_BODY, textDecoration: 'underline' }}
          >
            আগে থেকে অ্যাকাউন্ট আছে? লগইন করুন
          </button>
        </div>
      </div>

      <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 11, padding: '16px', letterSpacing: 0.5, fontFamily: FONT_BODY }}>
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}

function ReviewRow({ label, value, onEdit }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.borderDefault}` }}>
      <div>
        <p style={{ color: C.textMuted, fontSize: 11, margin: 0, fontFamily: FONT_BODY, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</p>
        <p style={{ color: C.textPrimary, fontSize: 14.5, margin: '2px 0 0', fontFamily: FONT_BODY, fontWeight: 500 }}>{value}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        style={{ background: 'none', border: 'none', color: C.accent600, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
      >
        এডিট
      </button>
    </div>
  )
}
