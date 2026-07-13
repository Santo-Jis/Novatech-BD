// pages/customer/CustomerSelfRegister.jsx
// কাস্টমার নিজে সাইন-আপ করার পাবলিক পেজ — কোনো auth লাগে না
//
// ফ্লো:
//   ১. এই ফর্ম পূরণ করে সাবমিট করে (shop_name, owner_name, whatsapp...)
//   ২. POST /portal/self-register → নতুন customer_code পায়
//   ৩. /customer-login?c=CODE-এ রিডাইরেক্ট — এরপর থেকে পুরনো,
//      টেস্টেড CustomerPortal ফ্লো (Welcome → Google login → Dashboard)
//      হুবহু একইভাবে চলে, নতুন কোনো auth কোড লাগে না
//
// কোনো কোম্পানি-নির্দিষ্ট লিংক/স্লাগ/কোড লাগে না — এই পেজ সরাসরি
// খোলা যায়, কিছু যাচাই করার দরকার নেই।
//
// GPS/route/credit_limit/photo এখানে নেই — SR পরে "Edit Customer"
// থেকে বসাবে (customer.controller.js → updateCustomer, আগে থেকেই আছে)

import { useState } from 'react'
import { BACKEND } from './utils/api'

const BUSINESS_TYPES = ['মুদি', 'ফার্মেসি', 'হার্ডওয়্যার', 'কসমেটিক্স', 'ইলেকট্রনিক্স', 'কাপড়', 'খাদ্য ও পানীয়', 'স্টেশনারি', 'অন্যান্য']

// ── ডিজাইন সিস্টেম টোকেন (design.html অনুযায়ী) ──────────────
const C = {
  bgBase: '#FAF8F3', bgSurface: '#FFFFFF',
  primary900: '#0F1B2E', primary700: '#16253D',
  accent600: '#9C6B2E', accent300: '#C99B5A',
  textSecondary: '#5B6472', textMuted: '#8B8F98',
  borderDefault: '#E4E1D8', error: '#B3452C', errorBg: '#F5E4DF',
}
const FONT_HEAD = "'Source Serif 4','Noto Sans Bengali',Georgia,serif"
const FONT_BODY = "'IBM Plex Sans','Noto Sans Bengali','Hind Siliguri',sans-serif"

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 8,
  background: C.bgSurface,
  border: `1px solid ${C.borderDefault}`,
  color: '#1F2937',
  fontSize: 14,
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  color: C.textSecondary,
  fontSize: 12,
  marginBottom: 6,
  display: 'block',
  fontFamily: FONT_BODY,
  fontWeight: 500,
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: C.error }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CustomerSelfRegister() {
  const [form, setForm] = useState({
    shop_name: '', owner_name: '', business_type: '',
    whatsapp: '', sms_phone: '', email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.shop_name.trim())  return setError('দোকানের নাম দিন।')
    if (!form.owner_name.trim()) return setError('মালিকের নাম দিন।')
    if (!/^01[0-9]{9}$/.test(form.whatsapp.trim())) return setError('সঠিক WhatsApp নম্বর দিন (01XXXXXXXXX)।')

    setSubmitting(true)
    try {
      const res = await fetch(`${BACKEND}/portal/self-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.message || 'রেজিস্ট্রেশন করতে সমস্যা হয়েছে।')
        setSubmitting(false)
        return
      }

      // ✅ পুরনো, টেস্টেড লগইন ফ্লো রিইউজ — এখান থেকে CustomerPortal সব সামলাবে
      window.location.href = `/customer-login?c=${encodeURIComponent(data.customer_code)}`

    } catch {
      setError('নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bgBase }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>

        {/* Logo */}
        <div style={{ width: 60, height: 60, borderRadius: 16, background: C.primary900, border: `2px solid ${C.accent300}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <span style={{ color: C.accent300, fontSize: 26, fontWeight: 700, fontFamily: FONT_HEAD }}>N</span>
        </div>

        <h1 style={{ color: C.primary700, fontSize: 20, fontWeight: 600, margin: '0 0 4px', textAlign: 'center', fontFamily: FONT_HEAD }}>
          নতুন কাস্টমার রেজিস্ট্রেশন
        </h1>
        <p style={{ color: C.textSecondary, fontSize: 13, margin: '0 0 24px', textAlign: 'center', fontFamily: FONT_BODY }}>
          আপনার দোকানের তথ্য দিয়ে অ্যাকাউন্ট খুলুন
        </p>

        {error && (
          <div style={{ width: '100%', maxWidth: 380, background: C.errorBg, border: `1px solid ${C.error}33`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ color: C.error, fontSize: 13, margin: 0, lineHeight: 1.5, fontFamily: FONT_BODY }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380, background: C.bgSurface, border: `1px solid ${C.borderDefault}`, borderRadius: 14, padding: 22, boxSizing: 'border-box' }}>

          <Field label="দোকানের নাম" required>
            <input style={inputStyle} value={form.shop_name} onChange={set('shop_name')} placeholder="যেমন: আল-আমিন স্টোর" />
          </Field>

          <Field label="মালিকের নাম" required>
            <input style={inputStyle} value={form.owner_name} onChange={set('owner_name')} placeholder="আপনার নাম" />
          </Field>

          <Field label="WhatsApp নম্বর" required>
            <input style={inputStyle} type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="01XXXXXXXXX" />
          </Field>

          <Field label="ব্যবসার ধরন">
            <select style={inputStyle} value={form.business_type} onChange={set('business_type')}>
              <option value="">-- বেছে নিন --</option>
              {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="SMS নম্বর (ঐচ্ছিক)">
            <input style={inputStyle} type="tel" value={form.sms_phone} onChange={set('sms_phone')} placeholder="আলাদা হলে দিন" />
          </Field>

          <Field label="Email (ঐচ্ছিক)">
            <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
          </Field>

          {/* GPS-না-থাকার ব্যাখ্যা — যাতে ব্যবহারকারী বিভ্রান্ত না হয় */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 18, marginTop: 4 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
            <p style={{ color: C.textMuted, fontSize: 11.5, margin: 0, lineHeight: 1.5, fontFamily: FONT_BODY }}>
              দোকানের লোকেশন এখন লাগবে না — আমাদের প্রতিনিধি (SR) শীঘ্রই দোকানে গিয়ে যুক্ত করে দেবেন।
            </p>
          </div>

          <button type="submit" disabled={submitting} style={{ width: '100%', padding: '14px', borderRadius: 8, background: submitting ? C.accent300 : C.accent600, border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: FONT_BODY }}>
            {submitting ? 'রেজিস্ট্রেশন হচ্ছে...' : 'রেজিস্ট্রেশন করুন'}
          </button>
        </form>

        <a href="/customer-login" style={{ color: C.textMuted, fontSize: 13, marginTop: 20, textAlign: 'center', fontFamily: FONT_BODY, textDecoration: 'underline' }}>
          আগে থেকে অ্যাকাউন্ট আছে? লগইন করুন
        </a>
      </div>

      <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 11, padding: '16px', letterSpacing: 0.5, fontFamily: FONT_BODY }}>
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
