import { create } from 'zustand'
import api, { tokenStore } from '../api/axios'
import { clearAllData } from '../api/offlineQueue'
import toast from 'react-hot-toast'

// ============================================================
// Auth Store — Zustand
// লগইন, লগআউট, ইউজার তথ্য
// ============================================================

// ⚠️ SECURITY: localStorage-এ শুধু UI-এর জন্য দরকারী fields সেভ হবে।
// basic_salary, outstanding_dues, manager_id, nid — localStorage-এ কখনো না।
// এগুলো দরকার হলে GET /api/auth/my-sensitive-info থেকে নাও (component state-এ রাখো)।
//
// accessToken — আর localStorage-এ নেই। tokenStore (in-memory) এ থাকে।
// Page refresh হলে /auth/refresh → HttpOnly refreshToken দিয়ে নতুন accessToken নেওয়া হয়।
const SAFE_USER_FIELDS = ['id', 'role', 'employee_code', 'name_bn', 'name_en',
  'email', 'phone', 'profile_photo', 'status', 'join_date']

const toSafeUser = (user) => {
  if (!user) return null
  return SAFE_USER_FIELDS.reduce((acc, key) => {
    if (user[key] !== undefined) acc[key] = user[key]
    return acc
  }, {})
}

export const useAuthStore = create((set, get) => ({
  user:      JSON.parse(localStorage.getItem('user') || 'null'),
  // ✅ token এখন শুধু memory-তে (tokenStore) — localStorage-এ নেই।
  // store-এ boolean হিসেবে রাখা হচ্ছে — UI logic-এর জন্য (logged in কিনা)।
  token:     tokenStore.get(),
  loading:   false,
  // ✅ authReady: silentRefresh শেষ হওয়ার আগে ProtectedRoute render ব্লক করে।
  // App mount-এ false থাকে, silentRefresh/skip হলে true হয়।
  authReady: false,

  // ── LOGIN ──
  login: async (identifier, password) => {
    set({ loading: true })
    try {
      const response = await api.post('/auth/login', { identifier, password })
      const { user, accessToken } = response.data.data
      // refreshToken: server HttpOnly cookie-তে সেট করেছে — JS-এ দেখা যাবে না

      // ✅ accessToken শুধু memory-তে — localStorage-এ যাবে না
      tokenStore.set(accessToken)

      // ⚠️ SECURITY: sensitive fields বাদ দিয়ে localStorage-এ সেভ
      const safeUser = toSafeUser(user)
      localStorage.setItem('user', JSON.stringify(safeUser))

      set({ user: safeUser, token: accessToken, loading: false, authReady: true })

      // লগইনের পর Eruda দেখাও
      if (typeof window.__showEruda === 'function') window.__showEruda()

      toast.success(`স্বাগতম, ${user.name_bn}!`)
      return { success: true, user: safeUser }

    } catch (error) {
      set({ loading: false })
      const message = error.response?.data?.message || 'লগইন ব্যর্থ হয়েছে।'
      toast.error(message)
      return { success: false, message }
    }
  },

  // ── SILENT REFRESH (page load-এ call করো) ──
  // accessToken memory-তে থাকে — refresh হলে হারায়।
  // App mount-এ এই function call করলে HttpOnly refreshToken দিয়ে
  // নতুন accessToken নেওয়া হয় — user আবার logged in হয়ে যায়।
  silentRefresh: async () => {
    try {
      const response = await api.post('/auth/refresh', {})

      const { accessToken } = response.data.data
      tokenStore.set(accessToken)
      set({ token: accessToken, authReady: true })
      return true
    } catch {
      // refreshToken নেই বা expire — logout state
      tokenStore.clear()
      localStorage.removeItem('user')
      set({ user: null, token: null, authReady: true })
      return false
    }
  },

  // ── LOGOUT ──
  logout: async () => {
    // portal_jwt_* keys গুলো আগে save করি — customer portal এর জন্য দরকার
    const portalKeys = Object.keys(localStorage).filter(k => k.startsWith('portal_jwt_'))
    const portalData = {}
    portalKeys.forEach(k => { portalData[k] = localStorage.getItem(k) })

    // ১. আগেই UI clear করো — ইউজার সাথে সাথে লগইন পেজে যাবে
    localStorage.clear()
    tokenStore.clear()   // memory-ও clear

    // portal_jwt গুলো ফিরিয়ে দাও
    Object.entries(portalData).forEach(([k, v]) => localStorage.setItem(k, v))

    set({ user: null, token: null })
    if (typeof window.__hideEruda === 'function') window.__hideEruda()

    // ২. ব্যাকগ্রাউন্ডে server logout (3s timeout — আটকাবে না)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3000)
      await api.post('/auth/logout', {}, { signal: controller.signal })
      clearTimeout(timer)
    } catch { /* timeout বা network error — কিছু করার নেই */ }

    // ৩. IndexedDB clear — redirect-এর আগে await করতে হবে।
    // background-এ রাখলে page unload হওয়ার সাথে সাথে deleteDatabase বন্ধ হয়,
    // পুরনো offline data থেকে যায় — race condition।
    // 2s timeout দিয়ে block করা হচ্ছে না — তবু সুযোগ দেওয়া হচ্ছে।
    await Promise.race([
      clearAllData(),
      new Promise(resolve => setTimeout(resolve, 2000))  // max 2s wait
    ]).catch(() => {})

    // ৪. Hard redirect — IndexedDB clear হওয়ার পরে
    window.location.href = '/login'
  },

  // ── UPDATE USER ──
  updateUser: (updatedUser) => {
    // ⚠️ SECURITY: update-এও sensitive fields ফিল্টার করো
    const merged = toSafeUser({ ...get().user, ...updatedUser })
    localStorage.setItem('user', JSON.stringify(merged))
    set({ user: merged })
  },

  // ── FETCH ME ──
  fetchMe: async () => {
    try {
      const response = await api.get('/auth/me')
      const user     = response.data.data
      // ⚠️ SECURITY: /me থেকে আসা data-ও ফিল্টার করে সেভ
      const safeUser = toSafeUser(user)
      localStorage.setItem('user', JSON.stringify(safeUser))
      set({ user: safeUser })
    } catch { /* silent */ }
  },

  // ── HELPERS ──
  isAdmin:   () => get().user?.role === 'admin',
  isManager: () => ['manager', 'supervisor', 'asm', 'rsm'].includes(get().user?.role),
  isWorker:  () => get().user?.role === 'worker',
}))
