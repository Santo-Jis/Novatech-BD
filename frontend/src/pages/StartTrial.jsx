import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowRight, FiArrowLeft,
  FiBriefcase, FiUser, FiPhone, FiMail, FiLock, FiShield, FiEye, FiEyeOff,
  FiGrid, FiUsers, FiMapPin, FiGlobe, FiLink, FiMessageCircle, FiLayers, FiCreditCard,
} from 'react-icons/fi'
import SEO from '../components/SEO'
import { SEAT_RATES, TRIAL_SEAT_LIMITS, MAX_TRIAL_CUSTOMERS, calculateMonthlyTotal, formatTaka } from '../constants/pricing'
import './AuthPages.css'

// ============================================================
// Start Trial — ZovoriX
// ৩ মাসের ফ্রি ট্রায়াল সাইনআপ ফর্ম — নতুন কোম্পানি/tenant self-register
// করে backend-এর বিদ্যমান POST /api/register এন্ডপয়েন্টে (onboarding
// controller) — কোনো ম্যানুয়াল approval লাগে না, সাথে সাথে trial শুরু হয়।
//
// ✅ v3 — প্রিমিয়াম রিডিজাইন: split-screen shell (dark brand panel +
//    রিফাইনড ফর্ম প্যানেল), scroll reveal, নতুন step indicator।
//    ফিল্ড/ভ্যালিডেশন/API payload অপরিবর্তিত — v2-এর সাথে ১০০% সামঞ্জস্যপূর্ণ,
//    শুধু ভিজ্যুয়াল লেয়ার বদলেছে।
//    ধাপ ১ — অ্যাকাউন্ট (কোম্পানি নাম, ID, নাম, ফোন, ইমেইল, পাসওয়ার্ড)
//    ধাপ ২ — কোম্পানি প্রোফাইল (ইন্ডাস্ট্রি, আকার, দেশ/বিভাগ/জেলা/টাইমজোন, ওয়েবসাইট)
//    ধাপ ৩ — টিম, রেফারেল সোর্স ও প্রাইসিং সামারি + সাবমিট
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

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

// Scroll-reveal wrapper, same pattern used on LandingPage
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setInView(true); io.unobserve(e.target) } })
    }, { threshold: 0.1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`zx-areveal${inView ? ' zx-in' : ''} ${className}`} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  )
}

function BrandMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="18" y="18" width="64" height="9" fill="var(--ink-1)" />
      <rect x="18" y="73" width="64" height="9" fill="var(--ink-1)" />
      <line x1="77" y1="23" x2="23" y2="77" stroke="var(--ink-1)" strokeWidth="9" />
      <line x1="23" y1="23" x2="77" y2="77" stroke="var(--gold-500)" strokeWidth="9" />
    </svg>
  )
}

// প্রতিটা role-এর জন্য এক লাইনের সিট-স্টেপার (− সংখ্যা +)
// admin/fixed role-এ স্টেপার না দেখিয়ে শুধু "১ (তুমি)" দেখানো হয়
function SeatStepper({ config, value, onChange, max }) {
  const disabled = config.comingSoon || config.fixed
  return (
    <div className={`zx-seat-row${config.comingSoon ? ' zx-disabled' : ''}`}>
      <div>
        <div className="zx-seat-name">
          {config.labelBn}
          {config.comingSoon && <span className="zx-seat-badge">শীঘ্রই আসছে</span>}
        </div>
        <div className="zx-seat-price">{formatTaka(config.price)}/সিট/মাস</div>
      </div>
      {config.fixed ? (
        <div className="zx-seat-fixed">১ (তুমি)</div>
      ) : (
        <div className="zx-seat-stepper">
          <button type="button" className="zx-seat-btn" disabled={disabled || value <= 0}
            onClick={() => onChange(Math.max(0, value - 1))}>−</button>
          <span className="zx-seat-count">{value}</span>
          <button type="button" className="zx-seat-btn" disabled={disabled || value >= max}
            onClick={() => onChange(Math.min(max, value + 1))}>+</button>
        </div>
      )}
    </div>
  )
}

// ধাপ নির্দেশক — উপরে ১-২-৩ প্রোগ্রেস দেখায়
function StepIndicator({ current }) {
  return (
    <div className="zx-steps">
      {STEPS.map((s, i) => (
        <div key={s.n} className="zx-step-item">
          <div className="zx-step-dot-wrap">
            <div className={`zx-step-dot${s.n < current ? ' zx-done' : ''}${s.n === current ? ' zx-active' : ''}`}>
              {s.n < current ? <FiCheck /> : s.n}
            </div>
            <span className={`zx-step-label${s.n === current ? ' zx-active' : ''}`}>{s.labelBn}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="zx-step-line">
              <div className={`zx-step-line-fill${s.n < current ? ' zx-filled' : ''}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
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
        // বিলিং তথ্য (ঐচ্ছিক, ধাপ ২-এর নিচে)
        company_address: data.company_address || undefined,
        company_phone: data.company_phone || undefined,
        company_email: data.company_email || undefined,
        billing_name: data.billing_name || undefined,
        billing_email: data.billing_email || undefined,
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
    <div className="zx-auth">
      <SEO
        title="৩ মাসের ফ্রি ট্রায়াল শুরু করুন"
        description="কোনো ক্রেডিট কার্ড ছাড়াই ZovoriX-এ ৩ মাসের ফ্রি ট্রায়াল শুরু করুন। বিক্রয়, টিম ও কাস্টমার ব্যবস্থাপনা এখনই ব্যবহার করা শুরু করুন।"
        path="/start-trial"
      />

      <div className="zx-auth-shell">
        {/* ============================================================
            LEFT — brand / value panel
            ============================================================ */}
        <aside className="zx-auth-brand">
          <div className="zx-auth-glow zx-auth-glow-drift" aria-hidden="true" style={{ width: 380, height: 380, top: -120, left: -100, background: 'radial-gradient(circle, rgba(202,154,68,0.28), transparent 70%)' }} />
          <div className="zx-auth-glow zx-auth-glow-drift" aria-hidden="true" style={{ width: 320, height: 320, bottom: -100, right: -80, animationDelay: '-8s', background: 'radial-gradient(circle, rgba(80,110,180,0.18), transparent 70%)' }} />

          <div className="zx-auth-brand-top">
            <div className="zx-auth-brand-mark" onClick={() => navigate('/')} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/') }}>
              <BrandMark />
              <span>ZovoriX</span>
            </div>

            <h1 className="zx-auth-brand-headline">
              আপনার <span className="zx-accent">৩ মাসের ফ্রি ট্রায়াল</span> শুরু করুন
            </h1>
            <p className="zx-auth-brand-sub">
              কোনো ক্রেডিট কার্ড লাগবে না। সাইনআপ করুন, সাথে সাথে পুরো ফিচার নিয়ে কাজ শুরু করে দিন।
            </p>

            <ul className="zx-auth-value-list">
              <li><FiCheck /> কোনো ক্রেডিট কার্ড লাগবে না</li>
              <li><FiCheck /> ৩ মাস পুরো ফিচার — কোনো লক নেই</li>
              <li><FiCheck /> ৫ মিনিটে সেটআপ, সাথে সাথে অ্যাক্সেস</li>
              <li><FiCheck /> যেকোনো সময় বাতিল করা যাবে</li>
            </ul>
          </div>

          <div className="zx-auth-brand-bottom">
            <div className="zx-auth-stat-row">
              <div>
                <div className="zx-auth-stat-value">২৪+</div>
                <div className="zx-auth-stat-label">ডিস্ট্রিবিউটর নেটওয়ার্ক</div>
              </div>
              <div>
                <div className="zx-auth-stat-value">১৪,৬৮৩+</div>
                <div className="zx-auth-stat-label">ট্র্যাকড দোকান</div>
              </div>
            </div>
            <div className="zx-auth-quote">
              <p>&#8220;ZovoriX-এ আসার পর স্টক ফল্ট ২%-এর নিচে নেমে এসেছে, আর পুরো ব্যবসা এখন এক স্ক্রিন থেকে দেখি।&#8221;</p>
              <div className="zx-auth-quote-person"><strong>সান্টো হাওলাদার</strong> — Owner &amp; CEO, NovaTech BD</div>
            </div>
          </div>
        </aside>

        {/* ============================================================
            RIGHT — form panel
            ============================================================ */}
        <div className="zx-auth-form-side">
          <div className="zx-auth-topbar">
            <div className="zx-auth-topbar-brand" onClick={() => navigate('/')} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/') }}>
              <BrandMark size={24} />
              <span>ZovoriX</span>
            </div>
            <span />
            <button type="button" className="zx-auth-topbar-link" onClick={() => navigate('/login')}>লগইন করুন</button>
          </div>

          <div className="zx-auth-main">
            <div className="zx-auth-container">
              {!result ? (
                <>
                  <Reveal className="zx-auth-head">
                    <span className="zx-auth-pill"><FiShield /> ৯০ দিন ফ্রি ট্রায়াল</span>
                    <h1>৩ মাসের ফ্রি ট্রায়াল শুরু করুন</h1>
                    <p>এখনই সাইনআপ করুন, সাথে সাথে অ্যাক্সেস পাবেন — কোনো অপেক্ষা নেই।</p>
                  </Reveal>

                  <StepIndicator current={step} />

                  <Reveal delay={0.08}>
                    <form onSubmit={handleSubmit(onSubmit)} className="zx-form-card">
                      {/* ─────────────── ধাপ ১ — অ্যাকাউন্ট ─────────────── */}
                      {step === 1 && (
                        <div className="zx-step-fade">
                          <div className="zx-field">
                            <label className="zx-label">কোম্পানির নাম <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiBriefcase /></span>
                              <input {...register('company_name', { required: true, minLength: 2 })} className="zx-input" placeholder="যেমন: আকাশ ট্রেডার্স" />
                            </div>
                            {errors.company_name && <p className="zx-error-text">কোম্পানির নাম আবশ্যক</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">Company ID (URL/লগইনে ব্যবহৃত হবে) <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon" style={{ fontFamily: 'var(--f-mono)', fontSize: 13 }}>#</span>
                              <input
                                {...register('slug', { required: true })}
                                onChange={(e) => { setSlugManuallyEdited(true); setValue('slug', slugify(e.target.value)) }}
                                className="zx-input zx-mono zx-has-suffix"
                                placeholder="akash-traders"
                              />
                              <span className="zx-input-suffix-icon">
                                {slugStatus === 'checking' && <FiLoader className="zx-spin" style={{ color: 'var(--coal-3)' }} />}
                                {slugStatus === 'available' && <FiCheckCircle style={{ color: 'var(--success)' }} />}
                                {(slugStatus === 'taken' || slugStatus === 'invalid') && <FiXCircle style={{ color: 'var(--danger)' }} />}
                              </span>
                            </div>
                            {slugStatus === 'taken' && <p className="zx-error-text">এই Company ID আগেই ব্যবহার হয়েছে</p>}
                            {slugStatus === 'invalid' && slug?.length > 0 && <p className="zx-error-text">শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন (৩-৩০ ক্যারেক্টার)</p>}
                            {slugStatus === 'available' && <p className="zx-success-text">এই Company ID পাওয়া যাচ্ছে</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">আপনার নাম <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiUser /></span>
                              <input {...register('admin_name', { required: true })} className="zx-input" placeholder="যেমন: রহিম উদ্দিন" />
                            </div>
                            {errors.admin_name && <p className="zx-error-text">নাম আবশ্যক</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">ফোন নম্বর <span className="zx-req">*</span> (লগইনের জন্য ব্যবহৃত হবে)</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiPhone /></span>
                              <input {...register('admin_phone', { required: true, pattern: /^[0-9+\-\s]{6,15}$/ })} type="tel" className="zx-input" placeholder="01XXXXXXXXX" />
                            </div>
                            {errors.admin_phone && <p className="zx-error-text">সঠিক ফোন নম্বর দিন</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">ইমেইল (ঐচ্ছিক)</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiMail /></span>
                              <input {...register('admin_email')} type="email" className="zx-input" placeholder="you@example.com" />
                            </div>
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">Password <span className="zx-req">*</span> (কমপক্ষে ৬ ক্যারেক্টার)</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiLock /></span>
                              <input {...register('password', { required: true, minLength: 6 })} type={showPassword ? 'text' : 'password'} className="zx-input zx-has-suffix" placeholder="••••••••" />
                              <button type="button" className="zx-input-toggle" onClick={() => setShowPassword((v) => !v)} aria-label="Password দেখান/লুকান">
                                {showPassword ? <FiEyeOff /> : <FiEye />}
                              </button>
                            </div>
                            {errors.password && <p className="zx-error-text">কমপক্ষে ৬ ক্যারেক্টার দিন</p>}
                          </div>

                          <div className="zx-field" style={{ marginBottom: 6 }}>
                            <label className="zx-label">Password আবার লিখুন <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiLock /></span>
                              <input {...register('confirm_password', { required: true })} type={showConfirmPassword ? 'text' : 'password'} className="zx-input zx-has-suffix" placeholder="••••••••" />
                              <button type="button" className="zx-input-toggle" onClick={() => setShowConfirmPassword((v) => !v)} aria-label="Password দেখান/লুকান">
                                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                              </button>
                            </div>
                            {password && watch('confirm_password') && password !== watch('confirm_password') && (
                              <p className="zx-error-text">Password মিলছে না</p>
                            )}
                          </div>

                          <button type="button" onClick={goToStep2} className="zx-auth-btn zx-auth-btn-primary zx-auth-btn-block" style={{ marginTop: 18 }}>
                            পরবর্তী ধাপ <FiArrowRight />
                          </button>
                        </div>
                      )}

                      {/* ─────────────── ধাপ ২ — কোম্পানি প্রোফাইল ─────────────── */}
                      {step === 2 && (
                        <div className="zx-step-fade">
                          <div className="zx-field">
                            <label className="zx-label">ব্যবসার ধরন <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiGrid /></span>
                              <select {...register('industry', { required: true })} className="zx-select" defaultValue="">
                                <option value="" disabled>বেছে নিন</option>
                                {INDUSTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                            {errors.industry && <p className="zx-error-text">ব্যবসার ধরন বেছে নিন</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">কোম্পানির আকার (মোট এমপ্লয়ি) <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiUsers /></span>
                              <select {...register('company_size', { required: true })} className="zx-select" defaultValue="">
                                <option value="" disabled>বেছে নিন</option>
                                {COMPANY_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                            {errors.company_size && <p className="zx-error-text">কোম্পানির আকার বেছে নিন</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">দেশ <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiGlobe /></span>
                              <select {...register('country', { required: true })} className="zx-select" defaultValue="বাংলাদেশ">
                                {Object.keys(COUNTRY_TIMEZONES).map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                            {errors.country && <p className="zx-error-text">দেশ বেছে নিন</p>}
                          </div>

                          <div className="zx-field">
                            <label className="zx-label">বিভাগ <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiLayers /></span>
                              <select {...register('division', { required: true })} className="zx-select" defaultValue="">
                                <option value="" disabled>বেছে নিন</option>
                                {Object.keys(BD_DIVISIONS_DISTRICTS).map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                            {errors.division && <p className="zx-error-text">বিভাগ বেছে নিন</p>}
                          </div>

                          {/* District — বিভাগের উপর নির্ভরশীল, বিভাগ না বাছা পর্যন্ত ডিসেবল থাকবে */}
                          <div className="zx-field">
                            <label className="zx-label">জেলা <span className="zx-req">*</span></label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiMapPin /></span>
                              <select {...register('city', { required: true })} className="zx-select" defaultValue="" disabled={!division}>
                                <option value="" disabled>{division ? 'বেছে নিন' : 'আগে বিভাগ বেছে নিন'}</option>
                                {(BD_DIVISIONS_DISTRICTS[division] || []).map((dist) => <option key={dist} value={dist}>{dist}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                            {errors.city && <p className="zx-error-text">জেলা বেছে নিন</p>}
                          </div>

                          {/* Timezone (auto-suggested, editable) */}
                          <div className="zx-field">
                            <label className="zx-label">টাইমজোন</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiGlobe /></span>
                              <input {...register('timezone')} className="zx-input" placeholder="যেমন: Asia/Dhaka (GMT+6)" />
                            </div>
                            <p className="zx-hint">দেশ অনুযায়ী অটো-বসানো হয়েছে, দরকার হলে বদলে দিন</p>
                          </div>

                          {/* Website (optional) */}
                          <div className="zx-field" style={{ marginBottom: 6 }}>
                            <label className="zx-label">ওয়েবসাইট (ঐচ্ছিক)</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiLink /></span>
                              <input {...register('website')} type="url" className="zx-input" placeholder="https://example.com" />
                            </div>
                          </div>

                          {/* বিলিং তথ্য (ঐচ্ছিক) — ট্রায়ালে বিল হয় না, কিন্তু এখনই দিয়ে
                              রাখলে পরে পেইড প্ল্যানে upgrade (/book-plan) করার সময়
                              আবার নতুন করে লিখতে হয় না */}
                          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--form-border)' }}>
                            <p className="zx-label" style={{ marginBottom: 2 }}>
                              <FiCreditCard style={{ verticalAlign: '-2px', marginRight: 5 }} />
                              বিলিং তথ্য (ঐচ্ছিক)
                            </p>
                            <p className="zx-hint" style={{ margin: '0 0 14px' }}>
                              ট্রায়ালে বিল হয় না — এখনই দিয়ে রাখলে পরে পেইড প্ল্যানে upgrade করার সময় আবার লিখতে হবে না
                            </p>

                            <div className="zx-field">
                              <label className="zx-label">কোম্পানির ঠিকানা</label>
                              <div className="zx-input-wrap">
                                <span className="zx-input-icon"><FiMapPin /></span>
                                <input {...register('company_address')} className="zx-input" />
                              </div>
                            </div>

                            <div className="zx-field-row">
                              <div className="zx-field">
                                <label className="zx-label">কোম্পানির ফোন</label>
                                <div className="zx-input-wrap">
                                  <span className="zx-input-icon"><FiPhone /></span>
                                  <input {...register('company_phone')} className="zx-input" />
                                </div>
                              </div>
                              <div className="zx-field">
                                <label className="zx-label">কোম্পানির ইমেইল</label>
                                <div className="zx-input-wrap">
                                  <span className="zx-input-icon"><FiMail /></span>
                                  <input {...register('company_email')} className="zx-input" />
                                </div>
                              </div>
                            </div>

                            <div className="zx-field-row">
                              <div className="zx-field">
                                <label className="zx-label">Billing Name</label>
                                <div className="zx-input-wrap">
                                  <span className="zx-input-icon"><FiUser /></span>
                                  <input {...register('billing_name')} className="zx-input" />
                                </div>
                              </div>
                              <div className="zx-field">
                                <label className="zx-label">Billing Email</label>
                                <div className="zx-input-wrap">
                                  <span className="zx-input-icon"><FiMail /></span>
                                  <input {...register('billing_email')} className="zx-input" />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="zx-auth-btn-row" style={{ marginTop: 18 }}>
                            <button type="button" onClick={goBack} className="zx-auth-btn zx-auth-btn-ghost">
                              <FiArrowLeft /> পেছনে
                            </button>
                            <button type="button" onClick={goToStep3} className="zx-auth-btn zx-auth-btn-primary">
                              পরবর্তী ধাপ <FiArrowRight />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ─────────────── ধাপ ৩ — টিম, রেফারেল ও প্ল্যান ─────────────── */}
                      {step === 3 && (
                        <div className="zx-step-fade">
                          {/* সিট নির্বাচন */}
                          <div style={{ marginBottom: 20 }}>
                            <label className="zx-label">তোমার টিমে কে কে থাকবে?</label>
                            <p className="zx-hint" style={{ margin: '-2px 0 10px' }}>
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

                            <div className="zx-price-box">
                              <span className="zx-price-box-label">ট্রায়াল শেষে সম্ভাব্য<br />মাসিক খরচ*</span>
                              <span className="zx-price-box-value">{formatTaka(monthlyTotal)}/মাস</span>
                            </div>
                            <p className="zx-hint">*শুধু হিসাব দেখানোর জন্য — এখন কোনো টাকা কাটা হবে না, ৩ মাস পুরো ফ্রি</p>
                          </div>

                          {/* Referral source */}
                          <div className="zx-field">
                            <label className="zx-label">আমাদের সম্পর্কে কীভাবে জানলেন?</label>
                            <div className="zx-input-wrap">
                              <span className="zx-input-icon"><FiMessageCircle /></span>
                              <select {...register('referral_source')} className="zx-select" defaultValue="">
                                <option value="" disabled>বেছে নিন (ঐচ্ছিক)</option>
                                {REFERRAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                              <span className="zx-select-arrow">▾</span>
                            </div>
                          </div>

                          {/* Terms checkbox */}
                          <label className="zx-terms-row">
                            <input type="checkbox" required />
                            <span>
                              আমি{' '}
                              <a href="/terms-conditions" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
                              {' '}এবং{' '}
                              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                              {' '}-এর সাথে সম্মত
                            </span>
                          </label>

                          <div className="zx-auth-btn-row">
                            <button type="button" onClick={goBack} className="zx-auth-btn zx-auth-btn-ghost">
                              <FiArrowLeft /> পেছনে
                            </button>
                            <button type="submit" disabled={submitting} className="zx-auth-btn zx-auth-btn-primary">
                              {submitting ? 'সাইনআপ হচ্ছে...' : <>ফ্রি ট্রায়াল শুরু করুন <FiArrowRight /></>}
                            </button>
                          </div>
                        </div>
                      )}
                    </form>
                  </Reveal>

                  <p className="zx-auth-footnote">
                    সমস্যা হচ্ছে? <a href="/contact">আমাদের সাথে যোগাযোগ করুন</a>
                  </p>
                </>
              ) : (
                /* Success state */
                <div className="zx-success-card">
                  <div className="zx-success-icon"><FiCheck /></div>
                  <h2>ট্রায়াল শুরু হয়েছে! 🎉</h2>
                  <p>তোমার ৩ মাসের ফ্রি ট্রায়াল চলবে</p>
                  {trialEndDate && <p className="zx-success-date">{trialEndDate} পর্যন্ত</p>}
                  {result?.seats && (
                    <div className="zx-success-seats">
                      <p className="zx-success-seats-title">তোমার সিট (ট্রায়ালে ফ্রি):</p>
                      {Object.entries(result.seats)
                        .filter(([, count]) => count > 0)
                        .map(([role, count]) => (
                          <p key={role}>
                            <span>{SEAT_RATES[role]?.labelBn || role}</span>
                            <span style={{ fontWeight: 700 }}>× {count}</span>
                          </p>
                        ))}
                    </div>
                  )}
                  <button
                    onClick={() => navigate('/login', { state: { companyId: result?.slug || '' } })}
                    className="zx-auth-btn zx-auth-btn-primary"
                  >
                    এখন লগইন করুন
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
