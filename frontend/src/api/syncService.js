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

// ── একটি queue item sync করা ────────────────────────────────
async function syncItem(item) {
  try {
    await updateQueueItem(item.id, { status: 'syncing' })

    if (item.type === 'SALE') {
      // FormData বানাও (receipt photo থাকতে পারে)
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
    await updateQueueItem(item.id, {
      status: newStatus,
      retry_count: newRetry,
      last_error: err.response?.data?.message || err.message,
    })
    return { success: false, error: err }
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
  let failCount = 0

  for (const item of toSync) {
    const result = await syncItem(item)
    if (result.success) successCount++
    else failCount++
  }

  toast.dismiss(toastId)

  if (successCount > 0 && failCount === 0) {
    toast.success(`✅ ${successCount}টি ডেটা সফলভাবে sync হয়েছে!`, { duration: 4000 })
  } else if (successCount > 0 && failCount > 0) {
    toast(`✅ ${successCount}টি sync হয়েছে, ⚠️ ${failCount}টি ব্যর্থ হয়েছে`, {
      icon: '⚠️',
      duration: 5000,
    })
  } else if (failCount > 0) {
    toast.error(`❌ ${failCount}টি sync ব্যর্থ হয়েছে। পরে আবার চেষ্টা হবে।`)
  }

  isSyncing = false

  // Update listener
  const remaining = await getPendingCount()
  notifyListeners(remaining)
}

// ── Online event এ auto sync ─────────────────────────────────
export function initAutoSync() {
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
