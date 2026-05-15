// frontend/src/pages/customer/CustomerLogin.jsx
// কাস্টমার লগিন পেজ — শুধু Google দিয়ে লগিন

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { Capacitor } from '@capacitor/core'
import axios from '../../api/axios'

const COMPANY  = 'NovaTech BD'
const FOOTER   = 'JIS-Digital'

/* ── NT Logo ─────────────────────────────────────────────── */
function NTLogo({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="50" rx="46" ry="22" stroke="#4ade80" strokeWidth="2.5" fill="none"
        strokeDasharray="4 3" opacity="0.7"
        style={{ transformOrigin: '50px 50px', animation: 'cl-spin 8s linear infinite' }} />
      <ellipse cx="50" cy="50" rx="46" ry="22" stroke="#22c55e" strokeWidth="1" fill="none"
        style={{ transformOrigin: '50px 50px', animation: 'cl-spin 8s linear infinite', transform: 'rotate(-15deg)' }} />
      <text x="50" y="62" textAnchor="middle" fontFamily="'Georgia', serif" fontSize="38"
        fontWeight="bold" fill="white" letterSpacing="-1">NT</text>
    </svg>
  )
}

/* ── Particles ───────────────────────────────────────────── */
function Particles() {
  const particles = Array.from({ length: 16 }, (_, i) => ({
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
          opacity: 0.2,
          animation: `cl-float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────── */
export default function CustomerLogin() {
  const navigate = useNavigate()
  const [step,    setStep]    = useState('idle')
  // idle | loading | redirecting | unknown | blocked | error
  const [errMsg,  setErrMsg]  = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // ইতিমধ্যে লগিন আছে কিনা চেক
    const hasJWT = Object.keys(sessionStorage).some(k => k.startsWith('portal_jwt_'))
    if (hasJWT) { navigate('/customer/dashboard', { replace: true }); return }
    setTimeout(() => setMounted(true), 80)
  }, [navigate])

  const handleGoogleLogin = async () => {
    setStep('loading')
    setErrMsg('')
    try {
      let email, name

      if (Capacitor.isNativePlatform()) {
        const googleUser = await GoogleAuth.signIn()
        const accessToken = googleUser.authentication?.accessToken
        if (accessToken) {
          const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const info = await infoResp.json()
          email = info.email
          name  = info.name
        } else {
          email = googleUser.email
          name  = googleUser.displayName || googleUser.name || googleUser.givenName
        }
      } else {
        // Web → GSI popup
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        if (!clientId) throw new Error('Google login কনফিগার নেই।')

        const access_token = await new Promise((resolve, reject) => {
          const initGSI = () => {
            window.google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'openid email profile',
              callback: (resp) => {
                if (resp.error) reject(new Error(resp.error))
                else resolve(resp.access_token)
              },
            }).requestAccessToken()
          }
          const existingScript = document.querySelector('script[src*="accounts.google.com/gsi"]')
          if (window.google?.accounts)       initGSI()
          else if (existingScript)           existingScript.onload = initGSI
          else {
            const script = document.createElement('script')
            script.src = 'https://accounts.google.com/gsi/client'
            script.async = true
            script.onload = initGSI
            script.onerror = () => reject(new Error('Google login লোড হয়নি।'))
            document.head.appendChild(script)
          }
        })

        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` }
        })
        const googleUser = await resp.json()
        email = googleUser.email
        name  = googleUser.name
      }

      // Backend চেক
      const checkRes = await axios.post('/auth/check-email', { email })
      const { type, data } = checkRes.data

      if (type === 'customer') {
        const cid = data.customer_id
        // sessionStorage এ save করো (CustomerGuard sessionStorage চেক করে)
        sessionStorage.setItem(`portal_jwt_${cid}`, data.portal_jwt)
        setStep('redirecting')
        setTimeout(() => navigate('/customer/dashboard', { replace: true }), 1500)
      } else if (type === 'worker') {
        // কর্মী হলে কর্মী লগিনে পাঠাও
        setStep('idle')
        setErrMsg('এই Email কর্মীদের জন্য। কর্মী লগিন ব্যবহার করুন।')
      } else {
        setStep('unknown')
      }

    } catch (err) {
      if (
        err?.message?.includes('cancel') ||
        err?.message?.includes('dismissed') ||
        err?.message?.includes('closed') ||
        err?.code === 12501
      ) {
        setStep('idle'); return
      }
      const backendType = err?.response?.data?.type
      const backendMsg  = err?.response?.data?.message || err?.message || 'সমস্যা হয়েছে।'
      if (backendType === 'blocked') { setStep('blocked'); setErrMsg(backendMsg) }
      else if (backendType === 'unknown') { setStep('unknown') }
      else { setStep('idle'); setErrMsg(backendMsg) }
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
        @keyframes cl-spin  { to { transform: rotate(360deg); } }
        @keyframes cl-float { from { transform: translateY(0) scale(1); opacity:0.15; } to { transform: translateY(-22px) scale(1.3); opacity:0.45; } }
        @keyframes cl-fadeUp { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
        @keyframes cl-glow { 0%,100% { filter: drop-shadow(0 0 8px rgba(74,222,128,0.4)); } 50% { filter: drop-shadow(0 0 22px rgba(74,222,128,0.9)); } }
        @keyframes cl-scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(500%); } }
        @keyframes cl-borderFlow { 0% { background-position:0% 50%; } 50% { background-position:100% 50%; } 100% { background-position:0% 50%; } }
        @keyframes cl-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.04); } }

        .cl-card-wrap { position: relative; }
        .cl-card-wrap::before {
          content: ''; position: absolute; inset: -1px; border-radius: 24px;
          background: linear-gradient(135deg, #4ade80, #1f2937, #4ade80, #064e3b);
          background-size: 300% 300%;
          animation: cl-borderFlow 6s ease infinite; z-index: -1;
        }
        .cl-google-btn {
          width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px;
          background: #fff; border: none; border-radius: 14px;
          padding: 15px 20px; cursor: pointer;
          font-size: 15px; font-weight: 700; color: #1a1a1a;
          font-family: 'Noto Sans Bengali', sans-serif;
          transition: all 0.2s; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .cl-google-btn:hover  { background: #f5f5f5; transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
        .cl-google-btn:active { transform: scale(0.97); }
        .cl-google-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .cl-fade-1 { animation: cl-fadeUp 0.5s 0.1s ease both; }
        .cl-fade-2 { animation: cl-fadeUp 0.5s 0.2s ease both; }
        .cl-fade-3 { animation: cl-fadeUp 0.5s 0.35s ease both; }
        .cl-fade-4 { animation: cl-fadeUp 0.5s 0.5s ease both; }
        .cl-logo-glow { animation: cl-glow 3s ease-in-out infinite; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #030712 0%, #0a0f1a 40%, #051a0e 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Noto Sans Bengali', sans-serif",
        position: 'relative', overflow: 'hidden',
      }}>
        <Particles />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(74,222,128,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '380px', height: '380px', background: 'radial-gradient(circle, rgba(74,222,128,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px', left: '-80px', width: '340px', height: '340px', background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* ── Card ─────────────────────────────────────────── */}
        <div
          className="cl-card-wrap"
          style={{
            width: '100%', maxWidth: 400,
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.5s ease',
            position: 'relative', zIndex: 1,
          }}
        >
          <div style={{
            background: 'rgba(10,15,26,0.96)',
            backdropFilter: 'blur(24px)',
            borderRadius: '24px',
            overflow: 'hidden',
          }}>

            {/* ── Header ───────────────────────────────────── */}
            <div style={{
              padding: '36px 28px 28px',
              textAlign: 'center',
              borderBottom: '1px solid rgba(74,222,128,0.1)',
              background: 'linear-gradient(180deg, rgba(74,222,128,0.05) 0%, transparent 100%)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Scanline */}
              <div style={{
                position: 'absolute', left: 0, right: 0, height: '2px',
                background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.5), transparent)',
                animation: 'cl-scanline 4s linear infinite',
              }} />

              {/* Logo */}
              <div className="cl-logo-glow cl-fade-1" style={{ display: 'inline-block', marginBottom: '16px' }}>
                <NTLogo size={72} />
              </div>

              {/* Company name */}
              <div className="cl-fade-2">
                <h1 style={{
                  color: '#fff', margin: '0 0 4px',
                  fontSize: '24px', fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: '3px',
                }}>
                  {COMPANY}
                </h1>
                <p style={{
                  color: 'rgba(74,222,128,0.6)', margin: 0,
                  fontSize: '11px', letterSpacing: '4px',
                  textTransform: 'uppercase',
                }}>
                  Customer Portal
                </p>
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────── */}
            <div style={{ padding: '32px 28px 28px' }}>

              {/* idle / error state */}
              {(step === 'idle' || step === 'error') && (
                <>
                  <p className="cl-fade-3" style={{
                    color: 'rgba(255,255,255,0.4)', fontSize: '11px',
                    textAlign: 'center', letterSpacing: '3px',
                    textTransform: 'uppercase', marginBottom: '24px',
                  }}>
                    লগইন করুন
                  </p>

                  <div className="cl-fade-3">
                    <button
                      className="cl-google-btn"
                      onClick={handleGoogleLogin}
                      disabled={step === 'loading'}
                    >
                      {/* Google SVG */}
                      <svg width="22" height="22" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Google দিয়ে লগইন করুন
                    </button>
                  </div>

                  {errMsg && (
                    <div className="cl-fade-3" style={{
                      marginTop: 16, padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171', fontSize: 13, textAlign: 'center',
                    }}>
                      {errMsg}
                    </div>
                  )}
                </>
              )}

              {/* Loading state */}
              {step === 'loading' && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    width: 48, height: 48, margin: '0 auto 20px',
                    border: '4px solid rgba(74,222,128,0.15)',
                    borderTop: '4px solid #4ade80',
                    borderRadius: '50%',
                    animation: 'cl-spin 0.8s linear infinite',
                  }} />
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 }}>
                    যাচাই করা হচ্ছে...
                  </p>
                </div>
              )}

              {/* Redirecting state */}
              {step === 'redirecting' && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 52, marginBottom: 16, animation: 'cl-pulse 1s ease infinite' }}>🛍️</div>
                  <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>
                    স্বাগতম!
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
                    আপনার পোর্টালে নিয়ে যাওয়া হচ্ছে...
                  </p>
                  <div style={{
                    width: 36, height: 36, margin: '16px auto 0',
                    border: '3px solid rgba(74,222,128,0.2)',
                    borderTop: '3px solid #4ade80',
                    borderRadius: '50%',
                    animation: 'cl-spin 0.8s linear infinite',
                  }} />
                </div>
              )}

              {/* Unknown state */}
              {step === 'unknown' && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
                  <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
                    অ্যাকাউন্ট পাওয়া যায়নি
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '0 0 24px' }}>
                    এই Email দিয়ে কোনো কাস্টমার অ্যাকাউন্ট নেই।{'\n'}আপনার SR-এর সাথে যোগাযোগ করুন।
                  </p>
                  <button
                    onClick={() => { setStep('idle'); setErrMsg('') }}
                    style={{
                      padding: '11px 28px', borderRadius: 12,
                      background: 'rgba(74,222,128,0.1)',
                      border: '1px solid rgba(74,222,128,0.3)',
                      color: '#4ade80', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    ← ফিরে যান
                  </button>
                </div>
              )}

              {/* Blocked state */}
              {step === 'blocked' && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 14 }}>🚫</div>
                  <h3 style={{ color: '#f87171', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
                    অ্যাক্সেস বন্ধ
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '0 0 24px' }}>
                    {errMsg || 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ আছে।'}
                  </p>
                  <button
                    onClick={() => { setStep('idle'); setErrMsg('') }}
                    style={{
                      padding: '11px 28px', borderRadius: 12,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    ← ফিরে যান
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <p className="cl-fade-4" style={{
          marginTop: 28,
          color: 'rgba(255,255,255,0.15)',
          fontSize: 11, letterSpacing: '3px',
          textTransform: 'uppercase',
          position: 'relative', zIndex: 1,
        }}>
          {FOOTER}
        </p>
      </div>
    </>
  )
}
