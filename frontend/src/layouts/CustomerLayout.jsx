// frontend/src/layouts/CustomerLayout.jsx
// ✨ PROFESSIONAL REDESIGN — Refined Dark Theme

import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  FiHome, FiShoppingCart, FiFileText, FiCreditCard,
  FiBell, FiX, FiUser, FiMenu, FiCpu, FiLogOut,
  FiChevronRight, FiPackage
} from 'react-icons/fi'

// ── Nav config ────────────────────────────────────────────────
const BOTTOM_NAV = [
  { path: '/customer/dashboard', icon: FiHome,         label: 'হোম'      },
  { path: '/customer/invoices',  icon: FiFileText,     label: 'ইনভয়েস'  },
  { path: '/customer/ai-chat',   icon: FiCpu,          label: 'AI চ্যাট' },
  { path: '/customer/payments',  icon: FiCreditCard,   label: 'পরিশোধ'  },
  { path: '/customer/orders',    icon: FiShoppingCart, label: 'অর্ডার'   },
]

const DRAWER_NAV = [
  { icon: FiHome,         label: 'ড্যাশবোর্ড',  path: '/customer/dashboard',      color: '#60a5fa' },
  { icon: FiShoppingCart, label: 'অর্ডার',       path: '/customer/orders',         color: '#34d399' },
  { icon: FiFileText,     label: 'ইনভয়েস',      path: '/customer/invoices',       color: '#a78bfa' },
  { icon: FiCreditCard,   label: 'পরিশোধ',      path: '/customer/payments',       color: '#fb923c' },
  { icon: FiUser,         label: 'প্রোফাইল',    path: '/customer/profile',        color: '#38bdf8' },
  { icon: FiCpu,          label: 'AI সহকারী',   path: '/customer/ai-chat',        color: '#e879f9' },
  { icon: FiBell,         label: 'নোটিফিকেশন', path: '/customer/notifications',  color: '#fbbf24' },
]

function clearCustomerSession() {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith('portal_jwt_') || k === 'portal_fcm_token')
    .forEach(k => sessionStorage.removeItem(k))
}

export default function CustomerLayout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // JWT decode
  const portalKey = Object.keys(sessionStorage).find(k => k.startsWith('portal_jwt_'))
  let customerInfo = {}
  try {
    const jwt      = sessionStorage.getItem(portalKey)
    const b64url   = jwt.split('.')[1]
    const b64      = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const padded   = b64 + '=='.slice(0, (4 - b64.length % 4) % 4)
    customerInfo   = JSON.parse(atob(padded))
  } catch { /* silent */ }

  // Header shadow on scroll
  useEffect(() => {
    const el = document.getElementById('cl-main')
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 4)
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Page title
  const pageTitle = DRAWER_NAV.find(n => location.pathname.startsWith(n.path))?.label
    || BOTTOM_NAV.find(n => location.pathname.startsWith(n.path))?.label
    || 'পোর্টাল'

  const handleLogout = () => {
    clearCustomerSession()
    navigate('/customer-login', { replace: true })
  }

  const initials = (customerInfo.shop_name || 'K').slice(0, 1).toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080d1a',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
      fontFamily: "'Noto Sans Bengali', sans-serif",
    }}>

      {/* ── Global styles ───────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }

        @keyframes drawerIn {
          from { transform: translateX(-100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        @keyframes itemIn {
          from { transform: translateX(-12px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }

        .cl-nav-item {
          position: relative;
          transition: background 0.18s ease;
        }
        .cl-nav-item:active {
          background: rgba(255,255,255,0.06) !important;
          transform: scale(0.98);
        }
        .cl-bottom-item {
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .cl-bottom-item:active {
          transform: scale(0.88);
        }
        .cl-icon-wrap {
          transition: all 0.2s ease;
        }
        .cl-bell-btn:active {
          transform: scale(0.9);
        }
        .cl-menu-btn:active {
          transform: scale(0.9);
        }
      `}</style>

      {/* ── Top Header ──────────────────────────────────────── */}
      <header style={{
        background: scrolled
          ? 'rgba(8,13,26,0.97)'
          : 'rgba(8,13,26,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.06)' : 'transparent'}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        transition: 'all 0.3s ease',
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.5)' : 'none',
      }}>
        {/* Left: Menu + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="cl-menu-btn"
            onClick={() => setMenuOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#94a3b8', fontSize: 17,
              transition: 'all 0.2s',
            }}
          >
            <FiMenu />
          </button>

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff',
              flexShrink: 0,
              boxShadow: '0 2px 10px rgba(59,130,246,0.4)',
            }}>
              {initials}
            </div>
            <div>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 700,
                color: '#f1f5f9', lineHeight: 1.2,
                maxWidth: 160,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {customerInfo.shop_name || 'কাস্টমার'}
              </p>
              <p style={{
                margin: 0, fontSize: 10, color: '#475569',
                fontFamily: 'monospace', letterSpacing: '0.03em',
              }}>
                {customerInfo.customer_code || 'পোর্টাল'}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Bell */}
        <button
          className="cl-bell-btn"
          onClick={() => navigate('/customer/notifications')}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#94a3b8', fontSize: 17,
            transition: 'all 0.2s', position: 'relative',
          }}
        >
          <FiBell />
          {/* Notification dot */}
          <span style={{
            position: 'absolute', top: 7, right: 7,
            width: 7, height: 7, borderRadius: '50%',
            background: '#f97316',
            border: '1.5px solid #080d1a',
          }} />
        </button>
      </header>

      {/* ── Drawer Overlay ──────────────────────────────────── */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />

          {/* Drawer Panel */}
          <div style={{
            position: 'relative',
            width: 272,
            maxWidth: '85vw',
            height: '100%',
            background: '#0d1426',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '20px 0 60px rgba(0,0,0,0.7)',
            animation: 'drawerIn 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
            overflow: 'hidden',
          }}>

            {/* Drawer top accent line */}
            <div style={{
              height: 3,
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
              flexShrink: 0,
            }} />

            {/* Profile section */}
            <div style={{
              padding: '20px 18px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Large avatar */}
                  <div style={{
                    width: 46, height: 46, borderRadius: 14,
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 800, color: '#fff',
                    boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <p style={{
                      margin: 0, fontSize: 15, fontWeight: 700,
                      color: '#f1f5f9', lineHeight: 1.3,
                    }}>
                      {customerInfo.shop_name || 'কাস্টমার'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 1 }}>
                      {customerInfo.owner_name || ''}
                    </p>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      borderRadius: 6, padding: '2px 8px', marginTop: 5,
                    }}>
                      <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, letterSpacing: '0.04em' }}>
                        CUSTOMER PORTAL
                      </span>
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={() => setMenuOpen(false)}
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#475569', fontSize: 15,
                    alignSelf: 'flex-start',
                    transition: 'all 0.15s',
                  }}
                >
                  <FiX />
                </button>
              </div>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
              {DRAWER_NAV.map((item, i) => {
                const Icon    = item.icon
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <button
                    key={item.path}
                    className="cl-nav-item"
                    onClick={() => { navigate(item.path); setMenuOpen(false) }}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px',
                      borderRadius: 11, border: 'none',
                      background: isActive
                        ? `rgba(${item.color === '#60a5fa' ? '59,130,246' : item.color === '#34d399' ? '52,211,153' : item.color === '#a78bfa' ? '167,139,250' : item.color === '#fb923c' ? '251,146,60' : item.color === '#38bdf8' ? '56,189,248' : item.color === '#e879f9' ? '232,121,249' : '251,191,36'},0.1}`
                        : 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                      marginBottom: 2,
                      animation: `itemIn 0.3s ease ${i * 40}ms backwards`,
                      borderLeft: isActive ? `3px solid ${item.color}` : '3px solid transparent',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 9,
                      background: isActive
                        ? `rgba(${item.color === '#60a5fa' ? '59,130,246' : item.color === '#34d399' ? '52,211,153' : item.color === '#a78bfa' ? '167,139,250' : item.color === '#fb923c' ? '251,146,60' : item.color === '#38bdf8' ? '56,189,248' : item.color === '#e879f9' ? '232,121,249' : '251,191,36'},0.18)`
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? item.color + '40' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isActive ? item.color : '#475569',
                      fontSize: 15, flexShrink: 0,
                      transition: 'all 0.2s',
                    }}>
                      <Icon />
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#f1f5f9' : '#94a3b8',
                      transition: 'color 0.2s',
                    }}>
                      {item.label}
                    </span>
                    <FiChevronRight style={{
                      marginLeft: 'auto',
                      color: isActive ? item.color : '#1e293b',
                      fontSize: 14,
                      transition: 'color 0.2s',
                    }} />
                  </button>
                )
              })}
            </nav>

            {/* Divider */}
            <div style={{
              height: 1, background: 'rgba(255,255,255,0.05)',
              margin: '0 18px',
            }} />

            {/* Logout */}
            <div style={{ padding: '12px 10px 28px' }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 12px', borderRadius: 11,
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.12)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.18s',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f87171', fontSize: 15,
                }}>
                  <FiLogOut />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                  লগআউট
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────── */}
      <main
        id="cl-main"
        style={{ flex: 1, overflowY: 'auto', paddingBottom: 76 }}
      >
        <Outlet />
      </main>

      {/* ── Bottom Navigation ───────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0,
        left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: 'rgba(8,13,26,0.96)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        zIndex: 40,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        padding: '6px 4px 10px',
      }}>
        {BOTTOM_NAV.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{ flex: 1, textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <div
                  className="cl-bottom-item"
                  style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 3, padding: '3px 2px',
                    position: 'relative',
                  }}
                >
                  {/* Active pill indicator */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: -6, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 20, height: 2.5, borderRadius: 999,
                      background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    }} />
                  )}

                  {/* Icon container */}
                  <div
                    className="cl-icon-wrap"
                    style={{
                      width: 42, height: 34, borderRadius: 10,
                      background: isActive
                        ? 'rgba(59,130,246,0.12)'
                        : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isActive ? '#60a5fa' : '#334155',
                      fontSize: isActive ? 19 : 17,
                      transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                      transform: isActive ? 'scale(1.08)' : 'scale(1)',
                    }}
                  >
                    <Icon />
                  </div>

                  <span style={{
                    fontSize: 9.5, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#60a5fa' : '#334155',
                    letterSpacing: '0.01em',
                    transition: 'color 0.2s',
                  }}>
                    {item.label}
                  </span>
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
