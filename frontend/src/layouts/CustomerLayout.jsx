// frontend/src/layouts/CustomerLayout.jsx
// 🚀 PREMIUM REDESIGN — Dark Glass Navigation

import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { FiHome, FiShoppingCart, FiFileText, FiCreditCard, FiBell, FiLogOut, FiX, FiUser, FiMenu, FiCpu } from 'react-icons/fi'

const bottomNav = [
  { path: '/customer/dashboard', icon: <FiHome />,         label: 'হোম',     emoji: '🏠' },
  { path: '/customer/invoices',  icon: <FiFileText />,     label: 'ইনভয়েস', emoji: '📄' },
  { path: '/customer/ai-chat',   icon: <FiCpu />,          label: 'AI চ্যাট', emoji: '🤖' },
  { path: '/customer/payments',  icon: <FiCreditCard />,   label: 'পরিশোধ', emoji: '💳' },
  { path: '/customer/orders',    icon: <FiShoppingCart />, label: 'অর্ডার',  emoji: '🛒' },
]

function clearCustomerSession() {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith('portal_jwt_') || k === 'portal_fcm_token')
    .forEach(k => sessionStorage.removeItem(k))
}

export default function CustomerLayout() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const portalKey = Object.keys(sessionStorage).find(k => k.startsWith('portal_jwt_'))
  let customerInfo = {}
  try {
    const jwt = sessionStorage.getItem(portalKey)
    // Base64URL → Base64 → JSON (JWT payload is Base64URL, not standard Base64)
    const base64Url = jwt.split('.')[1]
    const base64    = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded    = base64 + '=='.slice(0, (4 - base64.length % 4) % 4)
    customerInfo    = JSON.parse(atob(padded))
  } catch { /* silent */ }

  const handleLogout = () => {
    clearCustomerSession()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #020617 0%, #0f172a 40%, #1e1b4b 100%)',
      display: 'flex', flexDirection: 'column',
      maxWidth: 480, margin: '0 auto',
      position: 'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700;800&display=swap');
        * { font-family: 'Noto Sans Bengali', sans-serif; box-sizing: border-box; }
        @keyframes slide-in-left { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes fade-in { from{opacity:0} to{opacity:1} }
        @keyframes bounce-in { 0%{transform:scale(0.8) translateY(20px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes shimmer {
          0%{background-position:-200% center}
          100%{background-position:200% center}
        }
        .nav-shimmer {
          background: linear-gradient(90deg, #a5b4fc, #e879f9, #38bdf8, #a5b4fc);
          background-size: 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Top Header ───────────────────────────────────── */}
      <header style={{
        background: 'rgba(2,6,23,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 40,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#a5b4fc', fontSize: 18,
              transition: 'all 0.2s',
            }}
          >
            <FiMenu />
          </button>
          <div>
            <p className="nav-shimmer" style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>
              {customerInfo.shop_name || 'কাস্টমার'}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
              {customerInfo.customer_code || ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/customer/notifications')}
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#a5b4fc', fontSize: 18,
          }}
        >
          <FiBell />
        </button>
      </header>

      {/* ── Slide-in Drawer ───────────────────────────────── */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              animation: 'fade-in 0.2s ease',
            }}
          />
          {/* Drawer */}
          <div style={{
            position: 'relative',
            width: 280,
            background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)',
            height: '100%',
            display: 'flex', flexDirection: 'column',
            border: '0 solid',
            borderRight: '1px solid rgba(99,102,241,0.2)',
            boxShadow: '8px 0 40px rgba(0,0,0,0.6)',
            animation: 'slide-in-left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '28px 20px 20px',
              borderBottom: '1px solid rgba(99,102,241,0.15)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: -40, right: -40,
                width: 120, height: 120, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{
                    width: 48, height: 48, borderRadius: 16,
                    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, marginBottom: 12,
                    boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
                  }}>🏪</div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>
                    {customerInfo.shop_name || 'কাস্টমার'}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                    {customerInfo.owner_name || ''}
                  </p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 8, padding: '3px 10px', marginTop: 8,
                  }}>
                    <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, fontFamily: 'monospace' }}>
                      কাস্টমার পোর্টাল
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#64748b', fontSize: 16,
                  }}
                ><FiX /></button>
              </div>
            </div>

            {/* Nav Items */}
            <nav style={{ flex: 1, padding: '12px 12px' }}>
              {[
                { icon: <FiHome />,         emoji: '🏠', label: 'ড্যাশবোর্ড',   path: '/customer/dashboard' },
                { icon: <FiShoppingCart />, emoji: '🛒', label: 'অর্ডার',        path: '/customer/orders' },
                { icon: <FiFileText />,     emoji: '📄', label: 'ইনভয়েস',       path: '/customer/invoices' },
                { icon: <FiCreditCard />,   emoji: '💳', label: 'পরিশোধ',       path: '/customer/payments' },
                { icon: <FiUser />,         emoji: '👤', label: 'প্রোফাইল',     path: '/customer/profile' },
                { icon: <FiCpu />,          emoji: '🤖', label: 'AI সহকারী',    path: '/customer/ai-chat' },
                { icon: <FiBell />,         emoji: '🔔', label: 'নোটিফিকেশন', path: '/customer/notifications' },
              ].map((item, i) => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMenuOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 14px', borderRadius: 14, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    textAlign: 'left', marginBottom: 2,
                    transition: 'all 0.2s',
                    animation: `bounce-in 0.4s ease ${i * 60}ms backwards`,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 12,
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>{item.emoji}</div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1' }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#334155', fontSize: 16 }}>›</span>
                </button>
              ))}
            </nav>

            {/* Logout */}
            <div style={{ padding: '12px 12px 28px' }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '13px 14px', borderRadius: 14,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: 'rgba(239,68,68,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>🚪</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>লগআউট</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        <Outlet />
      </main>

      {/* ── Premium Bottom Navigation ─────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0,
        left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: 'rgba(2,6,23,0.92)',
        backdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(99,102,241,0.2)',
        display: 'flex', zIndex: 40,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
        padding: '6px 0 10px',
      }}>
        {bottomNav.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            style={{ flex: 1, textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4, padding: '4px 0',
                position: 'relative',
              }}>
                {/* Active glow */}
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: '50%',
                    transform: 'translateX(-50%)',
                    width: 36, height: 3, borderRadius: 999,
                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                    boxShadow: '0 0 12px rgba(99,102,241,0.8)',
                  }} />
                )}
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isActive ? 22 : 19,
                  transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isActive ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
                }}>
                  {item.emoji}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isActive ? '#a5b4fc' : '#334155',
                  transition: 'color 0.2s',
                }}>{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
