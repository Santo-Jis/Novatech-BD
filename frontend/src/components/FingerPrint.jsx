import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'

// ============================================================
// FingerPrint Component
// ৩ সেকেন্ড চেপে ধরলে চেক-ইন/আউট হবে
// ============================================================

export default function FingerPrint({
  onSuccess,
  label      = 'চেক-ইন',
  sublabel   = '৩ সেকেন্ড চেপে ধরুন',
  color      = 'primary',
  disabled   = false,
  size       = 'lg'
}) {
  const [pressing,   setPressing]   = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [completed,  setCompleted]  = useState(false)
  const intervalRef                 = useRef(null)
  const startTimeRef                = useRef(null)

  const DURATION = 3000 // ৩ সেকেন্ড

  const colors = {
    primary:   { ring: 'border-primary',   bg: 'bg-primary/10',   icon: 'text-primary',   fill: 'bg-primary' },
    secondary: { ring: 'border-secondary', bg: 'bg-secondary/10', icon: 'text-secondary', fill: 'bg-secondary' },
    danger:    { ring: 'border-danger',    bg: 'bg-danger/10',    icon: 'text-danger',    fill: 'bg-danger' }
  }

  const sizes = {
    md: { outer: 'w-32 h-32', inner: 'w-24 h-24', icon: 'text-5xl' },
    lg: { outer: 'w-44 h-44', inner: 'w-36 h-36', icon: 'text-7xl' }
  }

  const c = colors[color]  || colors.primary
  const s = sizes[size]    || sizes.lg

  const startPress = () => {
    if (disabled || completed) return
    setPressing(true)
    startTimeRef.current = Date.now()

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const pct     = Math.min(100, (elapsed / DURATION) * 100)
      setProgress(pct)

      if (pct >= 100) {
        clearInterval(intervalRef.current)
        setCompleted(true)
        setPressing(false)
        onSuccess?.()
      }
    }, 50)
  }

  const endPress = () => {
    if (completed) return
    clearInterval(intervalRef.current)
    setPressing(false)
    setProgress(0)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  // SVG circular progress
  const radius      = 60
  const circumference = 2 * Math.PI * radius
  const strokeDash  = circumference - (progress / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Outer ring with progress */}
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        {/* SVG Progress Ring */}
        <svg className="absolute inset-0 -rotate-90" width="160" height="160">
          {/* Background circle */}
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          {/* Progress circle */}
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke={color === 'primary' ? '#1e3a8a' : color === 'secondary' ? '#065f46' : '#991b1b'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDash}
            className="transition-all duration-100"
          />
        </svg>

        {/* Pulse rings when pressing */}
        {pressing && (
          <>
            <div className={`absolute inset-0 rounded-full border-2 ${c.ring} animate-ping opacity-30`} />
            <div className={`absolute inset-2 rounded-full border-2 ${c.ring} animate-ping opacity-20`} style={{ animationDelay: '0.2s' }} />
          </>
        )}

        {/* Center button */}
        <button
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={endPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          disabled={disabled}
          className={clsx(
            'w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 border-4 transition-all duration-200 touch-none',
            c.ring, c.bg,
            pressing  && 'scale-95 shadow-inner',
            completed && 'bg-emerald-100 border-emerald-500',
            disabled  && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span className={clsx(
            s.icon,
            completed ? '🎉' : pressing ? '👆' : '☝️'
          )}>
            {completed ? '✅' : '👆'}
          </span>
          <span className={clsx(
            'text-xs font-semibold',
            completed ? 'text-emerald-600' : c.icon
          )}>
            {completed ? 'সম্পন্ন!' : pressing ? `${Math.round(progress)}%` : label}
          </span>
        </button>
      </div>

      {/* Label */}
      {!completed && (
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
        </div>
      )}

      {completed && (
        <div className="text-center animate-fade-in">
          <p className="text-sm font-semibold text-emerald-600">সফলভাবে সম্পন্ন!</p>
        </div>
      )}
    </div>
  )
}
