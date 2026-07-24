import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowRight,
  FiBriefcase, FiUser, FiPhone, FiMail, FiLock, FiShield,
} from 'react-icons/fi'
import logo from '../assets/zovorix-logo.png'
import SEO from '../components/SEO'
import { SEAT_RATES, MAX_SEATS_PER_ROLE, calculateMonthlyTotal, formatTaka } from '../constants/pricing'

// ============================================================
// Start Trial — ZovoriX
// ৩ মাসের ফ্রি ট্রায়াল সাইনআপ ফর্ম — নতুন কোম্পানি/tenant self-register
// করে backend-এর বিদ্যমান POST /api/register এন্ডপয়েন্টে (onboarding
// controller) — কোনো ম্যানুয়াল approval লাগে না, সাথে সাথে trial শুরু হয়।
// ল্যান্ডিং পেইজের সাথে সামঞ্জস্যপূর্ণ ডিজাইন সিস্টেম ব্যবহার করা হয়েছে
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

const T = {
  bgBase:    '#FAF8F3',
  bgSurface: '#FFFFFF',
  bgAlt:     '#F3F1EA',
  bgSunken:  '#EFEDE4',
  primary900:'#0F1B2E',
  primary700:'#16253D',
  primary500:'#2C4870',
  primary300:'#6B85A8',
  primary100:'#DCE3EC',
  accent600: '#9C6B2E',
  accent300: '#C99B5A',
  accent100: '#F3E6D0',
  textPrimary:  '#1F2937',
  textSecondary:'#5B6472',
  textMuted:    '#8B8F98',
  borderDefault:'#E4E1D8',
  borderStrong: '#D0CCC0',
  danger:    '#B4423E',
  success:   '#2F7D5A',
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontBody: "'IBM Plex Sans','Noto Sans Bengali',Arial,sans-serif",
  fontMono: "'IBM Plex Mono',monospace",
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px 11px 40px',
  border: `1px solid ${T.borderDefault}`,
  borderRadius: '9px',
  fontSize: '14px',
  fontFamily: T.fontBody,
  color: T.textPrimary,
  background: T.bgSurface,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 600,
  color: T.textSecondary,
  marginBottom: '6px',
}

const fieldWrapStyle = { position: 'relative', marginBottom: '16px' }

const iconWrapStyle = {
  position: 'absolute',
  left: '13px',
  top: '38px',
  color: T.textMuted,
  fontSize: '15px',
  pointerEvents: 'none',
}

const stepBtnStyle = (disabled) => ({
  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
  border: `1px solid ${T.borderDefault}`, background: disabled ? T.bgSunken : T.bgAlt,
  color: disabled ? T.textMuted : T.primary700, fontSize: '16px', fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', lineHeight: 1, padding: 0,
})

const totalBoxStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '13px 16px', borderRadius: '10px', background: T.primary900, marginTop: '2px',
}

// প্রতিটা role-এর জন্য এক লাইনের সিট-স্টেপার (− সংখ্যা +)
// admin/fixed role-এ স্টেপার না দেখিয়ে শুধু "১ (তুমি)" দেখানো হয়
function SeatStepper({ config, value, onChange }) {
  const disabled = config.comingSoon || config.fixed
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px', borderRadius: '10px', border: `1px solid ${T.borderDefault}`,
      background: config.comingSoon ? T.bgAlt : T.bgSurface, marginBottom: '8px',
      opacity: config.comingSoon ? 0.7 : 1,
    }}>
      <div>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: '7px' }}>
          {config.labelBn}
          {config.comingSoon && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px',
              background: T.accent100, color: T.accent600, fontFamily: T.fontMono, whiteSpace: 'nowrap',
            }}>শীঘ্রই আসছে</span>
          )}
        </div>
        <div style={{ fontSize: '11.5px', color: T.textMuted, marginTop: '2px', fontFamily: T.fontMono }}>
          {formatTaka(config.price)}/সিট/মাস
        </div>
      </div>
      {config.fixed ? (
        <div style={{ fontSize: '13px', fontWeight: 700, color: T.textSecondary, padding: '0 6px', whiteSpace: 'nowrap' }}>১ (তুমি)</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button type="button" disabled={disabled || value <= 0} style={stepBtnStyle(disabled || value <= 0)}
            onClick={() => onChange(Math.max(0, value - 1))}>−</button>
          <span style={{ minWidth: '18px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: T.primary700 }}>{value}</span>
          <button type="button" disabled={disabled || value >= MAX_SEATS_PER_ROLE} style={stepBtnStyle(disabled || value >= MAX_SEATS_PER_ROLE)}
            onClick={() => onChange(Math.min(MAX_SEATS_PER_ROLE, value + 1))}>+</button>
        </div>
      )}
    </div>
  )
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
}

export default function StartTrial() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { slug, trialEnds } after success

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'invalid'
  const slugCheckTimer = useRef(null)

  // সিট নির্বাচন — একটা ছোট SR + ম্যানেজার টিম দিয়ে শুরু, চাইলে বাড়ানো/কমানো যাবে
  const [seats, setSeats] = useState({ manager: 1, worker: 2, shop_keeper: 0, stock_keeper: 0 })
  const monthlyTotal = calculateMonthlyTotal({ admin: 1, ...seats })

  const {
    register, handleSubmit, watch, setValue, formState: { errors },
  } = useForm({ mode: 'onBlur' })

  const companyName = watch('company_name')
  const slug = watch('slug')
  const password = watch('password')

  // কোম্পানির নাম থেকে slug অটো-জেনারেট (যতক্ষণ ইউজার নিজে slug এডিট না করে)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setValue('slug', slugify(companyName))
    }
  }, [companyName, slugManuallyEdited, setValue])

  // Slug availability — 500ms debounce
  const checkSlug = useCallback((value) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current)
    if (!value || value.length < 3) {
      setSlugStatus(value ? 'invalid' : null)
      return
    }
    if (!/^[a-z0-9-]{3,30}$/.test(value)) {
      setSlugStatus('invalid')
      return
    }
    setSlugStatus('checking')
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/register/check-slug/${value}`)
        setSlugStatus(res.data?.available ? 'available' : 'taken')
      } catch {
        setSlugStatus(null)
      }
    }, 500)
  }, [])

  useEffect(() => {
    checkSlug(slug)
    return () => { if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current) }
  }, [slug, checkSlug])

  const onSubmit = async (data) => {
    if (slugStatus === 'taken' || slugStatus === 'invalid') {
      toast.error('Company ID ঠিক করে আবার চেষ্টা করো।')
      return
    }
    if (data.password !== data.confirm_password) {
      toast.error('Password দুটো মিলছে না।')
      return
    }

    setSubmitting(true)
    try {
      const res = await axios.post(`${API_BASE}/api/register`, {
        company_name: data.company_name,
        slug: data.slug,
        admin_name: data.admin_name,
        admin_phone: data.admin_phone,
        admin_email: data.admin_email || undefined,
        password: data.password,
        seats,
      })
      setResult(res.data?.data || {})
      toast.success('ট্রায়াল শুরু হয়েছে! 🎉')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সাইনআপ করতে সমস্যা হয়েছে। আবার চেষ্টা করো।')
    } finally {
      setSubmitting(false)
    }
  }

  const trialEndDate = result?.trialEnds
    ? new Date(result.trialEnds).toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary }}>
      <SEO
        title="৩ মাসের ফ্রি ট্রায়াল শুরু করুন"
        description="কোনো ক্রেডিট কার্ড ছাড়াই ZovoriX-এ ৩ মাসের ফ্রি ট্রায়াল শুরু করুন। বিক্রয়, টিম ও কাস্টমার ব্যবস্থাপনা এখনই ব্যবহার করা শুরু করুন।"
        path="/start-trial"
      />

      {/* Minimal header */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: `1px solid ${T.borderDefault}`,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{ width: '30px', height: '30px', borderRadius: '7px', overflow: 'hidden', border: `1px solid ${T.borderDefault}` }}>
            <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '18px', color: T.primary700 }}>ZovoriX</span>
        </div>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '8px 16px', background: 'transparent', border: `1px solid ${T.primary700}`,
            borderRadius: '8px', color: T.primary700, fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', fontFamily: T.fontBody,
          }}
        >
          লগইন করুন
        </button>
      </nav>

      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '48px 20px 80px' }}>

        {!result ? (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px',
                background: T.accent100, borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                color: T.accent600, marginBottom: '18px', fontFamily: T.fontMono,
              }}>
                <FiShield /> ৯০ দিন ফ্রি — কোনো কার্ড লাগবে না
              </div>
              <h1 style={{
                fontFamily: T.fontHead, fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: 600,
                color: T.primary700, margin: '0 0 12px', lineHeight: 1.3,
              }}>
                ৩ মাসের ফ্রি ট্রায়াল শুরু করুন
              </h1>
              <p style={{ color: T.textSecondary, fontSize: '14.5px', lineHeight: 1.7, margin: 0 }}>
                এখনই সাইনআপ করুন, সাথে সাথে অ্যাক্সেস পাবেন — কোনো অপেক্ষা নেই।
              </p>
            </div>

            {/* Form Card */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              style={{
                background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '16px',
                padding: '28px 24px', boxShadow: '0 8px 32px rgba(15,27,46,0.06)',
              }}
            >
              {/* Company name */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>কোম্পানির নাম *</label>
                <FiBriefcase style={iconWrapStyle} />
                <input
                  {...register('company_name', { required: true, minLength: 2 })}
                  style={inputStyle}
                  placeholder="যেমন: আকাশ ট্রেডার্স"
                />
                {errors.company_name && (
                  <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>কোম্পানির নাম আবশ্যক</p>
                )}
              </div>

              {/* Slug */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Company ID (URL/লগইনে ব্যবহৃত হবে) *</label>
                <span style={{ ...iconWrapStyle, fontFamily: T.fontMono, fontSize: '13px', left: '13px' }}>#</span>
                <input
                  {...register('slug', { required: true })}
                  onChange={(e) => { setSlugManuallyEdited(true); setValue('slug', slugify(e.target.value)) }}
                  style={{ ...inputStyle, paddingRight: '38px', fontFamily: T.fontMono }}
                  placeholder="akash-traders"
                />
                <span style={{ position: 'absolute', right: '13px', top: '38px', fontSize: '15px' }}>
                  {slugStatus === 'checking' && <FiLoader style={{ color: T.textMuted, animation: 'spin 0.8s linear infinite' }} />}
                  {slugStatus === 'available' && <FiCheckCircle style={{ color: T.success }} />}
                  {(slugStatus === 'taken' || slugStatus === 'invalid') && <FiXCircle style={{ color: T.danger }} />}
                </span>
                <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
                {slugStatus === 'taken' && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>এই Company ID আগেই ব্যবহার হয়েছে</p>}
                {slugStatus === 'invalid' && slug?.length > 0 && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন (৩-৩০ ক্যারেক্টার)</p>}
                {slugStatus === 'available' && <p style={{ color: T.success, fontSize: '12px', marginTop: '5px' }}>এই Company ID পাওয়া যাচ্ছে</p>}
              </div>

              {/* Admin name */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>আপনার নাম *</label>
                <FiUser style={iconWrapStyle} />
                <input
                  {...register('admin_name', { required: true })}
                  style={inputStyle}
                  placeholder="যেমন: রহিম উদ্দিন"
                />
                {errors.admin_name && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>নাম আবশ্যক</p>}
              </div>

              {/* Phone */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>ফোন নম্বর * (লগইনের জন্য ব্যবহৃত হবে)</label>
                <FiPhone style={iconWrapStyle} />
                <input
                  {...register('admin_phone', { required: true, pattern: /^[0-9+\-\s]{6,15}$/ })}
                  type="tel"
                  style={inputStyle}
                  placeholder="01XXXXXXXXX"
                />
                {errors.admin_phone && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>সঠিক ফোন নম্বর দিন</p>}
              </div>

              {/* Email (optional) */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>ইমেইল (ঐচ্ছিক)</label>
                <FiMail style={iconWrapStyle} />
                <input
                  {...register('admin_email')}
                  type="email"
                  style={inputStyle}
                  placeholder="you@example.com"
                />
              </div>

              {/* Password */}
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Password * (কমপক্ষে ৬ ক্যারেক্টার)</label>
                <FiLock style={iconWrapStyle} />
                <input
                  {...register('password', { required: true, minLength: 6 })}
                  type="password"
                  style={inputStyle}
                  placeholder="••••••••"
                />
                {errors.password && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>কমপক্ষে ৬ ক্যারেক্টার দিন</p>}
              </div>

              {/* Confirm Password */}
              <div style={{ ...fieldWrapStyle, marginBottom: '20px' }}>
                <label style={labelStyle}>Password আবার লিখুন *</label>
                <FiLock style={iconWrapStyle} />
                <input
                  {...register('confirm_password', { required: true })}
                  type="password"
                  style={inputStyle}
                  placeholder="••••••••"
                />
                {password && watch('confirm_password') && password !== watch('confirm_password') && (
                  <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>Password মিলছে না</p>
                )}
              </div>

              {/* সিট নির্বাচন */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>তোমার টিমে কে কে থাকবে?</label>
                <p style={{ fontSize: '12px', color: T.textMuted, margin: '-2px 0 10px', lineHeight: 1.6 }}>
                  ট্রায়ালে যেকোনো সংখ্যা বেছে নাও, পুরোটাই ৩ মাস ফ্রি
                </p>

                {Object.values(SEAT_RATES).map((config) => (
                  <SeatStepper
                    key={config.role}
                    config={config}
                    value={config.fixed ? 1 : seats[config.role]}
                    onChange={(v) => setSeats((s) => ({ ...s, [config.role]: v }))}
                  />
                ))}

                <div style={totalBoxStyle}>
                  <span style={{ fontSize: '12.5px', color: T.primary100, lineHeight: 1.5 }}>
                    ট্রায়াল শেষে সম্ভাব্য<br />মাসিক খরচ*
                  </span>
                  <span style={{ fontSize: '17px', fontWeight: 700, color: T.accent300, fontFamily: T.fontMono }}>
                    {formatTaka(monthlyTotal)}/মাস
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: T.textMuted, margin: '6px 0 0' }}>
                  *শুধু হিসাব দেখানোর জন্য — এখন কোনো টাকা কাটা হবে না, ৩ মাস পুরো ফ্রি
                </p>
              </div>

              {/* Terms checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '22px', fontSize: '12.5px', color: T.textSecondary, cursor: 'pointer' }}>
                <input type="checkbox" required style={{ marginTop: '2px' }} />
                <span>
                  আমি{' '}
                  <a href="/terms-conditions" target="_blank" rel="noopener noreferrer" style={{ color: T.primary700, fontWeight: 600 }}>Terms & Conditions</a>
                  {' '}এবং{' '}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: T.primary700, fontWeight: 600 }}>Privacy Policy</a>
                  {' '}-এর সাথে সম্মত
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px', background: submitting ? T.primary300 : T.primary700,
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: T.fontBody,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {submitting ? 'সাইনআপ হচ্ছে...' : <>ফ্রি ট্রায়াল শুরু করুন <FiArrowRight /></>}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '12.5px', color: T.textMuted, marginTop: '18px' }}>
              সমস্যা হচ্ছে? <a href="/contact" style={{ color: T.primary700, fontWeight: 600 }}>আমাদের সাথে যোগাযোগ করুন</a>
            </p>
          </>
        ) : (
          /* Success state */
          <div style={{
            background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '16px',
            padding: '40px 28px', textAlign: 'center', boxShadow: '0 8px 32px rgba(15,27,46,0.06)',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%', background: T.accent100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              fontSize: '30px', color: T.accent600,
            }}>
              <FiCheck />
            </div>
            <h2 style={{ fontFamily: T.fontHead, fontSize: '22px', color: T.primary700, margin: '0 0 10px' }}>
              ট্রায়াল শুরু হয়েছে! 🎉
            </h2>
            <p style={{ color: T.textSecondary, fontSize: '14px', lineHeight: 1.7, marginBottom: '4px' }}>
              তোমার ৩ মাসের ফ্রি ট্রায়াল চলবে
            </p>
            {trialEndDate && (
              <p style={{ color: T.primary700, fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>
                {trialEndDate} পর্যন্ত
              </p>
            )}
            {result?.seats && (
              <div style={{ background: T.bgAlt, borderRadius: '10px', padding: '14px 16px', margin: '0 0 24px', textAlign: 'left' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: T.textSecondary, margin: '0 0 8px' }}>তোমার সিট (ট্রায়ালে ফ্রি):</p>
                {Object.entries(result.seats)
                  .filter(([, count]) => count > 0)
                  .map(([role, count]) => (
                    <p key={role} style={{ fontSize: '13px', color: T.textPrimary, margin: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{SEAT_RATES[role]?.labelBn || role}</span>
                      <span style={{ fontWeight: 700 }}>× {count}</span>
                    </p>
                  ))}
              </div>
            )}
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '13px 28px', background: T.primary700, border: 'none', borderRadius: '9px',
                color: '#fff', fontSize: '14.5px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
              }}
            >
              এখন লগইন করুন
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
