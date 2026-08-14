import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowLeft, FiArrowRight, FiPhone, FiMail,
  FiUser, FiHome, FiCreditCard, FiUsers, FiMapPin, FiGlobe, FiLink, FiBriefcase, FiShield,
} from 'react-icons/fi'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import SEO from '../components/SEO'
import { PLANS, PLAN_ORDER, COMMITMENT_DISCOUNTS, formatTaka } from '../constants/planPricing'
import './AuthPages.css'

// ============================================================
// BookPlan — "প্ল্যান বুক করুন" পেজ — মাল্টি-স্টেপ (StartTrial.jsx-এর
// স্টেপ-ইন্ডিকেটর প্যাটার্ন মিলিয়ে)।
// ------------------------------------------------------------
// দুই এন্ট্রি পয়েন্ট, একই পেজ:
//  ১. পাবলিক ভিজিটর (লগইন নেই) → ৪ ধাপ: প্ল্যান → কোম্পানি প্রোফাইল →
//     বিলিং → পেমেন্ট → POST /api/plan-bookings
//  ২. লগইন করা tenant admin (upgrade) → ৩ ধাপ (কোম্পানি ধাপ বাদ, মাউন্টে
//     /my-profile থেকে বিলিং তথ্য fetch করে pre-fill করা হয়, trial
//     signup-এ আগে দেওয়া থাকলে আবার লিখতে হয় না) → POST /api/plan-bookings/upgrade
//
// ✅ v2 — প্রিমিয়াম রিডিজাইন: StartTrial.jsx-এর মতোই split-screen shell +
//    AuthPages.css শেয়ার করে। ফিল্ড/ভ্যালিডেশন/API payload অপরিবর্তিত।
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

// StartTrial.jsx-এর ধাপ ২-এর ঠিক একই অপশন (ইচ্ছাকৃত duplication —
// StartTrial.jsx-এর কাজ করা কোড না ছুঁয়ে; option বদলালে দুই জায়গাতেই
// বদলাতে হবে)
const COUNTRY_TIMEZONES = {
  বাংলাদেশ: 'Asia/Dhaka (GMT+6)', ভারত: 'Asia/Kolkata (GMT+5:30)',
  'যুক্তরাজ্য': 'Europe/London (GMT+0/+1)', 'যুক্তরাষ্ট্র': 'America/New_York (GMT-5)', অন্যান্য: '',
}
const INDUSTRY_OPTIONS = [
  'খুচরা ব্যবসা (Retail)', 'পাইকারি/ডিস্ট্রিবিউশন (Wholesale)', 'উৎপাদন (Manufacturing)',
  'খাদ্য ও পানীয় (Food & Beverage)', 'ফার্মাসিউটিক্যাল (Pharma)', 'ইলেকট্রনিক্স (Electronics)',
  'পোশাক/ফ্যাশন (Apparel)', 'আইটি/সফটওয়্যার (IT/Software)', 'নির্মাণ (Construction)', 'অন্যান্য (Other)',
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
const REFERRAL_OPTIONS = ['Facebook', 'Google সার্চ', 'বন্ধু/সহকর্মীর মাধ্যমে', 'বিজ্ঞাপন/মার্কেটিং', 'ইভেন্ট/সেমিনার', 'অন্যান্য']

const STEP_LABELS = { plan: 'প্ল্যান', company: 'কোম্পানি', billing: 'বিলিং', payment: 'পেমেন্ট' }

const SEAT_ROLES = [
  { pricingKey: 'sr', dbRole: 'worker', label: 'SR (সেলস রিপ্রেজেন্টেটিভ)' },
  { pricingKey: 'manager', dbRole: 'manager', label: 'ম্যানেজার' },
  { pricingKey: 'stock', dbRole: 'stock_keeper', label: 'স্টক কিপার' },
  { pricingKey: 'shop', dbRole: 'shop_keeper', label: 'শপ কিপার' },
]
const BILLING_CYCLES = [
  { key: 'monthly', label: 'মাসিক', discountPct: 0 },
  ...COMMITMENT_DISCOUNTS.map((d) => ({ key: `${d.years}yr`, label: `${d.years} বছর (${d.discountPct}% ছাড়)`, discountPct: d.discountPct })),
]

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

function StepIndicator({ stepKeys, currentIndex }) {
  return (
    <div className="zx-steps">
      {stepKeys.map((key, i) => (
        <div key={key} className="zx-step-item">
          <div className="zx-step-dot-wrap">
            <div className={`zx-step-dot${i < currentIndex ? ' zx-done' : ''}${i === currentIndex ? ' zx-active' : ''}`}>
              {i < currentIndex ? <FiCheck /> : i + 1}
            </div>
            <span className={`zx-step-label${i === currentIndex ? ' zx-active' : ''}`}>{STEP_LABELS[key]}</span>
          </div>
          {i < stepKeys.length - 1 && (
            <div className="zx-step-line"><div className={`zx-step-line-fill${i < currentIndex ? ' zx-filled' : ''}`} /></div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function BookPlan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuthStore()
  const isUpgradeMode = !!(user && isAdmin())

  const stepKeys = isUpgradeMode ? ['plan', 'billing', 'payment'] : ['plan', 'company', 'billing', 'payment']
  const [stepIndex, setStepIndex] = useState(0)
  const currentStepKey = stepKeys[stepIndex]

  const [plan, setPlan] = useState(PLAN_ORDER.includes(searchParams.get('plan')) ? searchParams.get('plan') : 'pro')
  const [cycle, setCycle] = useState('monthly')
  const [seats, setSeats] = useState({ sr: 2, manager: 1, stock: 1, shop: 1 })
  const [slugStatus, setSlugStatus] = useState(null)
  const [division, setDivision] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [profilePrefilled, setProfilePrefilled] = useState(false)

  const { register, handleSubmit, watch, setValue, getValues } = useForm({ mode: 'onBlur' })
  const slugValue = watch('slug')
  const countryValue = watch('country')

  // ─── Upgrade মোডে: আগে দেওয়া বিলিং/প্রোফাইল তথ্য fetch করে pre-fill ───
  useEffect(() => {
    if (!isUpgradeMode) return
    api.get('/plan-bookings/my-profile').then((res) => {
      const p = res.data?.data
      if (!p) return
      const fields = ['company_address', 'company_phone', 'company_email', 'billing_name', 'billing_email']
      let hasAny = false
      fields.forEach((f) => {
        if (p[f]) { setValue(f, p[f]); hasAny = true }
      })
      if (hasAny) setProfilePrefilled(true)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpgradeMode])

  // দেশ বদলালে timezone অটো-সাজেস্ট (StartTrial.jsx-এর মতোই)
  useEffect(() => {
    if (countryValue && COUNTRY_TIMEZONES[countryValue] !== undefined) {
      setValue('timezone', COUNTRY_TIMEZONES[countryValue])
    }
  }, [countryValue, setValue])

  const checkSlug = useCallback((value) => {
    if (isUpgradeMode) return undefined
    if (!value || value.length < 3) { setSlugStatus(null); return undefined }
    if (!/^[a-z0-9-]{3,30}$/.test(value)) { setSlugStatus('invalid'); return undefined }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/register/check-slug/${value}`)
        setSlugStatus(res.data?.data?.available ? 'available' : 'taken')
      } catch { setSlugStatus(null) }
    }, 500)
    return () => clearTimeout(t)
  }, [isUpgradeMode])

  useEffect(() => { checkSlug(slugValue) }, [slugValue, checkSlug])

  const planData = PLANS[plan]

  const pricing = useMemo(() => {
    const adminRole = planData.roles.find((r) => r.key === 'admin')
    let monthly = adminRole ? adminRole.price : 0
    SEAT_ROLES.forEach(({ pricingKey }) => {
      const roleData = planData.roles.find((r) => r.key === pricingKey)
      const qty = Number(seats[pricingKey] || 0)
      if (roleData && qty > 0) monthly += roleData.price * qty
    })
    const discountPct = BILLING_CYCLES.find((c) => c.key === cycle)?.discountPct || 0
    return { monthly, discounted: Math.round(monthly * (1 - discountPct / 100)), discountPct }
  }, [planData, seats, cycle])

  const goNext = () => {
    if (currentStepKey === 'company') {
      const v = getValues()
      if (!v.company_name || !v.slug || !v.contact_name || !v.contact_phone) {
        toast.error('* চিহ্নিত ফিল্ডগুলো পূরণ করুন।')
        return
      }
      if (slugStatus === 'taken' || slugStatus === 'invalid') {
        toast.error('Company ID ঠিক করে আবার চেষ্টা করো।')
        return
      }
    }
    setStepIndex((i) => Math.min(i + 1, stepKeys.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const goBack = () => {
    setStepIndex((i) => Math.max(i - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onSubmit = async (formData) => {
    if (!formData.payment_method || !formData.trx_id) {
      toast.error('পেমেন্ট মাধ্যম ও TrxID আবশ্যক।')
      return
    }
    setSubmitting(true)
    try {
      const seatCounts = {}
      SEAT_ROLES.forEach(({ pricingKey, dbRole }) => {
        const qty = Number(seats[pricingKey] || 0)
        if (qty > 0) seatCounts[dbRole] = qty
      })

      const payload = {
        requested_plan: plan,
        seat_counts: seatCounts,
        billing_cycle: cycle,
        estimated_total_paisa: pricing.discounted * 100,
        contact_name: formData.contact_name,
        contact_phone: formData.contact_phone,
        contact_email: formData.contact_email || null,
        company_address: formData.company_address || null,
        company_phone: formData.company_phone || null,
        company_email: formData.company_email || null,
        billing_name: formData.billing_name || null,
        billing_email: formData.billing_email || null,
        payment_method: formData.payment_method,
        trx_id: formData.trx_id,
      }

      let res
      if (isUpgradeMode) {
        res = await api.post('/plan-bookings/upgrade', payload)
      } else {
        payload.company_name = formData.company_name
        payload.company_name_bn = formData.company_name_bn || null
        payload.slug = formData.slug
        payload.industry = formData.industry || null
        payload.company_size = formData.company_size || null
        payload.country = formData.country || null
        payload.division = division || null
        payload.city = formData.city || null
        payload.timezone = formData.timezone || null
        payload.website = formData.website || null
        payload.referral_source = formData.referral_source || null
        res = await axios.post(`${API_BASE}/api/plan-bookings`, payload)
      }

      setSubmitted({ id: res.data?.data?.id })
      toast.success('রিকোয়েস্ট জমা হয়েছে!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'জমা দেওয়া যায়নি, আবার চেষ্টা করুন।')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="zx-auth">
        <SEO title="বুকিং সম্পন্ন" path="/book-plan" />
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="zx-success-card" style={{ maxWidth: 440 }}>
            <div className="zx-success-icon"><FiCheckCircle /></div>
            <h2>রিকোয়েস্ট জমা হয়েছে</h2>
            <p>
              আপনার TrxID যাচাই করে আমরা দ্রুতই যোগাযোগ করবো। ভেরিফাই হওয়ার পর
              {isUpgradeMode ? ' আপনার প্ল্যান আপগ্রেড হয়ে যাবে।' : ' লগইন তথ্য পাঠানো হবে।'}
            </p>
            <button onClick={() => navigate(isUpgradeMode ? '/dashboard' : '/')} className="zx-auth-btn zx-auth-btn-primary" style={{ marginTop: 8 }}>
              {isUpgradeMode ? 'ড্যাশবোর্ডে ফিরে যান' : 'হোমপেজে ফিরে যান'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zx-auth">
      <SEO title="প্ল্যান বুক করুন" description="ZovoriX-এ পেইড প্ল্যান বুক করুন।" path="/book-plan" />

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
              সঠিক <span className="zx-accent">প্ল্যানে সরাসরি</span> শুরু করুন
            </h1>
            <p className="zx-auth-brand-sub">
              টিমের মাপ অনুযায়ী প্ল্যান বেছে নিন — bKash/Nagad-এ পে করুন, আমরা যাচাই করেই আপনাকে অ্যাক্টিভেট করে দেব।
            </p>

            <ul className="zx-auth-value-list">
              <li><FiCheck /> যত খুশি টিম মেম্বার — শুধু অ্যাক্টিভ রোল অনুযায়ী বিল</li>
              <li><FiCheck /> ১ বা ২ বছরের কমিটমেন্টে রেট লক থাকবে</li>
              <li><FiCheck /> bKash, Nagad বা Rocket-এ সরাসরি পেমেন্ট</li>
              <li><FiCheck /> TrxID যাচাই হওয়ার পরই দ্রুত অ্যাক্টিভেশন</li>
            </ul>
          </div>

          <div className="zx-auth-brand-bottom">
            <div className="zx-auth-stat-row">
              <div>
                <div className="zx-auth-stat-value">২৪+</div>
                <div className="zx-auth-stat-label">ডিস্ট্রিবিউটর নেটওয়ার্ক</div>
              </div>
              <div>
                <div className="zx-auth-stat-value">৩৭.৯%</div>
                <div className="zx-auth-stat-label">গড় রেভিনিউ গ্রোথ</div>
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
            <button type="button" className="zx-auth-back" onClick={() => navigate(-1)}>
              <FiArrowLeft /> পেছনে
            </button>
            <div className="zx-auth-topbar-brand" onClick={() => navigate('/')} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/') }}>
              <BrandMark size={24} />
              <span>ZovoriX</span>
            </div>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--coal-1)' }}>প্ল্যান বুক করুন</span>
          </div>

          <div className="zx-auth-main">
            <form onSubmit={handleSubmit(onSubmit)} className="zx-auth-container zx-wide">
              <StepIndicator stepKeys={stepKeys} currentIndex={stepIndex} />

              {isUpgradeMode && stepIndex === 0 && (
                <div className="zx-notice zx-notice-gold">
                  আপনি লগইন করা আছেন — এটা আপনার বিদ্যমান কোম্পানির জন্য <strong>আপগ্রেড</strong> রিকোয়েস্ট হবে।
                </div>
              )}

              {/* ───────────── ধাপ: প্ল্যান ───────────── */}
              {currentStepKey === 'plan' && (
                <div className="zx-step-fade">
                  <div className="zx-section-card">
                    <p className="zx-section-title">প্ল্যান বেছে নিন</p>
                    <div className="zx-plan-grid">
                      {PLAN_ORDER.map((key) => (
                        <button type="button" key={key} onClick={() => setPlan(key)} className={`zx-plan-pick${plan === key ? ' zx-selected' : ''}`}>
                          <div className="zx-plan-pick-name">{PLANS[key].name}</div>
                          <div className="zx-plan-pick-sub">{PLANS[key].maxCustomersLabel}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="zx-section-card">
                    <p className="zx-section-title"><FiUsers /> কতজন লাগবে</p>
                    {SEAT_ROLES.map(({ pricingKey, label }) => {
                      const roleData = planData.roles.find((r) => r.key === pricingKey)
                      if (!roleData) return null
                      return (
                        <div key={pricingKey} className="zx-seat-row">
                          <div>
                            <div className="zx-seat-name">{label}</div>
                            <div className="zx-seat-price">{formatTaka(roleData.price)}/মাস প্রতি সিট</div>
                          </div>
                          <input
                            type="number" min="0" max="500" value={seats[pricingKey]}
                            onChange={(e) => setSeats((s) => ({ ...s, [pricingKey]: Math.max(0, Number(e.target.value)) }))}
                            className="zx-input zx-seat-num-input zx-no-icon"
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="zx-section-card">
                    <p className="zx-section-title">বিলিং সাইকেল</p>
                    <div className="zx-cycle-row">
                      {BILLING_CYCLES.map((c) => (
                        <button type="button" key={c.key} onClick={() => setCycle(c.key)} className={`zx-cycle-btn${cycle === c.key ? ' zx-selected' : ''}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <div className="zx-price-box" style={{ marginTop: 16 }}>
                      <span className="zx-price-box-label">আনুমানিক মাসিক বিল</span>
                      <span className="zx-price-box-value">{formatTaka(pricing.discounted)}</span>
                    </div>
                    {pricing.discountPct > 0 && (
                      <p className="zx-price-savings">{formatTaka(pricing.monthly)} থেকে {pricing.discountPct}% ছাড়</p>
                    )}
                  </div>
                </div>
              )}

              {/* ───────────── ধাপ: কোম্পানি (শুধু নতুন কাস্টমার) ───────────── */}
              {currentStepKey === 'company' && (
                <div className="zx-step-fade">
                  <div className="zx-section-card">
                    <p className="zx-section-title"><FiHome /> কোম্পানির তথ্য</p>
                    <div className="zx-field">
                      <label className="zx-label">কোম্পানির নাম (ইংরেজি) <span className="zx-req">*</span></label>
                      <input {...register('company_name', { required: true })} className="zx-input zx-no-icon" placeholder="Zovorix Traders" />
                    </div>
                    <div className="zx-field">
                      <label className="zx-label">কোম্পানির নাম (বাংলা)</label>
                      <input {...register('company_name_bn')} className="zx-input zx-no-icon" placeholder="জোভরিক্স ট্রেডার্স" />
                    </div>
                    <div className="zx-field">
                      <label className="zx-label">Company ID (slug) <span className="zx-req">*</span></label>
                      <div className="zx-input-wrap">
                        <input {...register('slug', { required: true })} className="zx-input zx-no-icon zx-mono zx-has-suffix" placeholder="zovorix-traders" />
                        <span className="zx-input-suffix-icon">
                          {slugStatus === 'checking' && <FiLoader className="zx-spin" style={{ color: 'var(--coal-3)' }} />}
                          {slugStatus === 'available' && <FiCheckCircle style={{ color: 'var(--success)' }} />}
                          {(slugStatus === 'taken' || slugStatus === 'invalid') && <FiXCircle style={{ color: 'var(--danger)' }} />}
                        </span>
                      </div>
                    </div>
                    <div className="zx-field">
                      <label className="zx-label"><FiUser style={{ verticalAlign: '-2px', marginRight: 4 }} />যোগাযোগের নাম <span className="zx-req">*</span></label>
                      <input {...register('contact_name', { required: true })} className="zx-input zx-no-icon" />
                    </div>
                    <div className="zx-field-row">
                      <div className="zx-field">
                        <label className="zx-label"><FiPhone style={{ verticalAlign: '-2px', marginRight: 4 }} />ফোন <span className="zx-req">*</span></label>
                        <input {...register('contact_phone', { required: true })} className="zx-input zx-no-icon" />
                      </div>
                      <div className="zx-field">
                        <label className="zx-label"><FiMail style={{ verticalAlign: '-2px', marginRight: 4 }} />ইমেইল</label>
                        <input {...register('contact_email')} className="zx-input zx-no-icon" />
                      </div>
                    </div>
                  </div>

                  <div className="zx-section-card">
                    <p className="zx-section-title"><FiBriefcase /> ব্যবসার প্রোফাইল (ঐচ্ছিক)</p>
                    <div className="zx-field">
                      <label className="zx-label">ব্যবসার ধরন</label>
                      <select {...register('industry')} className="zx-select zx-no-icon" defaultValue="">
                        <option value="" disabled>বেছে নিন</option>
                        {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="zx-field">
                      <label className="zx-label">কোম্পানির আকার</label>
                      <select {...register('company_size')} className="zx-select zx-no-icon" defaultValue="">
                        <option value="" disabled>বেছে নিন</option>
                        {COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="zx-field-row">
                      <div className="zx-field">
                        <label className="zx-label"><FiGlobe style={{ verticalAlign: '-2px', marginRight: 4 }} />দেশ</label>
                        <select {...register('country')} className="zx-select zx-no-icon" defaultValue="">
                          <option value="" disabled>বেছে নিন</option>
                          {Object.keys(COUNTRY_TIMEZONES).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="zx-field">
                        <label className="zx-label">টাইমজোন</label>
                        <input {...register('timezone')} className="zx-input zx-no-icon" />
                      </div>
                    </div>
                    {countryValue === 'বাংলাদেশ' && (
                      <div className="zx-field-row">
                        <div className="zx-field">
                          <label className="zx-label">বিভাগ</label>
                          <select value={division} onChange={(e) => { setDivision(e.target.value); setValue('city', '') }} className="zx-select zx-no-icon">
                            <option value="" disabled>বেছে নিন</option>
                            {Object.keys(BD_DIVISIONS_DISTRICTS).map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="zx-field">
                          <label className="zx-label">জেলা</label>
                          <select {...register('city')} className="zx-select zx-no-icon" defaultValue="" disabled={!division}>
                            <option value="" disabled>বেছে নিন</option>
                            {(BD_DIVISIONS_DISTRICTS[division] || []).map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="zx-field">
                      <label className="zx-label"><FiLink style={{ verticalAlign: '-2px', marginRight: 4 }} />ওয়েবসাইট</label>
                      <input {...register('website')} type="url" className="zx-input zx-no-icon" placeholder="https://example.com" />
                    </div>
                    <div className="zx-field" style={{ marginBottom: 0 }}>
                      <label className="zx-label">আমাদের সম্পর্কে কীভাবে জানলেন?</label>
                      <select {...register('referral_source')} className="zx-select zx-no-icon" defaultValue="">
                        <option value="" disabled>বেছে নিন</option>
                        {REFERRAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────── ধাপ: বিলিং ───────────── */}
              {currentStepKey === 'billing' && (
                <div className="zx-step-fade">
                  <div className="zx-section-card">
                    <p className="zx-section-title">বিলিং তথ্য</p>
                    {profilePrefilled && (
                      <div className="zx-notice zx-notice-success">
                        আগে (ট্রায়াল সাইনআপে) দেওয়া তথ্য থেকে auto-fill করা হয়েছে — চাইলে বদলে নিতে পারো।
                      </div>
                    )}
                    <div className="zx-field">
                      <label className="zx-label"><FiMapPin style={{ verticalAlign: '-2px', marginRight: 4 }} />কোম্পানির ঠিকানা</label>
                      <input {...register('company_address')} className="zx-input zx-no-icon" />
                    </div>
                    <div className="zx-field-row">
                      <div className="zx-field">
                        <label className="zx-label">কোম্পানির ফোন</label>
                        <input {...register('company_phone')} className="zx-input zx-no-icon" />
                      </div>
                      <div className="zx-field">
                        <label className="zx-label">কোম্পানির ইমেইল</label>
                        <input {...register('company_email')} className="zx-input zx-no-icon" />
                      </div>
                    </div>
                    <div className="zx-field-row" style={{ marginBottom: 0 }}>
                      <div className="zx-field" style={{ marginBottom: 0 }}>
                        <label className="zx-label">Billing Name</label>
                        <input {...register('billing_name')} className="zx-input zx-no-icon" />
                      </div>
                      <div className="zx-field" style={{ marginBottom: 0 }}>
                        <label className="zx-label">Billing Email</label>
                        <input {...register('billing_email')} className="zx-input zx-no-icon" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────── ধাপ: পেমেন্ট ───────────── */}
              {currentStepKey === 'payment' && (
                <div className="zx-step-fade">
                  <div className="zx-section-card">
                    <p className="zx-section-title"><FiCreditCard /> পেমেন্ট</p>
                    <div className="zx-payment-block">
                      bKash/Nagad Merchant: <strong>01309540282</strong> নম্বরে
                      &quot;Send Money&quot; করে TrxID নিচে লিখুন। TrxID যাচাই করেই আমরা activate করবো।
                    </div>
                    <div className="zx-field">
                      <label className="zx-label">পেমেন্ট মাধ্যম <span className="zx-req">*</span></label>
                      <select {...register('payment_method', { required: true })} className="zx-select zx-no-icon" defaultValue="">
                        <option value="" disabled>বেছে নিন</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="rocket">Rocket</option>
                        <option value="other">অন্যান্য</option>
                      </select>
                    </div>
                    <div className="zx-field" style={{ marginBottom: 0 }}>
                      <label className="zx-label">Transaction ID (TrxID) <span className="zx-req">*</span></label>
                      <input {...register('trx_id', { required: true })} className="zx-input zx-no-icon zx-mono" placeholder="8N7X..." />
                    </div>
                  </div>
                </div>
              )}

              <div className="zx-auth-btn-row" style={{ marginTop: 18 }}>
                {stepIndex > 0 && (
                  <button type="button" onClick={goBack} className="zx-auth-btn zx-auth-btn-ghost">
                    <FiArrowLeft /> পেছনে
                  </button>
                )}
                {currentStepKey !== 'payment' ? (
                  <button type="button" onClick={goNext} className="zx-auth-btn zx-auth-btn-primary">
                    পরবর্তী ধাপ <FiArrowRight />
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="zx-auth-btn zx-auth-btn-primary">
                    {submitting ? <FiLoader className="zx-spin" /> : <FiCheck />}
                    {submitting ? 'জমা হচ্ছে...' : 'রিকোয়েস্ট জমা দিন'}
                  </button>
                )}
              </div>

              <p className="zx-auth-footnote">
                <FiShield style={{ verticalAlign: '-2px', marginRight: 5 }} />
                নিরাপদ পেমেন্ট যাচাই — সমস্যা হচ্ছে? <a href="/contact">যোগাযোগ করুন</a>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
