// utils/helpers.js
// ছোট ছোট helper functions

/**
 * সংখ্যা বাংলা locale-এ format করো (comma separator)
 * @param {number|string} n
 * @returns {string}
 */
export const fmt = (n) =>
  parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })

/**
 * Date string বাংলা locale-এ format করো
 * @param {string} d
 * @returns {string}
 */
export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('bn-BD', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

/**
 * sessionStorage-এর portal JWT key তৈরি করো
 * @param {string|number} customerId
 * @returns {string}
 */
export const getStorageKey = (customerId) => `portal_jwt_${customerId}`

// sessionStorage wrapper functions
export const storageGet    = (key) => sessionStorage.getItem(key)
export const storageSet    = (key, val) => sessionStorage.setItem(key, val)
export const storageRemove = (key) => sessionStorage.removeItem(key)
export const storageKeys   = () =>
  Object.keys(sessionStorage).filter(k => k.startsWith('portal_jwt_'))
