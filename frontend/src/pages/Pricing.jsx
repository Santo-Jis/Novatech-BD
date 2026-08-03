import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiShoppingBag, FiSettings, FiChevronDown, FiCheck, FiX, FiMapPin, FiUsers, FiMail, FiCpu, FiMenu } from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'
import SEO from '../components/SEO'
import { PLAN_ORDER, PLANS, AI_PAY_AS_YOU_GO, PRICING_FAQ, formatTaka, applyDiscount } from '../constants/planPricing'
import { FEATURE_CATEGORIES } from '../constants/planFeatures'

// ============================================================
// Pricing — ZovoriX
// ল্যান্ডিং পেইজের ডিজাইন সিস্টেমের সাথে সামঞ্জস্যপূর্ণ, লেআউট-অনুপ্রেরণা
// Claude.com/pricing (Compare features across plans) থেকে নেওয়া।
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

// ফিচার-ম্যাট্রিক্সের হেডার ও প্রতিটা সারি একই grid-template ব্যবহার করে,
// তাই কলাম কখনো একে অপরের থেকে বেঁকে যায় না।
const GRID_COLS = 'minmax(0,1fr) repeat(4, 72px)'

// true→চেক, false→ক্রস, string→নোট হিসেবে দেখাবে
function Cell({ value }) {
  if (value === true) {
    return <FiCheck style={{ fontSize: '16px', color: T.accent600 }} aria-label="আছে" />
  }
  if (value === false) {
    return <FiX style={{ fontSize: '15px', color: T.textMuted, opacity: 0.5 }} aria-label="নাই" />
  }
  return (
    <span style={{
      fontSize: '11px', fontFamily: T.fontMono, color: T.textSecondary,
      background: T.bgAlt, border: `1px solid ${T.borderDefault}`,
      borderRadius: '6px', padding: '2px 7px', whiteSpace: 'nowrap',
    }}>
      {value}
    </span>
  )
}

export default function Pricing() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropRef = useRef(null)

  // মাসিক / ১ বছর / ২ বছর বিলিং সাইকেল টগল
  const [cycle, setCycle] = useState('monthly') // 'monthly' | '1yr' | '2yr'
  const cycleYears = cycle === '1yr' ? 1 : cycle === '2yr' ? 2 : 0

  // ফিচার-ম্যাট্রিক্সের কোন ক্যাটাগরি খোলা আছে
  const [openCats, setOpenCats] = useState(() => new Set([FEATURE_CATEGORIES[0].id]))
  const [usageOpen, setUsageOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)
  const toggleCat = (id) => {
    setOpenCats(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary, overflowX: 'hidden' }}>
      <SEO
        title="প্রাইসিং"
        description="ZovoriX-এর ৪টা প্ল্যান — Standard, Pro, Max ও ERP। যতজন ইউজার দরকার তত নিন, ফিচার দিয়ে প্ল্যান বাছাই করুন, কাস্টমার-কানেকশন লিমিট অনুযায়ী দাম।"
        path="/pricing"
      />

      {/* Navbar */}
      <style>{`
        @media (max-width: 640px) {
          .zx-navbar { flex-direction: column !important; flex-wrap: nowrap !important; align-items: stretch !important; padding: 10px 14px !important; row-gap: 10px !important; }
          .zx-navbar-top { width: 100% !important; }
          .zx-brand { gap: 6px !important; justify-content: flex-start !important; }
          .zx-logo-box { width: 26px !important; height: 26px !important; border-radius: 6px !important; }
          .zx-brand-text { font-size: 14px !important; }
          .zx-hamburger { display: flex !important; }
          .zx-nav-links, .zx-nav-actions { display: none !important; }
          .zx-navbar.zx-menu-open .zx-nav-links {
            display: flex !important; flex-direction: column !important; align-items: stretch !important;
            justify-content: flex-start !important; gap: 4px !important; width: 100% !important;
            order: 0 !important; flex: none !important;
          }
          .zx-navbar.zx-menu-open .zx-nav-links button {
            font-size: 14px !important; width: 100% !important; text-align: left !important;
            padding: 10px 4px !important;
          }
          .zx-navbar.zx-menu-open .zx-nav-actions {
            display: flex !important; flex-direction: column !important; align-items: stretch !important;
            justify-content: flex-start !important; gap: 8px !important; width: 100% !important;
            border-top: 1px solid #E4E1D8; padding-top: 10px !important; margin-top: 4px !important;
          }
          .zx-navbar.zx-menu-open .zx-btn-retailer, .zx-navbar.zx-menu-open .zx-btn-mgmt {
            padding: 10px 14px !important; font-size: 13px !important; gap: 8px !important;
            justify-content: center !important; width: 100% !important;
          }
          .zx-navbar.zx-menu-open .zx-btn-suffix { display: inline !important; }
          .zx-navbar.zx-menu-open .zx-chevron { font-size: 13px !important; }
        }
        @media (max-width: 360px) {
          .zx-navbar.zx-menu-open .zx-btn-retailer, .zx-navbar.zx-menu-open .zx-btn-mgmt { padding: 10px 12px !important; }
        }
        .zx-plan-table th, .zx-plan-table td { vertical-align: middle; }
        .zx-cat-row:hover { background: ${T.bgAlt}; }
      `}</style>
      <nav className={`zx-navbar${mobileMenuOpen ? ' zx-menu-open' : ''}`} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: `1px solid ${T.borderDefault}`,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        flexWrap: 'wrap', rowGap: '10px',
      }}>
        <div className="zx-navbar-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div
            className="zx-brand"
            onClick={() => { setMobileMenuOpen(false); navigate('/landing') }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}
          >
            <div className="zx-logo-box" style={{ width: '34px', height: '34px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.borderDefault}` }}>
              <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span className="zx-brand-text" style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '19px', color: T.primary700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              ZovoriX
            </span>
          </div>

          {/* মোবাইল হ্যামবার্গার মেনু — শুধু ছোট স্ক্রিনে দেখা যাবে */}
          <button
            className="zx-hamburger"
            onClick={() => setMobileMenuOpen(p => !p)}
            aria-label={mobileMenuOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'}
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: `1px solid ${T.borderDefault}`,
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              flexShrink: 0,
              color: T.primary700,
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            {mobileMenuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        {/* নেভ লিংক — হেডারেই মিশে গেছে */}
        <div className="zx-nav-links" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 auto', flexWrap: 'wrap', gap: '22px', minWidth: '120px' }}>
          <button onClick={() => { setMobileMenuOpen(false); navigate('/landing') }} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
            হোম
          </button>
          <button onClick={() => { setMobileMenuOpen(false); navigate('/about') }} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
            আমাদের সম্পর্কে
          </button>
          <button onClick={() => { setMobileMenuOpen(false); navigate('/contact') }} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
            যোগাযোগ
          </button>
          <button onClick={() => { setMobileMenuOpen(false); navigate('/pricing') }} style={{ background: 'none', border: 'none', padding: 0, color: T.primary700, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody, whiteSpace: 'nowrap' }}>
            প্রাইসিং
          </button>
          <button onClick={() => { setMobileMenuOpen(false); navigate('/blog') }} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
            ব্লগ
          </button>
        </div>

        <div className="zx-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            className="zx-btn-retailer"
            onClick={() => { setMobileMenuOpen(false); navigate('/customer-login') }}
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
                    onClick={() => { setMgmtOpen(false); setMobileMenuOpen(false); navigate('/login', { state: { roleHint: item.role } }) }}
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

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '52px 24px 28px' }}>
        <div style={{
          fontSize: '12px', fontFamily: T.fontMono, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: T.textMuted, marginBottom: '18px',
        }}>
          প্রাইসিং
        </div>
        <h1 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 600,
          lineHeight: 1.35, margin: '0 auto', maxWidth: '580px', color: T.primary700,
        }}>
          ইউজার যত খুশি যোগ করুন, প্ল্যান ঠিক হয় ফিচার দিয়ে
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '15px', maxWidth: '560px', margin: '18px auto 0', lineHeight: 1.8 }}>
          প্রতিটা প্ল্যানে ইচ্ছামতো SR, ম্যানেজার, স্টক/শপ কিপার বা অ্যাডমিন যোগ করা যায় — যতজন যোগ
          করবেন ততজনের সিট-রেট অনুযায়ী বিল হবে। প্ল্যান বদলায় দুইটা জিনিসে: কী কী ফিচার পাচ্ছেন, আর
          সর্বোচ্চ কতজন কাস্টমার কানেক্ট করতে পারবেন — ইউজার সংখ্যার সাথে এর কোনো সম্পর্ক নেই।
        </p>

        {/* Billing cycle toggle */}
        <div style={{
          display: 'inline-flex', marginTop: '26px', background: T.bgSurface,
          border: `1px solid ${T.borderDefault}`, borderRadius: '10px', padding: '4px',
        }}>
          {[
            { key: 'monthly', label: 'মাসিক' },
            { key: '1yr',     label: '১ বছর · ১৫% ছাড়' },
            { key: '2yr',     label: '২ বছর · ২৫% ছাড়' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setCycle(opt.key)}
              style={{
                padding: '8px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontFamily: T.fontBody, fontSize: '12.5px', fontWeight: 600,
                background: cycle === opt.key ? T.primary700 : 'transparent',
                color: cycle === opt.key ? '#fff' : T.textSecondary,
                transition: 'background 0.15s, color 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Plan cards */}
      <section style={{ padding: '8px 24px 0', maxWidth: '1160px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gap: '16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
        }}>
          {PLAN_ORDER.map(key => {
            const plan = PLANS[key]
            return (
              <div key={key} style={{
                background: T.bgSurface,
                border: plan.highlight ? `1.5px solid ${T.accent600}` : `1px solid ${T.borderDefault}`,
                borderRadius: '12px', padding: '24px 20px', display: 'flex', flexDirection: 'column',
                boxShadow: plan.highlight ? '0 8px 24px rgba(156,107,46,0.12)' : 'none',
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: '-11px', left: '20px', background: T.accent600,
                    color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 10px',
                    borderRadius: '999px', letterSpacing: '0.03em', fontFamily: T.fontMono,
                  }}>
                    সবচেয়ে জনপ্রিয়
                  </div>
                )}
                <div style={{ fontFamily: T.fontHead, fontSize: '21px', fontWeight: 700, color: T.primary700 }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: '12.5px', color: T.textMuted, margin: '4px 0 16px', lineHeight: 1.6, minHeight: '34px' }}>
                  {plan.tagline}
                </div>

                {/* Per-role pricing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '16px', borderTop: `1px solid ${T.borderDefault}`, paddingTop: '14px' }}>
                  {plan.roles.map(r => {
                    const price = cycleYears ? applyDiscount(r.price, cycleYears) : r.price
                    return (
                      <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '12.5px', color: T.textSecondary }}>{r.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: T.primary700, whiteSpace: 'nowrap' }}>
                          {r.price === 0 ? 'ফ্রি' : `${formatTaka(price)}/ইউজার`}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ borderTop: `1px solid ${T.borderDefault}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12.5px', color: T.textSecondary, marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiUsers style={{ fontSize: '13px', color: T.accent600, flexShrink: 0 }} />
                    <span>{plan.maxCustomersLabel}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiMail style={{ fontSize: '13px', color: T.accent600, flexShrink: 0 }} />
                    <span>{formatTaka(plan.freeCreditTk)} ফ্রি Email/SMS ক্রেডিট/মাস</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiCpu style={{ fontSize: '13px', color: T.accent600, flexShrink: 0 }} />
                    <span>{plan.freeAiCreditM}M টোকেন ফ্রি AI ক্রেডিট/মাস</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/book-plan?plan=${key}`)}
                  style={{
                    marginTop: 'auto', padding: '11px 16px', borderRadius: '8px', border: 'none',
                    background: plan.highlight ? T.accent600 : T.primary700, color: '#fff',
                    fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
                  }}
                >
                  {plan.name} দিয়ে শুরু করুন
                </button>
              </div>
            )
          })}
        </div>

        {/* Usage & overage — link to expand, avoids clashing numbers on cards */}
        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <button
            onClick={() => setUsageOpen(p => !p)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px',
              color: T.primary700, fontSize: '13px', fontWeight: 600, fontFamily: T.fontBody,
              textDecoration: 'underline', textUnderlineOffset: '3px',
            }}
          >
            Email/SMS ও AI ক্রেডিট কীভাবে হিসাব হয় — বিস্তারিত দেখুন {usageOpen ? '▲' : '▼'}
          </button>
        </div>

        {usageOpen && (
          <div style={{
            marginTop: '14px', background: T.bgSurface, border: `1px solid ${T.borderDefault}`,
            borderRadius: '12px', padding: '20px', overflowX: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.borderDefault}` }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11.5px', color: T.textMuted, fontWeight: 600 }}>প্ল্যান</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11.5px', color: T.textMuted, fontWeight: 600 }}>ফ্রি ক্রেডিট (মাসিক)</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11.5px', color: T.textMuted, fontWeight: 600 }}>ফ্রি শেষে — Email / SMS</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11.5px', color: T.textMuted, fontWeight: 600 }}>ফ্রি AI ক্রেডিট</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11.5px', color: T.textMuted, fontWeight: 600 }}>ফ্রি শেষে — AI</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_ORDER.map(key => {
                  const plan = PLANS[key]
                  return (
                    <tr key={key} style={{ borderBottom: `1px solid ${T.bgAlt}` }}>
                      <td style={{ padding: '10px', fontSize: '13px', fontWeight: 700, color: T.primary700 }}>{plan.name}</td>
                      <td style={{ padding: '10px', fontSize: '12.5px', color: T.textSecondary }}>{formatTaka(plan.freeCreditTk)}</td>
                      <td style={{ padding: '10px', fontSize: '12.5px', color: T.textSecondary }}>
                        ৳{plan.payAsYouGo.emailSms}/ইমেইল · ৳{plan.payAsYouGo.sms}/SMS
                      </td>
                      <td style={{ padding: '10px', fontSize: '12.5px', color: T.textSecondary }}>{plan.freeAiCreditM}M টোকেন</td>
                      <td style={{ padding: '10px', fontSize: '12.5px', color: T.textSecondary }}>
                        {AI_PAY_AS_YOU_GO.min}–{AI_PAY_AS_YOU_GO.max} {AI_PAY_AS_YOU_GO.unit} <span style={{ color: T.textMuted }}>(মডেল-ভেদে)</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p style={{ fontSize: '11.5px', color: T.textMuted, margin: '14px 4px 0', lineHeight: 1.7 }}>
              ফ্রি কোটা প্রতি মাসে রিসেট হয় এবং জমা থাকে না। কোটা শেষ হলে ওয়ালেট ব্যালেন্স থেকে উপরের রেটে
              অটো-কেটে নেওয়া হয়; ব্যালেন্স না থাকলে শুধু সেই নির্দিষ্ট সার্ভিস সাময়িক বন্ধ থাকে, বাকি সিস্টেম চালু থাকে।
            </p>
          </div>
        )}
      </section>

      {/* Feature comparison matrix — single shared CSS-grid template so columns
          never drift out of alignment between the header and the rows. */}
      <section style={{ padding: '48px 24px 56px', maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(21px, 3.6vw, 28px)', fontWeight: 600,
          color: T.primary700, textAlign: 'center', margin: '0 0 6px',
        }}>
          সব প্ল্যানের ফিচার তুলনা করুন
        </h2>
        <p style={{ textAlign: 'center', color: T.textMuted, fontSize: '13px', margin: '0 0 24px' }}>
          একটা ক্যাটাগরিতে ক্লিক করে বিস্তারিত ফিচার দেখুন
        </p>

        <div style={{ overflowX: 'auto', border: `1px solid ${T.borderDefault}`, borderRadius: '12px', background: T.bgSurface }}>
          <div style={{ minWidth: '640px' }}>
            {/* Plan header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
              padding: '13px 16px', background: T.primary900,
              position: 'sticky', top: 0, zIndex: 5,
            }}>
              <div style={{ fontSize: '11px', color: T.primary300, fontFamily: T.fontMono, letterSpacing: '0.04em', textTransform: 'uppercase' }}>ফিচার</div>
              {PLAN_ORDER.map(key => (
                <div key={key} style={{ textAlign: 'center', color: '#fff', fontSize: '12.5px', fontWeight: 700, fontFamily: T.fontHead }}>
                  {PLANS[key].name}
                </div>
              ))}
            </div>

            {FEATURE_CATEGORIES.map((cat, catIdx) => {
              const isOpen = openCats.has(cat.id)
              return (
                <div key={cat.id} style={{ borderTop: catIdx === 0 ? 'none' : `1px solid ${T.borderDefault}` }}>
                  <button
                    className="zx-cat-row"
                    onClick={() => toggleCat(cat.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: T.primary700, fontFamily: T.fontBody }}>
                      {cat.title}{' '}
                      <span style={{ color: T.textMuted, fontWeight: 500, fontSize: '11.5px' }}>({cat.rows.length})</span>
                    </span>
                    <FiChevronDown style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: T.textMuted, flexShrink: 0 }} />
                  </button>

                  {isOpen && cat.rows.map((row, i) => {
                    const [label, std, pro, max, erp] = row
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
                          padding: '9px 16px', borderTop: `1px solid ${T.bgAlt}`,
                        }}
                      >
                        <div style={{ fontSize: '12.5px', color: T.textPrimary, paddingLeft: '14px' }}>{label}</div>
                        {[std, pro, max, erp].map((v, ci) => (
                          <div key={ci} style={{ display: 'flex', justifyContent: 'center' }}>
                            <Cell value={v} />
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '0 24px 64px', maxWidth: '760px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(21px, 3.6vw, 28px)', fontWeight: 600,
          color: T.primary700, textAlign: 'center', margin: '0 0 28px',
        }}>
          সাধারণ জিজ্ঞাসা
        </h2>
        <div style={{ border: `1px solid ${T.borderDefault}`, borderRadius: '12px', background: T.bgSurface, overflow: 'hidden' }}>
          {PRICING_FAQ.map((item, i) => {
            const isOpen = faqOpen === i
            return (
              <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.borderDefault}` }}>
                <button
                  onClick={() => setFaqOpen(isOpen ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '12px', padding: '16px 18px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: T.fontBody,
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 600, color: T.textPrimary }}>{item.q}</span>
                  <FiChevronDown style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: T.textMuted, flexShrink: 0 }} />
                </button>
                {isOpen && (
                  <div style={{ padding: '0 18px 16px', fontSize: '13px', color: T.textSecondary, lineHeight: 1.8 }}>
                    {item.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: T.primary900, color: T.primary100, padding: '48px 24px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '32px', paddingBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '16px', color: '#fff' }}>ZovoriX</span>
              </div>
              <p style={{ fontSize: '12.5px', lineHeight: 1.7, color: T.primary300, margin: 0, maxWidth: '220px' }}>
                A complete platform for sales, team and customer management.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="tel:+8801309540282" style={{ color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>+880 1309-540282</a>
                <a href="mailto:support@zovorix.com" style={{ color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>support@zovorix.com</a>
                <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer" style={{ color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>Message on WhatsApp</a>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>Social</div>
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
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>Login</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Management Login</button>
                <button onClick={() => navigate('/customer-login')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Retailer Shop Login</button>
                <button onClick={() => navigate('/apply/sr')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Apply as SR</button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>Company</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate('/pricing')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Pricing</button>
                <button onClick={() => navigate('/about')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>About Us</button>
                <button onClick={() => navigate('/contact')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Contact</button>
                <button onClick={() => navigate('/blog')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Blog</button>
                <button onClick={() => navigate('/privacy-policy')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Privacy Policy</button>
                <button onClick={() => navigate('/terms-conditions')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Terms & Conditions</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '20px' }}>
            <div style={{ fontSize: '12px', color: T.primary300 }}>© {new Date().getFullYear()} ZovoriX. All rights reserved.</div>
            <div style={{ fontSize: '12px', color: T.primary300, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiMapPin style={{ fontSize: '13px', color: T.accent300 }} /> Barishal Sadar, Kaunia, Janoki Singho Road
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
