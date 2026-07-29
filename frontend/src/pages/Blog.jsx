import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiShoppingBag, FiSettings, FiChevronDown, FiPhone, FiMail, FiMessageCircle, FiMapPin } from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'
import SEO from '../components/SEO'
import BlogPostCard from '../components/BlogPostCard'
import { BLOG_POSTS } from '../constants/blogPosts'

// ============================================================
// Blog — ZovoriX
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

export default function Blog() {
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

  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, fontFamily: T.fontBody, color: T.textPrimary, overflowX: 'hidden' }}>
      <SEO
        title="ব্লগ"
        description="বিক্রয় বৃদ্ধি, টিম ম্যানেজমেন্ট, অর্ডার প্রসেস ও ডেটা-নির্ভর সিদ্ধান্ত নিয়ে ZovoriX-এর গাইড ও টিপস পড়ুন।"
        path="/blog"
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

      {/* Utility links bar — Home / About / Contact / Pricing / Blog */}
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
          style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700}
          onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
        >
          যোগাযোগ
        </button>
        <button
          onClick={() => navigate('/pricing')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.primary700}
          onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
        >
          প্রাইসিং
        </button>
        <button
          onClick={() => navigate('/blog')}
          style={{ background: 'none', border: 'none', padding: 0, color: T.primary700, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody }}
        >
          ব্লগ
        </button>
      </div>

      {/* Header */}
      <section style={{ textAlign: 'center', padding: '52px 24px 28px' }}>
        <div style={{ fontSize: '12px', fontFamily: T.fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textMuted, marginBottom: '18px' }}>
          ব্লগ
        </div>
        <h1 style={{ fontFamily: T.fontHead, fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 600, lineHeight: 1.35, margin: '0 auto', maxWidth: '580px', color: T.primary700 }}>
          ব্যবসা বৃদ্ধির গাইড ও টিপস
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '15px', maxWidth: '540px', margin: '18px auto 0', lineHeight: 1.8 }}>
          বিক্রয়, টিম ম্যানেজমেন্ট, অর্ডার প্রসেস ও ডেটা-নির্ভর সিদ্ধান্ত নিয়ে ব্যবহারিক লেখা —
          যা সরাসরি আপনার ডিস্ট্রিবিউশন ব্যবসায় কাজে লাগবে।
        </p>
      </section>

      {/* পোস্ট গ্রিড */}
      <section style={{ padding: '8px 24px 88px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '22px' }}>
          {BLOG_POSTS.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: T.primary900, color: T.primary100, padding: '48px 24px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '32px', paddingBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '16px', color: '#fff' }}>ZovoriX</span>
              </div>
              <p style={{ fontSize: '12.5px', lineHeight: 1.7, color: T.primary300, margin: 0, maxWidth: '240px' }}>
                A complete platform for sales, team and customer management.
              </p>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="tel:+8801309540282" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiPhone style={{ fontSize: '14px', color: T.accent300 }} /> +880 1309-540282
                </a>
                <a href="mailto:support@zovorix.com" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMail style={{ fontSize: '14px', color: T.accent300 }} /> support@zovorix.com
                </a>
                <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMessageCircle style={{ fontSize: '14px', color: T.accent300 }} /> Message on WhatsApp
                </a>
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
