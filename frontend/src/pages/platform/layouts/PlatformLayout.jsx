import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiHome, FiBriefcase, FiSearch, FiLifeBuoy, FiMenu, FiX, FiLogOut, FiShield, FiClock, FiUsers } from 'react-icons/fi'
import { usePlatformAuthStore } from '../store/platformAuth.store'
import platformApi from '../api/platformApi'
import ErrorBoundary from '../../../components/ErrorBoundary'

const baseNavItems = [
  { path: '/platform/dashboard', icon: <FiHome />, label: 'ড্যাশবোর্ড' },
  { path: '/platform/tenants', icon: <FiBriefcase />, label: 'টেন্যান্ট তালিকা' },
  { path: '/platform/users', icon: <FiSearch />, label: 'ইউজার লুকআপ' },
  { path: '/platform/tickets', icon: <FiLifeBuoy />, label: 'সাপোর্ট টিকেট' },
  { path: '/platform/audit-log', icon: <FiClock />, label: 'Audit Log' },
]

const fullOnlyNavItems = [
  { path: '/platform/staff', icon: <FiUsers />, label: 'Staff ম্যানেজমেন্ট' },
]

const NOTIF_STORAGE_KEY = 'pf_notif_last_checked'
const POLL_INTERVAL_MS = 25000

export default function PlatformLayout() {
  const { staff, logout } = usePlatformAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const seenIdsRef = useRef(new Set())

  const handleLogout = () => {
    logout()
    navigate('/platform/login', { replace: true })
  }

  // ── Notification polling ──────────────────────────────────
  // ⚠️ এটা true push/websocket না — প্রতি ২৫ সেকেন্ডে backend poll
  // করে নতুন escalation/unassigned ticket চেক করে (near-real-time)।
  useEffect(() => {
    const poll = async () => {
      const since = localStorage.getItem(NOTIF_STORAGE_KEY) || new Date(Date.now() - 60000).toISOString()
      try {
        const res = await platformApi.get('/support/notifications-check', { params: { since } })
        const { escalated, unassigned, checked_at } = res.data.data

        let newCount = 0
        escalated.forEach((t) => {
          if (!seenIdsRef.current.has(`esc_${t.id}`)) {
            seenIdsRef.current.add(`esc_${t.id}`)
            newCount++
            toast(`এসকেলেটেড: ${t.subject}`, { icon: '⬆️' })
          }
        })
        unassigned.forEach((t) => {
          if (!seenIdsRef.current.has(`una_${t.id}`)) {
            seenIdsRef.current.add(`una_${t.id}`)
            newCount++
            toast(`নতুন টিকেট (অবরাদ্দকৃত): ${t.subject}`, { icon: '🎫' })
          }
        })

        if (newCount > 0 && !location.pathname.startsWith('/platform/tickets')) {
          setUnreadCount((c) => c + newCount)
        }
        localStorage.setItem(NOTIF_STORAGE_KEY, checked_at)
      } catch {
        // নীরবে ব্যর্থ — নোটিফিকেশন miss হওয়া critical না, toast দিয়ে বিরক্ত করার দরকার নেই
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tickets পেজে গেলে badge ক্লিয়ার
  useEffect(() => {
    if (location.pathname.startsWith('/platform/tickets')) {
      setUnreadCount(0)
    }
  }, [location.pathname])

  return (
    <div className="min-h-screen w-full bg-pf-bg-base font-pf-body text-pf-text-primary">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-pf-primary-900 flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
          <div>
            <p className="font-pf-head font-semibold text-white text-base leading-tight">ZovoriX</p>
            <p className="text-pf-primary-300 text-xs">Platform Support Panel</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-white/70 p-1 lg:hidden">
            <FiX className="text-xl" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {[...baseNavItems, ...(staff?.scope === 'full' ? fullOnlyNavItems : [])].map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all text-sm ${
                  isActive
                    ? 'bg-pf-primary-700 text-white font-semibold before:content-[""] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-pf-accent-600 before:rounded-r'
                    : 'text-pf-primary-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
              {item.path === '/platform/tickets' && unreadCount > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pf-accent-600 text-white text-[10px] font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-1 mb-3">
            <div className="w-8 h-8 rounded-full bg-pf-accent-600/20 text-pf-accent-300 flex items-center justify-center flex-shrink-0">
              <FiShield className="text-sm" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{staff?.name}</p>
              <p className="text-pf-primary-300 text-[11px] uppercase tracking-wide">
                {staff?.scope === 'full' ? 'Full scope' : 'Support scope'}
              </p>
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
        <p className="font-pf-head font-semibold text-white text-sm">ZovoriX Platform</p>
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
