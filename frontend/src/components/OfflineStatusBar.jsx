// ============================================================
// OfflineStatusBar Component
// Worker layout এর উপরে দেখায় — offline/syncing/done
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { FiWifiOff, FiRefreshCw, FiClock } from 'react-icons/fi'
import { useOffline } from '../store/useOffline'

export default function OfflineStatusBar() {
  const { isOnline, pendingCount } = useOffline()
  const [showSynced, setShowSynced] = useState(false)
  const prevPending = usePrevious(pendingCount)

  // pending ছিল, এখন 0 হয়ে গেছে → "sync হয়েছে" ২ সেকেন্ড দেখাও
  useEffect(() => {
    if (isOnline && prevPending > 0 && pendingCount === 0) {
      setShowSynced(true)
      const t = setTimeout(() => setShowSynced(false), 2500)
      return () => clearTimeout(t)
    }
  }, [isOnline, pendingCount, prevPending])

  // সব ঠিক — কিছু দেখাবো না
  if (isOnline && pendingCount === 0 && !showSynced) return null

  // ── Sync সম্পন্ন ──
  if (showSynced) {
    return (
      <div className="bg-emerald-600 text-white px-4 py-2 flex items-center gap-2 text-xs">
        <span>✅</span>
        <span className="font-medium">সব ডেটা sync হয়েছে!</span>
      </div>
    )
  }

  // ── Online + sync চলছে ──
  if (isOnline && pendingCount > 0) {
    return (
      <div className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2 text-xs">
        <FiRefreshCw size={13} className="flex-shrink-0 animate-spin" />
        <span className="font-medium">
          {pendingCount}টি offline ডেটা sync হচ্ছে...
        </span>
      </div>
    )
  }

  // ── Offline ──
  return (
    <div className="bg-gray-800 text-white px-4 py-2 flex items-center gap-2 text-xs">
      <FiWifiOff size={13} className="flex-shrink-0 text-red-400" />
      <span className="flex-1 font-medium">
        অফলাইন মোড — ডেটা সংরক্ষণ হচ্ছে
      </span>
      {pendingCount > 0 && (
        <span className="bg-amber-500 text-white rounded-full px-2 py-0.5 font-bold">
          {pendingCount}টি pending
        </span>
      )}
    </div>
  )
}

// ── usePrevious helper ───────────────────────────────────────
// useRef ব্যবহার করা হয়েছে — render-এর পরে update হয়,
// তাই current render-এ আগের value পাওয়া যায়
function usePrevious(value) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref.current
}

// ── OfflineSaveBadge (বাটনে ব্যবহার) ────────────────────────
export function OfflineSaveBadge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 ${className}`}>
      <FiClock size={10} />
      {children || 'offline এ save হবে'}
    </span>
  )
}
