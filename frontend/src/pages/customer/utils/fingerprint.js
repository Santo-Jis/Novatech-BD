// utils/fingerprint.js
// Device Fingerprint — persistent + hardware-based strong ID
//
// দুই স্তরে তৈরি:
//   ১. Persistent ID  — IndexedDB-তে random UUID store করা হয়।
//      একবার তৈরি হলে browser clear না করা পর্যন্ত একই থাকে।
//      localStorage ব্যবহার করা হয়নি — private mode-এ wipe হয়।
//
//   ২. Hardware signals — canvas fingerprint + audio context + fonts।
//      এগুলো device-specific এবং JS দিয়ে সহজে override করা যায় না।
//
//   দুটো মিলিয়ে final ID তৈরি হয় → server-side তার সাথে
//   User-Agent ও IP মিশিয়ে SHA-256 hash করে।
//   শুধু device_id চুরি করলেই হবে না — UA ও IP-ও মিলতে হবে।

// IndexedDB থেকে persistent device UUID পড়া/তৈরি করা
const getPersistentDeviceId = () => new Promise((resolve) => {
  try {
    const DB_NAME    = 'portal_device'
    const STORE_NAME = 'ids'
    const KEY        = 'device_uuid'

    const req = indexedDB.open(DB_NAME, 1)

    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME)
    }

    req.onsuccess = (e) => {
      const db  = e.target.result
      const tx  = db.transaction(STORE_NAME, 'readwrite')
      const st  = tx.objectStore(STORE_NAME)
      const get = st.get(KEY)

      get.onsuccess = () => {
        if (get.result) {
          resolve(get.result)
        } else {
          // প্রথমবার — random UUID তৈরি করে store করো
          const uuid = crypto.randomUUID
            ? crypto.randomUUID()
            : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map(b => b.toString(16).padStart(2, '0')).join('-')
          st.put(uuid, KEY)
          resolve(uuid)
        }
      }
      get.onerror = () => resolve('idb-error')
    }

    req.onerror = () => resolve('idb-open-error')
  } catch {
    resolve('idb-unavailable')
  }
})

// Canvas fingerprint — GPU rendering থেকে hardware-specific signal
const getCanvasFingerprint = () => {
  try {
    const canvas  = document.createElement('canvas')
    canvas.width  = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'no-canvas'

    ctx.textBaseline = 'top'
    ctx.font         = '14px Arial'
    ctx.fillStyle    = '#f60'
    ctx.fillRect(0, 0, 200, 50)
    ctx.fillStyle    = '#069'
    ctx.fillText('ZovoriX Portal 🔐', 2, 15)
    ctx.fillStyle    = 'rgba(102,204,0,0.8)'
    ctx.fillText('ZovoriX Portal 🔐', 4, 25)

    return canvas.toDataURL().slice(-80) // শেষ ৮০ char — pixel hash
  } catch {
    return 'canvas-blocked'
  }
}

// Audio context fingerprint — audio hardware থেকে signal
const getAudioFingerprint = () => {
  try {
    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
    if (!AudioCtx) return Promise.resolve('no-audio')

    return new Promise((resolve) => {
      const ctx  = new AudioCtx(1, 44100, 44100)
      const osc  = ctx.createOscillator()
      const comp = ctx.createDynamicsCompressor()

      osc.type = 'triangle'
      osc.frequency.value = 10000
      osc.connect(comp)
      comp.connect(ctx.destination)
      osc.start(0)

      ctx.startRendering()
      ctx.oncomplete = (e) => {
        const data = e.renderedBuffer.getChannelData(0)
        let sum = 0
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i])
        resolve(sum.toString().slice(0, 12))
      }

      // timeout — কিছু browser-এ oncomplete না আসলে fallback
      setTimeout(() => resolve('audio-timeout'), 500)
    })
  } catch {
    return Promise.resolve('audio-error')
  }
}

/**
 * getDeviceFingerprint — সব signal একত্রিত করে persistent SHA-256 fingerprint তৈরি
 * @returns {Promise<string>} 64-char hex fingerprint
 */
export const getDeviceFingerprint = async () => {
  try {
    const [persistentId, audioFp] = await Promise.all([
      getPersistentDeviceId(),
      getAudioFingerprint(),
    ])

    const canvasFp = getCanvasFingerprint()

    const parts = [
      persistentId,                              // IndexedDB UUID (persistent)
      canvasFp,                                  // GPU-based canvas hash
      audioFp,                                   // Audio hardware signal
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || '',
      navigator.platform || '',
    ]

    // SubtleCrypto দিয়ে SHA-256 hash — btoa থেকে অনেক বেশি collision-resistant
    const encoded = new TextEncoder().encode(parts.join('||'))
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
    const hashArr = Array.from(new Uint8Array(hashBuf))
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64)
  } catch {
    // Fallback: sync version (old behavior) — SubtleCrypto না থাকলে
    try {
      const parts = [
        navigator.userAgent, navigator.language,
        `${screen.width}x${screen.height}`,
        screen.colorDepth, new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || '', navigator.platform || '',
      ]
      return btoa(parts.join('|')).replace(/[/+=]/g, '').slice(0, 64)
    } catch {
      try {
        return crypto.randomUUID().replace(/-/g, '')
      } catch {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
      }
    }
  }
}

/**
 * Google GSI library লোড করো
 */
export const loadGSI = () => new Promise((resolve, reject) => {
  if (window.google?.accounts) { resolve(window.google.accounts); return }
  const script = document.createElement('script')
  script.src   = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = () => resolve(window.google.accounts)
  script.onerror = () => reject(new Error('Google login library load হয়নি।'))
  document.head.appendChild(script)
})

/**
 * Web-এ Google OAuth popup দিয়ে access_token নাও
 * @param {string} clientId
 * @returns {Promise<string>} access_token
 */
export const webGoogleLogin = (clientId) => new Promise(async (resolve, reject) => {
  try {
    const accounts = await loadGSI()
    accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     'openid email profile',
      callback:  (response) => {
        if (response.error) {
          reject(new Error(response.error === 'access_denied'
            ? 'লগইন বাতিল করা হয়েছে।'
            : `Google error: ${response.error}`))
        } else {
          resolve(response.access_token)
        }
      },
    }).requestAccessToken()
  } catch (err) {
    reject(err)
  }
})
