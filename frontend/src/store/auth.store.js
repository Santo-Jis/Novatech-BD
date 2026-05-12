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
    // ১. আগেই UI clear করো — ইউজার সাথে সাথে লগইন পেজে যাবে
    localStorage.clear()
    set({ user: null, token: null })
    if (typeof window.__hideEruda === 'function') window.__hideEruda()

    // ২. ব্যাকগ্রাউন্ডে server logout (3s timeout — আটকাবে না)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3000)
      await api.post('/auth/logout', {}, { signal: controller.signal })
      clearTimeout(timer)
    } catch { /* timeout বা network error — কিছু করার নেই */ }

    // ৩. IndexedDB ব্যাকগ্রাউন্ডে clear (block করবে না)
    clearAllData().catch(() => {})

    // ৪. Hard redirect
    window.location.href = '/login'
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
