import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiShoppingBag, FiSettings, FiChevronDown, FiArrowRight,
  FiPhone, FiMail, FiMessageCircle, FiTarget, FiEye,
  FiUsers, FiShield, FiTrendingUp, FiMapPin,
} from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'

// ============================================================
// About Us — ZovoriX
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

export default function AboutUs() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const dropRef = useRef(null)

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

  const values = [
    { icon: <FiEye />,        title: 'স্বচ্ছতা',        desc: 'প্রতিটি অর্ডার, পেমেন্ট ও SR-এর কার্যক্রম সবার জন্য স্পষ্ট ও দৃশ্যমান' },
    { icon: <FiTrendingUp />, title: 'ডেটা-নির্ভর সিদ্ধান্ত', desc: 'অনুমান নয় — সঠিক তথ্য দেখে ব্যবসায়িক সিদ্ধান্ত নেওয়ার সুযোগ' },
    { icon: <FiUsers />,      title: 'মানুষের জন্য সহজ', desc: 'জটিল সিস্টেম নয় — যে কেউ সহজে শিখে ব্যবহার করতে পারার মতো ডিজাইন' },
    { icon: <FiShield />,     title: 'বিশ্বাসযোগ্যতা',   desc: 'এনক্রিপ্টেড ডেটা ও নিরাপদ অ্যাক্সেসের মাধ্যমে ব্যবসার তথ্য সুরক্ষিত রাখা' },
  ]

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
        <div
          className="zx-brand"
          onClick={() => navigate('/landing')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}
        >
          <div className="zx-logo-box" style={{ width: '34px', height: '34px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.borderDefault}` }}>
            <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span className="zx-brand-text" style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '19px', color: T.primary700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            ZovoriX
          </span>
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
          style={{ background: 'none', border: 'none', padding: 0, color: T.primary700, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody }}
        >
          আমাদের সম্পর্কে
        </button>
        <button
          onClick={() => navigate('/contact')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700}
          onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
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
          আমাদের গল্প
        </div>
        <h1 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(28px, 5.5vw, 44px)', fontWeight: 600,
          lineHeight: 1.3, margin: '0 auto 8px', maxWidth: '680px', color: T.primary700,
        }}>
          ব্যবসাকে অন্ধকার থেকে<br />
          <span style={{ color: T.accent600 }}>আলোয় আনার গল্প</span>
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '15.5px', maxWidth: '540px', margin: '24px auto 0', lineHeight: 1.8 }}>
          হাতে-লেখা খাতা আর মুখে-মুখে হিসাব থেকে শুরু করে — একটি প্ল্যাটফর্মে
          পুরো ব্যবসা দেখার জায়গা পর্যন্ত।
        </p>
      </section>

      {/* Story */}
      <section style={{ padding: '8px 24px 64px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '16px',
          padding: '36px 32px', boxShadow: '0 1px 2px rgba(15,27,46,0.04)',
        }}>
          {[
            'রাত তখন ১১টা। বরিশালের একজন ডিস্ট্রিবিউটর তার খাতার পাতা উল্টাচ্ছেন — কার কাছে কত টাকা বাকি, কোন SR আজ কোন এলাকায় গিয়েছিল, কোন দোকানে মাল দেওয়া হয়েছে কিন্তু টাকা তোলা হয়নি — সব হিসাব মাথায় নিয়ে ঘুমাতে যান। পরদিন সকালে আবার সেই একই যুদ্ধ। SR ফোন করে বলে "স্যার, আমি মার্কেটে আছি" — কিন্তু আসলে কোথায় আছে, কী করছে, কতজন কাস্টমারের কাছে গিয়েছে — কিছুই জানার উপায় নেই। বিশ্বাসের উপর ভর করেই চলে পুরো ব্যবসা।',
            'এই দৃশ্যটা কোনো একটা দোকানের একার গল্প না — বাংলাদেশের হাজারো ডিলার আর ডিস্ট্রিবিউটরের প্রতিদিনের বাস্তবতা। হাতে-লেখা খাতা, মুখে-মুখে হিসাব, আর "বিশ্বাস করে দেওয়া" পেমেন্ট — এই তিনটার উপর দাঁড়িয়ে থাকা একটা ব্যবসা যেকোনো সময় হোঁচট খেতে পারে। একটা ভুল এন্ট্রি, একটা ভুলে-যাওয়া কাস্টমার, একটা না-জানা SR-এর গতিবিধি — সব মিলিয়ে ব্যবসাটা বড় হওয়ার বদলে মালিকের ঘুম কেড়ে নেয়।',
            'এই জায়গা থেকেই Junayet Islam Santo-র মাথায় প্রশ্নটা আসে — "কেন একজন ডিস্ট্রিবিউটরকে এখনো এভাবে অন্ধকারে ব্যবসা চালাতে হবে? কেন তার হাতে রিয়েল-টাইমে তথ্য থাকবে না?" এই একটা প্রশ্ন থেকেই জন্ম নেয় ZovoriX — একটা সিস্টেম, যেখানে প্রতিটা SR-এর অবস্থান, প্রতিটা কাস্টমারের অর্ডার, প্রতিটা পেমেন্টের হিসাব এক জায়গায় থাকবে, স্পষ্ট থাকবে, নিরাপদ থাকবে।',
          ].map((p, i) => (
            <p key={i} style={{
              fontSize: '15px', lineHeight: 1.9, color: T.textPrimary,
              margin: i === 0 ? '0 0 20px' : (i === 2 ? 0 : '0 0 20px'),
            }}>
              {p}
            </p>
          ))}
        </div>

        {/* Highlight closing line */}
        <p style={{
          textAlign: 'center', fontFamily: T.fontHead, fontSize: '17px', fontStyle: 'italic',
          color: T.primary700, maxWidth: '560px', margin: '28px auto 0', lineHeight: 1.7,
        }}>
          আজ ZovoriX-এর হাত ধরে ২৪+ ডিস্ট্রিবিউটর, ৮৪+ SR ও ২৪ জন ম্যানেজার মিলে সামলাচ্ছেন
          ১৪,৬৮৩টি রিটেইল দোকানের ব্যবসা — প্রতিদিন, একটা স্ক্রিনের মধ্যে।
        </p>
      </section>

      {/* Founder */}
      <section style={{ padding: '8px 24px 64px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '20px', background: T.primary900,
          borderRadius: '16px', padding: '32px', flexWrap: 'wrap',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', background: T.accent600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontFamily: T.fontHead, fontSize: '24px', fontWeight: 600, color: '#fff',
          }}>
            JS
          </div>
          <div>
            <div style={{ fontSize: '11px', fontFamily: T.fontMono, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.primary300, marginBottom: '4px' }}>
              প্রতিষ্ঠাতা
            </div>
            <div style={{ fontFamily: T.fontHead, fontSize: '19px', fontWeight: 600, color: '#fff' }}>
              Junayet Islam Santo
            </div>
            <p style={{ fontSize: '13.5px', color: T.primary100, margin: '8px 0 0', lineHeight: 1.7, maxWidth: '460px' }}>
              ডিস্ট্রিবিউটরদের প্রতিদিনের সমস্যা কাছ থেকে দেখে ZovoriX তৈরির সিদ্ধান্ত নেন —
              লক্ষ্য একটাই, ব্যবসাকে অনুমান নয়, সঠিক তথ্যের উপর দাঁড় করানো।
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '8px 24px 64px', maxWidth: '880px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px',
        }}>
          <div style={{ background: T.accent100, border: `1px solid ${T.borderDefault}`, borderRadius: '14px', padding: '28px' }}>
            <div style={{ width: '42px', height: '42px', background: T.accent600, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px', marginBottom: '14px' }}>
              <FiTarget />
            </div>
            <h3 style={{ fontFamily: T.fontHead, fontSize: '17px', fontWeight: 600, color: T.primary700, margin: '0 0 8px' }}>আমাদের মিশন</h3>
            <p style={{ fontSize: '14px', color: T.textSecondary, lineHeight: 1.8, margin: 0 }}>
              ডিস্ট্রিবিউটর ও ব্যবসায়ীদের প্রতিদিনের সমস্যাগুলো সমাধান করা এবং দেশের সকল
              ব্যবসায়ীকে একটি প্ল্যাটফর্মে যুক্ত করে ব্যবসাকে আরও সহজ ও সুন্দর করে তোলা।
            </p>
          </div>
          <div style={{ background: T.primary100, border: `1px solid ${T.borderDefault}`, borderRadius: '14px', padding: '28px' }}>
            <div style={{ width: '42px', height: '42px', background: T.primary700, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px', marginBottom: '14px' }}>
              <FiEye />
            </div>
            <h3 style={{ fontFamily: T.fontHead, fontSize: '17px', fontWeight: 600, color: T.primary700, margin: '0 0 8px' }}>আমাদের লক্ষ্য</h3>
            <p style={{ fontSize: '14px', color: T.textSecondary, lineHeight: 1.8, margin: 0 }}>
              সঠিক ডেটার মাধ্যমে প্রতিটি ব্যবসায়ীকে তার প্রতিযোগীদের চেয়ে এক ধাপ এগিয়ে
              রাখা — যাতে সিদ্ধান্ত নেওয়া হয় অনুমানে নয়, তথ্যের আলোয়।
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: '8px 24px 80px', maxWidth: '960px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontFamily: T.fontHead, fontSize: '24px', fontWeight: 600, color: T.primary700, margin: '0 0 36px' }}>
          আমরা যা বিশ্বাস করি
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '18px' }}>
          {values.map((f, i) => (
            <div key={i} style={{
              background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '12px',
              padding: '26px 20px', textAlign: 'center', transition: 'border-color 0.2s, transform 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary300; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDefault; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ width: '46px', height: '46px', background: T.primary100, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: T.primary700, margin: '0 auto 14px' }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: T.textPrimary, marginBottom: '6px', fontFamily: T.fontBody }}>{f.title}</h3>
              <p style={{ fontSize: '13px', color: T.textSecondary, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/contact')}
            style={{
              padding: '13px 26px', background: T.primary700, border: 'none', borderRadius: '9px',
              color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px', fontFamily: T.fontBody,
              boxShadow: '0 10px 24px rgba(15,27,46,0.22)',
            }}
          >
            যোগাযোগ করুন <FiArrowRight style={{ fontSize: '14px' }} />
          </button>
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
                <button onClick={() => navigate('/privacy-policy')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Privacy Policy</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '20px' }}>
            <div style={{ fontSize: '12px', color: T.primary300 }}>© {new Date().getFullYear()} ZovoriX. সর্বস্বত্ব সংরক্ষিত।</div>
            <div style={{ fontSize: '12px', color: T.primary300, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiMapPin style={{ fontSize: '13px', color: T.accent300 }} /> বরিশাল সদর, কাউনিয়া, জানকি সিংহ রোড
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
