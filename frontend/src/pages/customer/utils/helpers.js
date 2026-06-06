// utils/helpers.js

export const fmt = (n) =>
  parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('bn-BD', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—'

// ── Customer code storage ───────────────────────────────────
// URL থেকে পাওয়া ?c=CUSTOMER_CODE localStorage-এ রাখা হয়
// যাতে পরের বার app খুললে সরাসরি auto-login হয়
export const getCustomerCode = () => localStorage.getItem('portal_customer_code')
export const setCustomerCode = (code) => localStorage.setItem('portal_customer_code', code)

// ── JWT Storage ─────────────────────────────────────────────
// localStorage ব্যবহার — app বন্ধ করলেও টিকে থাকে
export const getStorageKey  = (code) => `portal_jwt_${code}`
export const storageGet     = (key)      => localStorage.getItem(key)
export const storageSet     = (key, val) => localStorage.setItem(key, val)
export const storageRemove  = (key)      => localStorage.removeItem(key)
export const storageKeys    = () =>
  Object.keys(localStorage).filter(k => k.startsWith('portal_jwt_'))

// ── JWT Validity Check (client-side, no server call) ────────
// JWT-এর payload decode করে exp চেক করা হয়
// ৩০ দিন পরে backend JWT expire করে — এখানে আগেভাগে ধরা পড়ে
export const isJWTValid = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}
