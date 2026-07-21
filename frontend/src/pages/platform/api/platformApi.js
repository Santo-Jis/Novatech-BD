import axios from 'axios'
import toast from 'react-hot-toast'

// ============================================================
// Platform API Client — Support/Full scope staff
// ─────────────────────────────────────────────────────────────
// ইচ্ছাকৃতভাবে src/api/axios.js (tenant-user client) থেকে সম্পূর্ণ
// আলাদা রাখা হলো। platform_staff auth একদম নতুন সিস্টেম:
//   - আলাদা JWT secret (PLATFORM_JWT_SECRET), আলাদা payload shape
//   - কোনো refresh-token endpoint নেই (backend শুধু ১৫ মিনিটের
//     access token দেয়) — তাই এখানে silent-refresh লজিক নেই,
//     মেয়াদ শেষ হলে সরাসরি লগইনে পাঠানো হয়।
//   - 401/403 হ্যান্ডলিং tenant-user flow-কে (যেটা /login-এ পাঠায়)
//     প্রভাবিত করা যাবে না বলেই আলাদা instance।
// ============================================================

const PLATFORM_TOKEN_KEY = 'pf_access_token'

// Access token সেশনজুড়ে (ট্যাব বন্ধ না করা পর্যন্ত) মনে রাখতে
// sessionStorage ব্যবহার — localStorage না, যাতে অন্য ট্যাব/ডিভাইসে
// persist না হয়। ১৫ মিনিট পর এমনিতেই সার্ভার-সাইড invalid হয়ে যাবে।
export const platformTokenStore = {
  get: () => sessionStorage.getItem(PLATFORM_TOKEN_KEY),
  set: (token) => sessionStorage.setItem(PLATFORM_TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(PLATFORM_TOKEN_KEY),
}

const platformApi = axios.create({
  baseURL: import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '/platform/api')
    : '/platform/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

platformApi.interceptors.request.use(
  (config) => {
    const token = platformTokenStore.get()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code

    // কোল্ড-স্টার্ট Render backend হলে প্রথম রিকোয়েস্ট ৫০+ সেকেন্ড
    // লাগতে পারে — network error/timeout-কে আলাদা toast দিয়ে জানাও।
    const isNetworkError = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')
    if (isNetworkError) {
      toast.error('সার্ভার শুরু হতে সময় নিচ্ছে (কোল্ড স্টার্ট)। কিছুক্ষণ পর আবার চেষ্টা করুন।')
      error._toastShown = true
      return Promise.reject(error)
    }

    if (status === 401) {
      platformTokenStore.clear()
      if (code === 'TOKEN_EXPIRED') {
        toast.error('সেশনের মেয়াদ শেষ হয়েছে। আবার লগইন করুন।')
      }
      error._toastShown = true
      if (!window.location.pathname.startsWith('/platform/login')) {
        window.location.href = '/platform/login'
      }
      return Promise.reject(error)
    }

    if (status === 403) {
      toast.error(error.response?.data?.message || 'এই কাজের অনুমতি নেই।')
      error._toastShown = true
    } else if (status >= 500) {
      toast.error('সার্ভারে সমস্যা হয়েছে। পরে চেষ্টা করুন।')
      error._toastShown = true
    }

    return Promise.reject(error)
  }
)

export default platformApi
