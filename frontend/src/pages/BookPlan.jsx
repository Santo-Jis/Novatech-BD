import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowLeft, FiArrowRight, FiPhone, FiMail,
  FiUser, FiHome, FiCreditCard, FiUsers, FiMapPin, FiGlobe, FiLink, FiBriefcase,
} from 'react-icons/fi'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import SEO from '../components/SEO'
import { PLANS, PLAN_ORDER, COMMITMENT_DISCOUNTS, formatTaka } from '../constants/planPricing'

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
// role-key ম্যাপিং ও বাকি নোট আগের ভার্সনের মতোই — নিচে দেখো।
// ============================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

const T = {
  bgBase: '#FAF8F3', bgSurface: '#FFFFFF', bgAlt: '#F3F1EA', bgSunken: '#EFEDE4',
  primary900: '#0F1B2E', primary700: '#16253D', primary500: '#2C4870', primary300: '#6B85A8', primary100: '#DCE3EC',
  accent600: '#9C6B2E', accent300: '#C99B5A', accent100: '#F3E6D0',
  textPrimary: '#1F2937', textSecondary: '#5B6472', textMuted: '#8B8F98',
  borderDefault: '#E4E1D8', borderStrong: '#D0CCC0', danger: '#B4423E', success: '#2F7D5A',
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontBody: "'IBM Plex Sans','Noto Sans Bengali',Arial,sans-serif",
  fontMono: "'IBM Plex Mono',monospace",
}

const inputStyle = {
  width: '100%', padding: '11px 14px', border: `1px solid ${T.borderDefault}`,
  borderRadius: '9px', fontSize: '14px', fontFamily: T.fontBody, color: T.textPrimary,
  background: T.bgSurface, outline: 'none', boxSizing: 'border-box',
}
const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, marginBottom: '6px' }
const cardStyle = { background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '14px', padding: '20px', marginBottom: '16px' }
const sectionTitleStyle = { fontFamily: T.fontHead, fontSize: '17px', fontWeight: 700, color: T.primary700, marginBottom: '14px' }
const navBtnStyle = (primary) => ({
  padding: '13px 18px', borderRadius: '10px', border: primary ? 'none' : `1px solid ${T.borderDefault}`,
  background: primary ? T.primary700 : 'transparent', color: primary ? '#fff' : T.textSecondary,
  fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
})

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
  ...COMMITMENT_DISCOUNTS.map(d => ({ key: `${d.years}yr`, label: `${d.years} বছর (${d.discountPct}% ছাড়)`, discountPct: d.discountPct })),
]

function StepIndicator({ stepKeys, currentIndex }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '26px' }}>
      {stepKeys.map((key, i) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', flex: i < stepKeys.length - 1 ? 1 : 'unset' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12.5px', fontWeight: 700, fontFamily: T.fontMono,
              background: i <= currentIndex ? T.primary700 : T.bgAlt,
              color: i <= currentIndex ? '#fff' : T.textMuted,
              border: i === currentIndex ? `2px solid ${T.accent300}` : 'none', boxSizing: 'border-box',
            }}>
              {i < currentIndex ? <FiCheck size={13} /> : i + 1}
            </div>
            <span style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', color: i === currentIndex ? T.primary700 : T.textMuted }}>
              {STEP_LABELS[key]}
            </span>
          </div>
          {i < stepKeys.length - 1 && (
            <div style={{ flex: 1, height: '2px', margin: '0 6px 16px', background: i < currentIndex ? T.primary700 : T.borderDefault }} />
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
    if (isUpgradeMode) return
    if (!value || value.length < 3) { setSlugStatus(null); return }
    if (!/^[a-z0-9-]{3,30}$/.test(value)) { setSlugStatus('invalid'); return }
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
    const adminRole = planData.roles.find(r => r.key === 'admin')
    let monthly = adminRole ? adminRole.price : 0
    SEAT_ROLES.forEach(({ pricingKey }) => {
      const roleData = planData.roles.find(r => r.key === pricingKey)
      const qty = Number(seats[pricingKey] || 0)
      if (roleData && qty > 0) monthly += roleData.price * qty
    })
    const discountPct = BILLING_CYCLES.find(c => c.key === cycle)?.discountPct || 0
    return { monthly, discounted: Math.round(monthly * (1 - discountPct / 100)), discountPct }
  }, [planData, seats, cycle])

  const goNext = () => {
    if (currentStepKey === 'plan') {
      // কোনো validation লাগে না, সবসময় ডিফল্ট মান আছে
    }
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
      <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <SEO title="বুকিং সম্পন্ন" path="/book-plan" />
        <div style={{ ...cardStyle, maxWidth: '440px', textAlign: 'center', padding: '36px 28px' }}>
          <FiCheckCircle style={{ fontSize: '48px', color: T.success, marginBottom: '14px' }} />
          <h1 style={{ fontFamily: T.fontHead, fontSize: '22px', fontWeight: 700, color: T.primary700, marginBottom: '10px' }}>রিকোয়েস্ট জমা হয়েছে</h1>
          <p style={{ fontSize: '14px', color: T.textSecondary, lineHeight: 1.6, marginBottom: '18px' }}>
            আপনার TrxID যাচাই করে আমরা দ্রুতই যোগাযোগ করবো। ভেরিফাই হওয়ার পর
            {isUpgradeMode ? ' আপনার প্ল্যান আপগ্রেড হয়ে যাবে।' : ' লগইন তথ্য পাঠানো হবে।'}
          </p>
          <button onClick={() => navigate(isUpgradeMode ? '/dashboard' : '/')} style={{ ...navBtnStyle(true), display: 'inline-flex', padding: '12px 24px' }}>
            {isUpgradeMode ? 'ড্যাশবোর্ডে ফিরে যান' : 'হোমপেজে ফিরে যান'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary, paddingBottom: '60px' }}>
      <SEO title="প্ল্যান বুক করুন" description="ZovoriX-এ পেইড প্ল্যান বুক করুন।" path="/book-plan" />

      <nav style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 20px', borderBottom: `1px solid ${T.borderDefault}` }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, display: 'flex' }}>
          <FiArrowLeft size={18} />
        </button>
        <span style={{ fontFamily: T.fontHead, fontWeight: 700, fontSize: '16px', color: T.primary700 }}>প্ল্যান বুক করুন</span>
      </nav>

      <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: '640px', margin: '24px auto', padding: '0 16px' }}>
        <StepIndicator stepKeys={stepKeys} currentIndex={stepIndex} />

        {isUpgradeMode && stepIndex === 0 && (
          <div style={{ ...cardStyle, background: T.accent100, border: `1px solid ${T.accent300}` }}>
            <p style={{ fontSize: '13.5px', color: T.primary700, margin: 0 }}>
              আপনি লগইন করা আছেন — এটা আপনার বিদ্যমান কোম্পানির জন্য <strong>আপগ্রেড</strong> রিকোয়েস্ট হবে।
            </p>
          </div>
        )}

        {/* ───────────── ধাপ: প্ল্যান ───────────── */}
        {currentStepKey === 'plan' && (
          <>
            <div style={cardStyle}>
              <p style={sectionTitleStyle}>প্ল্যান বেছে নিন</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {PLAN_ORDER.map((key) => (
                  <button type="button" key={key} onClick={() => setPlan(key)} style={{
                    padding: '12px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                    border: `2px solid ${plan === key ? T.primary700 : T.borderDefault}`,
                    background: plan === key ? T.primary100 : T.bgSurface, fontFamily: T.fontBody,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: T.primary700 }}>{PLANS[key].name}</div>
                    <div style={{ fontSize: '11.5px', color: T.textMuted, marginTop: '2px' }}>{PLANS[key].maxCustomersLabel}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <p style={sectionTitleStyle}><FiUsers style={{ verticalAlign: '-2px', marginRight: '6px' }} />কতজন লাগবে</p>
              {SEAT_ROLES.map(({ pricingKey, label }) => {
                const roleData = planData.roles.find(r => r.key === pricingKey)
                if (!roleData) return null
                return (
                  <div key={pricingKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: T.textPrimary }}>{label}</div>
                      <div style={{ fontSize: '12px', color: T.textMuted }}>{formatTaka(roleData.price)}/মাস প্রতি সিট</div>
                    </div>
                    <input type="number" min="0" max="500" value={seats[pricingKey]}
                      onChange={(e) => setSeats(s => ({ ...s, [pricingKey]: Math.max(0, Number(e.target.value)) }))}
                      style={{ ...inputStyle, width: '72px', textAlign: 'center', padding: '8px' }} />
                  </div>
                )
              })}
            </div>

            <div style={cardStyle}>
              <p style={sectionTitleStyle}>বিলিং সাইকেল</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {BILLING_CYCLES.map((c) => (
                  <button type="button" key={c.key} onClick={() => setCycle(c.key)} style={{
                    padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${cycle === c.key ? T.primary700 : T.borderDefault}`,
                    background: cycle === c.key ? T.primary700 : T.bgSurface,
                    color: cycle === c.key ? '#fff' : T.textSecondary, fontFamily: T.fontBody,
                  }}>{c.label}</button>
                ))}
              </div>
              <div style={{ marginTop: '16px', padding: '13px 16px', borderRadius: '10px', background: T.primary900, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: T.primary100, fontSize: '13px' }}>আনুমানিক মাসিক বিল</span>
                <span style={{ color: '#fff', fontFamily: T.fontMono, fontSize: '17px', fontWeight: 700 }}>{formatTaka(pricing.discounted)}</span>
              </div>
              {pricing.discountPct > 0 && (
                <p style={{ fontSize: '12px', color: T.success, marginTop: '6px', textAlign: 'right' }}>{formatTaka(pricing.monthly)} থেকে {pricing.discountPct}% ছাড়</p>
              )}
            </div>
          </>
        )}

        {/* ───────────── ধাপ: কোম্পানি (শুধু নতুন কাস্টমার) ───────────── */}
        {currentStepKey === 'company' && (
          <>
            <div style={cardStyle}>
              <p style={sectionTitleStyle}><FiHome style={{ verticalAlign: '-2px', marginRight: '6px' }} />কোম্পানির তথ্য</p>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>কোম্পানির নাম (ইংরেজি) *</label>
                <input {...register('company_name', { required: true })} style={inputStyle} placeholder="Zovorix Traders" />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>কোম্পানির নাম (বাংলা)</label>
                <input {...register('company_name_bn')} style={inputStyle} placeholder="জোভরিক্স ট্রেডার্স" />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Company ID (slug) *</label>
                <div style={{ position: 'relative' }}>
                  <input {...register('slug', { required: true })} style={{ ...inputStyle, paddingRight: '36px' }} placeholder="zovorix-traders" />
                  <span style={{ position: 'absolute', right: '12px', top: '11px' }}>
                    {slugStatus === 'checking' && <FiLoader style={{ color: T.textMuted }} />}
                    {slugStatus === 'available' && <FiCheckCircle style={{ color: T.success }} />}
                    {(slugStatus === 'taken' || slugStatus === 'invalid') && <FiXCircle style={{ color: T.danger }} />}
                  </span>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}><FiUser style={{ verticalAlign: '-2px', marginRight: '4px' }} />যোগাযোগের নাম *</label>
                <input {...register('contact_name', { required: true })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}><FiPhone style={{ verticalAlign: '-2px', marginRight: '4px' }} />ফোন *</label>
                  <input {...register('contact_phone', { required: true })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}><FiMail style={{ verticalAlign: '-2px', marginRight: '4px' }} />ইমেইল</label>
                  <input {...register('contact_email')} style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <p style={sectionTitleStyle}><FiBriefcase style={{ verticalAlign: '-2px', marginRight: '6px' }} />ব্যবসার প্রোফাইল (ঐচ্ছিক)</p>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>ব্যবসার ধরন</label>
                <select {...register('industry')} style={inputStyle} defaultValue="">
                  <option value="" disabled>বেছে নিন</option>
                  {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>কোম্পানির আকার</label>
                <select {...register('company_size')} style={inputStyle} defaultValue="">
                  <option value="" disabled>বেছে নিন</option>
                  {COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}><FiGlobe style={{ verticalAlign: '-2px', marginRight: '4px' }} />দেশ</label>
                  <select {...register('country')} style={inputStyle} defaultValue="">
                    <option value="" disabled>বেছে নিন</option>
                    {Object.keys(COUNTRY_TIMEZONES).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>টাইমজোন</label>
                  <input {...register('timezone')} style={inputStyle} />
                </div>
              </div>
              {countryValue === 'বাংলাদেশ' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={labelStyle}>বিভাগ</label>
                    <select value={division} onChange={(e) => { setDivision(e.target.value); setValue('city', '') }} style={inputStyle}>
                      <option value="" disabled>বেছে নিন</option>
                      {Object.keys(BD_DIVISIONS_DISTRICTS).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>জেলা</label>
                    <select {...register('city')} style={inputStyle} defaultValue="" disabled={!division}>
                      <option value="" disabled>বেছে নিন</option>
                      {(BD_DIVISIONS_DISTRICTS[division] || []).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}><FiLink style={{ verticalAlign: '-2px', marginRight: '4px' }} />ওয়েবসাইট</label>
                <input {...register('website')} type="url" style={inputStyle} placeholder="https://example.com" />
              </div>
              <div>
                <label style={labelStyle}>আমাদের সম্পর্কে কীভাবে জানলেন?</label>
                <select {...register('referral_source')} style={inputStyle} defaultValue="">
                  <option value="" disabled>বেছে নিন</option>
                  {REFERRAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ───────────── ধাপ: বিলিং ───────────── */}
        {currentStepKey === 'billing' && (
          <div style={cardStyle}>
            <p style={sectionTitleStyle}>বিলিং তথ্য</p>
            {profilePrefilled && (
              <p style={{ fontSize: '12px', color: T.success, background: '#EAF4EE', padding: '8px 12px', borderRadius: '8px', marginBottom: '14px' }}>
                আগে (ট্রায়াল সাইনআপে) দেওয়া তথ্য থেকে auto-fill করা হয়েছে — চাইলে বদলে নিতে পারো।
              </p>
            )}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}><FiMapPin style={{ verticalAlign: '-2px', marginRight: '4px' }} />কোম্পানির ঠিকানা</label>
              <input {...register('company_address')} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>কোম্পানির ফোন</label>
                <input {...register('company_phone')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>কোম্পানির ইমেইল</label>
                <input {...register('company_email')} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Billing Name</label>
                <input {...register('billing_name')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Billing Email</label>
                <input {...register('billing_email')} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* ───────────── ধাপ: পেমেন্ট ───────────── */}
        {currentStepKey === 'payment' && (
          <div style={cardStyle}>
            <p style={sectionTitleStyle}><FiCreditCard style={{ verticalAlign: '-2px', marginRight: '6px' }} />পেমেন্ট</p>
            <div style={{ background: T.bgAlt, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', color: T.textSecondary, lineHeight: 1.6 }}>
              bKash/Nagad Merchant: <strong style={{ color: T.textPrimary, fontFamily: T.fontMono }}>01309540282</strong> নম্বরে
              "Send Money" করে TrxID নিচে লিখুন। TrxID যাচাই করেই আমরা activate করবো।
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>পেমেন্ট মাধ্যম *</label>
              <select {...register('payment_method', { required: true })} style={inputStyle} defaultValue="">
                <option value="" disabled>বেছে নিন</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
                <option value="other">অন্যান্য</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Transaction ID (TrxID) *</label>
              <input {...register('trx_id', { required: true })} style={{ ...inputStyle, fontFamily: T.fontMono }} placeholder="8N7X..." />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          {stepIndex > 0 && (
            <button type="button" onClick={goBack} style={navBtnStyle(false)}>
              <FiArrowLeft /> পেছনে
            </button>
          )}
          {currentStepKey !== 'payment' ? (
            <button type="button" onClick={goNext} style={{ ...navBtnStyle(true), flex: 1 }}>
              পরবর্তী ধাপ <FiArrowRight />
            </button>
          ) : (
            <button type="submit" disabled={submitting} style={{ ...navBtnStyle(true), flex: 1, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? <FiLoader style={{ animation: 'spin 0.8s linear infinite' }} /> : <FiCheck />}
              {submitting ? 'জমা হচ্ছে...' : 'রিকোয়েস্ট জমা দিন'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
