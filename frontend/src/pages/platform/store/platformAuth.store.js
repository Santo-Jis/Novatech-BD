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

export const usePlatformAuthStore = create((set, get) => ({
  staff: loadStaff(),
  authReady: true,

  isAuthenticated: () => !!platformTokenStore.get() && !!get().staff,

  login: async (email, password) => {
    const res = await platformApi.post('/auth/login', { email, password })
    const { accessToken, staff } = res.data.data
    platformTokenStore.set(accessToken)
    sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff))
    set({ staff })
    return staff
  },

  logout: () => {
    platformTokenStore.clear()
    sessionStorage.removeItem(STAFF_KEY)
    set({ staff: null })
  },
}))
