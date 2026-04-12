import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'

export default function FingerPrint({
  onSuccess,
  label    = 'চেক-ইন',
  sublabel = '৩ সেকেন্ড চেপে ধরুন',
  color    = 'primary',
  disabled = false,
}) {
  const [progress,  setProgress]  = useState(0)
  const [pressing,  setPressing]  = useState(false)
  const [completed, setCompleted] = useState(false)

  const timerRef     = useRef(null)
  const startRef     = useRef(null)
  const buttonRef    = useRef(null)
  const onSuccessRef = useRef(onSuccess)

  useEffect(() => { onSuccessRef.current = onSuccess }, [onSuccess])

  const DURATION = 3000

  const ringColor = color === 'secondary' ? '#065f46' : color === 'danger' ? '#991b1b' : '#1e3a8a'
  const borderCls = color === 'secondary' ? 'border-secondary' : color === 'danger' ? 'border-danger' : 'border-primary'
  const bgCls     = color === 'secondary' ? 'bg-secondary/10' : color === 'danger' ? 'bg-danger/10'  : 'bg-primary/10'
  const textCls   = color === 'secondary' ? 'text-secondary'  : color === 'danger' ? 'text-danger'   : 'text-primary'

  function doStart() {
    if (disabled || completed) return
    startRef.current = Date.now()
    setPressing(true)

    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startRef.current) / DURATION) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(timerRef.current)
        setCompleted(true)
        setPressing(false)
        onSuccessRef.current?.()
      }
    }, 30)
  }

  function doStop() {
    if (completed) return
    clearInterval(timerRef.current)
    setPressing(false)
    setProgress(0)
  }

  // touch events — passive: false দিয়ে
  useEffect(() => {
    const btn = buttonRef.current
    if (!btn) return

    const onTS  = (e) => { e.preventDefault(); doStart() }
    const onTE  = (e) => { e.preventDefault(); doStop()  }
    const onCtx = (e) => { e.preventDefault() }

    btn.addEventListener('touchstart',  onTS,  { passive: false })
    btn.addEventListener('touchend',    onTE,  { passive: false })
    btn.addEventListener('touchcancel', onTE,  { passive: false })
    btn.addEventListener('contextmenu', onCtx, { passive: false })

    return () => {
      btn.removeEventListener('touchstart',  onTS)
      btn.removeEventListener('touchend',    onTE)
      btn.removeEventListener('touchcancel', onTE)
      btn.removeEventListener('contextmenu', onCtx)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, completed])

  useEffect(() => () => clearInterval(timerRef.current), [])

  const radius        = 60
  const circumference = 2 * Math.PI * radius
  const dashOffset    = circumference - (progress / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-4" style={{ userSelect:'none', WebkitUserSelect:'none' }}>
      <div className="relative flex items-center justify-center" style={{ width:160, height:160 }}>

        {/* SVG ring */}
        <svg className="absolute inset-0" style={{ transform:'rotate(-90deg)' }} width="160" height="160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke={completed ? '#059669' : ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition:'stroke-dashoffset 0.03s' }}
          />
        </svg>

        {/* Pulse */}
        {pressing && (
          <div className={`absolute inset-0 rounded-full border-2 ${borderCls} animate-ping opacity-25 pointer-events-none`} />
        )}

        {/* Button */}
        <div
          ref={buttonRef}
          onMouseDown={doStart}
          onMouseUp={doStop}
          onMouseLeave={doStop}
          style={{ touchAction:'none', WebkitTapHighlightColor:'transparent', cursor:'pointer' }}
          className={clsx(
            'w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 border-4 transition-all duration-150',
            completed ? 'bg-emerald-100 border-emerald-500' : `${borderCls} ${bgCls}`,
            pressing && 'scale-95',
            disabled && 'opacity-50'
          )}
        >
          <span style={{ fontSize:'2.2rem', lineHeight:1 }}>
            {completed ? '✅' : pressing ? '👆' : '☝️'}
          </span>
          <span className={clsx('text-xs font-bold', completed ? 'text-emerald-600' : textCls)}>
            {completed ? 'সম্পন্ন!' : pressing ? `${Math.round(progress)}%` : label}
          </span>
        </div>
      </div>

      {!completed && (
        <div className="text-center pointer-events-none">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
        </div>
      )}
      {completed && (
        <p className="text-sm font-semibold text-emerald-600 pointer-events-none">সফলভাবে সম্পন্ন!</p>
      )}
    </div>
  )
}
