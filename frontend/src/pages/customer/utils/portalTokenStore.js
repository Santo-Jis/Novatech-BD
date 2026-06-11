// utils/portalTokenStore.js
//
// Portal access token — শুধু JS heap-এ (memory)।
// localStorage / sessionStorage-এ কিছুই যাবে না।
//
// ❌ আগে:  localStorage.setItem(`portal_jwt_${code}`, jwtToken)   ← XSS-এ চুরি হয়
// ✅ এখন:  portalTokenStore.set(token, expiresIn)                  ← JS heap, পড়া যায় না
//
// page refresh হলে token হারায়, কিন্তু backend-এর HttpOnly cookie থেকে
// /portal/refresh endpoint-এ নতুন access token পাওয়া যায়।

let _accessToken = null
let _expiresAt   = null

const REFRESH_BUFFER_MS = 60 * 1000  // expire-এর ১ মিনিট আগে refresh করার signal

export const portalTokenStore = {
  /** current access token */
  get: () => _accessToken,

  /**
   * @param {string} token     — 15-মিনিট access JWT (backend response body থেকে)
   * @param {number} expiresIn — seconds (backend expires_in field)
   */
  set: (token, expiresIn = 900) => {
    _accessToken = token
    _expiresAt   = Date.now() + expiresIn * 1000
  },

  /** portalFetch auto-refresh-এর জন্য */
  isExpired: () => {
    if (!_accessToken || !_expiresAt) return true
    return Date.now() > _expiresAt - REFRESH_BUFFER_MS
  },

  /** logout বা auth error-এ */
  clear: () => {
    _accessToken = null
    _expiresAt   = null
  },
}
