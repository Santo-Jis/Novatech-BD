import { create } from 'zustand'

// ============================================================
// App Store — Global State
// ============================================================

const savedDark = localStorage.getItem('darkMode') === 'true'
if (savedDark) document.documentElement.classList.add('dark')

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

  // Current Route (Worker)
  selectedRoute:    null,
  setSelectedRoute: (route) => set({ selectedRoute: route }),

  // Current Sale (OTP flow)
  currentSale:    null,
  setCurrentSale: (sale) => set({ currentSale: sale }),
}))
