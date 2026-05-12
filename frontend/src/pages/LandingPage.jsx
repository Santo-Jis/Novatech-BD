// frontend/src/pages/LandingPage.jsx
// NovaTech BD — Professional Landing Page
// Theme: Navy Blue + White | Language: বাংলা + English

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Animated Counter ──────────────────────────────────────────
function Counter({ target, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true) },
      { threshold: 0.5 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    let frame
    const start = performance.now()
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(target * ease))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [started, target, duration])

  return <span ref={ref}>{count}{suffix}</span>
}

// ── Scroll Reveal Hook ────────────────────────────────────────
function useReveal() {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, visible]
}

// ── Data ──────────────────────────────────────────────────────
const features = [
  { icon: '📍', title: 'লাইভ GPS ট্র্যাকিং', en: 'Live GPS Tracking', desc: 'মাঠে কর্মীরা কোথায় আছে রিয়েলটাইমে দেখুন। রুট অনুসরণ, চেক-ইন ও ট্রেইল হিস্ট্রি সব এক জায়গায়।' },
  { icon: '🛒', title: 'স্মার্ট অর্ডার ম্যানেজমেন্ট', en: 'Smart Order Management', desc: 'SR-এর মাধ্যমে কাস্টমারের অর্ডার নিন, ট্র্যাক করুন এবং ডেলিভারি নিশ্চিত করুন সহজেই।' },
  { icon: '💳', title: 'ক্রেডিট ও বাকি ব্যবস্থাপনা', en: 'Credit Management', desc: 'কাস্টমারের বাকি, ক্রেডিট লিমিট এবং পেমেন্ট রিমাইন্ডার স্বয়ংক্রিয়ভাবে পরিচালনা করুন।' },
  { icon: '📊', title: 'AI-চালিত বিশ্লেষণ', en: 'AI-Powered Analytics', desc: 'বিক্রয় প্রবণতা, কর্মীর পারফরম্যান্স এবং ব্যবসার অন্তর্দৃষ্টি AI দিয়ে বিশ্লেষণ করুন।' },
  { icon: '👥', title: 'কাস্টমার পোর্টাল', en: 'Customer Portal', desc: 'কাস্টমাররা WhatsApp লিংকে ক্লিক করে নিজের ইনভয়েস, বাকি ও অর্ডার দেখতে পারবেন।' },
  { icon: '💰', title: 'বেতন ও কমিশন', en: 'Salary & Commission', desc: 'কর্মীদের বেতন, কমিশন এবং বোনাস স্বয়ংক্রিয়ভাবে হিসাব করুন এবং পরিশোধ করুন।' },
  { icon: '📱', title: 'অফলাইন সাপোর্ট', en: 'Offline Support', desc: 'ইন্টারনেট না থাকলেও কাজ চালিয়ে যান। অনলাইন হলে ডেটা স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।' },
  { icon: '🔔', title: 'পুশ নোটিফিকেশন', en: 'Push Notifications', desc: 'ক্রেডিট রিমাইন্ডার, অর্ডার আপডেট ও নোটিশ সরাসরি মোবাইলে পাঠান।' },
]

const whyUs = [
  { icon: '🚀', title: 'দ্রুত সেটআপ', desc: '২৪ ঘণ্টার মধ্যে আপনার টিম ব্যবহার শুরু করতে পারবে। কোনো ইনস্টলেশন লাগে না।' },
  { icon: '🔒', title: 'সম্পূর্ণ নিরাপদ', desc: 'এন্ড-টু-এন্ড এনক্রিপশন, রোল-বেসড অ্যাক্সেস কন্ট্রোল এবং নিয়মিত ব্যাকআপ।' },
  { icon: '📱', title: 'মোবাইল-ফার্স্ট', desc: 'Android APK এবং PWA — যেকোনো ডিভাইসে কাজ করে, দামি হার্ডওয়্যার লাগে না।' },
  { icon: '🇧🇩', title: 'বাংলাদেশের জন্য', desc: 'বাংলা ভাষা, বাংলাদেশি ব্যবসার ধরন এবং স্থানীয় সাপোর্ট টিম।' },
  { icon: '💡', title: 'AI সহায়তা', desc: 'Gemini AI দিয়ে ব্যবসার প্রশ্নের উত্তর পান, রিপোর্ট বিশ্লেষণ করুন।' },
  { icon: '🤝', title: 'ডেডিকেটেড সাপোর্ট', desc: '৭ দিন, ২৪ ঘণ্টা WhatsApp সাপোর্ট। আপনার সমস্যা আমাদের সমস্যা।' },
]

const testimonials = [
  { name: 'রাশেদুল ইসলাম', company: 'মেসার্স রাশেদ ট্রেডার্স, ঢাকা', avatar: 'রা', text: 'NovaTech BD ব্যবহার করার পর আমার SR-দের উপর নজর রাখা অনেক সহজ হয়েছে। কাস্টমারের বাকি ট্র্যাক করা এখন মিনিটের কাজ।', rating: 5 },
  { name: 'মো. সাইফুল হক', company: 'হক ডিস্ট্রিবিউটর্স, চট্টগ্রাম', avatar: 'স', text: 'আগে Excel-এ সব হিসাব রাখতাম, অনেক সময় নষ্ট হতো। এখন সব ডিজিটাল, রিপোর্ট এক ক্লিকে পাই।', rating: 5 },
  { name: 'নাসরিন বেগম', company: 'নাসরিন এন্টারপ্রাইজ, সিলেট', avatar: 'না', text: 'কাস্টমার পোর্টালটা অসাধারণ! আমার কাস্টমাররা WhatsApp লিংকে ক্লিক করেই তাদের বাকি দেখতে পারে।', rating: 5 },
]

const screenshots = [
  { label: 'Admin Dashboard', emoji: '📊', desc: 'সম্পূর্ণ ব্যবসার চিত্র এক পেজে' },
  { label: 'SR Mobile App', emoji: '📱', desc: 'মাঠের SR-এর জন্য সহজ ইন্টারফেস' },
  { label: 'Customer Portal', emoji: '🏪', desc: 'কাস্টমারের নিজস্ব পোর্টাল' },
  { label: 'Live Tracking', emoji: '🗺️', desc: 'রিয়েলটাইম GPS মানচিত্র' },
]

// ── Main Component ────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  const [heroRef, heroVisible] = useReveal()
  const [featRef, featVisible] = useReveal()
  const [whyRef, whyVisible]   = useReveal()
  const [testRef, testVisible] = useReveal()
  const [aboutRef, aboutVisible] = useReveal()
  const [contactRef, contactVisible] = useReveal()

  return (
    <div style={{ fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif", color: '#1e293b', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #0f2557;
          --blue: #1a56db;
          --sky: #3b82f6;
          --light: #eff6ff;
          --white: #ffffff;
          --gray: #64748b;
          --border: #e2e8f0;
        }

        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: var(--blue); border-radius: 3px; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-12px); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes gradient-shift {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes slide-in {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }

        .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        .btn-primary {
          background: linear-gradient(135deg, #1a56db, #1d4ed8);
          color: white; border: none; border-radius: 14px;
          padding: 14px 32px; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 8px 24px rgba(26,86,219,0.35);
          transition: all 0.25s;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(26,86,219,0.45); }
        .btn-primary:active { transform: translateY(0); }

        .btn-outline {
          background: transparent;
          color: var(--blue); border: 2px solid var(--blue);
          border-radius: 14px; padding: 12px 28px;
          font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: all 0.25s;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-outline:hover { background: var(--blue); color: white; transform: translateY(-2px); }

        .card {
          background: white; border-radius: 20px;
          border: 1px solid var(--border);
          padding: 28px 24px;
          box-shadow: 0 2px 16px rgba(15,37,87,0.06);
          transition: all 0.3s;
        }
        .card:hover { transform: translateY(-6px); box-shadow: 0 16px 48px rgba(15,37,87,0.12); border-color: #bfdbfe; }

        .section-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(28px, 5vw, 42px);
          font-weight: 800; color: var(--navy);
          line-height: 1.2;
        }
        .section-sub {
          font-size: 17px; color: var(--gray);
          line-height: 1.7; margin-top: 12px;
        }
        .badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--light); color: var(--blue);
          border: 1px solid #bfdbfe;
          border-radius: 999px; padding: 6px 16px;
          font-size: 13px; font-weight: 700;
          letter-spacing: 0.03em;
        }
        .star { color: #f59e0b; font-size: 16px; }
        .nav-link {
          color: #334155; font-size: 14px; font-weight: 600;
          text-decoration: none; cursor: pointer;
          padding: 6px 4px;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .nav-link:hover { color: var(--blue); border-color: var(--blue); }

        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-3 { grid-template-columns: 1fr !important; }
          .grid-4 { grid-template-columns: 1fr 1fr !important; }
          .hero-btns { flex-direction: column !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>

      {/* ══════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(255,255,255,0.97)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid #e2e8f0' : 'none',
        boxShadow: scrolled ? '0 4px 24px rgba(15,37,87,0.08)' : 'none',
        transition: 'all 0.3s',
        padding: '0 24px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #0f2557, #1a56db)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontFamily: 'Syne', fontWeight: 800, fontSize: 16,
              boxShadow: '0 4px 16px rgba(26,86,219,0.3)',
            }}>NT</div>
            <div>
              <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: '#0f2557', lineHeight: 1 }}>NovaTech BD</p>
              <p style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>MANAGEMENT SYSTEM</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {[['features','ফিচারসমূহ'],['why','কেন আমরা'],['about','আমাদের সম্পর্কে'],['testimonials','মতামত'],['contact','যোগাযোগ']].map(([id, label]) => (
              <span key={id} className="nav-link" onClick={() => scrollTo(id)}>{label}</span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-outline hide-mobile" style={{ padding: '10px 20px', fontSize: 14 }} onClick={() => navigate('/login')}>
              লগইন করুন
            </button>
            <button className="btn-primary hide-mobile" style={{ padding: '10px 20px', fontSize: 14 }} onClick={() => scrollTo('contact')}>
              ডেমো দেখুন →
            </button>
            {/* Mobile hamburger */}
            <button className="show-mobile" onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#0f2557' }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div style={{
            position: 'fixed', top: 72, left: 0, right: 0, bottom: 0,
            background: 'white', zIndex: 99,
            padding: 24, display: 'flex', flexDirection: 'column', gap: 8,
            animation: 'slide-in 0.3s ease',
          }}>
            {[['features','ফিচারসমূহ'],['why','কেন আমরা'],['about','আমাদের সম্পর্কে'],['testimonials','মতামত'],['contact','যোগাযোগ']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} style={{
                background: 'none', border: 'none', textAlign: 'left',
                fontSize: 18, fontWeight: 700, color: '#0f2557', padding: '14px 0',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
            ))}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn-outline" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/login')}>লগইন করুন</button>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => scrollTo('contact')}>ডেমো দেখুন →</button>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════════ */}
      <section style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0f2557 0%, #1a56db 60%, #1d4ed8 100%)',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center',
        paddingTop: 72,
      }}>
        {/* Background decorations */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -150, left: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '20%', left: '60%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(96,165,250,0.1)', pointerEvents: 'none', animation: 'float 6s ease-in-out infinite' }} />

        {/* Grid pattern */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}
            className="grid-2">

            {/* Left */}
            <div ref={heroRef} style={{ animation: 'fadeUp 0.8s ease forwards' }}>
              <div className="badge" style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', marginBottom: 24 }}>
                🇧🇩 বাংলাদেশের #১ ফিল্ড সেলস ম্যানেজমেন্ট SaaS
              </div>

              <h1 style={{
                fontFamily: 'Syne', fontWeight: 800, color: 'white',
                fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1.15, marginBottom: 20,
              }}>
                আপনার ব্যবসা<br />
                <span style={{
                  background: 'linear-gradient(90deg, #93c5fd, #bfdbfe, #60a5fa)',
                  backgroundSize: '200%',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 3s linear infinite',
                }}>ডিজিটাল করুন</span><br />
                আজই
              </h1>

              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, lineHeight: 1.8, marginBottom: 36, maxWidth: 500 }}>
                SR ট্র্যাকিং, অর্ডার ম্যানেজমেন্ট, কাস্টমার পোর্টাল এবং AI বিশ্লেষণ — সব এক প্ল্যাটফর্মে। বাংলাদেশের ডিস্ট্রিবিউশন ব্যবসার জন্য তৈরি।
              </p>

              <div className="hero-btns" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{
                  background: 'white', color: '#1a56db',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  fontSize: 16, padding: '16px 36px',
                }} onClick={() => scrollTo('contact')}>
                  ফ্রি ডেমো বুক করুন →
                </button>
                <button className="btn-outline" style={{
                  color: 'white', borderColor: 'rgba(255,255,255,0.4)',
                  fontSize: 16, padding: '16px 36px',
                }} onClick={() => navigate('/login')}>
                  লগইন করুন
                </button>
              </div>

              {/* Trust badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 40, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#fbbf24', fontSize: 18 }}>★★★★★</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>৫০০+ ব্যবহারকারী</span>
                </div>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>🔒 ডেটা সম্পূর্ণ নিরাপদ</span>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>📱 Android ও PWA</span>
              </div>
            </div>

            {/* Right — Mock Dashboard */}
            <div className="hide-mobile" style={{ animation: 'fadeUp 0.8s ease 0.2s backwards', position: 'relative' }}>
              <div style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 24, padding: 24,
                boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
                animation: 'float 5s ease-in-out infinite',
              }}>
                {/* Mock header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.1em' }}>আজকের সারসংক্ষেপ</p>
                    <p style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Admin Dashboard</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
                  </div>
                </div>

                {/* Mock stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'মোট বিক্রয়', value: '৳৪,৮২,৩৫০', color: '#22c55e', icon: '💰' },
                    { label: 'সক্রিয় SR', value: '২৪ জন', color: '#60a5fa', icon: '👥' },
                    { label: 'মোট অর্ডার', value: '১৮৬টি', color: '#f59e0b', icon: '🛒' },
                    { label: 'বাকি আদায়', value: '৳৯২,৪০০', color: '#a78bfa', icon: '💳' },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.08)', borderRadius: 14,
                      padding: '14px 16px', border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>{s.icon} {s.label}</p>
                      <p style={{ color: s.color, fontWeight: 800, fontSize: 17, fontFamily: 'monospace' }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Mock bar chart */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 10 }}>সাপ্তাহিক বিক্রয়</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 60 }}>
                    {[45,70,55,85,65,90,75].map((h, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: '100%', height: `${h}%`,
                          background: i === 5 ? 'linear-gradient(#60a5fa, #3b82f6)' : 'rgba(255,255,255,0.15)',
                          borderRadius: 6,
                        }} />
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
                          {['রবি','সোম','মঙ্গ','বুধ','বৃহ','শুক্র','শনি'][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live tracking badge */}
                <div style={{
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 12, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e',
                      animation: 'pulse-ring 1.5s ease infinite',
                    }} />
                  </div>
                  <span style={{ color: '#86efac', fontSize: 13, fontWeight: 600 }}>১৮ জন SR এখন মাঠে সক্রিয়</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, lineHeight: 0 }}>
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 80L1440 80L1440 40C1200 80 960 0 720 20C480 40 240 80 0 40L0 80Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATS
      ══════════════════════════════════════════ */}
      <section style={{ background: 'white', padding: '60px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { value: 500, suffix: '+', label: 'সক্রিয় ব্যবহারকারী', icon: '👥' },
              { value: 50, suffix: '+', label: 'কোম্পানি ব্যবহার করছে', icon: '🏢' },
              { value: 99, suffix: '%', label: 'আপটাইম গ্যারান্টি', icon: '⚡' },
              { value: 24, suffix: '/৭', label: 'সাপোর্ট সার্ভিস', icon: '🤝' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{s.icon}</div>
                <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 40, color: '#1a56db', lineHeight: 1 }}>
                  <Counter target={s.value} suffix={s.suffix} />
                </p>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════ */}
      <section id="features" style={{ background: '#f8fafc', padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div ref={featRef} className={`reveal ${featVisible ? 'visible' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span className="badge">✨ ফিচারসমূহ</span>
            <h2 className="section-title" style={{ marginTop: 16 }}>যা যা পাচ্ছেন এক প্ল্যাটফর্মে</h2>
            <p className="section-sub" style={{ maxWidth: 600, margin: '12px auto 0' }}>
              ছোট থেকে বড় — যেকোনো ডিস্ট্রিবিউশন ব্যবসার জন্য সম্পূর্ণ ডিজিটাল সমাধান
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}
            className="grid-4">
            {features.map((f, i) => (
              <div key={i} className="card" style={{
                animationDelay: `${i * 80}ms`,
                opacity: featVisible ? 1 : 0,
                transform: featVisible ? 'translateY(0)' : 'translateY(30px)',
                transition: `all 0.5s ease ${i * 80}ms`,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, marginBottom: 16,
                }}>{f.icon}</div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0f2557', marginBottom: 4 }}>{f.title}</p>
                <p style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em' }}>{f.en}</p>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SCREENSHOT / DEMO
      ══════════════════════════════════════════ */}
      <section id="demo" style={{ background: 'white', padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="badge">🖥️ স্ক্রিনশট</span>
            <h2 className="section-title" style={{ marginTop: 16 }}>দেখুন কেমন দেখতে</h2>
            <p className="section-sub">সহজ, সুন্দর এবং দ্রুত ইন্টারফেস</p>
          </div>

          {/* Tab buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 40, flexWrap: 'wrap' }}>
            {screenshots.map((s, i) => (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                padding: '10px 20px', borderRadius: 12, border: 'none',
                background: activeTab === i ? '#1a56db' : '#f1f5f9',
                color: activeTab === i ? 'white' : '#64748b',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.2s',
                boxShadow: activeTab === i ? '0 4px 16px rgba(26,86,219,0.3)' : 'none',
              }}>{s.emoji} {s.label}</button>
            ))}
          </div>

          {/* Mock screen */}
          <div style={{
            maxWidth: 800, margin: '0 auto',
            background: 'linear-gradient(160deg, #0f2557, #1a56db)',
            borderRadius: 24, padding: 3,
            boxShadow: '0 32px 80px rgba(15,37,87,0.25)',
          }}>
            <div style={{
              background: '#f8fafc', borderRadius: 22,
              padding: 32, minHeight: 360,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 20,
            }}>
              <div style={{ fontSize: 80 }}>{screenshots[activeTab].emoji}</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: '#0f2557' }}>{screenshots[activeTab].label}</p>
                <p style={{ color: '#64748b', fontSize: 16, marginTop: 8 }}>{screenshots[activeTab].desc}</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {[1,2,3].map(j => (
                  <div key={j} style={{
                    width: 140, height: 80, borderRadius: 12,
                    background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
                    border: '1px solid #bfdbfe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28,
                  }}>{['📊','📈','📋'][j-1]}</div>
                ))}
              </div>
              <button className="btn-primary" onClick={() => scrollTo('contact')}>
                ফুল ডেমো দেখতে যোগাযোগ করুন →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          WHY US
      ══════════════════════════════════════════ */}
      <section id="why" style={{ background: 'linear-gradient(160deg, #0f2557 0%, #1e3a8a 100%)', padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(96,165,250,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(167,139,250,0.08) 0%, transparent 50%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div ref={whyRef} className={`reveal ${whyVisible ? 'visible' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>💎 কেন আমরা</span>
            <h2 className="section-title" style={{ marginTop: 16, color: 'white' }}>কেন NovaTech BD বেছে নেবেন?</h2>
            <p className="section-sub" style={{ color: 'rgba(255,255,255,0.65)', maxWidth: 600, margin: '12px auto 0' }}>
              বাজারে অনেক সফটওয়্যার আছে — কিন্তু বাংলাদেশের ব্যবসার মতো করে বোঝে শুধু আমরা
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }} className="grid-3">
            {whyUs.map((w, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 20, padding: '28px 24px',
                backdropFilter: 'blur(10px)',
                opacity: whyVisible ? 1 : 0,
                transform: whyVisible ? 'translateY(0)' : 'translateY(30px)',
                transition: `all 0.5s ease ${i * 100}ms`,
                cursor: 'default',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(96,165,250,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
              >
                <div style={{ fontSize: 36, marginBottom: 16 }}>{w.icon}</div>
                <p style={{ fontWeight: 700, fontSize: 17, color: 'white', marginBottom: 10 }}>{w.title}</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75 }}>{w.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA banner */}
          <div style={{
            marginTop: 60,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24, padding: '40px 32px',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, color: 'white', marginBottom: 12 }}>
              আজই শুরু করুন — প্রথম মাস বিনামূল্যে!
            </p>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, marginBottom: 28 }}>
              কোনো ক্রেডিট কার্ড লাগবে না। সেটআপ ফ্রি। বাতিল করতে পারবেন যেকোনো সময়।
            </p>
            <button className="btn-primary" style={{
              background: 'white', color: '#1a56db',
              fontSize: 16, padding: '16px 40px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }} onClick={() => scrollTo('contact')}>
              ফ্রি ট্রায়াল শুরু করুন →
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════ */}
      <section id="testimonials" style={{ background: '#f8fafc', padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div ref={testRef} className={`reveal ${testVisible ? 'visible' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span className="badge">💬 গ্রাহকদের মতামত</span>
            <h2 className="section-title" style={{ marginTop: 16 }}>তারা যা বলছেন</h2>
            <p className="section-sub">আমাদের ব্যবহারকারীরাই আমাদের সেরা পরিচয়</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }} className="grid-3">
            {testimonials.map((t, i) => (
              <div key={i} className="card" style={{
                opacity: testVisible ? 1 : 0,
                transform: testVisible ? 'translateY(0)' : 'translateY(30px)',
                transition: `all 0.5s ease ${i * 150}ms`,
                position: 'relative',
              }}>
                <div style={{ fontSize: 40, color: '#dbeafe', fontFamily: 'Georgia', lineHeight: 1, marginBottom: 16 }}>"</div>
                <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 24 }}>{t.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1a56db, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 700, fontSize: 18,
                  }}>{t.avatar}</div>
                  <div>
                    <p style={{ fontWeight: 700, color: '#0f2557', fontSize: 15 }}>{t.name}</p>
                    <p style={{ color: '#64748b', fontSize: 12 }}>{t.company}</p>
                  </div>
                </div>
                <div style={{ position: 'absolute', top: 24, right: 24 }}>
                  {'★'.repeat(t.rating).split('').map((s, j) => <span key={j} className="star">{s}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ABOUT
      ══════════════════════════════════════════ */}
      <section id="about" style={{ background: 'white', padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }} className="grid-2">
            {/* Left */}
            <div ref={aboutRef} className={`reveal ${aboutVisible ? 'visible' : ''}`}>
              <span className="badge">🏢 আমাদের সম্পর্কে</span>
              <h2 className="section-title" style={{ marginTop: 16 }}>বাংলাদেশের ব্যবসার জন্য তৈরি</h2>
              <p className="section-sub">
                NovaTech BD বাংলাদেশের ডিস্ট্রিবিউশন ও ফিল্ড সেলস কোম্পানিগুলোর জন্য একটি সম্পূর্ণ ডিজিটাল ম্যানেজমেন্ট প্ল্যাটফর্ম।
              </p>
              <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.8, marginTop: 16 }}>
                আমরা বিশ্বাস করি প্রযুক্তি ব্যবহার করে বাংলাদেশের ছোট-বড় সব ব্যবসা আরো দক্ষ ও লাভজনক হতে পারে। আমাদের সফটওয়্যার সম্পূর্ণ বাংলায়, বাংলাদেশি ব্যবসার চাহিদা মাথায় রেখে তৈরি।
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
                {[
                  '✅ বাংলাদেশে তৈরি, বাংলাদেশের জন্য',
                  '✅ ক্লাউড-ভিত্তিক — যেকোনো জায়গা থেকে অ্যাক্সেস',
                  '✅ Android APK + PWA সাপোর্ট',
                  '✅ ডেডিকেটেড বাংলা সাপোর্ট টিম',
                ].map((item, i) => (
                  <p key={i} style={{ fontSize: 15, color: '#334155', fontWeight: 500 }}>{item}</p>
                ))}
              </div>
            </div>

            {/* Right — visual */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { icon: '🎯', title: 'আমাদের লক্ষ্য', text: 'বাংলাদেশের প্রতিটি ব্যবসাকে ডিজিটাল করা' },
                { icon: '💡', title: 'আমাদের দর্শন', text: 'সহজ প্রযুক্তি, বড় পরিবর্তন' },
                { icon: '🤝', title: 'আমাদের প্রতিশ্রুতি', text: 'আপনার সাফল্যই আমাদের সাফল্য' },
                { icon: '🌟', title: 'আমাদের অভিজ্ঞতা', text: '৫+ বছর ফিল্ড সেলস সফটওয়্যারে' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: i % 2 === 0 ? '#eff6ff' : 'linear-gradient(135deg, #0f2557, #1a56db)',
                  borderRadius: 20, padding: '24px 20px',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: i % 2 === 0 ? '#0f2557' : 'white', marginBottom: 8 }}>{item.title}</p>
                  <p style={{ fontSize: 13, color: i % 2 === 0 ? '#64748b' : 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CONTACT
      ══════════════════════════════════════════ */}
      <section id="contact" style={{ background: '#f8fafc', padding: '100px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div ref={contactRef} className={`reveal ${contactVisible ? 'visible' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="badge">📞 যোগাযোগ</span>
            <h2 className="section-title" style={{ marginTop: 16 }}>আজই শুরু করুন</h2>
            <p className="section-sub">ফ্রি ডেমো বুক করুন — আমরা ২৪ ঘণ্টার মধ্যে যোগাযোগ করব</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }} className="grid-2">
            {/* Form */}
            <div className="card" style={{ padding: 36 }}>
              <h3 style={{ fontWeight: 700, fontSize: 20, color: '#0f2557', marginBottom: 24 }}>ডেমো রিকোয়েস্ট করুন</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'আপনার নাম', placeholder: 'মো. রাশেদুল ইসলাম', type: 'text' },
                  { label: 'ফোন নম্বর', placeholder: '০১৭XXXXXXXX', type: 'tel' },
                  { label: 'কোম্পানির নাম', placeholder: 'মেসার্স রাশেদ ট্রেডার্স', type: 'text' },
                  { label: 'ইমেইল (ঐচ্ছিক)', placeholder: 'example@gmail.com', type: 'email' },
                ].map((f, i) => (
                  <div key={i}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder} style={{
                      width: '100%', padding: '12px 16px', borderRadius: 12,
                      border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit',
                      outline: 'none', transition: 'border-color 0.2s', color: '#1e293b',
                    }}
                    onFocus={e => e.target.style.borderColor = '#1a56db'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                  </div>
                ))}
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '14px' }}
                  onClick={() => alert('ধন্যবাদ! আমরা শীঘ্রই যোগাযোগ করব।')}>
                  ডেমো বুক করুন →
                </button>
              </div>
            </div>

            {/* Contact info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h3 style={{ fontWeight: 700, fontSize: 20, color: '#0f2557' }}>সরাসরি যোগাযোগ</h3>
              {[
                { icon: '📱', label: 'WhatsApp / ফোন', value: '+880 1XXXXXXXXX', link: 'https://wa.me/880' },
                { icon: '✉️', label: 'ইমেইল', value: 'info@novatechbd.com', link: 'mailto:info@novatechbd.com' },
                { icon: '📍', label: 'ঠিকানা', value: 'ঢাকা, বাংলাদেশ', link: null },
                { icon: '⏰', label: 'সাপোর্ট সময়', value: '৭ দিন, সকাল ৯টা – রাত ১০টা', link: null },
              ].map((c, i) => (
                <div key={i} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: '#eff6ff', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 22, flexShrink: 0,
                  }}>{c.icon}</div>
                  <div>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{c.label}</p>
                    {c.link
                      ? <a href={c.link} style={{ fontWeight: 700, color: '#1a56db', fontSize: 15, textDecoration: 'none' }}>{c.value}</a>
                      : <p style={{ fontWeight: 700, color: '#0f2557', fontSize: 15 }}>{c.value}</p>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer style={{ background: '#0f2557', color: 'white', padding: '60px 24px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 48, marginBottom: 48 }} className="grid-3">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: 'rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Syne', fontWeight: 800, fontSize: 16,
                }}>NT</div>
                <div>
                  <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16 }}>NovaTech BD</p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>MANAGEMENT SYSTEM</p>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.8, maxWidth: 300 }}>
                বাংলাদেশের ডিস্ট্রিবিউশন ও ফিল্ড সেলস ব্যবসার জন্য সম্পূর্ণ ডিজিটাল ম্যানেজমেন্ট সমাধান।
              </p>
            </div>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 16, color: 'rgba(255,255,255,0.8)' }}>Quick Links</p>
              {[['features','ফিচারসমূহ'],['why','কেন আমরা'],['about','আমাদের সম্পর্কে'],['contact','যোগাযোগ']].map(([id, label]) => (
                <p key={id} onClick={() => scrollTo(id)} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 10, cursor: 'pointer', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = 'white'}
                  onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.5)'}
                >{label}</p>
              ))}
            </div>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 16, color: 'rgba(255,255,255,0.8)' }}>লগইন করুন</p>
              {[['Admin','অ্যাডমিন'],['Manager','ম্যানেজার'],['SR/Worker','কর্মী']].map(([en, bn]) => (
                <p key={en} onClick={() => navigate('/login')} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 10, cursor: 'pointer', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = 'white'}
                  onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.5)'}
                >{bn} লগইন</p>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>© ২০২৬ NovaTech BD। সর্বস্বত্ব সংরক্ষিত।</p>
            <button className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={() => navigate('/login')}>
              লগইন করুন →
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
