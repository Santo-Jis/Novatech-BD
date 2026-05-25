/**
 * PullToRefreshIndicator
 * ─────────────────────────────────────────────────────────────────
 * Pull-to-refresh visual indicator — usePullToRefresh hook-এর সাথে ব্যবহার করুন।
 *
 * ব্যবহার:
 *   <PullToRefreshIndicator
 *     progress={pullProgress}      // 0–1
 *     pullDistance={pullDistance}  // px
 *     isRefreshing={isRefreshing}
 *   />
 *
 * এটা scroll container-এর একদম উপরে রাখুন (প্রথম child হিসেবে)।
 * ─────────────────────────────────────────────────────────────────
 */
export default function PullToRefreshIndicator({ progress, pullDistance, isRefreshing }) {
  const visible = pullDistance > 4 || isRefreshing

  // progress অনুযায়ী রং — ধূসর → নীল
  const iconColor = progress >= 1 ? '#2563eb' : '#94a3b8'
  const bgColor   = progress >= 1 ? '#eff6ff' : '#f1f5f9'

  // Container উপর থেকে নামে — pull distance-এ সাড়া দেয়
  const translateY = isRefreshing ? 0 : Math.max(-48, pullDistance - 48)

  return (
    <div
      className="flex justify-center pointer-events-none overflow-hidden"
      style={{
        height: isRefreshing ? 52 : Math.max(0, pullDistance),
        transition: isRefreshing ? 'height 0.2s ease' : 'none',
      }}
    >
      {visible && (
        <div
          className="flex items-center justify-center transition-opacity duration-150"
          style={{
            opacity: Math.min(1, progress * 1.2),
            transform: `translateY(${isRefreshing ? 0 : Math.min(0, translateY)}px)`,
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full shadow-sm"
            style={{ background: bgColor, transition: 'background 0.2s' }}
          >
            {isRefreshing ? (
              /* Spinner */
              <svg
                className="animate-spin"
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="#2563eb" strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              /* Arrow — progress অনুযায়ী rotate হয় */
              <svg
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke={iconColor} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transform: `rotate(${Math.min(180, progress * 180)}deg)`,
                  transition: 'transform 0.1s, stroke 0.2s',
                }}
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: iconColor, transition: 'color 0.2s' }}
            >
              {isRefreshing
                ? 'আপডেট হচ্ছে...'
                : progress >= 1
                  ? 'ছেড়ে দিন'
                  : 'টেনে রিফ্রেশ করুন'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
