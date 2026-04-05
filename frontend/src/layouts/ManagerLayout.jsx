import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import {
  FiHome, FiUsers, FiShoppingCart, FiCheckSquare,
  FiCalendar, FiMapPin, FiUser, FiBell,
  FiMenu, FiX, FiLogOut, FiChevronDown,
  FiMoon, FiSun, FiMessageSquare
} from 'react-icons/fi'

const navItems = [
  { path: '/manager/dashboard',   icon: <FiHome />,          label: 'ড্যাশবোর্ড' },
  { path: '/manager/team',        icon: <FiUsers />,         label: 'আমার টিম' },
  { path: '/manager/orders',      icon: <FiShoppingCart />,  label: 'অর্ডার' },
  { path: '/manager/settlements', icon: <FiCheckSquare />,   label: 'হিসাব' },
  { path: '/manager/attendance',  icon: <FiCalendar />,      label: 'হাজিরা' },
  { path: '/manager/customers',   icon: <FiUser />,          label: 'কাস্টমার' },
  { path: '/manager/routes',      icon: <FiMapPin />,        label: 'রুট' },
  { path: '/manager/ai-chat',     icon: <FiMessageSquare />, label: 'AI চ্যাট' },
  { path: '/manager/notices',     icon: <FiBell />,          label: 'নোটিশ' },
]

export default function ManagerLayout() {
  const { user, logout }     = useAuthStore()
  const { sidebarOpen, toggleSidebar, notifications, darkMode, toggleDarkMode } = useAppStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex transition-colors">
      <aside className={`fixed inset-y-0 left-0 z-50 bg-secondary dark:bg-slate-800 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16'} lg:relative lg:translate-x-0`}>
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          {sidebarOpen && (
            <div className="ml-3">
              <p className="text-white font-bold text-sm">NovaTech BD</p>
              <p className="text-white/50 text-xs capitalize">{user?.role} Panel</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink key={item.path} to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${isActive ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        {sidebarOpen && (
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
                {user?.profile_photo ? <img src={user.profile_photo} alt="" className="w-full h-full object-cover" /> : <FiUser className="text-white text-sm" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.name_bn}</p>
                <p className="text-white/50 text-xs capitalize">{user?.role}</p>
              </div>
              <button onClick={logout} className="text-white/50 hover:text-white"><FiLogOut /></button>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center px-4 gap-4 sticky top-0 z-40 shadow-sm transition-colors">
          <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300">
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
          <div className="flex-1" />
          <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-yellow-400 transition-colors">
            {darkMode ? <FiSun /> : <FiMoon />}
          </button>
          <button className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300">
            <FiBell />
            {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className="relative">
            <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center overflow-hidden">
                {user?.profile_photo ? <img src={user.profile_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-white text-xs font-bold">{user?.name_bn?.[0]}</span>}
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium hidden md:block">{user?.name_bn}</span>
              <FiChevronDown className="text-gray-400 text-sm" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-sm font-semibold dark:text-gray-100">{user?.name_bn}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user?.employee_code}</p>
                </div>
                <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <FiLogOut /> লগআউট
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
      </div>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={toggleSidebar} />}
    </div>
  )
}
