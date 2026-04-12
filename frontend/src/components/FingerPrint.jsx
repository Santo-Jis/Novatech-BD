import { useState, useRef, useEffect, useCallback } from 'react'
import clsx from 'clsx'

export default function FingerPrint({
  onSuccess,
  label    = 'চেক-ইন',
  sublabel = '৩ সেকেন্ড চেপে ধরুন',
  color    = 'primary',
  disabled = false,
  size     = 'lg'
}) {
  const [pressing,  setPressing]  = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [completed, setCompleted] = useState(false)

  const intervalRef   = useRef(null)
  const startTimeRef  = useRef(null)
  const buttonRef     = useRef(null)
  const pressingRef   = useRef(false)
  const completedRef  = useRef(false)

  const DURATION = 3000

  const colors = {
    primary:   { ring: 'border-primary',   bg: 'bg-primary/10',   icon: 'text-primary'   },
    secondary: { ring: 'border-secondary', bg: 'bg-secondary/10', icon: 'text-secondary' },
    danger:    { ring: 'border-danger',    bg: 'bg-danger/10',    icon: 'text-danger'    }
  }
  const c = colors[color] || colors.primary

  const stopPress = useCallback(() => {
    if (completedRef.current) return
    clearInterval(intervalRef.current)
    pressingRef.current = false
    setPressing(false)
    setProgress(0)
  }, [])

  const startPress = useCallback(() => {
    if (disabled || completedRef.current) return
    pressingRef.current = true
    setPressing(true)
    startTimeRef.current = Date.now()

    intervalRef.current = setInterval(() => {
      if (!pressingRef.current) return
      const elapsed = Date.now() - startTimeRef.current
      const pct     = Math.min(100, (elapsed / DURATION) * 100)
      setProgress(pct)

      if (pct >= 100) {
        clearInterval(intervalRef.current)
        completedRef.current = true
        setCompleted(true)
        setPressing(false)
        onSuccess?.()
      }
    }, 50)
  }, [disabled, onSuccess])

  // DOM এ সরাসরি non-passive event listener লাগানো
  useEffect(() => {
    const btn = buttonRef.current
    if (!btn) return

    const onStart = (e) => {
      e.preventDefault()
      e.stopPropagation()
      startPress()
    }
    const onEnd = (e) => {
      e.preventDefault()
      e.stopPropagation()
      stopPress()
    }
    const onCtx = (e) => e.preventDefault()

    btn.addEventListener('touchstart',  onStart, { passive: false })
    btn.addEventListener('touchend',    onEnd,   { passive: false })
    btn.addEventListener('touchcancel', onEnd,   { passive: false })
    btn.addEventListener('contextmenu', onCtx,   { passive: false })

    return () => {
      btn.removeEventListener('touchstart',  onStart)
      btn.removeEventListener('touchend',    onEnd)
      btn.removeEventListener('touchcancel', onEnd)
      btn.removeEventListener('contextmenu', onCtx)
    }
  }, [startPress, stopPress])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const radius       = 60
  const circumference = 2 * Math.PI * radius
  const strokeDash   = circumference - (progress / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-4" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        {/* Progress ring */}
        <svg className="absolute inset-0 -rotate-90" width="160" height="160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke={color === 'primary' ? '#1e3a8a' : color === 'secondary' ? '#065f46' : '#991b1b'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDash}
            style={{ transition: 'stroke-dashoffset 0.1s' }}
          />
        </svg>

        {/* Pulse */}
        {pressing && (
          <div className={`absolute inset-0 rounded-full border-2 ${c.ring} animate-ping opacity-30`} />
        )}

        {/* Button — mouse events inline, touch via ref */}
        <button
          ref={buttonRef}
          onMouseDown={startPress}
          onMouseUp={stopPress}
          onMouseLeave={stopPress}
          disabled={disabled}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'none' }}
          className={clsx(
            'w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 border-4 transition-all duration-200',
            c.ring, c.bg,
            pressing  && 'scale-95 shadow-inner',
            completed && 'bg-emerald-100 border-emerald-500',
            disabled  && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>
            {completed ? '✅' : '👆'}
          </span>
          <span className={clsx('text-xs font-semibold', completed ? 'text-emerald-600' : c.icon)}>
            {completed ? 'সম্পন্ন!' : pressing ? `${Math.round(progress)}%` : label}
          </span>
        </button>
      </div>

      {!completed && (
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
        </div>
      )}
      {completed && (
        <p className="text-sm font-semibold text-emerald-600">সফলভাবে সম্পন্ন!</p>
      )}
    </div>
  )
}
