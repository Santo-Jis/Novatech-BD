import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiShoppingBag, FiSettings, FiChevronDown, FiPhone, FiMail, FiMessageCircle,
  FiMapPin, FiClock, FiSend,
} from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'

// ============================================================
// Contact Us — ZovoriX
// ল্যান্ডিং পেইজের সাথে সামঞ্জস্যপূর্ণ ডিজাইন সিস্টেম ব্যবহার করা হয়েছে
// ============================================================

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
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontBody: "'IBM Plex Sans','Noto Sans Bengali',Arial,sans-serif",
  fontMono: "'IBM Plex Mono',monospace",
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  border: `1px solid ${T.borderDefault}`,
  borderRadius: '9px',
  fontSize: '14px',
  fontFamily: T.fontBody,
  color: T.textPrimary,
  background: T.bgSurface,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function ContactUs() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const dropRef = useRef(null)
  const [form, setForm] = useState({ name: '', contact: '', message: '' })
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setMgmtOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const roles = [
    { label: 'SR লগইন',      role: 'sr',      icon: '👤', desc: 'Sales Representative' },
    { label: 'Manager লগইন', role: 'manager', icon: '📊', desc: 'ম্যানেজার / সুপারভাইজার' },
    { label: 'Admin লগইন',   role: 'admin',   icon: '⚙️', desc: 'অ্যাডমিন প্যানেল' },
  ]

  const contactCards = [
    { icon: <FiPhone />,        title: 'ফোন',      value: '+৮৮০ ১৩০৯-৫৪০২৮২', href: 'tel:+8801309540282' },
    { icon: <FiMail />,         title: 'ইমেইল',    value: 'support@zovorix.com', href: 'mailto:support@zovorix.com' },
    { icon: <FiMessageCircle />,title: 'হোয়াটসঅ্যাপ', value: 'চ্যাট শুরু করুন', href: 'https://wa.me/8801309540282' },
    { icon: <FiMapPin />,       title: 'ঠিকানা',   value: 'বরিশাল সদর, কাউনিয়া, জানকি সিংহ রোড', href: 'https://www.google.com/maps/search/?api=1&query=Kaunia+Jankisingha+Road+Barisal+Sadar' },
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    const subject = encodeURIComponent(`ZovoriX যোগাযোগ ফর্ম — ${form.name || 'নাম প্রদত্ত নয়'}`)
    const body = encodeURIComponent(
      `নাম: ${form.name}\nযোগাযোগ: ${form.contact}\n\nবার্তা:\n${form.message}`
    )
    window.location.href = `mailto:support@zovorix.com?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary, overflowX: 'hidden' }}>
      {/* Navbar */}
      <style>{`
        @media (max-width: 480px) {
          .zx-navbar { padding: 8px 10px !important; flex-wrap: nowrap !important; row-gap: 0 !important; }
          .zx-brand { gap: 6px !important; }
          .zx-logo-box { width: 26px !important; height: 26px !important; border-radius: 6px !important; }
          .zx-brand-text { font-size: 14px !important; }
          .zx-nav-actions { gap: 6px !important; }
          .zx-btn-retailer, .zx-btn-mgmt { padding: 6px 8px !important; font-size: 11px !important; gap: 4px !important; border-radius: 6px !important; }
          .zx-btn-suffix { display: none !important; }
          .zx-btn-icon { font-size: 12px !important; }
          .zx-chevron { font-size: 11px !important; }
        }
        @media (max-width: 360px) {
          .zx-brand-text { display: none !important; }
          .zx-btn-retailer, .zx-btn-mgmt { padding: 6px 7px !important; }
        }
      `}</style>
      <nav className="zx-navbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: `1px solid ${T.borderDefault}`,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        flexWrap: 'wrap', rowGap: '10px',
      }}>
        <div className="zx-brand" onClick={() => navigate('/landing')} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}>
          <div className="zx-logo-box" style={{ width: '34px', height: '34px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.borderDefault}` }}>
            <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span className="zx-brand-text" style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '19px', color: T.primary700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>ZovoriX</span>
        </div>

        <div className="zx-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            className="zx-btn-retailer"
            onClick={() => navigate('/customer-login')}
            style={{
              padding: '9px 18px', background: 'transparent', border: `1px solid ${T.primary700}`,
              borderRadius: '8px', color: T.primary700, fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              fontFamily: T.fontBody, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.primary700; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.primary700 }}
          >
            <FiShoppingBag className="zx-btn-icon" style={{ fontSize: '14px' }} /> রিটেইলার<span className="zx-btn-suffix">&nbsp;লগইন</span>
          </button>

          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              className="zx-btn-mgmt"
              onClick={() => setMgmtOpen(p => !p)}
              style={{
                padding: '9px 18px', background: T.primary700, border: `1px solid ${T.primary700}`,
                borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontFamily: T.fontBody, transition: 'background 0.2s', whiteSpace: 'nowrap',
              }}
            >
              <FiSettings className="zx-btn-icon" style={{ fontSize: '14px' }} />
              ম্যানেজমেন্ট<span className="zx-btn-suffix">&nbsp;লগইন</span>
              <FiChevronDown className="zx-chevron" style={{ fontSize: '13px', transition: 'transform 0.2s', transform: mgmtOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {mgmtOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: '210px',
                background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '10px',
                overflow: 'hidden', boxShadow: '0 16px 40px rgba(15,27,46,0.18)', zIndex: 200,
                animation: 'fadeSlideDown 0.15s ease-out',
              }}>
                <style>{`@keyframes fadeSlideDown { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>
                <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${T.borderDefault}`, color: T.textMuted, fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: T.fontMono }}>
                  ম্যানেজমেন্ট পোর্টাল
                </div>
                {roles.map((item) => (
                  <button
                    key={item.role}
                    onClick={() => { setMgmtOpen(false); navigate('/login', { state: { roleHint: item.role } }) }}
                    style={{
                      width: '100%', padding: '11px 16px', background: 'transparent', border: 'none',
                      borderBottom: `1px solid ${T.borderDefault}`, color: T.textPrimary, fontSize: '13px',
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                      fontFamily: T.fontBody, textAlign: 'left', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.bgAlt}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: '32px', height: '32px', background: T.primary100, borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: T.primary700 }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '1px' }}>{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Utility links bar — Home / About / Contact */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px',
        padding: '10px 24px', borderBottom: `1px solid ${T.borderDefault}`,
        background: T.bgAlt, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate('/landing')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700}
          onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
        >
          হোম
        </button>
        <button
          onClick={() => navigate('/about')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700}
          onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
        >
          আমাদের সম্পর্কে
        </button>
        <button
          onClick={() => navigate('/contact')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.primary700, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody }}
        >
          যোগাযোগ
        </button>
      </div>


      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '64px 24px 40px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px',
          background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '20px',
          fontSize: '11px', fontFamily: T.fontMono, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: T.textMuted, marginBottom: '24px',
        }}>
          যোগাযোগ
        </div>
        <h1 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(28px, 5.5vw, 44px)', fontWeight: 600,
          lineHeight: 1.3, margin: '0 auto 8px', maxWidth: '560px', color: T.primary700,
        }}>
          আমরা আছি<br />
          <span style={{ color: T.accent600 }}>আপনার পাশে</span>
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '15.5px', maxWidth: '480px', margin: '24px auto 0', lineHeight: 1.8 }}>
          প্রশ্ন, পরামর্শ বা সাহায্য দরকার? নিচের যেকোনো মাধ্যমে যোগাযোগ করুন —
          আমরা দ্রুত সাড়া দেওয়ার চেষ্টা করি।
        </p>
      </section>

      {/* Contact cards */}
      <section style={{ padding: '8px 24px 48px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '18px' }}>
          {contactCards.map((c, i) => (
            <a
              key={i}
              href={c.href}
              target={c.href.startsWith('http') ? '_blank' : undefined}
              rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              style={{
                background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '12px',
                padding: '24px 20px', textAlign: 'center', textDecoration: 'none', color: 'inherit',
                display: 'block', transition: 'border-color 0.2s, transform 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary300; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDefault; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ width: '46px', height: '46px', background: T.primary100, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: T.primary700, margin: '0 auto 14px' }}>
                {c.icon}
              </div>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: T.textMuted, marginBottom: '6px', fontFamily: T.fontMono, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {c.title}
              </h3>
              <p style={{ fontSize: '14px', color: T.primary700, fontWeight: 600, margin: 0, wordBreak: 'break-word' }}>
                {c.value}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* Support hours + Form */}
      <section style={{ padding: '8px 24px 64px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.4fr)', gap: '24px' }} className="contact-grid">
          <style>{`
            @media (max-width: 720px) {
              .contact-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>

          {/* Support hours card */}
          <div style={{ background: T.primary900, borderRadius: '16px', padding: '32px 28px', color: '#fff', height: 'fit-content' }}>
            <div style={{ width: '42px', height: '42px', background: T.accent600, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', marginBottom: '18px' }}>
              <FiClock />
            </div>
            <h3 style={{ fontFamily: T.fontHead, fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>সাপোর্ট সময়</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ color: T.primary300 }}>শনি – বৃহস্পতি</span>
              <span style={{ fontWeight: 600 }}>সকাল ৮:৩০ – রাত ৯:৩০</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '10px 0' }}>
              <span style={{ color: T.primary300 }}>শুক্রবার</span>
              <span style={{ fontWeight: 600 }}>বিরতি ১১:৩০ – ৪:০০</span>
            </div>
            <p style={{ fontSize: '12.5px', color: T.primary300, marginTop: '16px', lineHeight: 1.7 }}>
              শুক্রবার বাকি সময় স্বাভাবিক সাপোর্ট চালু থাকে।
            </p>

            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: T.primary100 }}>
                <FiMapPin style={{ fontSize: '15px', color: T.accent300, marginTop: '2px', flexShrink: 0 }} />
                <span>বরিশাল সদর, কাউনিয়া, জানকি সিংহ রোড</span>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div style={{ background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '16px', padding: '32px 28px' }}>
            <h3 style={{ fontFamily: T.fontHead, fontSize: '18px', fontWeight: 600, color: T.primary700, margin: '0 0 18px' }}>
              বার্তা পাঠান
            </h3>

            {sent ? (
              <div style={{ padding: '20px', background: T.accent100, borderRadius: '10px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px', color: T.primary700, fontWeight: 600 }}>
                  আপনার মেইল অ্যাপ খোলা হয়েছে — বার্তাটি পাঠাতে সেখান থেকে সেন্ড করুন।
                </p>
                <button
                  onClick={() => setSent(false)}
                  style={{ marginTop: '12px', background: 'none', border: 'none', color: T.accent600, fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  আরেকটি বার্তা পাঠান
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: '6px' }}>নাম</label>
                  <input
                    type="text" required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="আপনার নাম"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: '6px' }}>ফোন / ইমেইল</label>
                  <input
                    type="text" required value={form.contact}
                    onChange={e => setForm({ ...form, contact: e.target.value })}
                    placeholder="যোগাযোগের নম্বর বা ইমেইল"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: '6px' }}>বার্তা</label>
                  <textarea
                    required rows={4} value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    placeholder="আপনার প্রশ্ন বা বার্তা লিখুন"
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: T.fontBody }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '12px 24px', background: T.primary700, border: 'none', borderRadius: '9px',
                    color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontFamily: T.fontBody, marginTop: '4px',
                  }}
                >
                  <FiSend /> বার্তা পাঠান
                </button>
                <p style={{ fontSize: '11.5px', color: T.textMuted, textAlign: 'center', margin: '4px 0 0' }}>
                  দ্রুত উত্তরের জন্য WhatsApp বা ফোনেও যোগাযোগ করতে পারেন।
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: T.primary900, color: T.primary100, padding: '48px 24px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', paddingBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '16px', color: '#fff' }}>ZovoriX</span>
              </div>
              <p style={{ fontSize: '12.5px', lineHeight: 1.7, color: T.primary300, margin: 0, maxWidth: '240px' }}>
                বিক্রয়, টিম ও কাস্টমার ব্যবস্থাপনার জন্য একটি সম্পূর্ণ প্ল্যাটফর্ম।
              </p>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>যোগাযোগ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="tel:+8801309540282" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiPhone style={{ fontSize: '14px', color: T.accent300 }} /> +৮৮০ ১৩০৯-৫৪০২৮২
                </a>
                <a href="mailto:support@zovorix.com" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMail style={{ fontSize: '14px', color: T.accent300 }} /> support@zovorix.com
                </a>
                <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMessageCircle style={{ fontSize: '14px', color: T.accent300 }} /> WhatsApp-এ লিখুন
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>সামাজিক যোগাযোগ</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {[
                  { icon: <FaFacebookF />,  href: 'https://www.facebook.com/profile.php?id=61591653097465&mibextid=ZbWKwL', label: 'Facebook' },
                  { icon: <FaXTwitter />,   href: 'https://x.com/Zovorix',              label: 'X' },
                  { icon: <FaInstagram />,  href: 'https://instagram.com/zovorix',       label: 'Instagram' },
                  { icon: <FaTiktok />,     href: 'https://tiktok.com/@zovorix.com',     label: 'TikTok' },
                  { icon: <FaDiscord />,    href: 'https://discord.gg/zovorix',          label: 'Discord' },
                  { icon: <FaRedditAlien />,href: 'https://reddit.com/u/zovorix',        label: 'Reddit' },
                ].map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}
                    style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary100, fontSize: '14px', transition: 'background 0.15s, color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.accent600; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = T.primary100 }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>লিংক</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>ম্যানেজমেন্ট লগইন</button>
                <button onClick={() => navigate('/customer-login')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>রিটেইলার শপ লগইন</button>
                <button onClick={() => navigate('/apply/sr')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>SR আবেদন করুন</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '20px' }}>
            <div style={{ fontSize: '12px', color: T.primary300 }}>© {new Date().getFullYear()} ZovoriX. সর্বস্বত্ব সংরক্ষিত।</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
