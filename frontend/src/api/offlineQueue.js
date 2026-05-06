// ============================================================
// Offline Queue Service
// IndexedDB দিয়ে offline এ যা করা হয়, পরে sync হয়
// ============================================================

const DB_NAME = 'novatech_offline'
const DB_VERSION = 1
const STORE_QUEUE = 'queue'
const STORE_CACHE = 'cache'

// Cache ২৪ ঘণ্টার বেশি পুরনো হলে stale ধরা হবে
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// আজকের তারিখ YYYY-MM-DD ফরম্যাটে
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

let db = null

// ── IndexedDB খোলা ──────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db)

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const database = e.target.result

      // Pending actions queue
      if (!database.objectStoreNames.contains(STORE_QUEUE)) {
        const store = database.createObjectStore(STORE_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('created_at', 'created_at', { unique: false })
      }

      // Offline cache (products, customers)
      if (!database.objectStoreNames.contains(STORE_CACHE)) {
        database.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      }
    }

    req.onsuccess = (e) => {
      db = e.target.result
      resolve(db)
    }

    req.onerror = () => reject(req.error)
  })
}

// ── Queue এ action যোগ করা ──────────────────────────────────
export async function enqueue(action) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)
    const item = {
      ...action,
      created_at: Date.now(),
      status: 'pending', // pending | syncing | failed
      retry_count: 0,
    }
    const req = store.add(item)
    req.onsuccess = () => resolve(req.result) // returns id
    req.onerror = () => reject(req.error)
  })
}

// ── সব pending items পাওয়া ──────────────────────────────────
export async function getPendingQueue() {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_QUEUE, 'readonly')
    const store = tx.objectStore(STORE_QUEUE)
    const req = store.getAll()
    req.onsuccess = () =>
      resolve(req.result.filter(i => i.status !== 'synced'))
    req.onerror = () => reject(req.error)
  })
}

// ── একটি item update করা ────────────────────────────────────
export async function updateQueueItem(id, updates) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = { ...getReq.result, ...updates }
      const putReq = store.put(item)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ── synced item মুছে ফেলা ───────────────────────────────────
export async function removeQueueItem(id) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── Cache save ───────────────────────────────────────────────
export async function saveCache(key, data) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CACHE, 'readwrite')
    const store = tx.objectStore(STORE_CACHE)
    const req = store.put({ key, data, saved_at: Date.now(), saved_date: todayStr() })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── Cache পড়া ───────────────────────────────────────────────
// return: { data, isToday } | null
// isToday = false হলে আজকের ডেটা নয় — UI তে সতর্কতা দেখাবে
export async function getCache(key) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CACHE, 'readonly')
    const store = tx.objectStore(STORE_CACHE)
    const req = store.get(key)
    req.onsuccess = () => {
      const record = req.result
      if (!record) return resolve(null)
      const isExpired = Date.now() - record.saved_at > CACHE_TTL_MS
      if (isExpired) return resolve(null)
      resolve({
        data:    record.data,
        isToday: record.saved_date === todayStr(),
      })
    }
    req.onerror = () => reject(req.error)
  })
}

// ── Queue count ──────────────────────────────────────────────
export async function getPendingCount() {
  const items = await getPendingQueue()
  return items.filter(i => i.status === 'pending' || i.status === 'failed').length
}


// ── Logout এ সব data মুছে ফেলা ──────────────────────────────
// user পরিবর্তন হলে অবশ্যই call করতে হবে
export async function clearAllData() {
  // in-memory reference বন্ধ করো
  if (db) {
    db.close()
    db = null
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
    // blocked হলে অন্য tab DB ধরে আছে — তবু resolve করো
    req.onblocked = () => resolve()
  })
}
