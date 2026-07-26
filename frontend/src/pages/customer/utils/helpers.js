// utils/helpers.js

export const fmt = (n) =>
  parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('bn-BD', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—'

// ── Customer code storage ────────────────────────────────────
// customer_code sensitive নয় — URL-এ থাকে, localStorage-এ রাখা নিরাপদ।
// এটা শুধু "কোন customer-এর portal" তা identify করে — auth token নয়।
export const getCustomerCode = () => localStorage.getItem('portal_customer_code')
export const setCustomerCode = (code) => localStorage.setItem('portal_customer_code', code)

// ── Person ID storage (company-বিহীন self-register প্রোফাইল) ──
// person_id-ও sensitive না (UUID, auth token না) — একই কারণে localStorage-এ রাখা নিরাপদ।
// self-register-এর পর প্রথমবার Gmail bind করার জন্য directGoogleAuth-এ পাঠানো হয়।
export const getPersonId = () => localStorage.getItem('portal_person_id')
export const setPersonId = (id) => localStorage.setItem('portal_person_id', id)
export const clearPersonId = () => localStorage.removeItem('portal_person_id')

// ── সরানো হয়েছে ──────────────────────────────────────────────
// getStorageKey, storageGet, storageSet, storageRemove, storageKeys, isJWTValid
//
// ❌ এগুলো localStorage-এ JWT রাখত → XSS-এ চুরি হওয়ার ঝুঁকি ছিল
// ✅ এখন:  portalTokenStore.js  → memory (access token, 15 min)
//           HttpOnly cookie      → refresh token (30 day), JS পড়তে পারে না
