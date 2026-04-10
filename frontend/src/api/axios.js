import axios from 'axios'
import toast from 'react-hot-toast'

// ============================================================
// Axios Instance
// Base URL + Auto Token Refresh
// ============================================================

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

// ============================================================
// Request Interceptor — Token যোগ করো
// ============================================================

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

// ============================================================
// Response Interceptor — Token Refresh
// ============================================================

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

    // Token মেয়াদ শেষ হলে Refresh করো
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
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

      const refreshToken = localStorage.getItem('refreshToken')

      if (!refreshToken) {
        // লগআউট করো
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
          { refreshToken }
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

    // সাধারণ Error Handle
    const message = error.response?.data?.message || 'সার্ভারে সমস্যা হয়েছে।'

    if (error.response?.status === 403) {
      toast.error('এই কাজের অনুমতি নেই।')
    } else if (error.response?.status === 404) {
      // 404 শান্তভাবে handle করো
    } else if (error.response?.status >= 500) {
      toast.error('সার্ভারে সমস্যা হয়েছে। পরে চেষ্টা করুন।')
    }

    return Promise.reject(error)
  }
)

export default api
