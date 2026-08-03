import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiCheckCircle, FiXCircle, FiLoader, FiArrowLeft, FiPhone, FiMail,
  FiUser, FiHome, FiCreditCard, FiUsers,
} from 'react-icons/fi'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import SEO from '../components/SEO'
import { PLANS, PLAN_ORDER, COMMITMENT_DISCOUNTS, formatTaka } from '../constants/planPricing'

// ============================================================
// BookPlan — "প্ল্যান বুক করুন" পেজ (নতুন, এই round-এ যোগ)
// ------------------------------------------------------------
// দুই এন্ট্রি পয়েন্ট, একই পেজ:
//  ১. পাবলিক ভিজিটর (লগইন নেই) → পুরো ফর্ম (কোম্পানি তথ্য সহ) →
//     POST /api/plan-bookings (নতুন tenant, approve হলে তৈরি হবে)
//  ২. লগইন করা tenant admin (trial থেকে upgrade করতে চায়) → ছোট ফর্ম
//     (কোম্পানি তথ্য বাদ, তাদেরটা backend নিজেই জানে JWT থেকে) →
//     POST /api/plan-bookings/upgrade
//
// কোনো payment gateway নেই — bKash/Nagad-এ ম্যানুয়ালি পাঠিয়ে TrxID
// এখানে লেখা হয়, Super Admin panel-এ pending থাকে যতক্ষণ না verify
// করে approve করা হয়। তাই submit করেই প্ল্যান activate হয় না।
//
// role-key ম্যাপিং: planPricing.js-এ 'sr'/'stock'/'shop' নামে আছে
// (মার্কেটিং কপি), কিন্তু আসল DB/employee সিস্টেমে 'worker'/'stock_keeper'/
// 'shop_keeper' — এখানেই একবার ম্যাপ করে backend-এ আসল role নাম পাঠানো হয়,
// যাতে ব্যাকএন্ডে কোনো অনুবাদ লাগবে না (planBooking.service.js দেখো)।
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
  width: '100%', padding: '11px 14px', border: `1px solid ${T.borderDefault}`,
  borderRadius: '9px', fontSize: '14px', fontFamily: T.fontBody, color: T.textPrimary,
  background: T.bgSurface, outline: 'none', boxSizing: 'border-box',
}
const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, marginBottom: '6px' }
const cardStyle = {
  background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '14px',
  padding: '20px', marginBottom: '16px',
}
const sectionTitleStyle = { fontFamily: T.fontHead, fontSize: '17px', fontWeight: 700, color: T.primary700, marginBottom: '14px' }

// planPricing.js-এর মার্কেটিং role-key → আসল DB role — এই একটা জায়গাতেই ম্যাপ করা
const SEAT_ROLES = [
  { pricingKey: 'sr',      dbRole: 'worker',       label: 'SR (সেলস রিপ্রেজেন্টেটিভ)' },
  { pricingKey: 'manager', dbRole: 'manager',       label: 'ম্যানেজার' },
  { pricingKey: 'stock',   dbRole: 'stock_keeper',  label: 'স্টক কিপার' },
  { pricingKey: 'shop',    dbRole: 'shop_keeper',   label: 'শপ কিপার' },
]

const BILLING_CYCLES = [
  { key: 'monthly', label: 'মাসিক', discountPct: 0 },
  ...COMMITMENT_DISCOUNTS.map(d => ({ key: `${d.years}yr`, label: `${d.years} বছর (${d.discountPct}% ছাড়)`, discountPct: d.discountPct })),
]

export default function BookPlan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuthStore()
  const isUpgradeMode = !!(user && isAdmin())

  const [plan, setPlan] = useState(PLAN_ORDER.includes(searchParams.get('plan')) ? searchParams.get('plan') : 'pro')
  const [cycle, setCycle] = useState('monthly')
  const [seats, setSeats] = useState({ sr: 2, manager: 1, stock: 1, shop: 1 })
  const [slugStatus, setSlugStatus] = useState(null) // null | checking | available | taken | invalid
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null) // { id }

  const { register, handleSubmit, watch, formState: { errors } } = useForm({ mode: 'onBlur' })
  const slugValue = watch('slug')

  // ─── স্লাগ availability চেক (শুধু নতুন কাস্টমার মোডে লাগে) ───
  const checkSlug = useCallback((value) => {
    if (isUpgradeMode) return
    if (!value || value.length < 3) { setSlugStatus(null); return }
    if (!/^[a-z0-9-]{3,30}$/.test(value)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/register/check-slug/${value}`)
        setSlugStatus(res.data?.data?.available ? 'available' : 'taken')
      } catch {
        setSlugStatus(null)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [isUpgradeMode])

  useEffect(() => { checkSlug(slugValue) }, [slugValue, checkSlug])

  const planData = PLANS[plan]

  // ─── লাইভ দাম ক্যালকুলেটর ───
  const pricing = useMemo(() => {
    const adminRole = planData.roles.find(r => r.key === 'admin')
    let monthly = adminRole ? adminRole.price : 0
    const lines = [{ label: 'অ্যাডমিন/মালিক (আপনি)', qty: 1, price: adminRole?.price || 0 }]
    SEAT_ROLES.forEach(({ pricingKey, label }) => {
      const roleData = planData.roles.find(r => r.key === pricingKey)
      const qty = Number(seats[pricingKey] || 0)
      if (!roleData || qty <= 0) return
      monthly += roleData.price * qty
      lines.push({ label, qty, price: roleData.price })
    })
    const discountPct = BILLING_CYCLES.find(c => c.key === cycle)?.discountPct || 0
    const discounted = Math.round(monthly * (1 - discountPct / 100))
    return { lines, monthly, discounted, discountPct }
  }, [planData, seats, cycle])

  const onSubmit = async (formData) => {
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
          <h1 style={{ fontFamily: T.fontHead, fontSize: '22px', fontWeight: 700, color: T.primary700, marginBottom: '10px' }}>
            রিকোয়েস্ট জমা হয়েছে
          </h1>
          <p style={{ fontSize: '14px', color: T.textSecondary, lineHeight: 1.6, marginBottom: '18px' }}>
            আপনার TrxID যাচাই করে আমরা দ্রুতই যোগাযোগ করবো। ভেরিফাই হওয়ার পর
            {isUpgradeMode ? ' আপনার প্ল্যান আপগ্রেড হয়ে যাবে।' : ' লগইন তথ্য পাঠানো হবে।'}
          </p>
          <button onClick={() => navigate(isUpgradeMode ? '/dashboard' : '/')} style={{
            padding: '12px 24px', background: T.primary700, border: 'none', borderRadius: '10px',
            color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
          }}>
            {isUpgradeMode ? 'ড্যাশবোর্ডে ফিরে যান' : 'হোমপেজে ফিরে যান'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary, paddingBottom: '60px' }}>
      <SEO
        title="প্ল্যান বুক করুন"
        description="ZovoriX-এ পেইড প্ল্যান বুক করুন — বিস্তারিত তথ্য দিয়ে সহজেই আপগ্রেড করুন।"
        path="/book-plan"
      />

      <nav style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 20px', borderBottom: `1px solid ${T.borderDefault}` }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, display: 'flex' }}>
          <FiArrowLeft size={18} />
        </button>
        <span style={{ fontFamily: T.fontHead, fontWeight: 700, fontSize: '16px', color: T.primary700 }}>প্ল্যান বুক করুন</span>
      </nav>

      <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: '640px', margin: '24px auto', padding: '0 16px' }}>

        {isUpgradeMode && (
          <div style={{ ...cardStyle, background: T.accent100, border: `1px solid ${T.accent300}` }}>
            <p style={{ fontSize: '13.5px', color: T.primary700, margin: 0 }}>
              আপনি লগইন করা আছেন — এটা আপনার বিদ্যমান কোম্পানির জন্য <strong>আপগ্রেড</strong> রিকোয়েস্ট হবে।
            </p>
          </div>
        )}

        {/* প্ল্যান বাছাই */}
        <div style={cardStyle}>
          <p style={sectionTitleStyle}>প্ল্যান বেছে নিন</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {PLAN_ORDER.map((key) => (
              <button type="button" key={key} onClick={() => setPlan(key)} style={{
                padding: '12px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${plan === key ? T.primary700 : T.borderDefault}`,
                background: plan === key ? T.primary100 : T.bgSurface,
                fontFamily: T.fontBody,
              }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: T.primary700 }}>{PLANS[key].name}</div>
                <div style={{ fontSize: '11.5px', color: T.textMuted, marginTop: '2px' }}>{PLANS[key].maxCustomersLabel}</div>
              </button>
            ))}
          </div>
        </div>

        {/* সিট সংখ্যা */}
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
                <input
                  type="number" min="0" max="500" value={seats[pricingKey]}
                  onChange={(e) => setSeats(s => ({ ...s, [pricingKey]: Math.max(0, Number(e.target.value)) }))}
                  style={{ ...inputStyle, width: '72px', textAlign: 'center', padding: '8px' }}
                />
              </div>
            )
          })}
        </div>

        {/* বিলিং সাইকেল */}
        <div style={cardStyle}>
          <p style={sectionTitleStyle}>বিলিং সাইকেল</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {BILLING_CYCLES.map((c) => (
              <button type="button" key={c.key} onClick={() => setCycle(c.key)} style={{
                padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${cycle === c.key ? T.primary700 : T.borderDefault}`,
                background: cycle === c.key ? T.primary700 : T.bgSurface,
                color: cycle === c.key ? '#fff' : T.textSecondary, fontFamily: T.fontBody,
              }}>
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '16px', padding: '13px 16px', borderRadius: '10px', background: T.primary900, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: T.primary100, fontSize: '13px' }}>আনুমানিক মাসিক বিল</span>
            <span style={{ color: '#fff', fontFamily: T.fontMono, fontSize: '17px', fontWeight: 700 }}>{formatTaka(pricing.discounted)}</span>
          </div>
          {pricing.discountPct > 0 && (
            <p style={{ fontSize: '12px', color: T.success, marginTop: '6px', textAlign: 'right' }}>
              {formatTaka(pricing.monthly)} থেকে {pricing.discountPct}% ছাড়
            </p>
          )}
          <p style={{ fontSize: '11.5px', color: T.textMuted, marginTop: '6px' }}>
            এটা আনুমানিক হিসাব — Super Admin TrxID যাচাই করার সময় চূড়ান্ত করবে।
          </p>
        </div>

        {/* কোম্পানি তথ্য — শুধু নতুন কাস্টমারের ক্ষেত্রে */}
        {!isUpgradeMode && (
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
              {slugStatus === 'taken' && <p style={{ fontSize: '12px', color: T.danger, marginTop: '4px' }}>এই ID আগেই ব্যবহার হয়েছে</p>}
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
        )}

        {/* বিলিং তথ্য */}
        <div style={cardStyle}>
          <p style={sectionTitleStyle}>বিলিং তথ্য</p>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>কোম্পানির ঠিকানা</label>
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

        {/* পেমেন্ট */}
        <div style={cardStyle}>
          <p style={sectionTitleStyle}><FiCreditCard style={{ verticalAlign: '-2px', marginRight: '6px' }} />পেমেন্ট</p>
          <div style={{ background: T.bgAlt, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', color: T.textSecondary, lineHeight: 1.6 }}>
            bKash/Nagad Merchant: <strong style={{ color: T.textPrimary, fontFamily: T.fontMono }}>01XXXXXXXXX</strong> নম্বরে
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

        <button type="submit" disabled={submitting} style={{
          width: '100%', padding: '14px', background: submitting ? T.primary300 : T.primary700, border: 'none',
          borderRadius: '11px', color: '#fff', fontSize: '15px', fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: T.fontBody,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          {submitting ? <FiLoader style={{ animation: 'spin 0.8s linear infinite' }} /> : <FiCheck />}
          {submitting ? 'জমা হচ্ছে...' : 'রিকোয়েস্ট জমা দিন'}
        </button>
      </form>
    </div>
  )
}
