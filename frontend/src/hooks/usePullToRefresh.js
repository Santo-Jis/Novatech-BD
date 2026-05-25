import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * usePullToRefresh
 * ─────────────────────────────────────────────────────────────────
 * Mobile-friendly pull-to-refresh gesture।
 *
 * ব্যবহার:
 *   const { containerRef, isRefreshing, pullDistance, pullProgress } =
 *     usePullToRefresh({ onRefresh: fetchData })
 *
 *   <div ref={containerRef}>
 *     <PullIndicator progress={pullProgress} isRefreshing={isRefreshing} />
 *     ...content
 *   </div>
 *
 * Props:
 *   onRefresh      — async function, refresh শেষে resolve হবে
 *   threshold      — কতটুকু টানলে trigger হবে (default: 70px)
 *   maxPull        — সর্বোচ্চ কতটুকু টানা যাবে (default: 120px)
 *   disabled       — true হলে gesture কাজ করবে না
 *
 * Returns:
 *   containerRef   — scroll container-এ ref দিতে হবে
 *   isRefreshing   — refresh চলছে কিনা
 *   pullDistance   — কতটুকু টানা হয়েছে (px)
 *   pullProgress   — 0–1 (threshold-এর শতাংশ)
 * ─────────────────────────────────────────────────────────────────
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull   = 120,
  disabled  = false,
} = {}) {
  const containerRef   = useRef(null)
  const startYRef      = useRef(0)
  const isDraggingRef  = useRef(false)

  const [pullDistance,  setPullDistance]  = useState(0)
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  const pullDistanceRef = useRef(0)  // sync ref for touch handlers

  const pullProgress = Math.min(1, pullDistance / threshold)

  const triggerRefresh = useCallback(async () => {
    if (isRefreshing || !onRefresh) return
    setIsRefreshing(true)
    setPullDistance(0)
    pullDistanceRef.current = 0
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el || disabled) return

    const onTouchStart = (e) => {
      // শুধু scroll top-এ থাকলে gesture শুরু হবে
      if (el.scrollTop > 0) return
      startYRef.current   = e.touches[0].clientY
      isDraggingRef.current = true
    }

    const onTouchMove = (e) => {
      if (!isDraggingRef.current || isRefreshing) return

      const delta = e.touches[0].clientY - startYRef.current
      if (delta <= 0) {
        // উপরে টানলে normal scroll — gesture cancel
        isDraggingRef.current = false
        setPullDistance(0)
        pullDistanceRef.current = 0
        return
      }

      // নিচে টানলে — scroll আটকাও, pull indicator দেখাও
      // resistance factor: টানা যত বাড়বে, তত কষ্ট হবে (logarithmic feel)
      const resistance = 0.45
      const dist = Math.min(maxPull, delta * resistance)

      pullDistanceRef.current = dist
      setPullDistance(dist)

      // Page scroll আটকাতে — শুধু pull gesture active থাকলে
      if (dist > 5) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false

      if (pullDistanceRef.current >= threshold) {
        triggerRefresh()
      } else {
        // Threshold পূরণ হয়নি — snap back
        setPullDistance(0)
        pullDistanceRef.current = 0
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [disabled, isRefreshing, threshold, maxPull, triggerRefresh])

  return { containerRef, isRefreshing, pullDistance, pullProgress }
}
