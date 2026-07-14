// utils/api.js
// Backend URL এবং portalFetch (token auto-inject + 401 refresh + timeout + retry)

import { portalTokenStore } from './portalTokenStore'

// ✅ COOKIE FIX: production-এ relative '/api' পাথ ব্যবহার করা হচ্ছে (cross-origin URL না)।
//    Vercel-এর vercel.json rewrite এটাকে Render backend-এ proxy করে দেয়।
//    ফলে browser-এর কাছে request same-origin মনে হয় → portal_rt cookie
//    third-party হিসেবে ব্লক হয় না (Chrome-এর third-party cookie block বাইপাস হয়)।
//    Dev-এ (localhost) সরাসরি backend URL লাগে যেহেতু rewrite proxy কাজ করে না।
export const BACKEND = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  : '/api'

// ── Refresh queue ────────────────────────────────────────────
// একসাথে একাধিক request 401 পেলে শুধু একটিই refresh call হবে,
// বাকিগুলো queue-তে wait করবে।
let _isRefreshing = false
let _queue        = []  // [{ resolve, reject }]

const flushQueue = (err, token = null) => {
  _queue.forEach(p => (err ? p.reject(err) : p.resolve(token)))
  _queue = []
}

/**
 * portalFetch — Authorization header দিতে হবে না, auto-inject হয়।
 * 401 পেলে HttpOnly cookie দিয়ে /portal/refresh → নতুন token → retry।
 *
 * @param {string}  path         — '/portal/dashboard' আকারে
 * @param {object}  options      — fetch options (method, body, headers…)
 * @param {number}  retries      — network error-এ retry count (default 1)
 * @param {boolean} _skipRefresh — internal flag (বাইরে দেবেন না)
 */
export const portalFetch = async (path, options = {}, retries = 1, _skipRefresh = false) => {
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 15000)

  // ── Token auto-inject ────────────────────────────────────
  const token   = portalTokenStore.get()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  try {
    const res = await fetch(`${BACKEND}${path}`, {
      credentials: 'include',  // ✅ HttpOnly refresh cookie পাঠাতে হবে
      signal: controller.signal,
      ...options,
      headers,
    })
    clearTimeout(timeout)

    // ── 401: auto-refresh → retry ────────────────────────
    if (res.status === 401 && !_skipRefresh) {
      if (_isRefreshing) {
        // অন্য request আগেই refresh করছে — queue-এ wait
        return new Promise((resolve, reject) => _queue.push({ resolve, reject }))
          .then(newToken =>
            portalFetch(
              path,
              { ...options, headers: { ...options.headers, Authorization: `Bearer ${newToken}` } },
              0,
              true
            )
          )
      }

      _isRefreshing = true
      try {
        const refreshRes = await fetch(`${BACKEND}/portal/refresh`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
        })

        if (!refreshRes.ok) {
          const errData = await refreshRes.json().catch(() => ({}))
          const err = { status: refreshRes.status, message: errData.message || 'Session শেষ হয়েছে।' }
          flushQueue(err)
          _isRefreshing = false
          portalTokenStore.clear()
          throw err
        }

        const { data }           = await refreshRes.json()
        const { portal_jwt: newToken, expires_in = 900 } = data
        portalTokenStore.set(newToken, expires_in)
        flushQueue(null, newToken)
        _isRefreshing = false

        return portalFetch(
          path,
          { ...options, headers: { ...options.headers, Authorization: `Bearer ${newToken}` } },
          0,
          true
        )
      } catch (refreshErr) {
        flushQueue(refreshErr)
        _isRefreshing = false
        portalTokenStore.clear()
        throw refreshErr
      }
    }

    const data = await res.json()
    if (!res.ok) throw { status: res.status, message: data.message || 'Error' }
    return data

  } catch (err) {
    clearTimeout(timeout)
    // Network error / timeout → একবার retry (401/403 retry করবে না)
    if (retries > 0 && err.name !== 'AbortError' && !err.status) {
      await new Promise(r => setTimeout(r, 1000))
      return portalFetch(path, options, retries - 1, _skipRefresh)
    }
    throw err
  }
}
