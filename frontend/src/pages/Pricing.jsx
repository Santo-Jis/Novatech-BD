import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiShoppingBag, FiSettings, FiChevronDown, FiCheck, FiX, FiMapPin,
} from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'
import SEO from '../components/SEO'
import { PLAN_ORDER, PLANS, AI_PAY_AS_YOU_GO, COMMITMENT_DISCOUNTS, formatTaka, applyDiscount } from '../constants/planPricing'
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
  const dropRef = useRef(null)

  // মাসিক / ১ বছর / ২ বছর বিলিং সাইকেল টগল
  const [cycle, setCycle] = useState('monthly') // 'monthly' | '1yr' | '2yr'
  const cycleYears = cycle === '1yr' ? 1 : cycle === '2yr' ? 2 : 0

  // ফিচার-ম্যাট্রিক্সের কোন ক্যাটাগরি খোলা আছে
  const [openCats, setOpenCats] = useState(() => new Set([FEATURE_CATEGORIES[0].id]))
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
        .zx-plan-table th, .zx-plan-table td { vertical-align: middle; }
        .zx-cat-row:hover { background: ${T.bgAlt}; }
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

      {/* Utility links bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px',
        padding: '10px 24px', borderBottom: `1px solid ${T.borderDefault}`,
        background: T.bgAlt, flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate('/landing')} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
          হোম
        </button>
        <button onClick={() => navigate('/about')} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
          আমাদের সম্পর্কে
        </button>
        <button onClick={() => navigate('/contact')} style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700} onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}>
          যোগাযোগ
        </button>
        <button onClick={() => navigate('/pricing')} style={{ background: 'none', border: 'none', padding: 0, color: T.primary700, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody }}>
          প্রাইসিং
        </button>
      </div>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '56px 24px 32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px',
          background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '20px',
          fontSize: '11px', fontFamily: T.fontMono, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: T.textMuted, marginBottom: '24px',
        }}>
          প্রাইসিং
        </div>
        <h1 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(28px, 5.5vw, 44px)', fontWeight: 600,
          lineHeight: 1.3, margin: '0 auto 8px', maxWidth: '680px', color: T.primary700,
        }}>
          যতজন ইউজার লাগবে, নিন —<br />
          <span style={{ color: T.accent600 }}>প্ল্যান বাছাই হবে ফিচার দিয়ে</span>
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '15.5px', maxWidth: '600px', margin: '20px auto 0', lineHeight: 1.8 }}>
          ইউজার সংখ্যা কোনো লিমিট না — প্রতিটা প্ল্যানে যত ইচ্ছা SR, ম্যানেজার বা অ্যাডমিন যোগ করা যাবে,
          প্রতি সিটের রেট অনুযায়ী। প্ল্যান আলাদা হয় ফিচার আর সর্বোচ্চ কাস্টমার-কানেকশন দিয়ে।
        </p>

        {/* Billing cycle toggle */}
        <div style={{
          display: 'inline-flex', marginTop: '28px', background: T.bgSurface,
          border: `1px solid ${T.borderDefault}`, borderRadius: '999px', padding: '4px',
        }}>
          {[
            { key: 'monthly', label: 'মাসিক' },
            { key: '1yr',     label: '১ বছর — ১৫% ছাড়' },
            { key: '2yr',     label: '২ বছর — ২৫% ছাড়' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setCycle(opt.key)}
              style={{
                padding: '8px 16px', borderRadius: '999px', border: 'none', cursor: 'pointer',
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
      <section style={{ padding: '16px 24px 48px', maxWidth: '1180px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gap: '18px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
        }}>
          {PLAN_ORDER.map(key => {
            const plan = PLANS[key]
            return (
              <div key={key} style={{
                background: T.bgSurface,
                border: plan.highlight ? `2px solid ${T.accent600}` : `1px solid ${T.borderDefault}`,
                borderRadius: '16px', padding: '26px 22px', display: 'flex', flexDirection: 'column',
                boxShadow: plan.highlight ? '0 12px 32px rgba(156,107,46,0.16)' : '0 1px 2px rgba(15,27,46,0.04)',
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '22px', background: T.accent600,
                    color: '#fff', fontSize: '10.5px', fontWeight: 700, padding: '4px 10px',
                    borderRadius: '999px', letterSpacing: '0.03em', fontFamily: T.fontMono,
                  }}>
                    সবচেয়ে জনপ্রিয়
                  </div>
                )}
                <div style={{ fontFamily: T.fontHead, fontSize: '22px', fontWeight: 700, color: T.primary700 }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: '12.5px', color: T.textMuted, margin: '4px 0 18px', lineHeight: 1.6, minHeight: '34px' }}>
                  {plan.tagline}
                </div>

                {/* Per-role pricing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', borderTop: `1px solid ${T.borderDefault}`, paddingTop: '14px' }}>
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

                <div style={{ borderTop: `1px solid ${T.borderDefault}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px', color: T.textSecondary, marginBottom: '20px' }}>
                  <div>🔗 <strong style={{ color: T.textPrimary }}>{plan.maxCustomersLabel}</strong></div>
                  <div>🎁 ফ্রি {formatTaka(plan.freeCreditTk)} Email/SMS ক্রেডিট/মাস</div>
                  <div>🤖 ফ্রি AI ক্রেডিট — {plan.freeAiCreditM}M টোকেন/মাস</div>
                  <div>💳 Pay-as-you-go — {AI_PAY_AS_YOU_GO.min}-{AI_PAY_AS_YOU_GO.max} {AI_PAY_AS_YOU_GO.unit}</div>
                  <div>✉️ Email ৳{plan.payAsYouGo.emailSms}/পিস · SMS ৳{plan.payAsYouGo.sms}/পিস</div>
                </div>

                <button
                  onClick={() => navigate('/start-trial', { state: { planHint: key } })}
                  style={{
                    marginTop: 'auto', padding: '11px 16px', borderRadius: '9px', border: 'none',
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

        {/* Free trial + commitment discount note */}
        <div style={{
          marginTop: '22px', display: 'flex', flexWrap: 'wrap', gap: '14px',
          justifyContent: 'center',
        }}>
          <div style={{
            background: T.accent100, border: `1px solid ${T.borderDefault}`, borderRadius: '10px',
            padding: '12px 18px', fontSize: '12.5px', color: T.textPrimary, maxWidth: '440px', lineHeight: 1.7,
          }}>
            🎉 <strong>৩ মাস ফ্রি ট্রায়াল</strong> — ৪ SR + ১ ম্যানেজার + ১ অ্যাডমিন + ২ শপ কিপার + ২ স্টক কিপার,
            সর্বোচ্চ ২,০০০ কাস্টমার পর্যন্ত। ফুল-ফিচার ERP লেভেল অ্যাক্সেসসহ।
          </div>
          {COMMITMENT_DISCOUNTS.map(d => (
            <div key={d.years} style={{
              background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '10px',
              padding: '12px 18px', fontSize: '12.5px', color: T.textSecondary, display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <strong style={{ color: T.primary700 }}>{d.discountPct}%</strong> ছাড় — {d.years} বছরের লাইসেন্স
            </div>
          ))}
        </div>
      </section>

      {/* Feature comparison matrix */}
      <section style={{ padding: '16px 24px 64px', maxWidth: '1040px', margin: '0 auto' }}>
        <h2 style={{
          fontFamily: T.fontHead, fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 600,
          color: T.primary700, textAlign: 'center', margin: '0 0 6px',
        }}>
          সব প্ল্যানের ফিচার তুলনা করুন
        </h2>
        <p style={{ textAlign: 'center', color: T.textMuted, fontSize: '13px', margin: '0 0 28px' }}>
          একটা ক্যাটাগরিতে ক্লিক করে বিস্তারিত ফিচার দেখুন
        </p>

        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: '14px', overflow: 'hidden' }}>
          {/* Sticky plan header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr repeat(4, 90px)',
            padding: '14px 18px', background: T.primary900, position: 'sticky', top: '58px', zIndex: 10,
          }}>
            <div />
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
                    padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left', transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: T.primary700, fontFamily: T.fontBody }}>
                    {cat.title} <span style={{ color: T.textMuted, fontWeight: 500, fontSize: '11.5px' }}>({cat.rows.length}টি ফিচার)</span>
                  </span>
                  <FiChevronDown style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: T.textMuted }} />
                </button>

                {isOpen && (
                  <table className="zx-plan-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {cat.rows.map((row, i) => {
                        const [label, std, pro, max, erp] = row
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${T.bgAlt}` }}>
                            <td style={{ padding: '10px 18px 10px 34px', fontSize: '13px', color: T.textPrimary }}>{label}</td>
                            {[std, pro, max, erp].map((v, ci) => (
                              <td key={ci} style={{ padding: '10px 6px', textAlign: 'center' }}>
                                <Cell value={v} />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
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
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '32px', paddingBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}>
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
                <a href="tel:+8801309540282" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>+৮৮০ ১৩০৯-৫৪০২৮২</a>
                <a href="mailto:support@zovorix.com" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>support@zovorix.com</a>
                <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>WhatsApp-এ লিখুন</a>
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
                <button onClick={() => navigate('/pricing')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>প্রাইসিং</button>
                <button onClick={() => navigate('/privacy-policy')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Privacy Policy</button>
                <button onClick={() => navigate('/terms-conditions')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>Terms & Conditions</button>
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
