import { create } from 'zustand'

// ============================================================
// App Store — Global State
// ============================================================

const savedDark = localStorage.getItem('darkMode') === 'true'
if (savedDark) document.documentElement.classList.add('dark')

// Date-based route persistence — প্রতিদিন নতুন করে সিলেক্ট করতে হবে
const savedRoute = (() => {
  try {
    const raw = localStorage.getItem('selectedRoute')
    if (!raw) return null
    const { route, date } = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10) // "2024-01-15"
    if (date !== today) {
      localStorage.removeItem('selectedRoute') // নতুন দিন, পুরনো রুট clear
      return null
    }
    return route
  } catch {
    localStorage.removeItem('selectedRoute')
    return null
  }
})()

export const useAppStore = create((set, get) => ({
  // Sidebar
  sidebarOpen:   true,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  // Dark Mode
  darkMode: savedDark,
  toggleDarkMode: () => {
    const next = !get().darkMode
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('darkMode', String(next))
    set({ darkMode: next })
  },

  // Notifications (Firebase থেকে আসবে)
  notifications:      [],
  unreadCount:        0,
  addNotification: (notification) => {
    set(s => ({
      notifications: [notification, ...s.notifications].slice(0, 50),
      unreadCount:   s.unreadCount + 1
    }))
  },
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
  markAllRead:        () => set({ unreadCount: 0 }),

  // AI Insights
  aiInsights:      [],
  aiUnreadCount:   0,
  setAIInsights: (insights) => {
    const unread = insights.filter(i => !i.is_read).length
    set({ aiInsights: insights, aiUnreadCount: unread })
  },

  // Global Loading
  globalLoading:    false,
  setGlobalLoading: (val) => set({ globalLoading: val }),

  // Today's summary (Worker Dashboard)
  todaySummary:    null,
  setTodaySummary: (data) => set({ todaySummary: data }),

  // Current Route (Worker) — date সহ localStorage-এ save হয়
  selectedRoute:    savedRoute,
  setSelectedRoute: (route) => {
    if (route) {
      const today = new Date().toISOString().slice(0, 10)
      localStorage.setItem('selectedRoute', JSON.stringify({ route, date: today }))
    } else {
      localStorage.removeItem('selectedRoute')
    }
    set({ selectedRoute: route })
  },
  clearSelectedRoute: () => {
    localStorage.removeItem('selectedRoute')
    set({ selectedRoute: null })
  },

  // Current Sale (OTP flow)
  currentSale:    null,
  setCurrentSale: (sale) => set({ currentSale: sale }),
}))
