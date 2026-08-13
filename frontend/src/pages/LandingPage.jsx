import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiMenu, FiX, FiCheck, FiArrowRight, FiPlay, FiPlus,
  FiPhone, FiMail, FiMessageCircle, FiWifiOff, FiBox,
  FiShoppingBag, FiSettings, FiChevronDown,
} from 'react-icons/fi'
import {
  HiOutlineUserGroup, HiOutlineChartBarSquare, HiOutlineShieldCheck,
  HiOutlineDevicePhoneMobile, HiOutlineClipboardDocumentCheck,
  HiOutlineBuildingStorefront, HiOutlineReceiptPercent,
} from 'react-icons/hi2'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import SEO from '../components/SEO'
import { PLAN_ORDER, PLANS, COMMITMENT_DISCOUNTS, applyDiscount } from '../constants/planPricing'
import './LandingPage.css'

// ============================================================
// LandingPage — ZovoriX marketing site
// ------------------------------------------------------------
// Premium dark "command console" redesign. Distinct from the
// cream/navy design system used by Pricing/About/Contact —
// intentional, matches how cp-/pf- design systems already
// coexist in this codebase (see tailwind.config.js). Every
// class here is prefixed zx- and scoped under .zx-page so
// nothing leaks onto other routes.
// ============================================================

// ── Real pricing data comes from constants/planPricing.js — the
//    numbers below (prices, customer caps, discounts) are never
//    hardcoded. Only the English marketing copy is local to this
//    page, since the shared constants carry Bengali labels used
//    on the dedicated /pricing page. ──────────────────────────
const PLAN_COPY = {
  standard: {
    tagline: 'For small shops & growing teams',
    features: ['Order & invoice management', 'Attendance & basic reporting', 'Email/SMS credit included'],
  },
  pro: {
    tagline: 'For growing distribution businesses',
    features: ['Everything in Standard', 'Advanced approvals & route tools', 'Priority support'],
  },
  max: {
    tagline: 'For multi-level teams & larger operations',
    features: ['Everything in Pro', 'Multi-level team hierarchy', 'Batch & expiry-level stock control'],
  },
  erp: {
    tagline: 'Your whole business, one platform — no limits',
    features: ['Everything in Max', 'Full AI insights suite', 'Owner seat included free'],
  },
}

const minPaidPrice = (plan) => Math.min(...plan.roles.filter((r) => r.price > 0).map((r) => r.price))
const tk = (n) => `৳${Number(n).toLocaleString('en-US')}`

const FEATURES = [
  { icon: <FiWifiOff />, title: 'Offline-first order capture', desc: "Reps log orders, visits and payments straight from a shop counter — signal or no signal. Everything syncs the instant connection returns." },
  { icon: <HiOutlineUserGroup />, title: 'Live team & attendance tracking', desc: 'See who checked in, which routes are covered, and where every rep stands right now — not at the end of the day.' },
  { icon: <HiOutlineChartBarSquare />, title: 'Real-time command dashboard', desc: 'Revenue, orders, stock and team performance in one view that updates as your business moves, not once a week.' },
  { icon: <FiBox />, title: 'Inventory & warehouse control', desc: 'Track stock across warehouses by batch and expiry, so nothing sells past its shelf life and nothing quietly goes missing.' },
  { icon: <HiOutlineShieldCheck />, title: 'Role-based secure access', desc: 'Every rep, supervisor and admin sees exactly what their role needs — encrypted, permissioned, and audit-ready.' },
  { icon: <HiOutlineReceiptPercent />, title: 'Automated payouts & invoicing', desc: 'Commissions, salaries and retailer invoices calculate and settle themselves — so payday never means a spreadsheet marathon.' },
]

const SHOWCASE_TABS = [
  {
    key: 'rep', label: 'Field Rep', icon: <HiOutlineDevicePhoneMobile />, step: 'On the ground',
    title: 'Every visit, logged on the spot.',
    body: "Reps walk into a shop, place the order, log the visit and record payment — all from their phone, online or off. No paper, no end-of-day re-entry, no orders lost in a notebook.",
    list: ['Order entry works fully offline', 'Route & visit history on-device', 'Auto-sync the moment signal returns'],
    mock: [
      { l: 'Shop: Rahim Store', r: 'Visiting', cls: 'pending' },
      { l: 'Order total', r: '৳3,540', strong: true },
      { l: 'Payment collected', r: '৳2,000', cls: 'ok' },
      { l: 'Status', r: 'Offline · queued', cls: 'pending' },
    ],
  },
  {
    key: 'sup', label: 'Supervisor', icon: <HiOutlineClipboardDocumentCheck />, step: 'Managing the team',
    title: 'Approve and coach, in real time.',
    body: 'Watch orders land as they\u2019re placed, approve what needs approval, and see attendance and route coverage without waiting for a phone call or an end-of-day report.',
    list: ['One-tap order approvals', 'Live attendance & route coverage', 'Team performance, ranked automatically'],
    mock: [
      { l: 'Reps checked in', r: '11 / 12', strong: true },
      { l: 'Orders awaiting approval', r: '3', cls: 'pending' },
      { l: 'Top route today', r: 'Route B', strong: true },
      { l: 'Coverage', r: '94%', cls: 'ok' },
    ],
  },
  {
    key: 'exec', label: 'Executive', icon: <HiOutlineChartBarSquare />, step: 'Running the business',
    title: 'The whole network, from one screen.',
    body: "Revenue, stock levels, distributor performance and team output — for every location, updated live. Make the call before a small problem becomes an expensive one.",
    list: ['Network-wide revenue & stock view', 'Distributor & territory comparisons', 'Exportable reports, board-ready'],
    mock: [
      { l: 'Network revenue (MTD)', r: '৳48.2L', strong: true },
      { l: 'Active distributors', r: '24', strong: true },
      { l: 'Stock fault rate', r: '<2%', cls: 'ok' },
      { l: 'Vs. last month', r: '+12.4%', cls: 'ok' },
    ],
  },
  {
    key: 'retail', label: 'Retail Partner', icon: <HiOutlineBuildingStorefront />, step: 'Your retail partners',
    title: 'Retailers see their own account, anytime.',
    body: 'Give retail partners their own login to check order history, outstanding dues and payment status — fewer calls to your office, more trust in the relationship.',
    list: ['Self-serve order history', 'Transparent dues & payment status', 'Fewer calls, more trust'],
    mock: [
      { l: 'Last order', r: '2 days ago', strong: true },
      { l: 'Outstanding due', r: '৳4,200', cls: 'pending' },
      { l: 'Payment status', r: 'On time', cls: 'ok' },
      { l: 'Account', r: 'Verified partner', strong: true },
    ],
  },
]

const FAQS = [
  { q: 'Who is ZovoriX built for?', a: 'Distributors, wholesalers, traders and field-sales teams of any size — any business whose success depends on people moving through territory, not sitting behind a desk.' },
  { q: 'Does it work without an internet connection in the field?', a: 'Yes. Field reps can capture orders, visits and payments completely offline, in areas with weak or no signal. Everything syncs automatically the moment a connection returns.' },
  { q: 'How secure is our business data?', a: "Data is encrypted in transit and at rest, and every user's access is scoped to their role — a field rep never sees what only a supervisor or admin should." },
  { q: 'How does the free trial work?', a: 'Three months, full feature access, no card required. When the trial ends you choose the plan that fits — your data carries over, nothing is lost.' },
  { q: 'Can we change plans or add people later?', a: "Yes — upgrade or downgrade anytime, and add as many people as your business needs. You're billed per active role, never a flat per-seat cap." },
  { q: 'What if something goes wrong?', a: 'Reach us by phone, WhatsApp or email — our team responds directly, no ticket queue to wait in.' },
]

const SIGNIN_OPTIONS = [
  { label: 'Retailer login', icon: <FiShoppingBag />, customer: true },
  { label: 'Field rep login', icon: <HiOutlineDevicePhoneMobile />, role: 'sr' },
  { label: 'Manager login', icon: <HiOutlineUserGroup />, role: 'manager' },
  { label: 'Admin login', icon: <FiSettings />, role: 'admin' },
]

const SOCIALS = [
  { icon: <FaFacebookF />, href: 'https://www.facebook.com/profile.php?id=61591653097465&mibextid=ZbWKwL', label: 'Facebook' },
  { icon: <FaXTwitter />, href: 'https://x.com/Zovorix', label: 'X' },
  { icon: <FaInstagram />, href: 'https://instagram.com/zovorix', label: 'Instagram' },
  { icon: <FaTiktok />, href: 'https://tiktok.com/@zovorix.com', label: 'TikTok' },
  { icon: <FaDiscord />, href: 'https://discord.gg/zovorix', label: 'Discord' },
  { icon: <FaRedditAlien />, href: 'https://reddit.com/u/zovorix', label: 'Reddit' },
]

// ============================================================
// Small reusable helpers
// ============================================================

// ZovoriX brand mark — matches the exact geometry used on the
// app's own loading screen (index.html), recolored for dark bg.
function BrandMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="18" y="18" width="64" height="9" fill="var(--ink-1)" />
      <rect x="18" y="73" width="64" height="9" fill="var(--ink-1)" />
      <line x1="77" y1="23" x2="23" y2="77" stroke="var(--ink-1)" strokeWidth="9" />
      <line x1="23" y1="23" x2="77" y2="77" stroke="var(--gold-500)" strokeWidth="9" />
    </svg>
  )
}

// Scroll-reveal wrapper — IntersectionObserver with an immediate-
// visible fallback (older WebKit/no-JS environments never get
// stuck at opacity:0), and full prefers-reduced-motion respect
// via the CSS itself (.zx-reveal has a reduced-motion override).
function Reveal({ children, delay = 0, scale = false, className = '', as = 'div', ...rest }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Tag = as
  const cls = ['zx-reveal', scale ? 'zx-reveal-scale' : '', visible ? 'zx-is-visible' : '', className]
    .filter(Boolean).join(' ')
  return (
    <Tag ref={ref} className={cls} style={{ '--reveal-delay': `${delay}s` }} {...rest}>
      {children}
    </Tag>
  )
}

// Count-up stat — animates from 0 to target once, when scrolled
// into view. Skips the animation (shows the final value instantly)
// when the browser has no IntersectionObserver or reduced motion
// is requested — the CSS class list intentionally mirrors Reveal.
function Counter({ target, decimals = 0, suffix = '' }) {
  const ref = useRef(null)
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const animate = () => {
      if (startedRef.current) return
      startedRef.current = true
      if (reduceMotion) { setValue(target); return }
      const duration = 1400
      let start = null
      const step = (ts) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - (1 - progress) ** 3
        setValue(target * eased)
        if (progress < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }

    if (typeof IntersectionObserver === 'undefined') { animate(); return undefined }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { animate(); io.unobserve(e.target) } }),
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [target])

  return (
    <span ref={ref}>
      {value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}

const Check = (props) => <FiCheck {...props} />

// ============================================================
// Main component
// ============================================================

export default function LandingPage() {
  const navigate = useNavigate()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signinOpen, setSigninOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [showFloatingCta, setShowFloatingCta] = useState(false)
  const [activeTab, setActiveTab] = useState('rep')
  const [openFaq, setOpenFaq] = useState(null)
  const [billingPeriod, setBillingPeriod] = useState('m') // 'm' | 'y1' | 'y2'
  const [heroInView, setHeroInView] = useState(false)
  const [liveOrders, setLiveOrders] = useState(318)

  const signinRef = useRef(null)
  const heroRef = useRef(null)
  const heroVisualRef = useRef(null)
  const stageRef = useRef(null)
  const consoleRef = useRef(null)
  const phoneRef = useRef(null)
  const toggleGroupRef = useRef(null)
  const toggleThumbRef = useRef(null)
  const monthlyBtnRef = useRef(null)
  const y1BtnRef = useRef(null)
  const y2BtnRef = useRef(null)

  // ── Hidden Platform Panel access ─────────────────────────────
  // Tapping the footer ZovoriX logo 6 times within 3 seconds
  // routes to /platform/login. Deliberately no visible affordance
  // in the UI — only platform staff know this exists.
  const logoTapsRef = useRef([])
  const handleLogoTap = () => {
    const now = Date.now()
    const taps = logoTapsRef.current.filter((t) => now - t < 3000)
    taps.push(now)
    logoTapsRef.current = taps
    if (taps.length >= 6) {
      logoTapsRef.current = []
      navigate('/platform/login')
    }
  }

  const handleSignin = (opt) => {
    setSigninOpen(false)
    setMobileMenuOpen(false)
    if (opt.customer) navigate('/customer-login')
    else navigate('/login', { state: { roleHint: opt.role } })
  }

  const goTrial = () => navigate('/start-trial')

  // ── Close the sign-in dropdown on outside click ──────────────
  useEffect(() => {
    const handler = (e) => {
      if (signinRef.current && !signinRef.current.contains(e.target)) setSigninOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Navbar scrolled state + floating CTA visibility ──────────
  useEffect(() => {
    const onScroll = () => {
      setNavScrolled(window.scrollY > 24)
      const heroH = heroRef.current ? heroRef.current.offsetHeight : 560
      const trigger = (heroRef.current ? heroRef.current.offsetTop : 0) + heroH * 0.6
      setShowFloatingCta(window.scrollY > trigger)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Hero visual in-view (triggers the mini bar-chart animation) ──
  useEffect(() => {
    const el = heroVisualRef.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') { setHeroInView(true); return undefined }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setHeroInView(true); io.disconnect() } }),
      { threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // ── Hero console: subtle live-ticking order count ────────────
  useEffect(() => {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return undefined
    const id = setInterval(() => {
      setLiveOrders((n) => n + Math.floor(Math.random() * 3) + 1)
    }, 4200)
    return () => clearInterval(id)
  }, [])

  // ── Pricing toggle thumb positioning ──────────────────────────
  const positionThumb = useCallback(() => {
    const group = toggleGroupRef.current
    const thumb = toggleThumbRef.current
    const btn = { m: monthlyBtnRef, y1: y1BtnRef, y2: y2BtnRef }[billingPeriod]?.current
    if (!group || !thumb || !btn) return
    const groupRect = group.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    if (!btnRect.width) return
    thumb.style.width = `${btnRect.width}px`
    thumb.style.left = `${btnRect.left - groupRect.left}px`
  }, [billingPeriod])

  useEffect(() => {
    positionThumb()
    window.addEventListener('resize', positionThumb)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionThumb)
    return () => window.removeEventListener('resize', positionThumb)
  }, [positionThumb])

  // ── Hero visual tilt (desktop hover-capable only) ─────────────
  useEffect(() => {
    const stage = stageRef.current
    const consoleEl = consoleRef.current
    const phoneEl = phoneRef.current
    const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!stage || !consoleEl || !phoneEl || !canHover || reduceMotion) return undefined

    const onMove = (e) => {
      const rect = stage.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      consoleEl.style.transform = `translate(${px * -8}px, ${py * -8}px)`
      phoneEl.style.transform = `translate(${px * 10}px, ${py * 6}px)`
    }
    const onLeave = () => {
      consoleEl.style.transform = ''
      phoneEl.style.transform = ''
    }
    stage.addEventListener('mousemove', onMove)
    stage.addEventListener('mouseleave', onLeave)
    return () => {
      stage.removeEventListener('mousemove', onMove)
      stage.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const scrollToId = (id) => (e) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeShowcase = SHOWCASE_TABS.find((t) => t.key === activeTab) || SHOWCASE_TABS[0]

  return (
    <div className="zx-page">
      <SEO
        title="ZovoriX — Run the Field. Own the Numbers."
        description="ZovoriX unifies your field reps, routes, inventory and revenue into one live command view. Built for distributors, traders and executives who can't afford blind spots."
        path="/landing"
      />

      <a href="#zx-main" className="zx-skip-link">Skip to content</a>

      {/* ============================================================
          NAVBAR
          ============================================================ */}
      <header className={`zx-nav${navScrolled ? ' zx-is-scrolled' : ''}`}>
        <div className="zx-nav-inner">
          <a href="#top" className="zx-brand" aria-label="ZovoriX home">
            <BrandMark />
            <span className="zx-brand-word">ZovoriX</span>
          </a>

          <nav className="zx-nav-links" aria-label="Primary">
            <a className="zx-nav-link" href="#zx-features" onClick={scrollToId('zx-features')}>Features</a>
            <a className="zx-nav-link" href="#zx-showcase" onClick={scrollToId('zx-showcase')}>Product</a>
            <a className="zx-nav-link" href="#zx-pricing" onClick={scrollToId('zx-pricing')}>Pricing</a>
            <a className="zx-nav-link" href="#zx-testimonial" onClick={scrollToId('zx-testimonial')}>Customers</a>
          </nav>

          <div className="zx-nav-actions">
            <div className="zx-signin-wrap" ref={signinRef}>
              <button
                type="button"
                className="zx-nav-signin"
                aria-haspopup="true"
                aria-expanded={signinOpen}
                onClick={() => setSigninOpen((v) => !v)}
              >
                Sign in <FiChevronDown className="zx-chevron" style={{ transform: signinOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {signinOpen && (
                <div className="zx-signin-menu" role="menu">
                  {SIGNIN_OPTIONS.map((opt) => (
                    <button key={opt.label} type="button" role="menuitem" className="zx-signin-item" onClick={() => handleSignin(opt)}>
                      <span className="zx-signin-icon">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="zx-btn zx-btn-primary zx-btn-sm" onClick={goTrial}>Start free trial</button>
            <button
              type="button"
              className="zx-hamburger"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>
      </header>

      <div className={`zx-mobile-menu${mobileMenuOpen ? ' zx-is-open' : ''}`}>
        <div className="zx-mobile-menu-links">
          <a href="#zx-features" onClick={scrollToId('zx-features')}>Features</a>
          <a href="#zx-showcase" onClick={scrollToId('zx-showcase')}>Product</a>
          <a href="#zx-pricing" onClick={scrollToId('zx-pricing')}>Pricing</a>
          <a href="#zx-testimonial" onClick={scrollToId('zx-testimonial')}>Customers</a>
        </div>
        <div className="zx-mobile-menu-sub">
          {SIGNIN_OPTIONS.map((opt) => (
            <button key={opt.label} type="button" className="zx-mobile-signin-item" onClick={() => handleSignin(opt)}>
              <span className="zx-signin-icon">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="zx-mobile-menu-actions">
          <button type="button" className="zx-btn zx-btn-primary zx-btn-block" onClick={() => { setMobileMenuOpen(false); goTrial() }}>
            Start free trial
          </button>
        </div>
      </div>

      <div id="top" />
      <main id="zx-main">

        {/* ============================================================
            HERO
            ============================================================ */}
        <section className="zx-hero" ref={heroRef}>
          <div className="zx-glow zx-hero-glow-a zx-glow-drift" aria-hidden="true" />
          <div className="zx-glow zx-hero-glow-b zx-glow-drift" aria-hidden="true" style={{ animationDelay: '-9s' }} />

          <div className="zx-container zx-hero-inner">
            <Reveal className="zx-hero-copy">
              <span className="zx-eyebrow-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--gold-300)' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9" />
                </svg>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
                  Field operations platform
                </span>
              </span>

              <h1>
                Run the field.<br />
                <span className="zx-accent">
                  Own the numbers.
                  <svg className="zx-hero-swoosh" viewBox="0 0 320 14" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 11 C 90 3, 230 3, 318 11" stroke="var(--gold-500)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  </svg>
                </span>
              </h1>

              <p className="zx-lede">
                ZovoriX unifies your field reps, routes, inventory and revenue into one live command view — built for
                distributors, traders and executives who can&apos;t afford blind spots.
              </p>

              <div className="zx-hero-cta-row">
                <button type="button" className="zx-btn zx-btn-primary" onClick={goTrial}>
                  Start your free trial <FiArrowRight />
                </button>
                <a className="zx-btn zx-btn-ghost" href="#zx-showcase" onClick={scrollToId('zx-showcase')}>
                  <FiPlay /> See how it works
                </a>
              </div>

              <ul className="zx-hero-trust">
                <li><Check /> No card required</li>
                <li><Check /> Full feature access for 3 months</li>
                <li><Check /> Cancel anytime</li>
              </ul>
            </Reveal>

            <div
              className={`zx-hero-visual zx-reveal zx-reveal-scale${heroInView ? ' zx-is-visible zx-in-view' : ''}`}
              style={{ '--reveal-delay': '0.15s' }}
              ref={heroVisualRef}
            >
              <svg className="zx-hv-watermark" viewBox="0 0 100 100" aria-hidden="true" style={{ transform: 'rotate(8deg)' }}>
                <rect x="18" y="18" width="64" height="9" fill="var(--ink-1)" />
                <rect x="18" y="73" width="64" height="9" fill="var(--ink-1)" />
                <line x1="77" y1="23" x2="23" y2="77" stroke="var(--ink-1)" strokeWidth="9" />
                <line x1="23" y1="23" x2="77" y2="77" stroke="var(--gold-500)" strokeWidth="9" />
              </svg>

              <div className="zx-hv-stage" ref={stageRef}>
                <div className="zx-hv-console" ref={consoleRef}>
                  <div className="zx-hv-console-head">
                    <span className="zx-hv-console-title">Command view</span>
                    <span className="zx-hv-live"><span className="zx-hv-live-dot" /> Live</span>
                  </div>
                  <div className="zx-hv-stat-row">
                    <div className="zx-hv-stat">
                      <div className="zx-hv-stat-label">Today&apos;s orders</div>
                      <div className="zx-hv-stat-value">{liveOrders.toLocaleString('en-US')}</div>
                    </div>
                    <div className="zx-hv-stat">
                      <div className="zx-hv-stat-label">Active reps</div>
                      <div className="zx-hv-stat-value">84</div>
                    </div>
                    <div className="zx-hv-stat">
                      <div className="zx-hv-stat-label">Revenue today</div>
                      <div className="zx-hv-stat-value zx-gold">৳6.2L</div>
                    </div>
                  </div>
                  <div className="zx-hv-chart" aria-hidden="true">
                    {[38, 58, 46, 74, 64, 92, 100].map((h, i) => (
                      <div key={i} className="zx-hv-bar" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="zx-hv-territory">
                    <span className="zx-hv-territory-label">14,683 shops tracked</span>
                    <span className="zx-hv-dots">
                      <span /><span /><span className="zx-hot" /><span /><span />
                    </span>
                  </div>
                </div>

                <div className="zx-hv-signal" aria-hidden="true"><span /><span /><span /></div>

                <div className="zx-hv-phone" ref={phoneRef}>
                  <div className="zx-hv-phone-notch" />
                  <div className="zx-hv-phone-label">New order · Rahim Store</div>
                  <div className="zx-hv-line-item"><span>Item A × 12</span><span>৳2,400</span></div>
                  <div className="zx-hv-line-item"><span>Item B × 6</span><span>৳1,140</span></div>
                  <div className="zx-hv-total"><span>Total</span><span>৳3,540</span></div>
                  <span className="zx-hv-sync-pill"><span className="zx-dot" />Offline · syncing on reconnect</span>
                </div>

                <div className="zx-hv-chip zx-hv-chip-1"><Check /> Synced 2s ago</div>
                <div className="zx-hv-chip zx-hv-chip-2"><Check /> Zero paperwork</div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            SOCIAL PROOF
            ============================================================ */}
        <section className="zx-proof" id="zx-proof">
          <div className="zx-container">
            <div className="zx-proof-stats">
              <Reveal as="div" className="zx-proof-stat">
                <div className="zx-proof-stat-value"><Counter target={24} suffix="+" /></div>
                <div className="zx-proof-stat-label">Distributor networks running live</div>
              </Reveal>
              <Reveal as="div" className="zx-proof-stat" delay={0.08}>
                <div className="zx-proof-stat-value"><Counter target={14683} suffix="+" /></div>
                <div className="zx-proof-stat-label">Retail shops tracked end&#8209;to&#8209;end</div>
              </Reveal>
              <Reveal as="div" className="zx-proof-stat" delay={0.16}>
                <div className="zx-proof-stat-value"><Counter target={84} suffix="+" /></div>
                <div className="zx-proof-stat-label">Field reps active every day</div>
              </Reveal>
              <Reveal as="div" className="zx-proof-stat" delay={0.24}>
                <div className="zx-proof-stat-value"><Counter target={37.9} decimals={1} suffix="%" /></div>
                <div className="zx-proof-stat-label">Average revenue growth reported</div>
              </Reveal>
            </div>

            <Reveal as="div" className="zx-proof-divider">Built for field-driven businesses across</Reveal>
            <Reveal as="div" className="zx-proof-chips">
              {['FMCG Distribution', 'Pharmaceuticals', 'Building Materials', 'Consumer Electronics', 'Agri-Inputs', 'Wholesale & Trading'].map((c) => (
                <span key={c} className="zx-proof-chip">{c}</span>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ============================================================
            FEATURES
            ============================================================ */}
        <section className="zx-features" id="zx-features">
          <div className="zx-container">
            <Reveal as="div" className="zx-section-head">
              <span className="zx-eyebrow">What you get</span>
              <h2>Everything a field operation needs — nothing it doesn&apos;t.</h2>
              <p>Six systems that usually live in six different spreadsheets, built to work as one.</p>
            </Reveal>

            <div className="zx-feature-grid">
              {FEATURES.map((f, i) => (
                <Reveal as="div" key={f.title} className="zx-feature-card" delay={i * 0.06}>
                  <div className="zx-feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            PRODUCT SHOWCASE
            ============================================================ */}
        <section className="zx-showcase" id="zx-showcase">
          <div className="zx-container">
            <Reveal as="div" className="zx-section-head">
              <span className="zx-eyebrow">One platform, four vantage points</span>
              <h2>Built around how a field business actually runs.</h2>
              <p>An order starts on the street and ends in your P&amp;L. ZovoriX gives everyone in between the exact view they need.</p>
            </Reveal>

            <Reveal as="div" className="zx-showcase-tabs" role="tablist" aria-label="Product roles">
              {SHOWCASE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`zx-showcase-tab${activeTab === tab.key ? ' zx-is-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  aria-label={tab.label}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.icon}
                  <span className="zx-tab-label">{tab.label}</span>
                </button>
              ))}
            </Reveal>

            <Reveal as="div" className="zx-showcase-panels">
              <div className="zx-showcase-panel zx-is-active" role="tabpanel" key={activeShowcase.key}>
                <div className="zx-showcase-text">
                  <div className="zx-showcase-step">{activeShowcase.step}</div>
                  <h3>{activeShowcase.title}</h3>
                  <p>{activeShowcase.body}</p>
                  <ul className="zx-showcase-list">
                    {activeShowcase.list.map((item) => (
                      <li key={item}><Check /> {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="zx-showcase-mock">
                  <div className="zx-showcase-mock-head"><span /><span /><span /></div>
                  {activeShowcase.mock.map((row) => (
                    <div className="zx-showcase-mock-row" key={row.l}>
                      <span>{row.l}</span>
                      {row.strong ? <strong>{row.r}</strong> : <span className={row.cls ? `zx-${row.cls}` : ''}>{row.r}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============================================================
            BENEFITS (cream interlude)
            ============================================================ */}
        <section className="zx-benefits" id="zx-benefits">
          <div className="zx-container">
            <Reveal as="div" className="zx-section-head zx-on-cream">
              <span className="zx-eyebrow" style={{ color: 'var(--gold-700)' }}>Real results</span>
              <h2>The numbers our customers actually see.</h2>
              <p>One distributor&apos;s first year on ZovoriX — the kind of shift executives notice in the P&amp;L, not just the dashboard.</p>
            </Reveal>

            <div className="zx-benefits-grid">
              {[
                ['37.9%', 'Overall revenue growth'],
                ['80%', 'Increase in off-hours e-commerce orders'],
                ['60%', 'Gain in day-to-day efficiency'],
                ['2×', 'Rep visit frequency across 70% of coverage areas'],
                ['<2%', 'Stock fault rate, down from a costly norm'],
              ].map(([value, label], i) => (
                <Reveal as="div" key={label} className="zx-benefit-stat" delay={i * 0.06}>
                  <div className="zx-benefit-stat-value">{value}</div>
                  <div className="zx-benefit-stat-label">{label}</div>
                </Reveal>
              ))}
            </div>

            <Reveal as="div" className="zx-benefits-attrib">
              Reported by <strong>NovaTech BD</strong>, an FMCG distribution network running its full operation on ZovoriX.
            </Reveal>
          </div>
        </section>

        {/* ============================================================
            TESTIMONIAL
            ============================================================ */}
        <section className="zx-testimonial" id="zx-testimonial">
          <div className="zx-glow" style={{ width: 500, height: 500, top: '20%', left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(circle, rgba(202,154,68,0.14), transparent 70%)' }} aria-hidden="true" />
          <div className="zx-container">
            <Reveal as="div" className="zx-testimonial-card">
              <div className="zx-testimonial-mark" aria-hidden="true">&#8220;</div>
              <p className="zx-testimonial-quote">
                Since moving onto ZovoriX, staying on top of retailer dues and orders stopped being a daily headache — it&apos;s
                all visible from the app now. Our stock fault rate dropped under 2%, paperwork is a fraction of what it was,
                and retailers trust us more because everything is transparent. Managing our reps and supervisors is simple
                now — I run the entire business from one screen, and I always know exactly where it stands.
              </p>
              <div className="zx-testimonial-person">
                <div className="zx-testimonial-avatar" aria-hidden="true">SH</div>
                <div className="zx-testimonial-id">
                  <div className="zx-testimonial-name">Santo Howladar</div>
                  <div className="zx-testimonial-role">Owner &amp; CEO, NovaTech BD</div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============================================================
            PRICING — driven entirely by constants/planPricing.js
            ============================================================ */}
        <section className="zx-pricing" id="zx-pricing">
          <div className="zx-container">
            <Reveal as="div" className="zx-section-head">
              <span className="zx-eyebrow">Simple, role-based pricing</span>
              <h2>One platform. Pricing that scales the way your team does.</h2>
              <p>No per-seat caps, no hidden fees — pay per active role, and add as many people as your business needs.</p>
            </Reveal>

            <Reveal as="div" className="zx-pricing-toggle-wrap">
              <div className="zx-toggle-group" ref={toggleGroupRef} role="tablist" aria-label="Billing period">
                <span className="zx-toggle-thumb" ref={toggleThumbRef} />
                <div className="zx-toggle-row">
                  <button
                    type="button" ref={monthlyBtnRef}
                    className={`zx-toggle-btn${billingPeriod === 'm' ? ' zx-is-active' : ''}`}
                    role="tab" aria-selected={billingPeriod === 'm'}
                    onClick={() => setBillingPeriod('m')}
                  >
                    Monthly
                  </button>
                  <button
                    type="button" ref={y1BtnRef}
                    className={`zx-toggle-btn${billingPeriod === 'y1' ? ' zx-is-active' : ''}`}
                    role="tab" aria-selected={billingPeriod === 'y1'}
                    onClick={() => setBillingPeriod('y1')}
                  >
                    1&#8209;Year<span className="zx-save-badge">Save {COMMITMENT_DISCOUNTS.find((d) => d.years === 1)?.discountPct}%</span>
                  </button>
                  <button
                    type="button" ref={y2BtnRef}
                    className={`zx-toggle-btn${billingPeriod === 'y2' ? ' zx-is-active' : ''}`}
                    role="tab" aria-selected={billingPeriod === 'y2'}
                    onClick={() => setBillingPeriod('y2')}
                  >
                    2&#8209;Year<span className="zx-save-badge">Save {COMMITMENT_DISCOUNTS.find((d) => d.years === 2)?.discountPct}%</span>
                  </button>
                </div>
              </div>
              <div className="zx-pricing-note">Rates lock in for the length of your commitment — future price increases won&apos;t touch you.</div>
            </Reveal>

            <div className="zx-pricing-grid">
              {PLAN_ORDER.map((key, i) => {
                const plan = PLANS[key]
                const copy = PLAN_COPY[key]
                const base = minPaidPrice(plan)
                const price = billingPeriod === 'm' ? base : applyDiscount(base, billingPeriod === 'y1' ? 1 : 2)
                const ownerFree = plan.roles.some((r) => r.price === 0)
                return (
                  <Reveal as="div" key={key} className={`zx-price-card${plan.highlight ? ' zx-is-popular' : ''}`} delay={i * 0.08}>
                    {plan.highlight && <span className="zx-price-badge">Most popular</span>}
                    <div className="zx-price-name">{plan.name}</div>
                    <div className="zx-price-tagline">{copy.tagline}</div>
                    <div className="zx-price-value">
                      <span className="zx-price-amount">{tk(price)}</span>
                      <span className="zx-price-unit">/ user / mo, starting</span>
                    </div>
                    <div className="zx-price-role-note">
                      Lowest per-role rate shown &middot; {ownerFree ? 'owner seat is free' : 'admin & other roles priced separately'}
                    </div>
                    <div className="zx-price-cap">{plan.maxCustomers ? `${plan.maxCustomers.toLocaleString('en-US')} customer connections` : 'Unlimited customer connections'}</div>
                    <ul className="zx-price-features">
                      {copy.features.map((feat) => (
                        <li key={feat}><Check /> {feat}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`zx-btn zx-btn-block${plan.highlight ? ' zx-btn-primary' : ' zx-btn-ghost'}`}
                      onClick={goTrial}
                    >
                      Start free trial
                    </button>
                  </Reveal>
                )
              })}
            </div>

            <Reveal as="p" className="zx-pricing-footnote">
              All prices in BDT (৳). Every plan includes unlimited team members — you&apos;re billed only for active roles, never a flat per-seat fee.
            </Reveal>
          </div>
        </section>

        {/* ============================================================
            FAQ
            ============================================================ */}
        <section className="zx-faq" id="zx-faq">
          <div className="zx-container">
            <Reveal as="div" className="zx-section-head">
              <span className="zx-eyebrow">Questions, answered</span>
              <h2>Everything you were about to ask.</h2>
            </Reveal>

            <Reveal as="div" className="zx-faq-list">
              {FAQS.map((item, i) => {
                const isOpen = openFaq === i
                return (
                  <div className={`zx-faq-item${isOpen ? ' zx-is-open' : ''}`} key={item.q}>
                    <button
                      type="button"
                      className="zx-faq-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                    >
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
            FINAL CTA
            ============================================================ */}
        <section className="zx-cta-final">
          <div className="zx-container">
            <Reveal as="div" scale className="zx-cta-card">
              <div className="zx-glow zx-glow-drift" aria-hidden="true" />
              <div className="zx-cta-card-inner">
                <h2>See your business as one dashboard.</h2>
                <p>Start free for three months. No card, no setup fees, no commitment until you&apos;ve seen it run your business.</p>
                <div className="zx-cta-actions">
                  <button type="button" className="zx-btn zx-btn-primary" onClick={goTrial}>
                    Start your free trial <FiArrowRight />
                  </button>
                  <a
                    className="zx-btn zx-btn-ghost"
                    href="https://wa.me/8801309540282?text=I%27d%20like%20to%20book%20a%20ZovoriX%20demo"
                    target="_blank" rel="noopener noreferrer"
                  >
                    <FiMessageCircle /> Book a live demo
                  </a>
                </div>
                <div className="zx-cta-phone">Or call us directly at <a href="tel:+8801309540282">+880 1309-540282</a></div>
              </div>
            </Reveal>
          </div>
        </section>

      </main>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="zx-footer">
        <div className="zx-container">
          <div className="zx-footer-grid">
            <div className="zx-footer-brand">
              <div
                className="zx-brand"
                onClick={handleLogoTap}
                role="button"
                tabIndex={-1}
                aria-hidden="true"
                style={{ cursor: 'default', userSelect: 'none' }}
              >
                <BrandMark />
                <span className="zx-brand-word">ZovoriX</span>
              </div>
              <p>The command platform for field-driven businesses — sales, team and customer management in one place.</p>
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
              <div className="zx-footer-col-title">Product</div>
              <a href="#zx-features" onClick={scrollToId('zx-features')}>Features</a>
              <a href="#zx-showcase" onClick={scrollToId('zx-showcase')}>How it works</a>
              <a href="#zx-pricing" onClick={scrollToId('zx-pricing')}>Pricing</a>
              <button type="button" onClick={() => navigate('/blog')}>Blog</button>
            </div>

            <div className="zx-footer-col">
              <div className="zx-footer-col-title">Company</div>
              <button type="button" onClick={() => navigate('/about')}>About us</button>
              <button type="button" onClick={() => navigate('/contact')}>Contact</button>
              <button type="button" onClick={() => navigate('/apply/sr')}>Apply as a field rep</button>
            </div>

            <div className="zx-footer-col">
              <div className="zx-footer-col-title">Account</div>
              <button type="button" onClick={() => navigate('/customer-login')}>Retailer login</button>
              <button type="button" onClick={() => navigate('/login')}>Management login</button>
              <button type="button" onClick={goTrial}>Start free trial</button>
            </div>
          </div>

          <div className="zx-footer-bottom">
            <div>&copy; {new Date().getFullYear()} ZovoriX. All rights reserved.</div>
            <div className="zx-footer-legal">
              <button type="button" onClick={() => navigate('/privacy-policy')}>Privacy policy</button>
              <button type="button" onClick={() => navigate('/terms-conditions')}>Terms &amp; conditions</button>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating sticky CTA */}
      <div className={`zx-floating-cta${showFloatingCta ? ' zx-is-visible' : ''}`}>
        <button type="button" className="zx-btn zx-btn-primary" onClick={goTrial}>Start free trial</button>
      </div>
    </div>
  )
}

