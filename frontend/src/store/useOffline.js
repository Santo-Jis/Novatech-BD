// ============================================================
// useOffline Hook
// Network status + pending queue count track করে
// ============================================================

import { useState, useEffect } from 'react'
import { getPendingCount } from '../api/offlineQueue'
import { onSyncUpdate } from '../api/syncService'

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    // Initial count
    getPendingCount().then(setPendingCount)

    // Network events
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)

    // Sync হলে count update
    const unsub = onSyncUpdate(setPendingCount)

    // প্রতি ৩০ সেকেন্ডে count refresh
    const interval = setInterval(async () => {
      const count = await getPendingCount()
      setPendingCount(count)
    }, 30000)

    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
      unsub()
      clearInterval(interval)
    }
  }, [])

  return { isOnline, pendingCount }
}
