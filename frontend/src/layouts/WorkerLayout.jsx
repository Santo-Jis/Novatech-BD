import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import {
  FiHome, FiMapPin, FiShoppingBag, FiDollarSign, FiUser,
  FiBell, FiMoon, FiSun, FiUsers, FiMenu, FiX, FiLogOut,
  FiClipboard
} from 'react-icons/fi'

// ─── Bottom Navigation (সবসময় দেখা যাবে) ───────────────────
const bottomNav = [
  { path: '/worker/dashboard',  icon: <FiHome />,        label: 'হোম' },
  { path: '/worker/customers',  icon: <FiUsers />,       label: 'কাস্টমার' },
  { path: '/worker/settlement', icon: <FiShoppingBag />, label: 'হিসাব' },
  { path: '/worker/commission', icon: <FiDollarSign />,  label: 'কমিশন' },
  { path: '/worker/profile',    icon: <FiUser />,        label: 'প্রোফাইল' },
]

// ─── Hamburger Menu Items (গৌণ পৃষ্ঠা) ──────────────────────
const menuItems = [
  {
    icon: <FiMapPin />,
    label: 'রুট সিলেক্ট করুন',
    path: '/worker/route',
  },
  {
    icon: <FiClipboard />,
    label: 'অর্ডার দিন',
    path: '/worker/order',
  },
  {
    icon: <FiBell />,
    label: 'নোটিশ বোর্ড',
    path: '/worker/notices',
  },
]

export default function WorkerLayout() {
  const { user, logout }                            = useAuthStore()
  const { notifications, darkMode, toggleDarkMode } = useAppStore()
  const unread    = notifications.filter(n => !n.read).length
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate  = useNavigate()

  const handleNavigate = (path) => {
    navigate(path)
    setMenuOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col max-w-md mx-auto relative transition-colors">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-primary dark:bg-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md transition-colors">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="মেনু খুলুন"
          >
            <FiMenu className="text-xl" />
          </button>

          <div>
            <p className="font-bold text-sm leading-tight">{user?.name_bn}</p>
            <p className="text-white/60 text-xs">{user?.employee_code}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* বকেয়া badge */}
          {parseFloat(user?.outstanding_dues || 0) > 0 && (
            <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              বকেয়া ৳{parseFloat(user?.outstanding_dues || 0).toLocaleString('bn-BD')}
            </div>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="থিম পরিবর্তন"
          >
            {darkMode ? <FiSun className="text-lg" /> : <FiMoon className="text-lg" />}
          </button>

          {/* Notification bell */}
          <button
            onClick={() => navigate('/worker/notices')}
            className="relative p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="নোটিফিকেশন"
          >
            <FiBell className="text-xl" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-400 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Hamburger Sidebar ──────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-72 bg-white dark:bg-slate-800 h-full shadow-2xl flex flex-col">

            {/* Panel header */}
            <div className="bg-primary dark:bg-slate-700 text-white px-5 py-5 flex items-center justify-between">
              <div>
                <p className="font-bold text-base">{user?.name_bn}</p>
                <p className="text-white/60 text-xs mt-0.5">{user?.employee_code}</p>
                {user?.role && (
                  <p className="text-white/50 text-xs">
                    {user.role === 'worker' ? 'SR / ফিল্ড ওয়ার্কার' : user.role}
                  </p>
                )}
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="মেনু বন্ধ করুন"
              >
                <FiX className="text-xl" />
              </button>
            </div>

            {/* Menu items */}
            <nav className="flex-1 py-3 overflow-y-auto">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-gray-700 dark:text-gray-200 hover:bg-primary/5 dark:hover:bg-slate-700 transition-colors text-left"
                >
                  <span className="text-xl text-primary dark:text-blue-400">{item.icon}</span>
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              ))}
            </nav>

            {/* Logout */}
            <div className="border-t border-gray-100 dark:border-slate-700 p-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
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
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 flex z-40 shadow-lg transition-colors">
        {bottomNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative
               ${isActive
                 ? 'text-primary dark:text-blue-400'
                 : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                <span className={`text-xs font-medium ${isActive ? 'text-primary dark:text-blue-400' : ''}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-primary dark:bg-blue-400 rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
