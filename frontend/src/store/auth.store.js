import { create } from 'zustand'
import api from '../api/axios'
import { clearAllData } from '../api/offlineQueue'
import toast from 'react-hot-toast'

// ============================================================
// Auth Store — Zustand
// লগইন, লগআউট, ইউজার তথ্য
// ============================================================

export const useAuthStore = create((set, get) => ({
  user:    JSON.parse(localStorage.getItem('user')  || 'null'),
  token:   localStorage.getItem('accessToken')      || null,
  // refreshToken: HttpOnly cookie-তে — JS দিয়ে পড়া যায় না, store-এ রাখা হয় না
  loading: false,

  // ── LOGIN ──
  login: async (identifier, password) => {
    set({ loading: true })
    try {
      const response = await api.post('/auth/login', { identifier, password })
      const { user, accessToken } = response.data.data
      // refreshToken: server HttpOnly cookie-তে সেট করেছে — JS-এ দেখা যাবে না

      localStorage.setItem('user',        JSON.stringify(user))
      localStorage.setItem('accessToken', accessToken)

      set({ user, token: accessToken, loading: false })

      // লগইনের পর Eruda দেখাও
      if (typeof window.__showEruda === 'function') window.__showEruda()

      toast.success(`স্বাগতম, ${user.name_bn}!`)
      return { success: true, user }

    } catch (error) {
      set({ loading: false })
      const message = error.response?.data?.message || 'লগইন ব্যর্থ হয়েছে।'
      toast.error(message)
      return { success: false, message }
    }
  },

  // ── LOGOUT ──
  logout: async () => {
    // ✅ FIX: refreshToken body-তে পাঠানোর দরকার নেই —
    // browser automatically HttpOnly cookie পাঠাবে (withCredentials: true)।
    // sendBeacon fallback-এও cookie যায়, তাই body empty রাখা হচ্ছে।
    try {
      await api.post('/auth/logout', {})
    } catch {
      // API fail হলে beacon দিয়ে best-effort — cookie browser নিজেই attach করে
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            `${import.meta.env.VITE_API_URL}/auth/logout`,
            new Blob(['{}'], { type: 'application/json' })
          )
        }
      } catch { /* beacon ও fail হলে কিছু করার নেই */ }
    } finally {
      await clearAllData()
      localStorage.clear()
      set({ user: null, token: null })

      if (typeof window.__hideEruda === 'function') window.__hideEruda()

      window.location.href = '/login'
    }
  },

  // ── UPDATE USER ──
  updateUser: (updatedUser) => {
    const merged = { ...get().user, ...updatedUser }
    localStorage.setItem('user', JSON.stringify(merged))
    set({ user: merged })
  },

  // ── FETCH ME ──
  fetchMe: async () => {
    try {
      const response = await api.get('/auth/me')
      const user     = response.data.data
      localStorage.setItem('user', JSON.stringify(user))
      set({ user })
    } catch { /* silent */ }
  },

  // ── HELPERS ──
  isAdmin:   () => get().user?.role === 'admin',
  isManager: () => ['manager', 'supervisor', 'asm', 'rsm'].includes(get().user?.role),
  isWorker:  () => get().user?.role === 'worker',
}))
