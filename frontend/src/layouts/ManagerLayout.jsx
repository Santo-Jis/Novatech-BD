import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore } from '../store/app.store'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  FiHome, FiUsers, FiShoppingCart, FiCheckSquare, FiInbox,
  FiCalendar, FiMapPin, FiUser, FiBell, FiMenu, FiX,
  FiLogOut, FiMessageSquare, FiList, FiFileText,
  FiRefreshCw, FiShield, FiDollarSign, FiCreditCard,
  FiBarChart2, FiBookOpen, FiChevronRight
} from 'react-icons/fi'

const navItems = [
  { path: '/manager/dashboard',        icon: <FiHome />,         label: 'ড্যাশবোর্ড' },
  { path: '/manager/live-tracking',    icon: <FiMapPin />,       label: 'লাইভ ট্র্যাকিং' },
  { path: '/manager/trail-history',    icon: <FiMapPin />,       label: 'Trail History' },
  { path: '/manager/team',             icon: <FiUsers />,        label: 'আমার টিম' },
  { path: '/manager/orders',           icon: <FiShoppingCart />, label: 'অর্ডার' },
  { path: '/manager/order-ledger',     icon: <FiFileText />,     label: 'অর্ডার লেজার' },
  { path: '/manager/settlements',      icon: <FiCheckSquare />,  label: 'হিসাব' },
  { path: '/manager/expense',          icon: <FiFileText />,     label: 'খরচ অনুমোদন' },
  { path: '/manager/returns',          icon: <FiRefreshCw />,    label: 'রিটার্ন অনুমোদন' },
  { path: '/manager/portal-returns',   icon: <FiRefreshCw />,    label: 'পোর্টাল রিটার্ন' },   // নতুন
  { path: '/manager/credit-approvals', icon: <FiCreditCard />,   label: 'Credit Approvals' },
  { path: '/manager/attendance',       icon: <FiCalendar />,     label: 'হাজিরা' },
  { path: '/manager/customers',        icon: <FiUser />,         label: 'কাস্টমার' },
  { path: '/manager/portal-devices',   icon: <FiShield />,       label: 'পোর্টাল Device' },
  { path: '/manager/routes',           icon: <FiMapPin />,       label: 'রুট' },
  { path: '/manager/commission/team',  icon: <FiDollarSign />,   label: 'টিম কমিশন' },
  { path: '/manager/salary-sheet',     icon: <FiBookOpen />,     label: 'বেতন শীট' },          // নতুন
  { path: '/manager/reports',          icon: <FiBarChart2 />,    label: 'রিপোর্ট' },            // নতুন
  { path: '/manager/visit-order',      icon: <FiList />,         label: 'Visit ক্রম' },
  { path: '/manager/customer-requests',icon: <FiInbox />,        label: 'কাস্টমার রিকোয়েস্ট' },
  { path: '/manager/ai-chat',          icon: <FiMessageSquare />,label: 'AI চ্যাট' },
  { path: '/manager/notices',          icon: <FiBell />,         label: 'নোটিশ' },
]

function NotificationPanel({ onClose }) {
  const { notifications, unreadCount, aiUnreadCount, markAllRead, markNotificationRead, aiInsights } = useAppStore()

  const allItems = [
    ...notifications.map(n => ({ ...n, type: 'push' })),
    ...aiInsights.filter(i => !i.is_read).slice(0, 5).map(i => ({
      id:      i.id,
      title:   i.title || 'AI Insight',
      body:    i.content,
      read:    i.is_read,
      type:    'ai',
      created_at: i.created_at
    }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-80 bg-white dark:bg-slate-800 h-full shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <h2 className="font-bold text-gray-800 dark:text-white text-sm">🔔 নোটিফিকেশন</h2>
          <div className="flex items-center gap-2">
            {(unreadCount + aiUnreadCount) > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-primary hover:underline">সব পড়া</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <FiX />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
          {allItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FiBell className="text-3xl mx-auto mb-2 opacity-30" />
              <p className="text-sm">কোনো নোটিফিকেশন নেই</p>
            </div>
          ) : allItems.map(item => (
            <div key={item.id}
              onClick={() => item.type === 'push' && markNotificationRead(item.id)}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors
                ${!item.read ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0 mt-0.5">
                  {item.type === 'ai' ? '🤖' : '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                    {item.body}
                  </p>
                  {item.created_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(item.created_at).toLocaleString('bn-BD')}
                    </p>
                  )}
                </div>
                {!item.read && (
                  <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-slate-700 text-center">
          <p className="text-xs text-gray-400">সর্বশেষ ৫০টি নোটিফিকেশন</p>
        </div>
      </div>
    </div>
  )
}

export default function ManagerLayout() {
  const { user, logout }                       = useAuthStore()
  const { unreadCount, aiUnreadCount, darkMode, toggleDarkMode } = useAppStore()
  const allUnreadCount                         = unreadCount + aiUnreadCount   // computed locally
  const [sidebarOpen,      setSidebarOpen]     = useState(false)
  const [notifPanelOpen,   setNotifPanelOpen]  = useState(false)

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
          <button onClick={() => logout()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:bg-white/10 hover:text-white text-sm">
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
          <button onClick={() => setNotifPanelOpen(true)} className="relative text-white">
            <FiBell className="text-xl" />
            {allUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {allUnreadCount > 99 ? '99+' : allUnreadCount}
              </span>
            )}
          </button>
          <span className="text-white text-sm font-medium">{user?.name_bn || user?.name_en || 'Manager'}</span>
        </div>
      </header>

      {notifPanelOpen && <NotificationPanel onClose={() => setNotifPanelOpen(false)} />}

      <main className="p-4">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
