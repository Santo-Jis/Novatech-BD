import { create } from 'zustand'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ============================================================
// Auth Store — Zustand
// লগইন, লগআউট, ইউজার তথ্য
// ============================================================

export const useAuthStore = create((set, get) => ({
  user:         JSON.parse(localStorage.getItem('user')  || 'null'),
  token:        localStorage.getItem('accessToken')      || null,
  refreshToken: localStorage.getItem('refreshToken')     || null,
  loading:      false,

  // ── LOGIN ──
  login: async (identifier, password) => {
    set({ loading: true })
    try {
      const response = await api.post('/auth/login', { identifier, password })
      const { user, accessToken, refreshToken } = response.data.data

      // LocalStorage এ সেভ
      localStorage.setItem('user',         JSON.stringify(user))
      localStorage.setItem('accessToken',  accessToken)
      localStorage.setItem('refreshToken', refreshToken)

      set({ user, token: accessToken, refreshToken, loading: false })

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
    try {
      const refreshToken = get().refreshToken
      await api.post('/auth/logout', { refreshToken })
    } catch { /* silent */ } finally {
      localStorage.clear()
      set({ user: null, token: null, refreshToken: null })
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
