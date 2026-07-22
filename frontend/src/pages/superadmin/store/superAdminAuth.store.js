import { create } from 'zustand'
import superAdminApi, { superAdminKeyStore } from '../api/superAdminApi'

// এখানে সত্যিকারের কোনো /login endpoint নেই (backend শুধু header-key
// compare করে) — তাই "লগইন" মানে হলো key sessionStorage-এ বসিয়ে
// একটা real endpoint (হালকা /tenants?limit=1) কল করে verify করা যে key
// সঠিক কিনা। ভুল হলে key মুছে error দেখানো হয়।
export const useSuperAdminAuthStore = create((set, get) => ({
  ready: !!superAdminKeyStore.get(),

  isAuthenticated: () => !!superAdminKeyStore.get(),

  login: async (secretKey) => {
    superAdminKeyStore.set(secretKey)
    try {
      await superAdminApi.get('/tenants', { params: { limit: 1 } })
      set({ ready: true })
    } catch (err) {
      superAdminKeyStore.clear()
      set({ ready: false })
      throw err
    }
  },

  logout: () => {
    superAdminKeyStore.clear()
    set({ ready: false })
  },
}))
