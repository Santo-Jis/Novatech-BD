// frontend/src/layouts/CustomerLayout.jsx
// কাস্টমার অ্যাপ লেআউট — WorkerLayout-এর মতো structure

import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { FiHome, FiShoppingCart, FiFileText, FiCreditCard, FiBell, FiLogOut, FiX, FiUser } from 'react-icons/fi'

// ── Bottom Navigation ──────────────────────────────────────
const bottomNav = [
  { path: '/customer/dashboard', icon: <FiHome />,        label: 'হোম' },
  { path: '/customer/orders',    icon: <FiShoppingCart />, label: 'অর্ডার' },
  { path: '/customer/invoices',  icon: <FiFileText />,     label: 'ইনভয়েস' },
  { path: '/customer/payments',  icon: <FiCreditCard />,   label: 'পরিশোধ' },
]

// ── Customer-specific logout ───────────────────────────────
function clearCustomerSession() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('portal_jwt_') || k === 'portal_fcm_token')
    .forEach(k => localStorage.removeItem(k))
}

export default function CustomerLayout() {
  const navigate        = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  // portal_jwt থেকে customer info পড়ো
  const portalKey  = Object.keys(localStorage).find(k => k.startsWith('portal_jwt_'))
  // JWT decode (simple base64 — no verify needed, server verifies)
  let customerInfo = {}
  try {
    const jwt     = localStorage.getItem(portalKey)
    const payload = JSON.parse(atob(jwt.split('.')[1]))
    customerInfo  = payload
  } catch { /* silent */ }

  const handleLogout = () => {
    clearCustomerSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
          {/* Hamburger / Menu */}
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="text-xl">☰</span>
          </button>
          <div>
            <p className="font-bold text-sm leading-tight">{customerInfo.shop_name || 'কাস্টমার'}</p>
            <p className="text-white/60 text-xs">{customerInfo.customer_code || ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/customer/notifications')}
            className="relative p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <FiBell className="text-xl" />
          </button>
        </div>
      </header>

      {/* ── Slide-in Menu ──────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="relative w-64 bg-white h-full shadow-2xl flex flex-col">
            <div className="bg-indigo-600 text-white px-5 py-5 flex items-center justify-between">
              <div>
                <p className="font-bold text-base">{customerInfo.shop_name || 'কাস্টমার'}</p>
                <p className="text-white/60 text-xs mt-0.5">{customerInfo.owner_name || ''}</p>
                <p className="text-white/50 text-xs">কাস্টমার পোর্টাল</p>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <FiX className="text-xl" />
              </button>
            </div>

            <nav className="flex-1 py-3">
              {[
                { icon: <FiHome />,        label: 'ড্যাশবোর্ড',  path: '/customer/dashboard' },
                { icon: <FiShoppingCart />,label: 'অর্ডার',       path: '/customer/orders' },
                { icon: <FiFileText />,    label: 'ইনভয়েস',      path: '/customer/invoices' },
                { icon: <FiCreditCard />,  label: 'পরিশোধ',      path: '/customer/payments' },
                { icon: <FiUser />,        label: 'প্রোফাইল',    path: '/customer/profile' },
                { icon: <FiBell />,        label: 'নোটিফিকেশন', path: '/customer/notifications' },
              ].map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMenuOpen(false) }}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-gray-700 hover:bg-indigo-50 transition-colors text-left"
                >
                  <span className="text-xl text-indigo-600">{item.icon}</span>
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="border-t border-gray-100 p-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <FiLogOut className="text-xl" />
                <span className="font-medium text-sm">লগআউট</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────── */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* ── Bottom Navigation ──────────────────────────────── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 flex z-40 shadow-lg">
        {bottomNav.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative
               ${isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                <span className={`text-xs font-medium ${isActive ? 'text-indigo-600' : ''}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
