import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { FiHome, FiBriefcase, FiPlusCircle, FiMenu, FiX, FiLogOut, FiKey } from 'react-icons/fi'
import { useSuperAdminAuthStore } from '../store/superAdminAuth.store'
import ErrorBoundary from '../../../components/ErrorBoundary'

const navItems = [
  { path: '/superadmin/dashboard', icon: <FiHome />, label: 'ড্যাশবোর্ড' },
  { path: '/superadmin/tenants', icon: <FiBriefcase />, label: 'সব টেন্যান্ট' },
  { path: '/superadmin/tenants/new', icon: <FiPlusCircle />, label: 'নতুন টেন্যান্ট' },
]

export default function SuperAdminLayout() {
  const logout = useSuperAdminAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/superadmin/login', { replace: true })
  }

  return (
    <div className="min-h-screen w-full bg-pf-bg-base font-pf-body text-pf-text-primary">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — ইচ্ছাকৃতভাবে গাঢ় লাল/মেরুন accent দিয়ে Platform panel-এর
          নীল/সোনালি থেকে ভিজুয়ালি আলাদা করা হয়েছে, যাতে ভুলে Super Admin
          আর Support panel গুলিয়ে না ফেলা যায় — উভয়ই খুব উচ্চ-ক্ষমতাসম্পন্ন। */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-pf-primary-900 flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
          <div>
            <p className="font-pf-head font-semibold text-white text-base leading-tight">ZovoriX</p>
            <p className="text-red-300 text-xs">Super Admin</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-white/70 p-1 lg:hidden">
            <FiX className="text-xl" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path !== '/superadmin/tenants'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all text-sm ${
                  isActive
                    ? 'bg-pf-primary-700 text-white font-semibold before:content-[""] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-red-500 before:rounded-r'
                    : 'text-pf-primary-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-1 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center flex-shrink-0">
              <FiKey className="text-sm" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">Super Admin Key</p>
              <p className="text-pf-primary-300 text-[11px] uppercase tracking-wide">Full access</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-pf-primary-100 hover:bg-white/10 hover:text-white text-sm"
          >
            <FiLogOut className="text-lg" />
            <span>লগআউট</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-pf-primary-900 flex items-center justify-between px-4 shadow-md">
        <button onClick={() => setSidebarOpen(true)} className="text-white p-1">
          <FiMenu className="text-xl" />
        </button>
        <p className="font-pf-head font-semibold text-white text-sm">ZovoriX Super Admin</p>
        <div className="w-7" />
      </header>

      <main className="lg:pl-64">
        <div className="p-4 lg:p-8 max-w-6xl mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
