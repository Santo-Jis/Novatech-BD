import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import { FiHome, FiMapPin, FiShoppingBag, FiDollarSign, FiUser, FiBell, FiMoon, FiSun } from 'react-icons/fi'

const bottomNav = [
  { path: '/worker/dashboard',  icon: <FiHome />,        label: 'হোম' },
  { path: '/worker/customers',  icon: <FiMapPin />,      label: 'রুট' },
  { path: '/worker/settlement', icon: <FiShoppingBag />, label: 'হিসাব' },
  { path: '/worker/commission', icon: <FiDollarSign />,  label: 'কমিশন' },
  { path: '/worker/profile',    icon: <FiUser />,        label: 'প্রোফাইল' },
]

export default function WorkerLayout() {
  const { user }                            = useAuthStore()
  const { notifications, darkMode, toggleDarkMode } = useAppStore()
  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col max-w-md mx-auto relative transition-colors">
      <header className="bg-primary dark:bg-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md transition-colors">
        <div>
          <p className="font-bold text-sm">{user?.name_bn}</p>
          <p className="text-white/60 text-xs">{user?.employee_code}</p>
        </div>
        <div className="flex items-center gap-3">
          {parseFloat(user?.outstanding_dues || 0) > 0 && (
            <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              বকেয়া ৳{parseFloat(user.outstanding_dues).toLocaleString()}
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

      <main className="flex-1 overflow-auto pb-20"><Outlet /></main>

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
