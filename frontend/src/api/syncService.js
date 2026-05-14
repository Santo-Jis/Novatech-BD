// ============================================================
// Sync Service
// Online হলে offline queue auto-sync করে
// ============================================================

import api from '../api/axios'
import {
  getPendingQueue,
  updateQueueItem,
  removeQueueItem,
  getPendingCount,
} from './offlineQueue'
import toast from 'react-hot-toast'

let isSyncing = false
let syncListeners = []

export function onSyncUpdate(fn) {
  syncListeners.push(fn)
  return () => { syncListeners = syncListeners.filter(l => l !== fn) }
}

function notifyListeners(count) {
  syncListeners.forEach(fn => fn(count))
}

// ── Item-এর readable label তৈরি (error toast-এর জন্য) ────────
function _itemLabel(item) {
  const name = item?.payload?._customer_name
  switch (item?.type) {
    case 'SALE': {
      const total = item?.payload?._total
      const amt   = total != null ? ` (৳${Number(total).toLocaleString('bn-BD')})` : ''
      return name ? `বিক্রয় — ${name}${amt}` : 'বিক্রয়'
    }
    case 'VISIT':
      return name ? `ভিজিট — ${name}` : 'ভিজিট'
    case 'ORDER':
      return 'অর্ডার'
    case 'ATTENDANCE':
      return 'হাজিরা'
    default:
      return item?.type || 'ডেটা'
  }
}

// ── একটি queue item sync করা ────────────────────────────────
async function syncItem(item) {
  try {
    await updateQueueItem(item.id, { status: 'syncing' })

    if (item.type === 'SALE') {
      const payload = { ...item.payload }

      // receipt photo base64 থেকে blob বানাও
      if (payload._receipt_photo_base64) {
        try {
          const blob = await fetch(payload._receipt_photo_base64).then(r => r.blob())
          const uploadForm = new FormData()
          uploadForm.append('receipt_photo', blob, 'receipt.jpg')
          const uploadRes = await api.post('/sales/upload-receipt', uploadForm, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          payload.receipt_photo = uploadRes.data.data?.url
        } catch {
          // ছবি upload ব্যর্থ হলেও sale চলবে
        }
        delete payload._receipt_photo_base64
      }

      // offline-এ order_id ছিল না — এখন fetch করো
      if (!payload.order_id) {
        try {
          const orderRes = await api.get('/orders/today')
          const fetchedId = orderRes.data.data?.id
          if (!fetchedId) {
            // order পাওয়া গেছে কিন্তু id নেই — sync করা যাবে না
            throw new Error('আজকের order পাওয়া যায়নি। প্রথমে order তৈরি করুন।')
          }
          payload.order_id = fetchedId
        } catch (orderErr) {
          // order fetch ব্যর্থ — backend order_id ছাড়া sale block করে,
          // তাই এখানেই abort করো। syncItem-এর outer catch এটা handle করবে।
          throw orderErr
        }
      }

      await api.post('/sales', payload)

    } else if (item.type === 'VISIT') {
      const formData = new FormData()
      const p = item.payload

      formData.append('customer_id', p.customer_id)
      formData.append('will_sell', p.will_sell)
      if (p.no_sell_reason) formData.append('no_sell_reason', p.no_sell_reason)
      if (p.latitude)  formData.append('latitude',  p.latitude)
      if (p.longitude) formData.append('longitude', p.longitude)

      // closed shop photo
      if (p._closed_photo_base64) {
        try {
          const blob = await fetch(p._closed_photo_base64).then(r => r.blob())
          formData.append('closed_shop_photo', blob, 'closed_shop.jpg')
        } catch { /* ignore */ }
      }

      await api.post('/sales/visit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

    } else if (item.type === 'ORDER') {
      await api.post('/orders', item.payload)

    } else if (item.type === 'ATTENDANCE') {
      await api.post('/attendance/checkin', item.payload)
    }

    await removeQueueItem(item.id)
    return { success: true }

  } catch (err) {
    const newRetry = (item.retry_count || 0) + 1
    // ৩ বারের বেশি fail হলে failed mark করো
    const newStatus = newRetry >= 3 ? 'failed' : 'pending'
    const errorMsg  = err.response?.data?.message || err.message
    await updateQueueItem(item.id, {
      status: newStatus,
      retry_count: newRetry,
      last_error: errorMsg,
    })
    return { success: false, item, errorMsg }
  }
}

// ── সব pending items sync করা ───────────────────────────────
export async function syncAll() {
  if (isSyncing) return
  if (!navigator.onLine) return

  const items = await getPendingQueue()
  const toSync = items.filter(i => i.status === 'pending' || i.status === 'syncing')
  if (toSync.length === 0) return

  isSyncing = true

  const toastId = toast.loading(
    `⏳ ${toSync.length}টি offline ডেটা sync হচ্ছে...`,
    { duration: Infinity }
  )

  let successCount = 0
  const failures   = []   // { item, errorMsg }

  for (const item of toSync) {
    const result = await syncItem(item)
    if (result.success) successCount++
    else failures.push({ item: result.item, errorMsg: result.errorMsg })
  }

  toast.dismiss(toastId)

  const failCount = failures.length

  if (successCount > 0 && failCount === 0) {
    toast.success(`✅ ${successCount}টি ডেটা সফলভাবে sync হয়েছে!`, { duration: 4000 })

  } else if (successCount > 0 && failCount > 0) {
    toast(`✅ ${successCount}টি sync হয়েছে, ⚠️ ${failCount}টি ব্যর্থ হয়েছে`, {
      icon: '⚠️',
      duration: 5000,
    })
    // প্রতিটি failure-এর জন্য আলাদা বিস্তারিত toast
    failures.forEach(({ item, errorMsg }) => {
      const label = _itemLabel(item)
      toast.error(`❌ ${label} — ${errorMsg}`, { duration: 8000 })
    })

  } else if (failCount > 0) {
    failures.forEach(({ item, errorMsg }) => {
      const label = _itemLabel(item)
      toast.error(`❌ ${label} — ${errorMsg}`, { duration: 8000 })
    })
  }

  isSyncing = false

  // Update listener
  const remaining = await getPendingCount()
  notifyListeners(remaining)
}

// ── Online event এ auto sync ─────────────────────────────────
export function initAutoSync() {
  // App crash হলে 'syncing' status আটকে যেতে পারে —
  // startup-এ এগুলো 'pending'-এ reset করো
  getPendingQueue().then(items => {
    const stuck = items.filter(i => i.status === 'syncing')
    stuck.forEach(i => updateQueueItem(i.id, { status: 'pending' }))
  })

  window.addEventListener('online', () => {
    setTimeout(() => syncAll(), 1500) // একটু দেরি করে sync শুরু
  })

  // App open হলেও check করো
  if (navigator.onLine) {
    setTimeout(() => syncAll(), 3000)
  }
}

// ── Manual retry (failed items) ─────────────────────────────
export async function retryFailed() {
  const items = await getPendingQueue()
  const failed = items.filter(i => i.status === 'failed')
  for (const item of failed) {
    await updateQueueItem(item.id, { status: 'pending', retry_count: 0 })
  }
  await syncAll()
}
