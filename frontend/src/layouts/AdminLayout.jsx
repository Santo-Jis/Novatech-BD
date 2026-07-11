import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore } from '../store/app.store'
import ErrorBoundary from '../components/ErrorBoundary'
import { FiHome, FiUsers, FiCheckSquare, FiBarChart2, FiCpu, FiSettings, FiPackage, FiBell, FiMenu, FiX, FiLogOut, FiChevronDown, FiUser, FiMessageSquare, FiUserPlus, FiGrid, FiDollarSign, FiCreditCard, FiShield, FiRotateCcw, FiInbox, FiMapPin, FiSmartphone, FiShoppingCart, FiCalendar, FiTag } from 'react-icons/fi'

const navItems = [
  { path: '/admin/dashboard',               icon: <FiHome />,         label: 'ড্যাশবোর্ড' },
  { path: '/admin/employees',               icon: <FiUsers />,        label: 'কর্মী তালিকা' },
  { path: '/admin/teams',                   icon: <FiGrid />,         label: 'টিম ম্যানেজমেন্ট' },
  { path: '/admin/recruitment',             icon: <FiUserPlus />,     label: 'SR নিয়োগ' },
  { path: '/admin/pending',                 icon: <FiCheckSquare />,  label: 'অনুমোদন বাকি' },
  { path: '/admin/products',               icon: <FiPackage />,      label: 'পণ্য' },
  { path: '/admin/promotions',              icon: <FiTag />,          label: 'অফার / প্রমোশন' },
  { path: '/admin/routes',                 icon: <FiMapPin />,       label: 'রুট ম্যানেজমেন্ট' },
  { path: '/admin/portal-returns',          icon: <FiRotateCcw />,    label: 'পোর্টাল রিটার্ন' },
  { path: '/admin/customer-order-requests', icon: <FiShoppingCart />, label: 'অর্ডার রিকোয়েস্ট' },
  { path: '/admin/portal-devices',          icon: <FiSmartphone />,   label: 'পোর্টাল ডিভাইস' },
  { path: '/admin/leave-management',        icon: <FiCalendar />,     label: 'ছুটি ব্যবস্থাপনা' },
  { path: '/admin/commission-pay',          icon: <FiDollarSign />,   label: 'কমিশন পরিশোধ' },
  { path: '/admin/salary-pay',              icon: <FiCreditCard />,   label: 'বেতন পরিশোধ' },
  { path: '/admin/credit-settings',         icon: <FiCreditCard />,   label: 'ক্রেডিট সেটিংস' },
  { path: '/admin/reports',                 icon: <FiBarChart2 />,    label: 'রিপোর্ট' },
  { path: '/admin/ai-insights',             icon: <FiCpu />,          label: 'AI বিশ্লেষণ' },
  { path: '/admin/ai-chat',                 icon: <FiMessageSquare />,label: 'AI চ্যাট' },
  { path: '/admin/notices',                 icon: <FiBell />,         label: 'নোটিশ বোর্ড' },
  { path: '/admin/audit-logs',              icon: <FiShield />,       label: 'অডিট লগ' },
  { path: '/admin/customer-requests',       icon: <FiInbox />,        label: 'কাস্টমার রিকোয়েস্ট' },
  { path: '/admin/settings',               icon: <FiSettings />,     label: 'সেটিংস' },
]

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const { allUnreadCount, darkMode, toggleDarkMode } = useAppStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-slate-900 transition-colors">

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary dark:bg-slate-800 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div>
            <p className="text-white font-bold text-sm leading-tight">ZovoriX</p>
            <p className="text-white/50 text-xs">Admin Panel</p>
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
          <button onClick={() => logout()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:bg-white/10 hover:text-white text-sm">
            <FiLogOut className="text-lg" />
            <span>লগআউট</span>
          </button>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 h-14 bg-primary dark:bg-slate-800 flex items-center justify-between px-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-white p-1">
            <FiMenu className="text-xl" />
          </button>
          <span className="text-white font-bold text-sm">ZovoriX</span>
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <FiUser className="text-white text-sm" />
            </div>
            <span className="text-white text-sm font-medium">{user?.name_bn || user?.name_en || 'Admin'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
