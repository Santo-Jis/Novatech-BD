// frontend/src/pages/customer/CustomerDashboard.jsx
// 🚀 PREMIUM REDESIGN — Dark Glassmorphism + Animated Cards

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const portalFetch = async (path, jwt) => {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Error')
  return data
}

const fmt = (n) => parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })

function getPortalJWT() {
  const key = Object.keys(sessionStorage).find(k => k.startsWith('portal_jwt_'))
  return key ? sessionStorage.getItem(key) : null
}

// ── Animated Counter ──────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', duration = 1200 }) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef(null)
  const numVal = parseFloat(String(value).replace(/,/g, '')) || 0

  useEffect(() => {
    let frame
    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 4)
      setDisplay(Math.round(numVal * ease))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [numVal, duration])

  return <span>{prefix}{display.toLocaleString('bn-BD')}</span>
}

// ── Glowing Stat Card ─────────────────────────────────────────
function StatCard({ label, value, prefix = '৳', color, delay = 0, icon }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const colors = {
    red:    { glow: 'rgba(239,68,68,0.25)',   border: '#ef4444', text: '#fca5a5', accent: '#ef4444' },
    gray:   { glow: 'rgba(148,163,184,0.2)',  border: '#64748b', text: '#cbd5e1', accent: '#94a3b8' },
    green:  { glow: 'rgba(34,197,94,0.25)',   border: '#22c55e', text: '#86efac', accent: '#22c55e' },
    indigo: { glow: 'rgba(99,102,241,0.3)',   border: '#6366f1', text: '#a5b4fc', accent: '#6366f1' },
  }
  const c = colors[color] || colors.gray

  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)',
      border: `1px solid ${c.border}40`,
      borderRadius: 20,
      padding: '16px 14px',
      textAlign: 'center',
      boxShadow: `0 0 20px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      backdropFilter: 'blur(16px)',
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
      opacity: visible ? 1 : 0,
      transition: `all 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 60, height: 60,
        borderRadius: '50%',
        background: c.glow,
        filter: 'blur(20px)',
      }} />
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 10, color: '#64748b', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 800, color: c.text, margin: 0, fontFamily: 'monospace' }}>
        {visible ? <AnimatedNumber value={parseFloat(String(value).replace(/,/g, '').replace('৳', ''))} prefix={prefix} /> : `${prefix}0`}
      </p>
    </div>
  )
}

// ── Summary Row ───────────────────────────────────────────────
function SummaryRow({ label, value, color, delay }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.05)',
      transform: visible ? 'translateX(0)' : 'translateX(-20px)',
      opacity: visible ? 1 : 0,
      transition: `all 0.4s ease ${delay}ms`,
    }}>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {visible ? value : '—'}
      </span>
    </div>
  )
}

// ── Action Button ─────────────────────────────────────────────
function ActionButton({ icon, title, subtitle, onClick, primary, delay }) {
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        background: primary
          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)'
          : 'rgba(15,23,42,0.8)',
        border: primary ? 'none' : '1px solid rgba(99,102,241,0.3)',
        borderRadius: 20,
        padding: '18px 16px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer',
        width: '100%',
        boxShadow: primary
          ? '0 8px 32px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(16px)',
        transform: visible
          ? (pressed ? 'scale(0.96)' : 'translateY(0) scale(1)')
          : 'translateY(30px) scale(0.9)',
        opacity: visible ? 1 : 0,
        transition: pressed
          ? 'transform 0.1s ease'
          : `all 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 14,
        background: primary ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: primary ? 'white' : '#e2e8f0' }}>{title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: primary ? 'rgba(255,255,255,0.65)' : '#64748b' }}>{subtitle}</p>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 18, color: primary ? 'rgba(255,255,255,0.5)' : '#475569' }}>›</div>
    </button>
  )
}

export default function CustomerDashboard() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('শুভ সকাল')
    else if (h < 17) setGreeting('শুভ দুপুর')
    else setGreeting('শুভ সন্ধ্যা')

    const jwt = getPortalJWT()
    if (!jwt) { navigate('/login', { replace: true }); return }

    portalFetch('/portal/dashboard', jwt)
      .then(data => { setDashboard(data.data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  // ── Loading ───────────────────────────────────────────────
  if (loading) return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: '50%',
        border: '3px solid rgba(99,102,241,0.2)',
        borderTop: '3px solid #6366f1',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#64748b', fontSize: 14 }}>লোড হচ্ছে…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Error ─────────────────────────────────────────────────
  if (error) return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ color: '#f87171', fontSize: 14, textAlign: 'center' }}>{error}</p>
      <button
        onClick={() => navigate('/login', { replace: true })}
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', borderRadius: 14, padding: '12px 28px',
          color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
      >আবার লগইন করুন</button>
    </div>
  )

  if (!dashboard) return null

  const { customer, monthly_summary, total_summary } = dashboard
  const creditUsedPct = Math.min(100, Math.round(
    (parseFloat(customer.current_credit || 0) / Math.max(1, parseFloat(customer.credit_limit || 1))) * 100
  ))

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #020617 0%, #0f172a 40%, #1e1b4b 100%)',
      color: 'white',
      paddingBottom: 100,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700;800&display=swap');
        * { font-family: 'Noto Sans Bengali', sans-serif; box-sizing: border-box; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes pulse-glow { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes slide-up { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes shimmer {
          0%{background-position:-200% center}
          100%{background-position:200% center}
        }
        .shimmer-text {
          background: linear-gradient(90deg, #a5b4fc, #e879f9, #38bdf8, #a5b4fc);
          background-size: 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Decorative Background Orbs ── */}
      <div style={{
        position: 'fixed', top: -80, right: -80, width: 300, height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
        animation: 'float 6s ease-in-out infinite',
      }} />
      <div style={{
        position: 'fixed', bottom: 100, left: -60, width: 200, height: 200,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
        animation: 'float 8s ease-in-out infinite 2s',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero Header ──────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(99,102,241,0.15) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(99,102,241,0.15)',
          padding: '32px 20px 28px',
          animation: 'slide-up 0.6s ease forwards',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#6366f1', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {greeting} 👋
              </p>
              <h1 className="shimmer-text" style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                {customer.shop_name}
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{customer.owner_name}</p>
            </div>
            <div style={{
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 12, padding: '6px 12px',
            }}>
              <p style={{ margin: 0, fontSize: 10, color: '#6366f1', fontWeight: 700, letterSpacing: '0.05em' }}>কোড</p>
              <p style={{ margin: 0, fontSize: 13, color: '#a5b4fc', fontWeight: 800, fontFamily: 'monospace' }}>
                {customer.customer_code}
              </p>
            </div>
          </div>

          {/* Credit Usage Bar */}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>ক্রেডিট ব্যবহার</span>
              <span style={{ fontSize: 11, color: creditUsedPct > 80 ? '#f87171' : '#a5b4fc', fontWeight: 700 }}>
                {creditUsedPct}%
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${creditUsedPct}%`,
                background: creditUsedPct > 80
                  ? 'linear-gradient(90deg, #f87171, #ef4444)'
                  : 'linear-gradient(90deg, #6366f1, #a855f7)',
                transition: 'width 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.4s',
                boxShadow: creditUsedPct > 80
                  ? '0 0 12px rgba(239,68,68,0.6)'
                  : '0 0 12px rgba(99,102,241,0.6)',
              }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Balance Cards ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <StatCard label="বর্তমান বাকি"   value={fmt(customer.current_credit)}  color="red"    delay={100}  icon="💳" />
            <StatCard label="ক্রেডিট লিমিট"  value={fmt(customer.credit_limit)}    color="gray"   delay={200}  icon="🏦" />
            <StatCard label="জমা ব্যালেন্স"  value={fmt(customer.credit_balance)}  color="green"  delay={300}  icon="💰" />
          </div>

          {/* ── এই মাস ──────────────────────────────────── */}
          <div style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 24,
            overflow: 'hidden',
            backdropFilter: 'blur(16px)',
            animation: 'slide-up 0.5s ease 0.2s backwards',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>📊</div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>এই মাসের সারসংক্ষেপ</p>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SummaryRow label="মোট কেনাকাটা"  value={`৳${fmt(monthly_summary.total_purchase)}`}  color="#e2e8f0" delay={400} />
              <SummaryRow label="ইনভয়েস সংখ্যা" value={monthly_summary.total_invoices}             color="#a5b4fc" delay={480} />
              <SummaryRow label="নগদ দিয়েছেন"   value={`৳${fmt(monthly_summary.total_cash)}`}     color="#86efac" delay={560} />
              <SummaryRow label="বাকি রেখেছেন"  value={`৳${fmt(monthly_summary.total_credit)}`}   color="#fca5a5" delay={640} />
            </div>
          </div>

          {/* ── সর্বমোট ──────────────────────────────────── */}
          <div style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: 24,
            overflow: 'hidden',
            backdropFilter: 'blur(16px)',
            animation: 'slide-up 0.5s ease 0.35s backwards',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>🏆</div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>সর্বমোট লেনদেন</p>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SummaryRow label="মোট কেনাকাটা"  value={`৳${fmt(total_summary.total_purchase)}`}  color="#e2e8f0" delay={500} />
              <SummaryRow label="মোট ইনভয়েস"   value={total_summary.total_invoices}              color="#a5b4fc" delay={570} />
              <SummaryRow label="মোট নগদ"       value={`৳${fmt(total_summary.total_cash)}`}      color="#86efac" delay={640} />
              <SummaryRow label="মোট বাকি"      value={`৳${fmt(total_summary.total_credit)}`}    color="#fca5a5" delay={710} />
            </div>
          </div>

          {/* ── Quick Actions ─────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              দ্রুত অ্যাকশন
            </p>
            <ActionButton
              icon="🛒" title="নতুন অর্ডার দিন" subtitle="পণ্য সিলেক্ট করে অর্ডার করুন"
              onClick={() => navigate('/customer/orders')} primary delay={800}
            />
            <ActionButton
              icon="📄" title="ইনভয়েস দেখুন" subtitle="আপনার সকল ক্রয়ের ইতিহাস"
              onClick={() => navigate('/customer/invoices')} delay={900}
            />
            <ActionButton
              icon="💸" title="পরিশোধ ইতিহাস" subtitle="কখন কত টাকা দিয়েছেন"
              onClick={() => navigate('/customer/payments')} delay={1000}
            />
          </div>

          {/* ── Powered by footer ─────────────────────────── */}
          <div style={{
            textAlign: 'center', paddingTop: 8,
            animation: 'slide-up 0.5s ease 1.1s backwards',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 999, padding: '8px 20px',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px #22c55e',
                animation: 'pulse-glow 2s ease infinite',
              }} />
              <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>NovaTech BD • কাস্টমার পোর্টাল</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
