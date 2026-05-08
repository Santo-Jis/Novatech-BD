import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 12000,
  withCredentials: true,   // HttpOnly cookie cross-origin পাঠাতে হলে লাগবে
  headers: {
    'Content-Type': 'application/json'
  }
})

export function isNetworkError(error) {
  return (
    !error.response &&
    (error.code === 'ECONNABORTED' ||
     error.code === 'ERR_NETWORK' ||
     error.message === 'Network Error')
  )
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

let isRefreshing = false
let failedQueue  = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error)
    else       prom.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // ✅ FIX: Customer Portal routes-এ redirect করবো না
    const isPortalRoute = originalRequest?.url?.includes('/portal/')
    if (isPortalRoute) {
      return Promise.reject(error)
    }

    // ✅ FIX: আগে !code দিয়ে check করা হত — code না থাকলেই redirect।
    // কিন্তু WRONG_TOKEN_TYPE, invalid credentials, OTP fail — এগুলোতেও
    // code থাকে না বা আলাদা code থাকে, তখন legitimate error হারিয়ে যেত।
    // সঠিক logic: শুধু TOKEN_EXPIRED হলে refresh করো,
    // বাকি সব 401 (INVALID_TOKEN, WRONG_TOKEN_TYPE, code নেই) = logout।
    const code = error.response?.data?.code

    if (
      error.response?.status === 401 &&
      code !== 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      // TOKEN_EXPIRED ছাড়া সব 401 — token নেই বা invalid — logout
      if (code === 'WRONG_TOKEN_TYPE') {
        toast.error('অ্যাক্সেস অননুমোদিত। আবার লগইন করুন।')
      }
      localStorage.clear()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (
      error.response?.status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch(err => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing           = true

      try {
        // ✅ FIX: refreshToken body-তে নেই — browser HttpOnly cookie
        // withCredentials: true থাকায় automatically পাঠাবে
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
          {},
          { withCredentials: true }
        )

        const { accessToken } = response.data.data
        localStorage.setItem('accessToken', accessToken)

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
        processQueue(null, accessToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)

      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)

      } finally {
        isRefreshing = false
      }
    }

    if (isNetworkError(error)) {
      if (error.config?.method !== 'get') {
        toast.error('নেটওয়ার্ক সমস্যা। ডেটা পাঠানো যায়নি।')
      }
      return Promise.reject(error)
    }

    const message = error.response?.data?.message || 'সার্ভারে সমস্যা হয়েছে।'

    if (error.response?.status === 403) {
      // component-handled 403 codes — interceptor চুপ থাকবে, double toast হবে না
      const SILENT_403 = ['CHECKIN_REQUIRED']
      if (!SILENT_403.includes(code)) {
        toast.error(error.response?.data?.message || 'এই কাজের অনুমতি নেই।')
      }
    } else if (error.response?.status === 404) {
      // শান্তভাবে handle করো
    } else if (error.response?.status === 400) {
      // component নিজে দেখাবে
    } else if (error.response?.status >= 500) {
      toast.error('সার্ভারে সমস্যা হয়েছে। পরে চেষ্টা করুন।')
    }

    return Promise.reject(error)
  }
)

export default api
