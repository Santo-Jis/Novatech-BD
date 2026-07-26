import { create } from 'zustand'
import platformApi, { platformTokenStore } from '../api/platformApi'

// staff object sessionStorage-এ রাখা হয় শুধু UI re-render (নাম/scope
// দেখানোর) সুবিধার জন্য — কোনো sensitive data না, token আলাদা রাখা হয়।
const STAFF_KEY = 'pf_staff'

const loadStaff = () => {
  try {
    const raw = sessionStorage.getItem(STAFF_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const applySession = (set, accessToken, staff) => {
  platformTokenStore.set(accessToken)
  sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff))
  set({ staff })
}

export const usePlatformAuthStore = create((set, get) => ({
  staff: loadStaff(),
  authReady: true,

  isAuthenticated: () => !!platformTokenStore.get() && !!get().staff,

  // ✅ 2FA-aware login — 2FA চালু থাকা staff-এর জন্য response-এ
  // { requires2FA: true, pendingToken } আসবে, তখনো session সেট হয় না।
  // Login.jsx সেটা দেখে দ্বিতীয় ধাপে (TOTP কোড) নিয়ে যাবে।
  login: async (email, password) => {
    const res = await platformApi.post('/auth/login', { email, password })
    const data = res.data.data

    if (data.requires2FA) {
      return { requires2FA: true, pendingToken: data.pendingToken }
    }

    applySession(set, data.accessToken, data.staff)
    return { requires2FA: false, staff: data.staff }
  },

  // 2FA ধাপ ২ — TOTP কোড অথবা recovery code
  completeTwoFactor: async (pendingToken, code) => {
    const res = await platformApi.post('/auth/verify-2fa', { pendingToken, code })
    const { accessToken, staff } = res.data.data
    applySession(set, accessToken, staff)
    return staff
  },

  logout: () => {
    platformTokenStore.clear()
    sessionStorage.removeItem(STAFF_KEY)
    set({ staff: null })
  },
}))
