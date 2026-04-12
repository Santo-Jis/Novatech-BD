import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import { FiHome, FiMapPin, FiShoppingBag, FiDollarSign, FiUser, FiBell, FiMoon, FiSun, FiUsers, FiMenu, FiX, FiLogOut } from 'react-icons/fi'

const bottomNav = [
  { path: '/worker/dashboard',  icon: <FiHome />,        label: 'হোম' },
  { path: '/worker/customers',  icon: <FiUsers />,       label: 'কাস্টমার' },
  { path: '/worker/settlement', icon: <FiShoppingBag />, label: 'হিসাব' },
  { path: '/worker/commission', icon: <FiDollarSign />,  label: 'কমিশন' },
  { path: '/worker/profile',    icon: <FiUser />,        label: 'প্রোফাইল' },
]

export default function WorkerLayout() {
  const { user, logout }                    = useAuthStore()
  const { notifications, darkMode, toggleDarkMode } = useAppStore()
  const unread = notifications.filter(n => !n.read).length
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col max-w-md mx-auto relative transition-colors">

      {/* Header */}
      <header className="bg-primary dark:bg-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md transition-colors">
        <div className="flex items-center gap-3">
          {/* Hamburger menu */}
          <button onClick={() => setMenuOpen(true)} className="p-1 text-white/70 hover:text-white">
            <FiMenu className="text-xl" />
          </button>
          <div>
            <p className="font-bold text-sm">{user?.name_bn}</p>
            <p className="text-white/60 text-xs">{user?.employee_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {parseFloat(user?.outstanding_dues || 0) > 0 && (
            <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              বকেয়া ৳{parseFloat(user?.outstanding_dues || 0).toLocaleString()}
            </div>
          )}
          <button onClick={toggleDarkMode} className="p-1 text-white/70 hover:text-white transition-colors">
            {darkMode ? <FiSun /> : <FiMoon />}
          </button>
          <button className="relative p-1">
            <FiBell className="text-xl" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-400 text-white text-xs rounded-full flex items-center justify-center">{unread}</span>
            )}
          </button>
        </div>
      </header>

      {/* Hamburger Sidebar Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />

          {/* Menu panel */}
          <div className="relative w-72 bg-white dark:bg-slate-800 h-full shadow-xl flex flex-col">
            {/* Menu header */}
            <div className="bg-primary dark:bg-slate-700 text-white px-4 py-5 flex items-center justify-between">
              <div>
                <p className="font-bold">{user?.name_bn}</p>
                <p className="text-white/60 text-sm">{user?.employee_code}</p>
              </div>
              <button onClick={() => setMenuOpen(false)}>
                <FiX className="text-xl" />
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 py-4">
              {/* রুট */}
              <button
                onClick={() => { navigate('/worker/route'); setMenuOpen(false); }}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <FiMapPin className="text-xl text-primary" />
                <span className="font-medium">রুট সিলেক্ট করুন</span>
              </button>

              <div className="border-t border-gray-100 dark:border-slate-700 mx-4 my-2" />

              {/* নোটিশ */}
              <button
                onClick={() => { navigate('/worker/notices'); setMenuOpen(false); }}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <FiBell className="text-xl text-primary" />
                <span className="font-medium">নোটিশ বোর্ড</span>
              </button>
            </div>

            {/* Logout */}
            <div className="border-t border-gray-100 dark:border-slate-700 p-4">
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full flex items-center gap-4 px-5 py-3 text-red-500 hover:bg-red-50 rounded-xl"
              >
                <FiLogOut className="text-xl" />
                <span className="font-medium">লগআউট</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto pb-20"><Outlet /></main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 flex z-40 shadow-lg transition-colors">
        {bottomNav.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative ${isActive ? 'text-primary dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {({ isActive }) => (
              <>
                <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
                <span className={`text-xs font-medium ${isActive ? 'text-primary dark:text-blue-400' : 'text-gray-400'}`}>{item.label}</span>
                {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-primary dark:bg-blue-400 rounded-full" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
