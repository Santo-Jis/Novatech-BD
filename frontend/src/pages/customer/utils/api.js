// utils/api.js
// Backend URL এবং portalFetch (timeout + retry) এখানে থাকে

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

/**
 * portalFetch — timeout (15s) + retry (1 বার) সহ fetch wrapper
 * @param {string} path  - API path, যেমন '/portal/dashboard'
 * @param {object} options - fetch options (headers, method, body ইত্যাদি)
 * @param {number} retries - retry count (default 1)
 */
export const portalFetch = async (path, options = {}, retries = 1) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

  try {
    const res = await fetch(`${BACKEND}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeout)
    const data = await res.json()
    if (!res.ok) throw { status: res.status, message: data.message || 'Error' }
    return data
  } catch (err) {
    clearTimeout(timeout)
    // Network error বা timeout হলে একবার retry করো (401/403 retry করবে না)
    if (retries > 0 && err.name !== 'AbortError' && !err.status) {
      await new Promise(r => setTimeout(r, 1000)) // 1s পরে retry
      return portalFetch(path, options, retries - 1)
    }
    throw err
  }
}
