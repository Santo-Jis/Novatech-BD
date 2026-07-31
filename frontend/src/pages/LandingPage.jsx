import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiShoppingBag, FiChevronDown, FiSettings, FiPhone, FiMail, FiMessageCircle, FiMenu, FiX, FiWifiOff } from 'react-icons/fi'
import { HiOutlineReceiptPercent, HiOutlineUserGroup, HiOutlineChartBarSquare, HiOutlineShieldCheck, HiOutlineDevicePhoneMobile, HiOutlineClipboardDocumentCheck, HiOutlineBuildingStorefront } from 'react-icons/hi2'
import { FaXTwitter, FaTiktok, FaInstagram, FaFacebookF, FaDiscord, FaRedditAlien } from 'react-icons/fa6'
import logo from '../assets/zovorix-logo.png'
import novatechLogo from '../assets/novatech-nt-logo.png'
import SEO from '../components/SEO'
import HeroImageSlider from '../components/HeroImageSlider'
import BlogPostCard from '../components/BlogPostCard'
import { BLOG_POSTS } from '../constants/blogPosts'
import { PLAN_ORDER, PLANS, formatTaka } from '../constants/planPricing'

// ============================================================
// Landing Page — ZovoriX
// লগইন না করা ব্যবহারকারীদের জন্য পাবলিক পেজ
// ডিজাইন সিস্টেম: cream base / deep-navy primary / bronze accent (সীমিত ব্যবহার)
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

export default function LandingPage() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)
  const [showFloatingCta, setShowFloatingCta] = useState(false)
  const dropRef = useRef(null)

  // ── লুকানো Platform Panel অ্যাক্সেস ──────────────────────────
  // ফুটারের ZovoriX লোগোতে ৩ সেকেন্ডের মধ্যে ৬ বার ট্যাপ করলে
  // /platform/login-এ নিয়ে যাবে। ইচ্ছাকৃতভাবে UI-তে কোনো visible
  // hint নেই — শুধু platform staff-রাই জানবেন।
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

  // বাইরে ক্লিক করলে ড্রপডাউন বন্ধ
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setMgmtOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // হিরো সেকশন পার হয়ে গেলে ফ্লোটিং "ট্রায়াল শুরু করুন" বাটন দেখানো —
  // পুরো পেজেই নিচে স্ক্রল করলে ট্রায়াল CTA যেন সবসময় হাতের কাছে থাকে
  useEffect(() => {
    const onScroll = () => setShowFloatingCta(window.scrollY > 560)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const features = [
    { icon: <HiOutlineReceiptPercent />, title: 'বিক্রয় ব্যবস্থাপনা',  desc: 'অর্ডার, ইনভয়েস ও পেমেন্ট সব এক জায়গায়' },
    { icon: <HiOutlineUserGroup />,      title: 'টিম ম্যানেজমেন্ট',    desc: 'কর্মীদের অ্যাটেন্ডেন্স ও পারফরম্যান্স ট্র্যাকিং' },
    { icon: <HiOutlineChartBarSquare />, title: 'রিয়েল-টাইম রিপোর্ট',  desc: 'ব্যবসার সামগ্রিক চিত্র একনজরে দেখুন' },
    { icon: <HiOutlineShieldCheck />,    title: 'নিরাপদ প্ল্যাটফর্ম',   desc: 'এনক্রিপ্টেড ডেটা ও সুরক্ষিত অ্যাক্সেস' },
    { icon: <FiWifiOff />,               title: 'অফলাইন সাপোর্ট',      desc: 'ইন্টারনেট না থাকলেও কাজ করুন, সংযোগ ফিরলেই ডেটা অটো-সিঙ্ক হয়ে যাবে' },
  ]

  const workflowSteps = [
    { icon: <HiOutlineDevicePhoneMobile />, step: '০১', title: 'SR মাঠে গিয়ে অর্ডার নেন', desc: 'দোকান ভিজিট করে অ্যাপেই সরাসরি অর্ডার এন্ট্রি করেন, কাগজের হিসাব লাগে না' },
    { icon: <HiOutlineClipboardDocumentCheck />, step: '০২', title: 'ম্যানেজার রিয়েল-টাইমে দেখেন', desc: 'প্রতিটা অর্ডার ও টিমের পারফরম্যান্স সাথে সাথে দেখতে ও অনুমোদন দিতে পারেন' },
    { icon: <HiOutlineChartBarSquare />, step: '০৩', title: 'এডমিন পুরো নেটওয়ার্ক নিয়ন্ত্রণ করেন', desc: 'সব ডিস্ট্রিবিউটর, স্টক ও রিপোর্ট এক ড্যাশবোর্ড থেকে মনিটর করেন' },
    { icon: <HiOutlineBuildingStorefront />, step: '০৪', title: 'রিটেইলার নিজের হিসাব দেখেন', desc: 'নিজের অর্ডার হিস্ট্রি ও পেমেন্ট স্ট্যাটাস নিজের লগইন দিয়ে যেকোনো সময় দেখতে পারেন' },
  ]

  // প্রাইসিং পেইজের FAQ শুধু বিলিং নিয়ে — এখানে সাধারণ প্রশ্নগুলো রাখা হলো
  const landingFaq = [
    {
      q: 'এই সফটওয়্যারটা কাদের জন্য?',
      a: 'ডিস্ট্রিবিউটর, পাইকারি ব্যবসা ও FMCG সেলস টিমের জন্য তৈরি — যেখানে SR মাঠে অর্ডার নেন, ম্যানেজার টিম দেখেন, এবং অ্যাডমিন পুরো নেটওয়ার্ক পরিচালনা করেন।',
    },
    {
      q: 'ইন্টারনেট না থাকলে কি ব্যবহার করা যাবে?',
      a: 'হ্যাঁ। নেটওয়ার্ক দুর্বল বা না থাকা এলাকাতেও SR অর্ডার এন্ট্রি করতে পারবেন — সংযোগ ফিরলেই ডেটা অটোমেটিক সার্ভারে সিঙ্ক হয়ে যায়।',
    },
    {
      q: 'আমার ব্যবসার ডেটা কতটা নিরাপদ?',
      a: 'সব ডেটা এনক্রিপ্টেড অবস্থায় সংরক্ষিত হয় এবং প্রতিটা ইউজারের অ্যাক্সেস তার রোল (SR/ম্যানেজার/অ্যাডমিন/রিটেইলার) অনুযায়ী নিয়ন্ত্রিত থাকে।',
    },
    {
      q: 'ফ্রি ট্রায়াল কীভাবে শুরু করবো?',
      a: '৩ মাসের ফ্রি ট্রায়ালে সাইন আপ করলেই পুরো ফিচার-সেট ব্যবহার করা যায়। ট্রায়াল শেষে আপনার প্রয়োজন অনুযায়ী একটা প্ল্যান বেছে নিতে হবে।',
    },
    {
      q: 'কোনো সমস্যা হলে সাপোর্ট কীভাবে পাবো?',
      a: 'ফোন (+৮৮০ ১৩০৯-৫৪০২৮২), ইমেইল (support@zovorix.com) অথবা হোয়াটসঅ্যাপে সরাসরি যোগাযোগ করতে পারেন — আমাদের টিম সাহায্য করবে।',
    },
  ]

  const roles = [
    { label: 'SR লগইন',      role: 'sr',      icon: '👤', desc: 'Sales Representative' },
    { label: 'Manager লগইন', role: 'manager', icon: '📊', desc: 'ম্যানেজার / সুপারভাইজার' },
    { label: 'Admin লগইন',   role: 'admin',   icon: '⚙️', desc: 'অ্যাডমিন প্যানেল' },
  ]

  const stats = [
    { value: '২৪+',      label: 'ডিস্ট্রিবিউটর' },
    { value: '৮৪+',      label: 'সেলস রিপ্রেজেন্টেটিভ (SR)' },
    { value: '২৪',       label: 'ম্যানেজার' },
    { value: '১৪,৬৮৩',  label: 'রিটেইল দোকান' },
  ]

  // সাফল্যের গল্প — NovaTech BD (FMCG ব্র্যান্ড)-এর আসল রেজাল্ট
  const caseStudyStats = [
    { value: '৩৭.৯%', label: 'ওভারঅল রেভিনিউ বৃদ্ধি' },
    { value: '৮০%',   label: 'ই-কমার্স অর্ডারে অফ-টাইম রেভিনিউ বৃদ্ধি' },
    { value: '৬০%',   label: 'কাজের এফিসিয়েন্সি বৃদ্ধি' },
    { value: '২×',    label: '৭০% এরিয়ায় SR ভিজিট বৃদ্ধি' },
    { value: '<২%',   label: 'স্টক ফল্ট (আগের তুলনায় প্রায় শূন্যের কাছাকাছি)' },
  ]

  // প্রতিটা প্ল্যানের সবচেয়ে কম রোল-প্রাইস — ল্যান্ডিং টিজারে "শুরু ৳X থেকে" দেখাতে
  const minPaidPrice = (plan) => Math.min(...plan.roles.filter(r => r.price > 0).map(r => r.price))

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bgBase,
      fontFamily: T.fontBody,
      color: T.textPrimary,
      overflowX: 'hidden',
    }}>
      <SEO
        title="ZovoriX — আপনার ব্যবসাকে স্মার্ট করে তুলুন"
        description="বিক্রয়, কর্মী ও কাস্টমার — সব কিছু একটি প্ল্যাটফর্মে পরিচালনা করুন। রিয়েল-টাইম ডেটা দিয়ে সঠিক সিদ্ধান্ত নিন। আজই ডেমো বুক করুন।"
        path="/"
      />
      {/* Navbar */}
      <style>{`
        /* মোবাইল স্ক্রিনে নেভবার — লোগোর পাশে বাটনগুলো ছোট হয়ে একই লাইনে থাকবে, নিচে wrap করবে না।
           ট্যাব/ল্যাপটপে (৪৮০px-এর উপরে) কোনো পরিবর্তন নেই — বেস স্টাইলই বহাল থাকবে। */
        /* মোবাইল স্ক্রিনে নেভবার — ৩টা আলাদা লাইনে ভাগ হয়ে যাবে: লোগো, তারপর নেভ লিংক,
           তারপর লগইন বাটন — flex-direction:column দিয়ে, তাই ওভারল্যাপ হওয়ার সুযোগ নেই।
           ট্যাব/ল্যাপটপে (৪৮০px-এর উপরে) কোনো পরিবর্তন নেই — বেস স্টাইলই বহাল থাকবে (এক লাইনেই সব)। */
        @media (max-width: 640px) {
          .zx-navbar { flex-direction: column !important; flex-wrap: nowrap !important; align-items: stretch !important; padding: 10px 14px !important; row-gap: 10px !important; }
          .zx-navbar-top { width: 100% !important; }
          .zx-brand { gap: 6px !important; justify-content: flex-start !important; }
          .zx-logo-box { width: 26px !important; height: 26px !important; border-radius: 6px !important; }
          .zx-brand-text { font-size: 14px !important; }
          .zx-hamburger { display: flex !important; }
          /* মেনু বন্ধ থাকলে নেভ লিংক ও লগইন বাটন লুকানো থাকবে — শুধু হ্যামবার্গার আইকনে ট্যাপ করলে খুলবে */
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
      `}</style>
      <nav className={`zx-navbar${mobileMenuOpen ? ' zx-menu-open' : ''}`} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        borderBottom: `1px solid ${T.borderDefault}`,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexWrap: 'wrap',
        rowGap: '10px',
      }}>
        <div className="zx-navbar-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div className="zx-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div className="zx-logo-box" style={{
              width: '34px', height: '34px',
              borderRadius: '8px',
              overflow: 'hidden',
              flexShrink: 0,
              border: `1px solid ${T.borderDefault}`,
            }}>
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

        {/* নেভ লিংক — আগে আলাদা ব্যানার/বার হিসেবে ছিল, এখন হেডারেই মিশে গেছে */}
        <div className="zx-nav-links" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 auto', flexWrap: 'wrap', gap: '22px', minWidth: '120px' }}>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/about') }}
            style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700}
            onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
          >
            আমাদের সম্পর্কে
          </button>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/contact') }}
            style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700}
            onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
          >
            যোগাযোগ
          </button>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/pricing') }}
            style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700}
            onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
          >
            প্রাইসিং
          </button>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/blog') }}
            style={{ background: 'none', border: 'none', padding: 0, color: T.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: T.fontBody, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.color = T.primary700}
            onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
          >
            ব্লগ
          </button>
        </div>

        {/* Navbar right — রিটেইলার + ম্যানেজমেন্ট */}
        <div className="zx-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>

          {/* রিটেইলার শপ লগইন */}
          <button
            className="zx-btn-retailer"
            onClick={() => { setMobileMenuOpen(false); navigate('/customer-login') }}
            style={{
              padding: '9px 18px',
              background: 'transparent',
              border: `1px solid ${T.primary700}`,
              borderRadius: '8px',
              color: T.primary700,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: T.fontBody,
              whiteSpace: 'nowrap',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.primary700; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.primary700 }}
          >
            <FiShoppingBag className="zx-btn-icon" style={{ fontSize: '14px' }} /> রিটেইলার<span className="zx-btn-suffix">&nbsp;লগইন</span>
          </button>

          {/* ম্যানেজমেন্ট লগইন ড্রপডাউন */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              className="zx-btn-mgmt"
              onClick={() => setMgmtOpen(p => !p)}
              style={{
                padding: '9px 18px',
                background: T.primary700,
                border: `1px solid ${T.primary700}`,
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: T.fontBody,
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <FiSettings className="zx-btn-icon" style={{ fontSize: '14px' }} />
              ম্যানেজমেন্ট<span className="zx-btn-suffix">&nbsp;লগইন</span>
              <FiChevronDown className="zx-chevron" style={{
                fontSize: '13px',
                transition: 'transform 0.2s',
                transform: mgmtOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            {/* Dropdown Menu */}
            {mgmtOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                minWidth: '210px',
                background: T.bgSurface,
                border: `1px solid ${T.borderDefault}`,
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(15,27,46,0.18)',
                zIndex: 200,
                animation: 'fadeSlideDown 0.15s ease-out',
              }}>
                <style>{`@keyframes fadeSlideDown { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>

                {/* Header */}
                <div style={{
                  padding: '10px 16px 8px',
                  borderBottom: `1px solid ${T.borderDefault}`,
                  color: T.textMuted,
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontFamily: T.fontMono,
                }}>
                  ম্যানেজমেন্ট পোর্টাল
                </div>

                {roles.map((item) => (
                  <button
                    key={item.role}
                    onClick={() => {
                      setMgmtOpen(false)
                      setMobileMenuOpen(false)
                      navigate('/login', { state: { roleHint: item.role } })
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${T.borderDefault}`,
                      color: T.textPrimary,
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontFamily: T.fontBody,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.bgAlt}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      width: '32px', height: '32px',
                      background: T.primary100,
                      borderRadius: '7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', flexShrink: 0,
                    }}>{item.icon}</span>
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
      <section style={{
        textAlign: 'center',
        padding: '76px 24px 56px',
        position: 'relative',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: T.bgSurface,
          border: `1px solid ${T.borderDefault}`,
          borderRadius: '20px',
          fontSize: '11px',
          fontFamily: T.fontMono,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: T.textMuted,
          marginBottom: '28px',
        }}>
          ডিস্ট্রিবিউটর ও পাইকারি ব্যবসার জন্য ব্যবস্থাপনা সফটওয়্যার
        </div>

        <h1 style={{
          fontFamily: T.fontHead,
          fontSize: 'clamp(30px, 6vw, 50px)',
          fontWeight: 600,
          lineHeight: 1.25,
          margin: '0 auto 8px',
          maxWidth: '620px',
          color: T.primary700,
        }}>
          আপনার ব্যবসাকে<br />
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{ color: T.accent600 }}>স্মার্ট করে তুলুন</span>
            <svg
              viewBox="0 0 220 14" preserveAspectRatio="none"
              style={{ position: 'absolute', left: 0, bottom: '-8px', width: '100%', height: '12px' }}
            >
              <path d="M2 11 L218 3" stroke={T.accent300} strokeWidth="4" strokeLinecap="round" fill="none" />
            </svg>
          </span>
        </h1>

        <p style={{
          color: T.textSecondary,
          fontSize: '16px',
          maxWidth: '480px',
          margin: '28px auto 36px',
          lineHeight: 1.7,
        }}>
          বিক্রয়, কর্মী ও কাস্টমার — সব কিছু একটি প্ল্যাটফর্মে পরিচালনা করুন।
          রিয়েল-টাইম ডেটা দিয়ে সঠিক সিদ্ধান্ত নিন।
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => navigate('/start-trial')}
            style={{
              padding: '13px 28px',
              background: T.primary700,
              border: `1px solid ${T.primary700}`,
              borderRadius: '9px',
              color: '#fff',
              fontSize: '14.5px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: T.fontBody,
              transition: 'background 0.15s, transform 0.15s',
              boxShadow: '0 8px 20px rgba(15,27,46,0.18)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.primary900; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = T.primary700; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            ৩ মাসের ফ্রি ট্রায়াল শুরু করুন
          </button>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/about') }}
            style={{
              padding: '13px 28px',
              background: 'transparent',
              border: `1px solid ${T.borderStrong}`,
              borderRadius: '9px',
              color: T.primary700,
              fontSize: '14.5px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: T.fontBody,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgSurface; e.currentTarget.style.borderColor = T.primary500 }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.borderStrong }}
          >
            আরও জানুন
          </button>
        </div>

        <p style={{
          fontSize: '12.5px',
          color: T.textMuted,
          margin: '16px 0 0',
        }}>
          ৩ মাসের ট্রায়ালে পুরো ফিচার-সেট ফ্রি ব্যবহার করা যায়
        </p>

        {/* ৫টি ছবি/প্যানেল নির্দিষ্ট সময় পর পর অটো-স্লাইড হবে */}
        <HeroImageSlider />

      </section>

      {/* কীভাবে কাজ করে — SR থেকে রিটেইলার পর্যন্ত পুরো ওয়ার্কফ্লো একনজরে */}
      <section style={{
        padding: '8px 24px 72px',
        maxWidth: '1040px',
        margin: '0 auto',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontFamily: T.fontHead,
          fontSize: '24px',
          fontWeight: 600,
          color: T.primary700,
          margin: '48px 0 8px',
        }}>
          কীভাবে কাজ করে
        </h2>
        <p style={{
          textAlign: 'center',
          color: T.textSecondary,
          fontSize: '14px',
          maxWidth: '480px',
          margin: '0 auto 40px',
        }}>
          অর্ডার নেওয়া থেকে শুরু করে পুরো নেটওয়ার্ক মনিটর করা পর্যন্ত — চারটি ধাপে সব একসাথে
        </p>

        <style>{`
          /* গ্রিড কলাম কমে গেলে (ছোট স্ক্রিনে ধাপগুলো একটার নিচে একটা সাজে) আড়াআড়ি
             সংযোগ রেখাটা আর ঠিকমতো মানায় না, তাই তখন লুকিয়ে রাখা হলো */
          @media (max-width: 900px) {
            .zx-step-connector { display: none !important; }
          }
        `}</style>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '4px',
        }}>
          {workflowSteps.map((w, i) => (
            <div key={i} style={{
              position: 'relative',
              padding: '0 18px',
            }}>
              {/* ডেস্কটপে ধাপগুলোর মাঝে সংযোগ রেখা */}
              {i < workflowSteps.length - 1 && (
                <div className="zx-step-connector" style={{
                  display: 'block',
                  position: 'absolute',
                  top: '25px',
                  right: '-8px',
                  width: 'calc(100% - 34px)',
                  height: '1px',
                  background: T.borderStrong,
                  zIndex: 0,
                }} />
              )}
              <div style={{
                width: '50px', height: '50px',
                background: T.bgSurface,
                border: `1px solid ${T.borderDefault}`,
                borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', color: T.primary700,
                position: 'relative', zIndex: 1,
                marginBottom: '14px',
              }}>
                {w.icon}
              </div>
              <div style={{
                fontFamily: T.fontMono, fontSize: '11px', color: T.accent600,
                letterSpacing: '0.06em', marginBottom: '4px',
              }}>
                ধাপ {w.step}
              </div>
              <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: T.textPrimary, marginBottom: '6px', fontFamily: T.fontBody }}>
                {w.title}
              </h3>
              <p style={{ fontSize: '12.5px', color: T.textSecondary, lineHeight: 1.6, margin: 0 }}>
                {w.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{
        padding: '8px 24px 80px',
        maxWidth: '960px',
        margin: '0 auto',
        borderTop: `1px solid ${T.borderDefault}`,
      }}>
        <h2 style={{
          textAlign: 'center',
          fontFamily: T.fontHead,
          fontSize: '24px',
          fontWeight: 600,
          color: T.primary700,
          margin: '48px 0 36px',
        }}>
          কেন ZovoriX?
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '18px',
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: T.bgSurface,
              border: `1px solid ${T.borderDefault}`,
              borderRadius: '12px',
              padding: '26px 20px',
              textAlign: 'center',
              transition: 'border-color 0.2s, transform 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary300; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDefault; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{
                width: '46px', height: '46px',
                background: T.primary100,
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', color: T.primary700,
                margin: '0 auto 14px',
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: T.textPrimary, marginBottom: '6px', fontFamily: T.fontBody }}>
                {f.title}
              </h3>
              <p style={{ fontSize: '13px', color: T.textSecondary, lineHeight: 1.6, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Teaser — পুরো ডিটেইল Pricing পেইজে, এখানে শুধু ধারণা দেওয়ার জন্য */}
      <section style={{ padding: '8px 24px 72px', maxWidth: '1040px', margin: '0 auto' }}>
        <h2 style={{
          textAlign: 'center', fontFamily: T.fontHead, fontSize: '24px', fontWeight: 600,
          color: T.primary700, margin: '48px 0 8px',
        }}>
          আপনার ব্যবসার জন্য যেই প্ল্যান
        </h2>
        <p style={{ textAlign: 'center', color: T.textSecondary, fontSize: '14px', maxWidth: '480px', margin: '0 auto 40px' }}>
          ছোট দোকান থেকে বড় ডিস্ট্রিবিউশন নেটওয়ার্ক — প্রতি রোল অনুযায়ী দাম, লুকানো কোনো খরচ নেই
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}>
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key]
            return (
              <div key={key} style={{
                background: plan.highlight ? T.primary900 : T.bgSurface,
                border: `1px solid ${plan.highlight ? T.primary900 : T.borderDefault}`,
                borderRadius: '14px',
                padding: '24px 20px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: '-11px', left: '20px',
                    background: T.accent600, color: '#fff', fontSize: '10.5px', fontWeight: 700,
                    padding: '3px 10px', borderRadius: '20px', fontFamily: T.fontMono, letterSpacing: '0.04em',
                  }}>
                    জনপ্রিয়
                  </div>
                )}
                <div style={{
                  fontFamily: T.fontHead, fontSize: '18px', fontWeight: 600,
                  color: plan.highlight ? '#fff' : T.primary700, marginBottom: '4px',
                }}>
                  {plan.name}
                </div>
                <div style={{
                  fontSize: '12px', color: plan.highlight ? T.primary100 : T.textSecondary,
                  marginBottom: '18px', minHeight: '32px', lineHeight: 1.5,
                }}>
                  {plan.tagline}
                </div>
                <div style={{ marginBottom: '18px' }}>
                  <span style={{
                    fontFamily: T.fontHead, fontSize: '26px', fontWeight: 600,
                    color: plan.highlight ? '#fff' : T.textPrimary,
                  }}>
                    {formatTaka(minPaidPrice(plan))}
                  </span>
                  <span style={{ fontSize: '12px', color: plan.highlight ? T.primary300 : T.textMuted }}> /মাস থেকে</span>
                </div>
                <div style={{
                  fontSize: '12px', color: plan.highlight ? T.primary100 : T.textSecondary,
                  marginBottom: '20px', paddingBottom: '18px',
                  borderBottom: `1px solid ${plan.highlight ? 'rgba(255,255,255,0.15)' : T.borderDefault}`,
                }}>
                  {plan.maxCustomersLabel}
                </div>
                <button
                  onClick={() => { setMobileMenuOpen(false); navigate('/pricing') }}
                  style={{
                    marginTop: 'auto',
                    padding: '10px 16px',
                    background: plan.highlight ? '#fff' : 'transparent',
                    border: `1px solid ${plan.highlight ? '#fff' : T.primary700}`,
                    borderRadius: '8px',
                    color: plan.highlight ? T.primary900 : T.primary700,
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
                  }}
                >
                  বিস্তারিত দেখুন
                </button>
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', fontSize: '12.5px', color: T.textMuted, marginTop: '20px' }}>
          প্রতিটা প্ল্যানেই যত ইচ্ছা ইউজার যোগ করা যায় — রোল অনুযায়ী শুধু প্রতি-ইউজার রেটে বিল হয়
        </p>
      </section>

      {/* FAQ */}
      <section style={{ padding: '8px 24px 72px', maxWidth: '760px', margin: '0 auto' }}>
        <h2 style={{
          textAlign: 'center', fontFamily: T.fontHead, fontSize: '24px', fontWeight: 600,
          color: T.primary700, margin: '48px 0 8px',
        }}>
          সাধারণ জিজ্ঞাসা
        </h2>
        <p style={{ textAlign: 'center', color: T.textSecondary, fontSize: '14px', maxWidth: '480px', margin: '0 auto 32px' }}>
          প্রাইসিং সংক্রান্ত প্রশ্নের বিস্তারিত উত্তর পাবেন প্রাইসিং পেইজে
        </p>
        <div style={{ border: `1px solid ${T.borderDefault}`, borderRadius: '12px', background: T.bgSurface, overflow: 'hidden' }}>
          {landingFaq.map((item, i) => {
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

      {/* Stats */}
      <section style={{ padding: '8px 24px 64px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          background: T.primary900, borderRadius: '18px', padding: '40px 28px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '24px',
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: T.fontHead, fontSize: '32px', fontWeight: 600, color: T.accent300 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '12.5px', color: T.primary100, marginTop: '6px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* সাফল্যের গল্প — NovaTech BD */}
      <section style={{ padding: '8px 24px 72px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          background: T.primary900,
          borderRadius: '20px',
          padding: '40px 32px',
          color: '#fff',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px',
            background: 'rgba(255,255,255,0.08)', borderRadius: '20px', fontSize: '11px',
            fontFamily: T.fontMono, letterSpacing: '0.05em', color: T.accent300, marginBottom: '20px',
          }}>
            সাফল্যের গল্প
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '20px',
            marginBottom: '28px',
            paddingBottom: '28px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}>
            {caseStudyStats.map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: T.fontHead, fontSize: '28px', fontWeight: 600, color: T.accent300 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '12px', color: T.primary100, marginTop: '4px', lineHeight: 1.5 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '15px', lineHeight: 1.85, color: T.primary100, margin: '0 0 24px', maxWidth: '700px' }}>
            "ZovoriX ব্যবহার শুরু করার পর কাস্টমারদের সাথে যোগাযোগ ও অর্ডার ব্যবস্থাপনা অনেক সহজ হয়ে গেছে।
            আগে রিটেইলারদের বাকি টাকার হিসাব রাখতে খুব ঝামেলা হতো, বাকি আদায় করতে সরাসরি কাস্টমারের কাছে
            যেতে হতো — এখন পুরোটাই অ্যাপ থেকে মনিটর করা যায়। স্টোরেজ ও স্টক ম্যানেজমেন্ট সহজ হয়ে স্টক ফল্ট
            ২%-এরও কমে নেমে এসেছে, শপ ম্যানেজমেন্টও অনেক সহজ হয়ে গেছে। আগে যেসব ব্যবসায়িক ভুল হতো তা প্রায়
            শূন্যের কোঠায় নেমে এসেছে, কাগজের ব্যবহারও অনেকটাই কমেছে। রিটেইলার ও কাস্টমারদের মধ্যে আমাদের
            ব্র্যান্ডের প্রতি আস্থা বেড়েছে। SR, ASM ও RSM-দের ম্যানেজ করা এবং তাদের টাস্ক দেওয়া এখন অনেক সহজ —
            আমি এখন এক স্ক্রিন থেকেই পুরো ব্যবসা মনিটর করতে পারি, ব্যবসা কোন দিকে যাচ্ছে তার পাই-টু-পাই হিসাবও
            হাতের মুঠোয়।"
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: T.accent600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <img src={novatechLogo} alt="NovaTech BD" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>সান্তো হাওলাদার</div>
              <div style={{ fontSize: '12.5px', color: T.primary300 }}>মালিক ও সিইও, NovaTech BD — FMCG ব্র্যান্ড</div>
            </div>
          </div>
        </div>
      </section>

      {/* সাম্প্রতিক ব্লগ পোস্ট — নতুনগুলো constants/blogPosts.js-এর শুরুতে থাকে বলে প্রথম ৩টাই নেওয়া হলো */}
      <section style={{ padding: '8px 24px 72px', maxWidth: '1040px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '12px', margin: '48px 0 28px',
        }}>
          <div>
            <h2 style={{ fontFamily: T.fontHead, fontSize: '24px', fontWeight: 600, color: T.primary700, margin: '0 0 6px' }}>
              ব্লগ থেকে
            </h2>
            <p style={{ color: T.textSecondary, fontSize: '14px', margin: 0 }}>
              বিক্রয় বৃদ্ধি, টিম ম্যানেজমেন্ট ও অপারেশনস নিয়ে সাম্প্রতিক গাইড
            </p>
          </div>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/blog') }}
            style={{
              background: 'transparent', border: 'none', color: T.accent600,
              fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: T.fontBody,
              whiteSpace: 'nowrap',
            }}
          >
            সব পোস্ট দেখুন →
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
        }}>
          {BLOG_POSTS.slice(0, 3).map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>

      {/* Book a Demo — বড় ডিস্ট্রিবিউটরদের জন্য যারা সরাসরি টিমের সাথে কথা বলে সিদ্ধান্ত নিতে চান */}
      <section style={{ padding: '8px 24px 72px', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{
          background: T.bgSurface,
          border: `1px solid ${T.borderDefault}`,
          borderRadius: '18px',
          padding: '36px 28px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: T.fontHead, fontSize: '20px', fontWeight: 600,
            color: T.primary700, margin: '0 0 8px',
          }}>
            বড় টিমের জন্য ডেমো দরকার?
          </h2>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', maxWidth: '440px', margin: '0 auto 24px', lineHeight: 1.7 }}>
            আপনার ডিস্ট্রিবিউশন নেটওয়ার্ক বড় হলে, সাইনআপের আগে সরাসরি আমাদের টিমের সাথে কথা বলে
            আপনার প্রয়োজন অনুযায়ী একটা লাইভ ডেমো দেখে নিতে পারেন।
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href="https://wa.me/8801309540282?text=আমি%20ZovoriX-এর%20একটা%20ডেমো%20বুক%20করতে%20চাই"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '12px 22px',
                background: T.primary700,
                border: `1px solid ${T.primary700}`,
                borderRadius: '9px',
                color: '#fff',
                fontSize: '13.5px', fontWeight: 700,
                fontFamily: T.fontBody,
                textDecoration: 'none',
              }}
            >
              <FiMessageCircle /> হোয়াটসঅ্যাপে ডেমো বুক করুন
            </a>
            <a
              href="tel:+8801309540282"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '12px 22px',
                background: 'transparent',
                border: `1px solid ${T.borderStrong}`,
                borderRadius: '9px',
                color: T.primary700,
                fontSize: '13.5px', fontWeight: 700,
                fontFamily: T.fontBody,
                textDecoration: 'none',
              }}
            >
              <FiPhone /> +৮৮০ ১৩০৯-৫৪০২৮২
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        background: T.primary900,
        color: T.primary100,
        padding: '48px 24px 24px',
      }}>
        <div style={{
          maxWidth: '960px',
          margin: '0 auto',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '32px',
            paddingBottom: '32px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}>
            {/* ব্র্যান্ড */}
            <div>
              <div
                onClick={handleLogoTap}
                role="button"
                tabIndex={-1}
                aria-hidden="true"
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'default', userSelect: 'none' }}
              >
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={logo} alt="ZovoriX" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontFamily: T.fontHead, fontWeight: 600, fontSize: '16px', color: '#fff' }}>ZovoriX</span>
              </div>
              <p style={{ fontSize: '12.5px', lineHeight: 1.7, color: T.primary300, margin: 0, maxWidth: '240px' }}>
                বিক্রয়, টিম ও কাস্টমার ব্যবস্থাপনার সম্পূর্ণ প্ল্যাটফর্ম।
              </p>
            </div>

            {/* Contact */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>
                যোগাযোগ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="tel:+8801309540282" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiPhone style={{ fontSize: '14px', color: T.accent300 }} /> +880 1309-540282
                </a>
                <a href="mailto:support@zovorix.com" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMail style={{ fontSize: '14px', color: T.accent300 }} /> support@zovorix.com
                </a>
                <a href="https://wa.me/8801309540282" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.primary100, fontSize: '13px', textDecoration: 'none' }}>
                  <FiMessageCircle style={{ fontSize: '14px', color: T.accent300 }} /> হোয়াটসঅ্যাপে মেসেজ করুন
                </a>
              </div>
            </div>

            {/* Social */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>
                সোশ্যাল মিডিয়া
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {[
                  { icon: <FaFacebookF />,  href: 'https://www.facebook.com/profile.php?id=61591653097465&mibextid=ZbWKwL', label: 'Facebook' },
                  { icon: <FaXTwitter />,   href: 'https://x.com/Zovorix',              label: 'X' },
                  { icon: <FaInstagram />,  href: 'https://instagram.com/zovorix',       label: 'Instagram' },
                  { icon: <FaTiktok />,     href: 'https://tiktok.com/@zovorix.com',     label: 'TikTok' },
                  { icon: <FaDiscord />,    href: 'https://discord.gg/zovorix',          label: 'Discord' },
                  { icon: <FaRedditAlien />,href: 'https://reddit.com/u/zovorix',        label: 'Reddit' },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    title={s.label}
                    style={{
                      width: '32px', height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: T.primary100,
                      fontSize: '14px',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.accent600; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = T.primary100 }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Login */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>
                লগইন
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  ম্যানেজমেন্ট লগইন
                </button>
                <button onClick={() => { setMobileMenuOpen(false); navigate('/customer-login') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  রিটেইলার শপ লগইন
                </button>
                <button onClick={() => navigate('/apply/sr')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  SR হিসেবে আবেদন করুন
                </button>
              </div>
            </div>

            {/* Company */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.primary300, marginBottom: '14px', fontFamily: T.fontMono }}>
                কোম্পানি
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => { setMobileMenuOpen(false); navigate('/pricing') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  প্রাইসিং
                </button>
                <button onClick={() => { setMobileMenuOpen(false); navigate('/about') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  আমাদের সম্পর্কে
                </button>
                <button onClick={() => { setMobileMenuOpen(false); navigate('/contact') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  যোগাযোগ
                </button>
                <button onClick={() => { setMobileMenuOpen(false); navigate('/blog') }} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  ব্লগ
                </button>
                <button onClick={() => navigate('/privacy-policy')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  প্রাইভেসি পলিসি
                </button>
                <button onClick={() => navigate('/terms-conditions')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.primary100, fontSize: '13px', cursor: 'pointer', fontFamily: T.fontBody }}>
                  শর্তাবলী
                </button>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '20px',
          }}>
            <div style={{ fontSize: '12px', color: T.primary300 }}>
              © {new Date().getFullYear()} ZovoriX। সর্বস্বত্ব সংরক্ষিত।
            </div>
          </div>
        </div>
      </footer>

      {/* স্টিকি ফ্লোটিং CTA — হিরো পার হয়ে গেলে দেখা যাবে, ট্রায়াল বাটন সবসময় হাতের কাছে রাখতে */}
      <style>{`
        @keyframes zx-fab-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .zx-floating-cta {
          animation: zx-fab-in 0.25s ease-out;
        }
        @media (max-width: 640px) {
          .zx-floating-cta {
            left: 16px !important;
            right: 16px !important;
            bottom: 16px !important;
            width: auto !important;
          }
          .zx-floating-cta button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
      {showFloatingCta && (
        <div className="zx-floating-cta" style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 200,
        }}>
          <button
            onClick={() => navigate('/start-trial')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '13px 22px',
              background: T.primary700,
              border: `1px solid ${T.primary700}`,
              borderRadius: '999px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: T.fontBody,
              boxShadow: '0 10px 28px rgba(15,27,46,0.28)',
              transition: 'background 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.primary900; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = T.primary700; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            ৩ মাসের ফ্রি ট্রায়াল শুরু করুন
          </button>
        </div>
      )}
    </div>
  )
}
