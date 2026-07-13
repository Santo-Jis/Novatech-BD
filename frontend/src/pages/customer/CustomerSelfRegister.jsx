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
// GPS/route/credit_limit/photo এখানে নেই — SR পরে "Edit Customer"
// থেকে বসাবে (customer.controller.js → updateCustomer, আগে থেকেই আছে)

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { BACKEND } from './utils/api'

const BUSINESS_TYPES = ['মুদি', 'ফার্মেসি', 'হার্ডওয়্যার', 'কসমেটিক্স', 'ইলেকট্রনিক্স', 'কাপড়', 'খাদ্য ও পানীয়', 'স্টেশনারি', 'অন্যান্য']

const inputStyle = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'white',
  fontSize: 14,
  fontFamily: "'Hind Siliguri', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  color: 'rgba(255,255,255,0.55)',
  fontSize: 12,
  marginBottom: 6,
  display: 'block',
  fontFamily: "'Hind Siliguri', sans-serif",
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#f87171' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CustomerSelfRegister() {
  const { slug } = useParams()

  const [form, setForm] = useState({
    shop_name: '', owner_name: '', business_type: '',
    whatsapp: '', sms_phone: '', email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // কোম্পানি lookup — slug ছাড়া বা ভুল slug হলে ফর্ম দেখানো হবে না
  const [companyLoading, setCompanyLoading] = useState(true)
  const [company, setCompany] = useState(null)     // { company_name, company_name_bn }
  const [linkInvalid, setLinkInvalid] = useState(false)

  useEffect(() => {
    if (!slug) {
      setCompanyLoading(false)
      setLinkInvalid(true)
      return
    }
    fetch(`${BACKEND}/portal/company-info/${encodeURIComponent(slug)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (!data.success) throw new Error()
        setCompany(data)
      })
      .catch(() => setLinkInvalid(true))
      .finally(() => setCompanyLoading(false))
  }, [slug])

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
        body: JSON.stringify({ ...form, slug }),
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

  // ── লোডিং ────────────────────────────────────────────────
  if (companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)' }}>
        <span style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.25)', borderTop: '3px solid white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── ভুল/অনুপস্থিত লিংক ───────────────────────────────────
  if (linkInvalid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)' }}>
        <span style={{ fontSize: 40, marginBottom: 12 }}>🔗</span>
        <h1 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 8px', textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif" }}>
          এই লিংকটি সঠিক নয়
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.6, fontFamily: "'Hind Siliguri', sans-serif" }}>
          রেজিস্ট্রেশনের জন্য আপনার ডিলার/SR-এর দেওয়া সঠিক লিংকটি ব্যবহার করুন।
        </p>
        <a href="/customer-login" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 20, textDecoration: 'underline', fontFamily: "'Hind Siliguri', sans-serif" }}>
          লগইন পেজে ফিরে যান
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>

        {/* Logo */}
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <span style={{ color: 'white', fontSize: 28, fontWeight: 800, fontFamily: 'Georgia, serif' }}>N</span>
        </div>

        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 4px', textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif" }}>
          নতুন কাস্টমার রেজিস্ট্রেশন
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 24px', textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif" }}>
          {company?.company_name_bn || company?.company_name}-এ আপনার দোকানের তথ্য দিয়ে অ্যাকাউন্ট খুলুন
        </p>

        {error && (
          <div style={{ width: '100%', maxWidth: 380, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ color: 'rgba(252,165,165,0.9)', fontSize: 13, margin: 0, lineHeight: 1.5, fontFamily: "'Hind Siliguri', sans-serif" }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380, background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: 22 }}>

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
            <select style={{ ...inputStyle, colorScheme: 'dark' }} value={form.business_type} onChange={set('business_type')}>
              <option value="" style={{ color: '#1e293b' }}>-- বেছে নিন --</option>
              {BUSINESS_TYPES.map(t => <option key={t} value={t} style={{ color: '#1e293b' }}>{t}</option>)}
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
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, margin: 0, lineHeight: 1.5, fontFamily: "'Hind Siliguri', sans-serif" }}>
              দোকানের লোকেশন এখন লাগবে না — আমাদের প্রতিনিধি (SR) শীঘ্রই দোকানে গিয়ে যুক্ত করে দেবেন।
            </p>
          </div>

          <button type="submit" disabled={submitting} style={{ width: '100%', padding: '15px', borderRadius: 14, background: submitting ? 'rgba(255,255,255,0.7)' : 'white', border: 'none', color: '#1e3a8a', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontFamily: "'Hind Siliguri', sans-serif", opacity: submitting ? 0.8 : 1 }}>
            {submitting ? 'রেজিস্ট্রেশন হচ্ছে...' : 'রেজিস্ট্রেশন করুন'}
          </button>
        </form>

        <a href="/customer-login" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 20, textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif", textDecoration: 'underline' }}>
          আগে থেকে অ্যাকাউন্ট আছে? লগইন করুন
        </a>
      </div>

      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11, padding: '16px', letterSpacing: 0.5 }}>
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
