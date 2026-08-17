import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiShoppingBag, FiSettings, FiChevronDown, FiCheck, FiX, FiMapPin, FiUsers, FiMail, FiCpu,
  FiMenu, FiPlus, FiArrowRight,
} from 'react-icons/fi'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import SEO from '../components/SEO'
import { PLAN_ORDER, PLANS, AI_PAY_AS_YOU_GO, PRICING_FAQ, formatTaka, applyDiscount } from '../constants/planPricing'
import { FEATURE_CATEGORIES } from '../constants/planFeatures'
import './Pricing.css'

// ============================================================
// Pricing — ZovoriX
// ------------------------------------------------------------
// ✅ প্রিমিয়াম রিডিজাইন — ল্যান্ডিং পেইজের dark "command console"
//    ডিজাইন সিস্টেমের সাথে মিলিয়ে (আগে এই পেইজ আলাদা হালকা cream/navy
//    থিমে ছিল)। সব ডেটা ও লজিক অপরিবর্তিত: PLAN_ORDER/PLANS/
//    FEATURE_CATEGORIES/PRICING_FAQ সরাসরি constants থেকে, plan
//    সিলেক্ট করলে /book-plan?plan=key, management dropdown-এ
//    roleHint navigate — সবই আগের মতো।
// ============================================================

// ফিচার-ম্যাট্রিক্সের হেডার ও প্রতিটা সারি একই flex ওয়াইথ ব্যবহার করে (label
// flex:1, প্রতিটা প্ল্যান-কলাম flex:0 0 64px — CSS-এ .zx-matrix-header-plan /
// .zx-feat-cell), তাই কলাম কখনো একে অপরের থেকে বেঁকে যায় না।

function Cell({ value }) {
  if (value === true) return <FiCheck className="zx-feat-yes" aria-label="আছে" />
  if (value === false) return <FiX className="zx-feat-no" aria-label="নাই" />
  return <span className="zx-feat-note">{value}</span>
}

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

function Reveal({ children, className = '', delay = 0, as: Tag = 'div', ...rest }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setInView(true); io.unobserve(e.target) } })
    }, { threshold: 0.1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`zx-reveal${inView ? ' zx-in' : ''} ${className}`} style={{ '--rd': `${delay}s` }} {...rest}>
      {children}
    </Tag>
  )
}

const SOCIALS = [
  { icon: <FaFacebookF />, href: 'https://www.facebook.com/profile.php?id=61591653097465&mibextid=ZbWKwL', label: 'Facebook' },
  { icon: <FaXTwitter />, href: 'https://x.com/Zovorix', label: 'X' },
  { icon: <FaInstagram />, href: 'https://instagram.com/zovorix', label: 'Instagram' },
  { icon: <FaTiktok />, href: 'https://tiktok.com/@zovorix.com', label: 'TikTok' },
  { icon: <FaDiscord />, href: 'https://discord.gg/zovorix', label: 'Discord' },
  { icon: <FaRedditAlien />, href: 'https://reddit.com/u/zovorix', label: 'Reddit' },
]

const ROLES = [
  { label: 'SR লগইন', role: 'sr', icon: <FiUsers />, desc: 'Sales Representative' },
  { label: 'Manager লগইন', role: 'manager', icon: <FiUsers />, desc: 'ম্যানেজার / সুপারভাইজার' },
  { label: 'Admin লগইন', role: 'admin', icon: <FiSettings />, desc: 'অ্যাডমিন প্যানেল' },
]

export default function Pricing() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const dropRef = useRef(null)

  const [cycle, setCycle] = useState('monthly')
  const cycleYears = cycle === '1yr' ? 1 : cycle === '2yr' ? 2 : 0

  const [openCats, setOpenCats] = useState(() => new Set([FEATURE_CATEGORIES[0].id]))
  const [usageOpen, setUsageOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)

  const toggleGroupRef = useRef(null)
  const toggleThumbRef = useRef(null)
  const monthlyBtnRef = useRef(null)
  const y1BtnRef = useRef(null)
  const y2BtnRef = useRef(null)

  const toggleCat = (id) => {
    setOpenCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setMgmtOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const positionThumb = () => {
    const group = toggleGroupRef.current
    const thumb = toggleThumbRef.current
    const btn = { monthly: monthlyBtnRef, '1yr': y1BtnRef, '2yr': y2BtnRef }[cycle]?.current
    if (!group || !thumb || !btn) return
    const groupRect = group.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    if (!btnRect.width) return
    thumb.style.width = `${btnRect.width}px`
    thumb.style.left = `${btnRect.left - groupRect.left}px`
  }
  useEffect(() => {
    positionThumb()
    window.addEventListener('resize', positionThumb)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionThumb)
    return () => window.removeEventListener('resize', positionThumb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle])

  const handleSignin = (role) => {
    setMgmtOpen(false)
    setMobileMenuOpen(false)
    navigate('/login', { state: { roleHint: role } })
  }

  const scrollToId = (id) => (e) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="zx-page">
      <SEO
        title="প্রাইসিং"
        description="ZovoriX-এর ৪টা প্ল্যান — Standard, Pro, Max ও ERP। যতজন ইউজার দরকার তত নিন, ফিচার দিয়ে প্ল্যান বাছাই করুন, কাস্টমার-কানেকশন লিমিট অনুযায়ী দাম।"
        path="/pricing"
      />

      {/* ============================================================
          NAVBAR
          ============================================================ */}
      <header className={`zx-nav${navScrolled ? ' zx-is-scrolled' : ''}`}>
        <div className="zx-nav-inner">
          <a href="#top" className="zx-brand" aria-label="ZovoriX home" onClick={(e) => { e.preventDefault(); navigate('/landing') }}>
            <BrandMark />
            <span className="zx-brand-word">ZovoriX</span>
          </a>

          <nav className="zx-nav-links" aria-label="Primary">
            <button type="button" className="zx-nav-link" onClick={() => navigate('/landing')}>হোম</button>
            <button type="button" className="zx-nav-link" onClick={() => navigate('/about')}>আমাদের সম্পর্কে</button>
            <button type="button" className="zx-nav-link" onClick={() => navigate('/contact')}>যোগাযোগ</button>
            <button type="button" className="zx-nav-link zx-current">প্রাইসিং</button>
            <button type="button" className="zx-nav-link" onClick={() => navigate('/blog')}>ব্লগ</button>
          </nav>

          <div className="zx-nav-actions">
            <button type="button" className="zx-btn zx-btn-ghost zx-btn-sm" onClick={() => navigate('/customer-login')}>
              <FiShoppingBag /> রিটেইলার লগইন
            </button>
            <div className="zx-signin-wrap" ref={dropRef}>
              <button type="button" className="zx-nav-signin" aria-haspopup="true" aria-expanded={mgmtOpen} onClick={() => setMgmtOpen((v) => !v)}>
                <FiSettings style={{ width: 14, height: 14, marginRight: 6 }} />
                ম্যানেজমেন্ট
                <FiChevronDown className="zx-chevron" style={{ transform: mgmtOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {mgmtOpen && (
                <div className="zx-signin-menu" role="menu">
                  {ROLES.map((item) => (
                    <button key={item.role} type="button" role="menuitem" className="zx-signin-item" onClick={() => handleSignin(item.role)}>
                      <span className="zx-signin-icon">{item.icon}</span>
                      <span className="zx-signin-item-body">
                        <div>{item.label}</div>
                        <div>{item.desc}</div>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="zx-btn zx-btn-primary zx-btn-sm" onClick={() => navigate('/start-trial')}>ফ্রি ট্রায়াল</button>
            <button
              type="button" className="zx-hamburger"
              aria-label={mobileMenuOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'} aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>
      </header>

      <div className={`zx-mobile-menu${mobileMenuOpen ? ' zx-is-open' : ''}`}>
        <div className="zx-mobile-menu-links">
          <button type="button" onClick={() => navigate('/landing')}>হোম</button>
          <button type="button" onClick={() => navigate('/about')}>আমাদের সম্পর্কে</button>
          <button type="button" onClick={() => navigate('/contact')}>যোগাযোগ</button>
          <button type="button" onClick={() => navigate('/blog')}>ব্লগ</button>
        </div>
        <div className="zx-mobile-menu-sub">
          <button type="button" onClick={() => { setMobileMenuOpen(false); navigate('/customer-login') }}><FiShoppingBag style={{ marginRight: 8 }} /> রিটেইলার লগইন</button>
          {ROLES.map((item) => (
            <button key={item.role} type="button" onClick={() => handleSignin(item.role)}>{item.icon}<span style={{ marginLeft: 8 }}>{item.label}</span></button>
          ))}
        </div>
        <div className="zx-mobile-menu-actions">
          <button type="button" className="zx-btn zx-btn-primary zx-btn-block" onClick={() => { setMobileMenuOpen(false); navigate('/start-trial') }}>ফ্রি ট্রায়াল শুরু করুন</button>
        </div>
      </div>

      <div id="top" />

      {/* ============================================================
          HERO + BILLING TOGGLE
          ============================================================ */}
      <section className="zx-p-hero">
        <div className="zx-glow zx-glow-drift" aria-hidden="true" style={{ width: 460, height: 460, top: 40, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(circle, rgba(202,154,68,0.18), transparent 70%)' }} />
        <div className="zx-container" style={{ position: 'relative', zIndex: 1 }}>
          <Reveal as="div">
            <span className="zx-eyebrow">প্রাইসিং</span>
            <h1>ইউজার যত খুশি যোগ করুন, প্ল্যান ঠিক হয় ফিচার দিয়ে</h1>
            <p>
              প্রতিটা প্ল্যানে ইচ্ছামতো SR, ম্যানেজার, স্টক/শপ কিপার বা অ্যাডমিন যোগ করা যায় — যতজন যোগ
              করবেন ততজনের সিট-রেট অনুযায়ী বিল হবে। প্ল্যান বদলায় দুইটা জিনিসে: কী কী ফিচার পাচ্ছেন, আর
              সর্বোচ্চ কতজন কাস্টমার কানেক্ট করতে পারবেন — ইউজার সংখ্যার সাথে এর কোনো সম্পর্ক নেই।
            </p>

            <div className="zx-toggle-group" ref={toggleGroupRef} role="tablist" aria-label="বিলিং সাইকেল">
              <span className="zx-toggle-thumb" ref={toggleThumbRef} />
              <div className="zx-toggle-row">
                <button type="button" ref={monthlyBtnRef} className={`zx-toggle-btn${cycle === 'monthly' ? ' zx-active' : ''}`} onClick={() => setCycle('monthly')}>মাসিক</button>
                <button type="button" ref={y1BtnRef} className={`zx-toggle-btn${cycle === '1yr' ? ' zx-active' : ''}`} onClick={() => setCycle('1yr')}>১ বছর · ১৫% ছাড়</button>
                <button type="button" ref={y2BtnRef} className={`zx-toggle-btn${cycle === '2yr' ? ' zx-active' : ''}`} onClick={() => setCycle('2yr')}>২ বছর · ২৫% ছাড়</button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          PLAN CARDS
          ============================================================ */}
      <section className="zx-plans">
        <div className="zx-container">
          <div className="zx-plan-grid">
            {PLAN_ORDER.map((key, i) => {
              const plan = PLANS[key]
              return (
                <Reveal as="div" key={key} className={`zx-plan-card${plan.highlight ? ' zx-popular' : ''}`} delay={i * 0.07}>
                  {plan.highlight && <span className="zx-plan-badge">সবচেয়ে জনপ্রিয়</span>}
                  <div className="zx-plan-name">{plan.name}</div>
                  <div className="zx-plan-tagline">{plan.tagline}</div>

                  <div className="zx-role-list">
                    {plan.roles.map((r) => {
                      const price = cycleYears ? applyDiscount(r.price, cycleYears) : r.price
                      return (
                        <div key={r.key} className="zx-role-row">
                          <span className="zx-role-row-label">{r.label}</span>
                          <span className={`zx-role-row-price${r.price === 0 ? ' zx-free' : ''}`}>
                            {r.price === 0 ? 'ফ্রি' : `${formatTaka(price)}/ইউজার`}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <ul className="zx-plan-meta">
                    <li><FiUsers /> {plan.maxCustomersLabel}</li>
                    <li><FiMail /> {formatTaka(plan.freeCreditTk)} ফ্রি Email/SMS ক্রেডিট/মাস</li>
                    <li><FiCpu /> {plan.freeAiCreditM}M টোকেন ফ্রি AI ক্রেডিট/মাস</li>
                  </ul>

                  <button
                    type="button"
                    className={`zx-btn zx-btn-block zx-plan-cta${plan.highlight ? ' zx-btn-primary' : ' zx-btn-ghost'}`}
                    onClick={() => navigate(`/book-plan?plan=${key}`)}
                  >
                    {plan.name} দিয়ে শুরু করুন <FiArrowRight />
                  </button>
                </Reveal>
              )
            })}
          </div>

          {/* Usage & overage */}
          <div className="zx-usage-toggle-wrap">
            <button type="button" className="zx-usage-toggle" onClick={() => setUsageOpen((v) => !v)}>
              Email/SMS ও AI ক্রেডিট কীভাবে হিসাব হয় — বিস্তারিত দেখুন {usageOpen ? '▲' : '▼'}
            </button>
          </div>

          {usageOpen && (
            <div className="zx-usage-panel">
              <table>
                <thead>
                  <tr>
                    <th>প্ল্যান</th>
                    <th>ফ্রি ক্রেডিট (মাসিক)</th>
                    <th>ফ্রি শেষে — Email / SMS</th>
                    <th>ফ্রি AI ক্রেডিট</th>
                    <th>ফ্রি শেষে — AI</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_ORDER.map((key) => {
                    const plan = PLANS[key]
                    return (
                      <tr key={key}>
                        <td className="zx-plan-cell">{plan.name}</td>
                        <td>{formatTaka(plan.freeCreditTk)}</td>
                        <td>৳{plan.payAsYouGo.emailSms}/ইমেইল · ৳{plan.payAsYouGo.sms}/SMS</td>
                        <td>{plan.freeAiCreditM}M টোকেন</td>
                        <td>{AI_PAY_AS_YOU_GO.min}–{AI_PAY_AS_YOU_GO.max} {AI_PAY_AS_YOU_GO.unit} <span style={{ color: 'var(--ink-3)' }}>(মডেল-ভেদে)</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="zx-usage-note">
                ফ্রি কোটা প্রতি মাসে রিসেট হয় এবং জমা থাকে না। কোটা শেষ হলে ওয়ালেট ব্যালেন্স থেকে উপরের রেটে
                অটো-কেটে নেওয়া হয়; ব্যালেন্স না থাকলে শুধু সেই নির্দিষ্ট সার্ভিস সাময়িক বন্ধ থাকে, বাকি সিস্টেম চালু থাকে।
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
          FEATURE COMPARISON MATRIX
          ============================================================ */}
      <section className="zx-matrix">
        <div className="zx-container" style={{ maxWidth: 1000 }}>
          <Reveal as="div" className="zx-section-head">
            <h2>সব প্ল্যানের ফিচার তুলনা করুন</h2>
            <p>একটা ক্যাটাগরিতে ক্লিক করে বিস্তারিত ফিচার দেখুন</p>
          </Reveal>

          <Reveal as="div" className="zx-matrix-wrap">
            <div className="zx-matrix-inner">
              <div className="zx-matrix-header">
                <div className="zx-matrix-header-feat">ফিচার</div>
                {PLAN_ORDER.map((key) => (
                  <div key={key} className="zx-matrix-header-plan">{PLANS[key].name}</div>
                ))}
              </div>

              {FEATURE_CATEGORIES.map((cat) => {
                const isOpen = openCats.has(cat.id)
                return (
                  <div className="zx-cat" key={cat.id}>
                    <button type="button" className="zx-cat-row" aria-expanded={isOpen} onClick={() => toggleCat(cat.id)}>
                      <span className="zx-cat-title">{cat.title} <span className="zx-cat-count">({cat.rows.length})</span></span>
                      <FiChevronDown />
                    </button>
                    {isOpen && cat.rows.map((row) => {
                      const [label, std, pro, max, erp] = row
                      return (
                        <div className="zx-feat-row" key={label}>
                          <div className="zx-feat-label">{label}</div>
                          {[std, pro, max, erp].map((v, ci) => (
                            <div key={ci} className="zx-feat-cell"><Cell value={v} /></div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          FAQ
          ============================================================ */}
      <section className="zx-faq">
        <div className="zx-container">
          <Reveal as="div" className="zx-section-head">
            <h2>সাধারণ জিজ্ঞাসা</h2>
          </Reveal>

          <Reveal as="div" className="zx-faq-list">
            {PRICING_FAQ.map((item, i) => {
              const isOpen = faqOpen === i
              return (
                <div className={`zx-faq-item${isOpen ? ' zx-open' : ''}`} key={item.q}>
                  <button type="button" className="zx-faq-q" aria-expanded={isOpen} onClick={() => setFaqOpen(isOpen ? null : i)}>
                    {item.q}
                    <span className="zx-faq-q-icon"><FiPlus /></span>
                  </button>
                  <div className="zx-faq-a" style={{ maxHeight: isOpen ? '400px' : '0px' }}>
                    <div className="zx-faq-a-inner">{item.a}</div>
                  </div>
                </div>
              )
            })}
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="zx-footer">
        <div className="zx-container">
          <div className="zx-footer-grid">
            <div className="zx-footer-brand">
              <div className="zx-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/landing')}>
                <BrandMark />
                <span className="zx-brand-word">ZovoriX</span>
              </div>
              <p>A complete platform for sales, team and customer management.</p>
              <div className="zx-footer-social">
                {SOCIALS.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>{s.icon}</a>
                ))}
              </div>
            </div>

            <div className="zx-footer-col">
              <div className="zx-footer-col-title">Contact</div>
              <a href="tel:+8801309540282">+880 1309-540282</a>
              <a href="mailto:support@zovorix.com">support@zovorix.com</a>
              <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
            </div>

            <div className="zx-footer-col">
              <div className="zx-footer-col-title">Login</div>
              <button type="button" onClick={() => navigate('/login')}>Management Login</button>
              <button type="button" onClick={() => navigate('/customer-login')}>Retailer Shop Login</button>
              <button type="button" onClick={() => navigate('/apply/sr')}>Apply as SR</button>
            </div>

            <div className="zx-footer-col">
              <div className="zx-footer-col-title">Company</div>
              <button type="button" onClick={() => navigate('/pricing')}>Pricing</button>
              <button type="button" onClick={() => navigate('/about')}>About Us</button>
              <button type="button" onClick={() => navigate('/contact')}>Contact</button>
              <button type="button" onClick={() => navigate('/blog')}>Blog</button>
              <button type="button" onClick={() => navigate('/privacy-policy')}>Privacy Policy</button>
              <button type="button" onClick={() => navigate('/terms-conditions')}>Terms &amp; Conditions</button>
            </div>
          </div>

          <div className="zx-footer-bottom">
            <div>&copy; {new Date().getFullYear()} ZovoriX. All rights reserved.</div>
            <div className="zx-footer-addr"><FiMapPin /> Barishal Sadar, Kaunia, Janoki Singho Road</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
