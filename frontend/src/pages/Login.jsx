import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { FiEye, FiEyeOff, FiLock, FiMail, FiPhone, FiHash, FiArrowLeft, FiCheck } from 'react-icons/fi'
import axios from '../api/axios'

/* ─────────────────────────────────────────
   Typing Effect Hook
───────────────────────────────────────── */
const useTypingEffect = (text, speed = 70, delay = 0) => {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    const start = setTimeout(() => {
      let i = 0
      const interval = setInterval(() => {
        if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++ }
        else { setDone(true); clearInterval(interval) }
      }, speed)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(start)
  }, [text, speed, delay])
  return { displayed, done }
}

const LOGIN_TYPES = [
  { id: 'email', label: 'ইমেইল',     icon: FiMail,  placeholder: 'ইমেইল লিখুন',      type: 'email' },
  { id: 'phone', label: 'ফোন',       icon: FiPhone, placeholder: 'ফোন নম্বর লিখুন', type: 'tel'   },
  { id: 'code',  label: 'কর্মী কোড', icon: FiHash,  placeholder: 'কর্মী কোড লিখুন', type: 'text'  },
]

/* ─────────────────────────────────────────
   NT Logo SVG Component
───────────────────────────────────────── */
function NTLogo({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Orbit ring */}
      <ellipse cx="50" cy="50" rx="46" ry="22" stroke="#4ade80" strokeWidth="2.5" fill="none"
        strokeDasharray="4 3" opacity="0.7"
        style={{ transformOrigin: '50px 50px', animation: 'spin 8s linear infinite' }} />
      <ellipse cx="50" cy="50" rx="46" ry="22" stroke="#22c55e" strokeWidth="1" fill="none"
        style={{ transformOrigin: '50px 50px', animation: 'spin 8s linear infinite', transform: 'rotate(-15deg)' }} />
      {/* NT Letters */}
      <text x="50" y="62" textAnchor="middle" fontFamily="'Georgia', serif" fontSize="38"
        fontWeight="bold" fill="white" letterSpacing="-1">NT</text>
    </svg>
  )
}

/* ─────────────────────────────────────────
   Particle Background
───────────────────────────────────────── */
function Particles() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 4,
    duration: Math.random() * 6 + 6,
  }))
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: '#4ade80',
          opacity: 0.25,
          animation: `float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────
   Main Login Component
───────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate()
  const { login, user, loading } = useAuthStore()

  const [activeTab,  setActiveTab]  = useState('email')
  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loginError, setLoginError] = useState('')

  const [step,        setStep]        = useState('login')
  const [fpEmail,     setFpEmail]     = useState('')
  const [otp,         setOtp]         = useState(['','','','','',''])
  const [resetToken,  setResetToken]  = useState('')
  const [newPass,     setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [fpLoading,   setFpLoading]   = useState(false)
  const [fpError,     setFpError]     = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [mounted,     setMounted]     = useState(false)

  const bismillah = useTypingEffect('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم', 55, 600)
  const salam     = useTypingEffect('আসসালামু আলাইকুম', 75, bismillah.done ? 200 : 4000)

  useEffect(() => { setTimeout(() => setMounted(true), 100) }, [])
  useEffect(() => { if (user) redirectByRole(user.role) }, [user])
  useEffect(() => { setIdentifier(''); setLoginError('') }, [activeTab])
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const redirectByRole = (role) => {
    const map = { admin: '/admin/dashboard', manager: '/manager/dashboard', supervisor: '/manager/dashboard', asm: '/manager/dashboard', rsm: '/manager/dashboard', accountant: '/manager/dashboard', worker: '/worker/dashboard' }
    navigate(map[role] || '/', { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoginError('')
    if (!identifier || !password) return
    const result = await login(identifier.trim(), password)
    if (result.success) redirectByRole(result.user.role)
    else setLoginError(result.message || 'লগইন ব্যর্থ হয়েছে।')
  }

  const handleForgotSubmit = async () => {
    setFpError('')
    if (!fpEmail) return setFpError('ইমেইল দিন।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/forgot-password', { email: fpEmail })
      if (res.data.success) { setStep('otp'); setResendTimer(60) }
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে, আবার চেষ্টা করুন।') }
    setFpLoading(false)
  }

  const handleOtpSubmit = async () => {
    setFpError('')
    const otpStr = otp.join('')
    if (otpStr.length < 6) return setFpError('৬ সংখ্যার OTP দিন।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/verify-otp', { email: fpEmail, otp: otpStr })
      if (res.data.success) { setResetToken(res.data.data.reset_token); setStep('newpass') }
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে।') }
    setFpLoading(false)
  }

  const handleNewPassSubmit = async () => {
    setFpError('')
    if (!newPass || !confirmPass) return setFpError('সব ঘর পূরণ করুন।')
    if (newPass.length < 6) return setFpError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর।')
    if (newPass !== confirmPass) return setFpError('পাসওয়ার্ড মিলছে না।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/reset-password', { email: fpEmail, reset_token: resetToken, new_password: newPass })
      if (res.data.success) setStep('done')
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে।') }
    setFpLoading(false)
  }

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return
    const n = [...otp]; n[index] = value.slice(-1); setOtp(n)
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus()
  }
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) document.getElementById(`otp-${index - 1}`)?.focus()
  }
  const handleOtpPaste = (e) => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (p.length === 6) { setOtp(p.split('')); document.getElementById('otp-5')?.focus() }
  }
  const resetForgotFlow = () => {
    setStep('login'); setFpEmail(''); setOtp(['','','','','',''])
    setResetToken(''); setNewPass(''); setConfirmPass(''); setFpError(''); setResendTimer(0)
  }

  const activeType = LOGIN_TYPES.find(t => t.id === activeTab)

  /* ── Shared input style ── */
  const inputCls = `w-full pl-11 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-gray-500
    border border-gray-700 bg-gray-900/80 focus:outline-none focus:border-green-500
    focus:ring-1 focus:ring-green-500/40 transition-all duration-200`

  const btnCls = `w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200
    active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
    bg-gradient-to-r from-green-500 to-emerald-400 text-gray-950
    hover:from-green-400 hover:to-emerald-300 hover:shadow-lg hover:shadow-green-500/25`

  return (
    <>
      {/* ── Global Styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Noto+Sans+Bengali:wght@400;500;600&display=swap');

        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes float {
          from { transform: translateY(0px) scale(1); opacity: 0.2; }
          to   { transform: translateY(-20px) scale(1.3); opacity: 0.5; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.0); }
          50%       { box-shadow: 0 0 0 8px rgba(74,222,128,0.08); }
        }
        @keyframes logoGlow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(74,222,128,0.4)); }
          50%       { filter: drop-shadow(0 0 20px rgba(74,222,128,0.8)); }
        }
        @keyframes borderFlow {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .fade-up { animation: fadeUp 0.5s ease both; }
        .fade-up-1 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.3s ease both; }
        .fade-up-4 { animation: fadeUp 0.5s 0.4s ease both; }
        .logo-glow { animation: logoGlow 3s ease-in-out infinite; }

        .card-border {
          position: relative;
        }
        .card-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 20px;
          background: linear-gradient(135deg, #4ade80, #1f2937, #4ade80, #064e3b);
          background-size: 300% 300%;
          animation: borderFlow 6s ease infinite;
          z-index: -1;
        }

        .tab-active {
          background: linear-gradient(135deg, #16a34a, #059669);
          color: #000 !important;
          box-shadow: 0 2px 12px rgba(74,222,128,0.3);
        }

        .otp-input:focus {
          border-color: #4ade80 !important;
          box-shadow: 0 0 0 3px rgba(74,222,128,0.2);
          background: rgba(74,222,128,0.05) !important;
          color: #4ade80 !important;
        }
        .otp-filled {
          border-color: #22c55e !important;
          background: rgba(34,197,94,0.08) !important;
          color: #4ade80 !important;
        }
      `}</style>

      {/* ── Background ── */}
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #030712 0%, #0a0f1a 40%, #051a0e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', fontFamily: "'Noto Sans Bengali', sans-serif",
        position: 'relative', overflow: 'hidden',
      }}>
        <Particles />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(74,222,128,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-100px', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* ── Card ── */}
        <div className="card-border" style={{
          width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1,
          opacity: mounted ? 1 : 0, transition: 'opacity 0.6s ease',
        }}>
          <div style={{
            background: 'rgba(10,15,26,0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>

            {/* ── Header ── */}
            <div style={{
              padding: '32px 24px 24px',
              textAlign: 'center',
              borderBottom: '1px solid rgba(74,222,128,0.1)',
              background: 'linear-gradient(180deg, rgba(74,222,128,0.04) 0%, transparent 100%)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Scanline effect */}
              <div style={{
                position: 'absolute', left: 0, right: 0, height: '2px',
                background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.4), transparent)',
                animation: 'scanline 4s linear infinite',
              }} />

              {/* Bismillah */}
              <div style={{ minHeight: '28px', marginBottom: '6px' }} className="fade-up">
                <p style={{ color: 'rgba(74,222,128,0.8)', fontSize: '15px', fontFamily: 'serif', letterSpacing: '2px' }} dir="rtl">
                  {bismillah.displayed}
                  {!bismillah.done && <span style={{ animation: 'fadeIn 0.5s ease infinite alternate' }}>|</span>}
                </p>
              </div>

              {/* Salam */}
              <div style={{ minHeight: '22px', marginBottom: '20px' }} className="fade-up-1">
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', letterSpacing: '1px' }}>
                  {salam.displayed}
                  {bismillah.done && !salam.done && <span style={{ animation: 'fadeIn 0.5s ease infinite alternate' }}>|</span>}
                </p>
              </div>

              {/* NT Logo */}
              <div className="logo-glow fade-up-2" style={{ display: 'inline-block', marginBottom: '12px' }}>
                <NTLogo size={64} />
              </div>

              <div className="fade-up-3">
                <h1 style={{ color: 'white', fontSize: '22px', fontWeight: '700', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '3px', margin: '0 0 2px' }}>
                  NOVATECH BD
                </h1>
                <p style={{ color: 'rgba(74,222,128,0.6)', fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', margin: 0 }}>
                  Management System
                </p>
              </div>
            </div>

            {/* ── Body ── */}
            <div style={{ padding: '28px 24px 24px' }}>

              {/* ══ LOGIN ══ */}
              {step === 'login' && (
                <div>
                  <p className="fade-up" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textAlign: 'center', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '20px' }}>
                    লগইন করুন
                  </p>

                  {/* Tabs */}
                  <div className="fade-up-1" style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '4px', gap: '4px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {LOGIN_TYPES.map(tab => (
                      <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                        className={activeTab === tab.id ? 'tab-active' : ''}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                          padding: '8px 4px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                          fontSize: '12px', fontWeight: '600', transition: 'all 0.2s',
                          background: activeTab === tab.id ? undefined : 'transparent',
                          color: activeTab === tab.id ? undefined : 'rgba(255,255,255,0.4)',
                          fontFamily: "'Noto Sans Bengali', sans-serif",
                        }}>
                        <tab.icon style={{ fontSize: '13px' }} />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="fade-up-2">
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>
                        {activeType.label.toUpperCase()}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <activeType.icon style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(74,222,128,0.6)', fontSize: '16px' }} />
                        <input type={activeType.type} value={identifier} onChange={e => setIdentifier(e.target.value)}
                          placeholder={activeType.placeholder} required autoComplete="username"
                          className={inputCls} />
                      </div>
                    </div>

                    <div className="fade-up-3">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px' }}>পাসওয়ার্ড</label>
                        <button type="button" onClick={() => { setStep('forgot'); setFpError('') }}
                          style={{ color: '#4ade80', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.5px' }}>
                          ভুলে গেছেন?
                        </button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <FiLock style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(74,222,128,0.6)', fontSize: '16px' }} />
                        <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                          placeholder="পাসওয়ার্ড লিখুন" required autoComplete="current-password"
                          className={inputCls} style={{ paddingRight: '44px' }} />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                          style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {showPass ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                    </div>

                    {loginError && (
                      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px' }}>
                        <p style={{ color: '#f87171', fontSize: '12px', margin: 0, textAlign: 'center' }}>{loginError}</p>
                      </div>
                    )}

                    <button type="submit" disabled={loading} className={`${btnCls} fade-up-4`} style={{ marginTop: '4px' }}>
                      {loading
                        ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <span style={{ width: '16px', height: '16px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                            লগইন হচ্ছে...
                          </span>
                        : '→ লগইন করুন'
                      }
                    </button>
                  </form>
                </div>
              )}

              {/* ══ FORGOT: EMAIL ══ */}
              {step === 'forgot' && (
                <div>
                  <button onClick={resetForgotFlow} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(74,222,128,0.7)', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>
                    <FiArrowLeft /> ফিরে যান
                  </button>
                  <h2 style={{ color: 'white', fontSize: '18px', fontWeight: '700', textAlign: 'center', marginBottom: '6px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>পাসওয়ার্ড রিসেট</h2>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', textAlign: 'center', marginBottom: '24px' }}>রেজিস্টার্ড ইমেইলে OTP পাঠানো হবে।</p>

                  {fpError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                    <p style={{ color: '#f87171', fontSize: '12px', margin: 0, textAlign: 'center' }}>{fpError}</p>
                  </div>}

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>ইমেইল</label>
                    <div style={{ position: 'relative' }}>
                      <FiMail style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(74,222,128,0.6)', fontSize: '16px' }} />
                      <input type="email" value={fpEmail} onChange={e => setFpEmail(e.target.value)} placeholder="আপনার ইমেইল লিখুন" className={inputCls} />
                    </div>
                  </div>
                  <button onClick={handleForgotSubmit} disabled={fpLoading} className={btnCls}>
                    {fpLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><span style={{ width: '16px', height: '16px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />পাঠানো হচ্ছে...</span> : '→ OTP পাঠান'}
                  </button>
                </div>
              )}

              {/* ══ OTP ══ */}
              {step === 'otp' && (
                <div>
                  <button onClick={() => { setStep('forgot'); setFpError('') }} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(74,222,128,0.7)', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>
                    <FiArrowLeft /> ফিরে যান
                  </button>
                  <h2 style={{ color: 'white', fontSize: '18px', fontWeight: '700', textAlign: 'center', marginBottom: '6px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>OTP যাচাই</h2>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', textAlign: 'center', marginBottom: '4px' }}>
                    <span style={{ color: '#4ade80' }}>{fpEmail}</span> এ কোড পাঠানো হয়েছে
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', textAlign: 'center', marginBottom: '24px' }}>১০ মিনিটের মধ্যে দিন</p>

                  {fpError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                    <p style={{ color: '#f87171', fontSize: '12px', margin: 0, textAlign: 'center' }}>{fpError}</p>
                  </div>}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }} onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className={`otp-input ${digit ? 'otp-filled' : ''}`}
                        style={{
                          width: '46px', height: '52px', textAlign: 'center',
                          fontSize: '22px', fontWeight: '700',
                          border: `2px solid ${digit ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: '12px', background: digit ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                          color: digit ? '#4ade80' : 'white', outline: 'none', transition: 'all 0.2s',
                        }} />
                    ))}
                  </div>

                  <button onClick={handleOtpSubmit} disabled={fpLoading || otp.join('').length < 6} className={btnCls}>
                    {fpLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><span style={{ width: '16px', height: '16px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />যাচাই হচ্ছে...</span> : '→ যাচাই করুন'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    {resendTimer > 0
                      ? <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>{resendTimer}s পর আবার পাঠাতে পারবেন</p>
                      : <button onClick={handleForgotSubmit} disabled={fpLoading} style={{ color: '#4ade80', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>আবার OTP পাঠান</button>
                    }
                  </div>
                </div>
              )}

              {/* ══ NEW PASSWORD ══ */}
              {step === 'newpass' && (
                <div>
                  <h2 style={{ color: 'white', fontSize: '18px', fontWeight: '700', textAlign: 'center', marginBottom: '6px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>নতুন পাসওয়ার্ড</h2>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', textAlign: 'center', marginBottom: '24px' }}>কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।</p>

                  {fpError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                    <p style={{ color: '#f87171', fontSize: '12px', margin: 0, textAlign: 'center' }}>{fpError}</p>
                  </div>}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>নতুন পাসওয়ার্ড</label>
                      <div style={{ position: 'relative' }}>
                        <FiLock style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(74,222,128,0.6)', fontSize: '16px' }} />
                        <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="নতুন পাসওয়ার্ড" className={inputCls} style={{ paddingRight: '44px' }} />
                        <button type="button" onClick={() => setShowNewPass(!showNewPass)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {showNewPass ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>নিশ্চিত করুন</label>
                      <div style={{ position: 'relative' }}>
                        <FiLock style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: confirmPass && newPass !== confirmPass ? 'rgba(239,68,68,0.6)' : 'rgba(74,222,128,0.6)', fontSize: '16px' }} />
                        <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="আবার লিখুন"
                          className={inputCls}
                          style={{ borderColor: confirmPass && newPass !== confirmPass ? 'rgba(239,68,68,0.5)' : undefined }} />
                      </div>
                      {confirmPass && newPass !== confirmPass && <p style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>পাসওয়ার্ড মিলছে না</p>}
                    </div>
                    <button onClick={handleNewPassSubmit} disabled={fpLoading} className={btnCls}>
                      {fpLoading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><span style={{ width: '16px', height: '16px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />পরিবর্তন হচ্ছে...</span> : '→ পাসওয়ার্ড পরিবর্তন করুন'}
                    </button>
                  </div>
                </div>
              )}

              {/* ══ DONE ══ */}
              {step === 'done' && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '2px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse-green 2s ease infinite' }}>
                    <FiCheck style={{ color: '#4ade80', fontSize: '32px' }} />
                  </div>
                  <h2 style={{ color: 'white', fontSize: '18px', fontWeight: '700', marginBottom: '8px', fontFamily: "'Rajdhani', sans-serif" }}>সফল হয়েছে!</h2>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '28px' }}>নতুন পাসওয়ার্ড দিয়ে লগইন করুন।</p>
                  <button onClick={resetForgotFlow} className={btnCls}>→ লগইনে ফিরে যান</button>
                </div>
              )}

            </div>

            {/* ── Footer ── */}
            <div style={{ padding: '14px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: '11px', letterSpacing: '1px', margin: '0 0 2px' }}>
                NOVATECH BD (LTD.) © {new Date().getFullYear()}
              </p>
              <p style={{ color: 'rgba(74,222,128,0.25)', fontSize: '10px', letterSpacing: '0.5px', margin: 0 }}>
                জানকি সিংহ রোড, বরিশাল সদর
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
