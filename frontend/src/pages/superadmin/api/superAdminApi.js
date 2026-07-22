import axios from 'axios'
import toast from 'react-hot-toast'

// ============================================================
// Super Admin API Client
// ─────────────────────────────────────────────────────────────
// Super Admin auth backend/src/routes/superAdmin.routes.js অনুযায়ী
// JWT না — একটামাত্র static secret key (X-Super-Admin-Key header),
// যেটা .env-এর SUPER_ADMIN_SECRET_KEY-এর সাথে timing-safe compare হয়।
// তাই platformApi.js-এর মতো Authorization: Bearer না, বরং প্রতি
// request-এ এই কাস্টম হেডার বসানো হচ্ছে। কোনো refresh/expiry নেই —
// key ঠিক থাকলে session চলতেই থাকবে, ভুল/absent হলে 401।
// ============================================================

const SA_KEY_STORAGE = 'sa_secret_key'

// sessionStorage — ট্যাব বন্ধ হলে মুছে যাবে, localStorage-এ persist
// করানো হচ্ছে না যেহেতু এটা সবচেয়ে সংবেদনশীল credential (পুরো প্ল্যাটফর্মের
// সব tenant-এর অ্যাক্সেস)।
export const superAdminKeyStore = {
  get:   () => sessionStorage.getItem(SA_KEY_STORAGE),
  set:   (key) => sessionStorage.setItem(SA_KEY_STORAGE, key),
  clear: () => sessionStorage.removeItem(SA_KEY_STORAGE),
}

const superAdminApi = axios.create({
  baseURL: import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '/superadmin/api')
    : '/superadmin/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

superAdminApi.interceptors.request.use(
  (config) => {
    const key = superAdminKeyStore.get()
    if (key) config.headers['X-Super-Admin-Key'] = key
    return config
  },
  (error) => Promise.reject(error)
)

superAdminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status

    const isNetworkError = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')
    if (isNetworkError) {
      toast.error('সার্ভার শুরু হতে সময় নিচ্ছে (কোল্ড স্টার্ট)। কিছুক্ষণ পর আবার চেষ্টা করুন।')
      error._toastShown = true
      return Promise.reject(error)
    }

    if (status === 401) {
      superAdminKeyStore.clear()
      toast.error('Key ভুল অথবা মেয়াদ নেই। আবার দিন।')
      error._toastShown = true
      if (!window.location.pathname.startsWith('/superadmin/login')) {
        window.location.href = '/superadmin/login'
      }
      return Promise.reject(error)
    }

    if (status === 429) {
      toast.error(error.response?.data?.message || 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।')
      error._toastShown = true
    } else if (status >= 500) {
      toast.error('সার্ভারে সমস্যা হয়েছে। পরে চেষ্টা করুন।')
      error._toastShown = true
    }

    return Promise.reject(error)
  }
)

export default superAdminApi
