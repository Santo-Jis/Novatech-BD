import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowRight, FiArrowLeft,
  FiBriefcase, FiUser, FiPhone, FiMail, FiLock, FiShield, FiEye, FiEyeOff,
  FiGrid, FiUsers, FiMapPin, FiGlobe, FiLink, FiMessageCircle, FiLayers,
} from 'react-icons/fi'
import logo from '../assets/zovorix-logo.png'
import SEO from '../components/SEO'
import { SEAT_RATES, TRIAL_SEAT_LIMITS, MAX_TRIAL_CUSTOMERS, calculateMonthlyTotal, formatTaka } from '../constants/pricing'

// ============================================================
// Start Trial — ZovoriX
// ৩ মাসের ফ্রি ট্রায়াল সাইনআপ ফর্ম — নতুন কোম্পানি/tenant self-register
// করে backend-এর বিদ্যমান POST /api/register এন্ডপয়েন্টে (onboarding
// controller) — কোনো ম্যানুয়াল approval লাগে না, সাথে সাথে trial শুরু হয়।
// ল্যান্ডিং পেইজের সাথে সামঞ্জস্যপূর্ণ ডিজাইন সিস্টেম ব্যবহার করা হয়েছে
//
// ✅ v2 — মাল্টি-স্টেপ ফর্মে রিডিজাইন (৩ ধাপ):
//    ধাপ ১ — অ্যাকাউন্ট (কোম্পানি নাম, ID, নাম, ফোন, ইমেইল, পাসওয়ার্ড)
//    ধাপ ২ — কোম্পানি প্রোফাইল (ইন্ডাস্ট্রি, আকার, দেশ/বিভাগ/জেলা/টাইমজোন, ওয়েবসাইট)
//    ধাপ ৩ — টিম, রেফারেল সোর্স ও প্রাইসিং সামারি + সাবমিট
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
  appearance: 'none',
}

const selectStyle = { ...inputStyle, paddingRight: '36px' }

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

const selectArrowStyle = {
  position: 'absolute',
  right: '13px',
  top: '38px',
  color: T.textMuted,
  fontSize: '11px',
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

const navBtnStyle = (primary, disabled) => ({
  padding: '13px 22px',
  background: disabled ? T.primary300 : (primary ? T.primary700 : 'transparent'),
  border: primary ? 'none' : `1px solid ${T.borderDefault}`,
  borderRadius: '10px',
  color: primary ? '#fff' : T.textSecondary,
  fontSize: '14.5px', fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: T.fontBody,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
})

// ─── দেশ অনুযায়ী ডিফল্ট টাইমজোন সাজেশন ───
const COUNTRY_TIMEZONES = {
  বাংলাদেশ: 'Asia/Dhaka (GMT+6)',
  ভারত: 'Asia/Kolkata (GMT+5:30)',
  'যুক্তরাজ্য': 'Europe/London (GMT+0/+1)',
  'যুক্তরাষ্ট্র': 'America/New_York (GMT-5)',
  অন্যান্য: '',
}

const INDUSTRY_OPTIONS = [
  'খুচরা ব্যবসা (Retail)',
  'পাইকারি/ডিস্ট্রিবিউশন (Wholesale)',
  'উৎপাদন (Manufacturing)',
  'খাদ্য ও পানীয় (Food & Beverage)',
  'ফার্মাসিউটিক্যাল (Pharma)',
  'ইলেকট্রনিক্স (Electronics)',
  'পোশাক/ফ্যাশন (Apparel)',
  'আইটি/সফটওয়্যার (IT/Software)',
  'নির্মাণ (Construction)',
  'অন্যান্য (Other)',
]

const COMPANY_SIZE_OPTIONS = ['১-৫ জন', '৬-২০ জন', '২১-৫০ জন', '৫১-১০০ জন', '১০০+ জন']

// বাংলাদেশের ৮টা বিভাগ ও প্রতিটার অধীনে জেলাসমূহ — বিভাগ বেছে নিলে জেলার লিস্ট আপডেট হবে
const BD_DIVISIONS_DISTRICTS = {
  ঢাকা: ['ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মানিকগঞ্জ', 'মুন্সিগঞ্জ', 'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'রাজবাড়ী', 'শরীয়তপুর', 'টাঙ্গাইল', 'কিশোরগঞ্জ'],
  চট্টগ্রাম: ['চট্টগ্রাম', 'কক্সবাজার', 'রাঙামাটি', 'বান্দরবান', 'খাগড়াছড়ি', 'ফেনী', 'নোয়াখালী', 'লক্ষ্মীপুর', 'চাঁদপুর', 'কুমিল্লা', 'ব্রাহ্মণবাড়িয়া'],
  রাজশাহী: ['রাজশাহী', 'চাঁপাইনবাবগঞ্জ', 'নাটোর', 'নওগাঁ', 'পাবনা', 'সিরাজগঞ্জ', 'বগুড়া', 'জয়পুরহাট'],
  খুলনা: ['খুলনা', 'বাগেরহাট', 'সাতক্ষীরা', 'যশোর', 'ঝিনাইদহ', 'মাগুরা', 'নড়াইল', 'কুষ্টিয়া', 'চুয়াডাঙ্গা', 'মেহেরপুর'],
  বরিশাল: ['বরিশাল', 'ভোলা', 'পটুয়াখালী', 'পিরোজপুর', 'ঝালকাঠি', 'বরগুনা'],
  সিলেট: ['সিলেট', 'মৌলভীবাজার', 'হবিগঞ্জ', 'সুনামগঞ্জ'],
  রংপুর: ['রংপুর', 'দিনাজপুর', 'ঠাকুরগাঁও', 'পঞ্চগড়', 'নীলফামারী', 'লালমনিরহাট', 'কুড়িগ্রাম', 'গাইবান্ধা'],
  ময়মনসিংহ: ['ময়মনসিংহ', 'জামালপুর', 'শেরপুর', 'নেত্রকোণা'],
}

const REFERRAL_OPTIONS = [
  'Facebook',
  'Google সার্চ',
  'বন্ধু/সহকর্মীর মাধ্যমে',
  'বিজ্ঞাপন/মার্কেটিং',
  'ইভেন্ট/সেমিনার',
  'অন্যান্য',
]

const STEPS = [
  { n: 1, labelBn: 'অ্যাকাউন্ট' },
  { n: 2, labelBn: 'কোম্পানি প্রোফাইল' },
  { n: 3, labelBn: 'টিম ও প্ল্যান' },
]

// প্রতিটা role-এর জন্য এক লাইনের সিট-স্টেপার (− সংখ্যা +)
// admin/fixed role-এ স্টেপার না দেখিয়ে শুধু "১ (তুমি)" দেখানো হয়
function SeatStepper({ config, value, onChange, max }) {
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
          <button type="button" disabled={disabled || value >= max} style={stepBtnStyle(disabled || value >= max)}
            onClick={() => onChange(Math.min(max, value + 1))}>+</button>
        </div>
      )}
    </div>
  )
}

// ধাপ নির্দেশক — উপরে ১-২-৩ প্রোগ্রেস দেখায়
function StepIndicator({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
      {STEPS.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'unset' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700, fontFamily: T.fontMono,
              background: s.n < current ? T.primary700 : (s.n === current ? T.primary700 : T.bgAlt),
              color: s.n <= current ? '#fff' : T.textMuted,
              border: s.n === current ? `2px solid ${T.accent300}` : 'none',
              boxSizing: 'border-box',
              transition: 'all 0.2s',
            }}>
              {s.n < current ? <FiCheck size={14} /> : s.n}
            </div>
            <span style={{
              fontSize: '10.5px', fontWeight: 600, whiteSpace: 'nowrap',
              color: s.n === current ? T.primary700 : T.textMuted,
            }}>{s.labelBn}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: '2px', margin: '0 6px 18px',
              background: s.n < current ? T.primary700 : T.borderDefault,
              transition: 'all 0.2s',
            }} />
          )}
        </div>
      ))}
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
  const [step, setStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'invalid'
  const slugCheckTimer = useRef(null)

  // সিট নির্বাচন — ফ্রি ট্রায়াল প্যাকেজের পূর্ণ সীমা দিয়ে শুরু (৪ SR + ১ Manager
  // + ২ Shop Keeper + ২ Stock Keeper reserved), চাইলে কমানো যাবে (TRIAL_SEAT_LIMITS-এর
  // বেশি বাড়ানো যাবে না — দেখো SeatStepper-এর max prop)
  const [seats, setSeats] = useState({
    manager: TRIAL_SEAT_LIMITS.manager,
    worker: TRIAL_SEAT_LIMITS.worker,
    shop_keeper: TRIAL_SEAT_LIMITS.shop_keeper,
    stock_keeper: TRIAL_SEAT_LIMITS.stock_keeper,
  })
  const monthlyTotal = calculateMonthlyTotal({ admin: 1, ...seats })

  const {
    register, handleSubmit, watch, setValue, trigger, formState: { errors },
  } = useForm({ mode: 'onBlur' })

  const companyName = watch('company_name')
  const slug = watch('slug')
  const password = watch('password')
  const country = watch('country')
  const division = watch('division')
  const isFirstDivisionRender = useRef(true)

  // কোম্পানির নাম থেকে slug অটো-জেনারেট (যতক্ষণ ইউজার নিজে slug এডিট না করে)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setValue('slug', slugify(companyName))
    }
  }, [companyName, slugManuallyEdited, setValue])

  // দেশ বাছাই করলে টাইমজোন অটো-সাজেস্ট করো (ইউজার চাইলে ম্যানুয়ালি বদলাতে পারবে)
  useEffect(() => {
    if (country && COUNTRY_TIMEZONES[country] !== undefined) {
      setValue('timezone', COUNTRY_TIMEZONES[country])
    }
  }, [country, setValue])

  // বিভাগ বদলালে আগের জেলা রিসেট করো (কিন্তু প্রথমবার লোড হওয়ার সময় না)
  useEffect(() => {
    if (isFirstDivisionRender.current) {
      isFirstDivisionRender.current = false
      return
    }
    setValue('city', '')
  }, [division, setValue])

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

  // ধাপ ১ → ২: অ্যাকাউন্ট তথ্য ভ্যালিড কিনা চেক করো
  const goToStep2 = async () => {
    const valid = await trigger(['company_name', 'slug', 'admin_name', 'admin_phone', 'password', 'confirm_password'])
    if (!valid) return
    if (slugStatus === 'taken' || slugStatus === 'invalid') {
      toast.error('Company ID ঠিক করে আবার চেষ্টা করো।')
      return
    }
    if (password !== watch('confirm_password')) {
      toast.error('Password দুটো মিলছে না।')
      return
    }
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ধাপ ২ → ৩: কোম্পানি প্রোফাইল ভ্যালিড কিনা চেক করো (ওয়েবসাইট ঐচ্ছিক)
  const goToStep3 = async () => {
    const valid = await trigger(['industry', 'company_size', 'country', 'division', 'city'])
    if (!valid) return
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setStep((s) => Math.max(1, s - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
        // কোম্পানি প্রোফাইল (ধাপ ২)
        industry: data.industry,
        company_size: data.company_size,
        country: data.country,
        division: data.division,
        city: data.city, // এখানে নির্বাচিত জেলার (district) নাম যায়
        timezone: data.timezone || undefined,
        website: data.website || undefined,
        // রেফারেল (ধাপ ৩)
        referral_source: data.referral_source || undefined,
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
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
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

            <StepIndicator current={step} />

            {/* Form Card */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              style={{
                background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '16px',
                padding: '28px 24px', boxShadow: '0 8px 32px rgba(15,27,46,0.06)',
              }}
            >
              {/* ─────────────── ধাপ ১ — অ্যাকাউন্ট ─────────────── */}
              {step === 1 && (
                <>
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
                      type={showPassword ? 'text' : 'password'}
                      style={{ ...inputStyle, paddingRight: '38px' }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ position: 'absolute', right: '13px', top: '36px', background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '2px' }}
                      aria-label="Password দেখান/লুকান"
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                    {errors.password && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>কমপক্ষে ৬ ক্যারেক্টার দিন</p>}
                  </div>

                  {/* Confirm Password */}
                  <div style={{ ...fieldWrapStyle, marginBottom: '6px' }}>
                    <label style={labelStyle}>Password আবার লিখুন *</label>
                    <FiLock style={iconWrapStyle} />
                    <input
                      {...register('confirm_password', { required: true })}
                      type={showConfirmPassword ? 'text' : 'password'}
                      style={{ ...inputStyle, paddingRight: '38px' }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      style={{ position: 'absolute', right: '13px', top: '36px', background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '2px' }}
                      aria-label="Password দেখান/লুকান"
                    >
                      {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                    {password && watch('confirm_password') && password !== watch('confirm_password') && (
                      <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>Password মিলছে না</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={goToStep2}
                    style={{ ...navBtnStyle(true, false), width: '100%', marginTop: '18px' }}
                  >
                    পরবর্তী ধাপ <FiArrowRight />
                  </button>
                </>
              )}

              {/* ─────────────── ধাপ ২ — কোম্পানি প্রোফাইল ─────────────── */}
              {step === 2 && (
                <>
                  {/* Industry */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>ব্যবসার ধরন *</label>
                    <FiGrid style={iconWrapStyle} />
                    <select {...register('industry', { required: true })} style={selectStyle} defaultValue="">
                      <option value="" disabled>বেছে নিন</option>
                      {INDUSTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                    {errors.industry && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>ব্যবসার ধরন বেছে নিন</p>}
                  </div>

                  {/* Company size */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>কোম্পানির আকার (মোট এমপ্লয়ি) *</label>
                    <FiUsers style={iconWrapStyle} />
                    <select {...register('company_size', { required: true })} style={selectStyle} defaultValue="">
                      <option value="" disabled>বেছে নিন</option>
                      {COMPANY_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                    {errors.company_size && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>কোম্পানির আকার বেছে নিন</p>}
                  </div>

                  {/* Country */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>দেশ *</label>
                    <FiGlobe style={iconWrapStyle} />
                    <select {...register('country', { required: true })} style={selectStyle} defaultValue="বাংলাদেশ">
                      {Object.keys(COUNTRY_TIMEZONES).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                    {errors.country && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>দেশ বেছে নিন</p>}
                  </div>

                  {/* Division */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>বিভাগ *</label>
                    <FiLayers style={iconWrapStyle} />
                    <select {...register('division', { required: true })} style={selectStyle} defaultValue="">
                      <option value="" disabled>বেছে নিন</option>
                      {Object.keys(BD_DIVISIONS_DISTRICTS).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                    {errors.division && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>বিভাগ বেছে নিন</p>}
                  </div>

                  {/* District — বিভাগের উপর নির্ভরশীল, বিভাগ না বাছা পর্যন্ত ডিসেবল থাকবে */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>জেলা *</label>
                    <FiMapPin style={iconWrapStyle} />
                    <select
                      {...register('city', { required: true })}
                      style={{ ...selectStyle, opacity: division ? 1 : 0.6, cursor: division ? 'pointer' : 'not-allowed' }}
                      defaultValue=""
                      disabled={!division}
                    >
                      <option value="" disabled>{division ? 'বেছে নিন' : 'আগে বিভাগ বেছে নিন'}</option>
                      {(BD_DIVISIONS_DISTRICTS[division] || []).map((dist) => <option key={dist} value={dist}>{dist}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                    {errors.city && <p style={{ color: T.danger, fontSize: '12px', marginTop: '5px' }}>জেলা বেছে নিন</p>}
                  </div>

                  {/* Timezone (auto-suggested, editable) */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>টাইমজোন</label>
                    <FiGlobe style={iconWrapStyle} />
                    <input
                      {...register('timezone')}
                      style={inputStyle}
                      placeholder="যেমন: Asia/Dhaka (GMT+6)"
                    />
                    <p style={{ fontSize: '11px', color: T.textMuted, marginTop: '5px' }}>দেশ অনুযায়ী অটো-বসানো হয়েছে, দরকার হলে বদলে দিন</p>
                  </div>

                  {/* Website (optional) */}
                  <div style={{ ...fieldWrapStyle, marginBottom: '6px' }}>
                    <label style={labelStyle}>ওয়েবসাইট (ঐচ্ছিক)</label>
                    <FiLink style={iconWrapStyle} />
                    <input
                      {...register('website')}
                      type="url"
                      style={inputStyle}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button type="button" onClick={goBack} style={navBtnStyle(false, false)}>
                      <FiArrowLeft /> পেছনে
                    </button>
                    <button type="button" onClick={goToStep3} style={{ ...navBtnStyle(true, false), flex: 1 }}>
                      পরবর্তী ধাপ <FiArrowRight />
                    </button>
                  </div>
                </>
              )}

              {/* ─────────────── ধাপ ৩ — টিম, রেফারেল ও প্ল্যান ─────────────── */}
              {step === 3 && (
                <>
                  {/* সিট নির্বাচন */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>তোমার টিমে কে কে থাকবে?</label>
                    <p style={{ fontSize: '12px', color: T.textMuted, margin: '-2px 0 10px', lineHeight: 1.6 }}>
                      ফ্রি ট্রায়াল প্যাকেজে এই সর্বোচ্চ সংখ্যা পর্যন্ত সিট থাকছে, সাথে সর্বোচ্চ {MAX_TRIAL_CUSTOMERS.toLocaleString('bn-BD')} জন কাস্টমার যোগ করা যাবে — পুরোটাই ৩ মাস ফ্রি, ফুল ফিচার সহ
                    </p>

                    {Object.values(SEAT_RATES).map((config) => (
                      <SeatStepper
                        key={config.role}
                        config={config}
                        value={config.fixed ? 1 : seats[config.role]}
                        max={TRIAL_SEAT_LIMITS[config.role]}
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

                  {/* Referral source */}
                  <div style={fieldWrapStyle}>
                    <label style={labelStyle}>আমাদের সম্পর্কে কীভাবে জানলেন?</label>
                    <FiMessageCircle style={iconWrapStyle} />
                    <select {...register('referral_source')} style={selectStyle} defaultValue="">
                      <option value="" disabled>বেছে নিন (ঐচ্ছিক)</option>
                      {REFERRAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <span style={selectArrowStyle}>▾</span>
                  </div>

                  {/* Terms checkbox */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', margin: '18px 0 22px', fontSize: '12.5px', color: T.textSecondary, cursor: 'pointer' }}>
                    <input type="checkbox" required style={{ marginTop: '2px' }} />
                    <span>
                      আমি{' '}
                      <a href="/terms-conditions" target="_blank" rel="noopener noreferrer" style={{ color: T.primary700, fontWeight: 600 }}>Terms & Conditions</a>
                      {' '}এবং{' '}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: T.primary700, fontWeight: 600 }}>Privacy Policy</a>
                      {' '}-এর সাথে সম্মত
                    </span>
                  </label>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={goBack} style={navBtnStyle(false, false)}>
                      <FiArrowLeft /> পেছনে
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...navBtnStyle(true, submitting), flex: 1 }}
                    >
                      {submitting ? 'সাইনআপ হচ্ছে...' : <>ফ্রি ট্রায়াল শুরু করুন <FiArrowRight /></>}
                    </button>
                  </div>
                </>
              )}
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
              onClick={() => navigate('/login', { state: { companyId: result?.slug || '' } })}
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
