import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore } from '../store/app.store'
import { FiHome, FiUsers, FiShoppingCart, FiCheckSquare, FiCalendar, FiMapPin, FiUser, FiBell, FiMenu, FiX, FiLogOut, FiMessageSquare, FiList } from 'react-icons/fi'

const navItems = [
  { path: '/manager/dashboard',     icon: <FiHome />,         label: 'ড্যাশবোর্ড' },
  { path: '/manager/live-tracking', icon: <FiMapPin />,       label: '🔴 লাইভ ট্র্যাকিং' },
  { path: '/manager/team',          icon: <FiUsers />,        label: 'আমার টিম' },
  { path: '/manager/orders',        icon: <FiShoppingCart />, label: 'অর্ডার' },
  { path: '/manager/settlements',   icon: <FiCheckSquare />,  label: 'হিসাব' },
  { path: '/manager/attendance',    icon: <FiCalendar />,     label: 'হাজিরা' },
  { path: '/manager/customers',     icon: <FiUser />,         label: 'কাস্টমার' },
  { path: '/manager/routes',        icon: <FiMapPin />,       label: 'রুট' },
  { path: '/manager/visit-order',   icon: <FiList />,         label: 'Visit ক্রম' },
  { path: '/manager/ai-chat',       icon: <FiMessageSquare />,label: 'AI চ্যাট' },
  { path: '/manager/notices',       icon: <FiBell />,         label: 'নোটিশ' },
]

export default function ManagerLayout() {
  const { user, logout } = useAuthStore()
  const { allUnreadCount, darkMode, toggleDarkMode } = useAppStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors">

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary dark:bg-slate-800 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold text-sm">NovaTech BD</p>
            <p className="text-white/50 text-xs">Manager Panel</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-white p-1">
            <FiX className="text-xl" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${isActive ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:bg-white/10 hover:text-white text-sm">
            <FiLogOut className="text-lg" />
            <span>লগআউট</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 h-14 bg-primary dark:bg-slate-800 flex items-center justify-between px-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-white p-1">
            <FiMenu className="text-xl" />
          </button>
          <span className="text-white font-bold text-sm">NovaTech BD</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleDarkMode} className="text-white/80 hover:text-white text-lg">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <div className="relative">
            <FiBell className="text-white text-xl" />
            {allUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{allUnreadCount}</span>
            )}
          </div>
          <span className="text-white text-sm font-medium">{user?.name_bn || user?.name_en || 'Manager'}</span>
        </div>
      </header>

      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}
