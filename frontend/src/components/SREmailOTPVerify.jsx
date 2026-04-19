// frontend/src/components/SREmailOTPVerify.jsx
// ─────────────────────────────────────────────────────────────
// SR নিয়োগ ফর্মের জন্য Email OTP যাচাই Component
// Public route: /api/recruitment/verify-email/send & confirm
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiMail, FiShield, FiCheck, FiRefreshCw,
  FiArrowLeft, FiLock, FiAlertTriangle,
} from 'react-icons/fi'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

// ── ৬-ঘর OTP Input ───────────────────────────────────────────
function OTPBoxes({ value, onChange, disabled, hasError }) {
  const inputs = useRef([])
  const digits = value.padEnd(6, ' ').split('').slice(0, 6)

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1)
      onChange(next)
      if (i > 0) inputs.current[i - 1]?.focus()
      return
    }
    if (!/^\d$/.test(e.key)) return
    const next = value.slice(0, i) + e.key + value.slice(i + 1)
    onChange(next.slice(0, 6))
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      onChange(pasted)
      inputs.current[Math.min(pasted.length, 5)]?.focus()
    }
    e.preventDefault()
  }

  // Auto-focus first box on mount
  useEffect(() => {
    setTimeout(() => inputs.current[0]?.focus(), 300)
  }, [])

  return (
    <div className="flex gap-2.5 justify-center my-5">
      {digits.map((d, i) => {
        const filled = d.trim() !== ''
        return (
          <input
            key={i}
            ref={el => inputs.current[i] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d.trim()}
            onKeyDown={e => handleKey(i, e)}
            onPaste={handlePaste}
            onChange={() => {}}
            disabled={disabled}
            className={[
              'w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all duration-200',
              'focus:outline-none focus:scale-105',
              disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : '',
              hasError
                ? 'border-red-400 bg-red-50 text-red-600 animate-shake'
                : filled
                  ? 'border-red-500 bg-red-50 text-red-700 shadow-md shadow-red-100'
                  : 'border-gray-200 bg-white text-gray-800 focus:border-red-400 focus:bg-red-50/30',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}

// ── Circular Countdown ────────────────────────────────────────
function CountdownTimer({ seconds, onEnd }) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    setLeft(seconds)
    const iv = setInterval(() => {
      setLeft(p => {
        if (p <= 1) { clearInterval(iv); onEnd?.(); return 0 }
        return p - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [seconds])

  const pct  = (left / seconds) * 100
  const r    = 18
  const circ = 2 * Math.PI * r
  const urgent = left <= 15

  return (
    <div className="flex items-center gap-2.5 justify-center">
      <svg width="44" height="44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
        <circle
          cx="22" cy="22" r={r} fill="none"
          stroke={urgent ? '#ef4444' : '#dc2626'}
          strokeWidth="3.5"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="text-left">
        <p className={`text-sm font-bold tabular-nums ${urgent ? 'text-red-600' : 'text-gray-700'}`}>
          {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
        </p>
        <p className="text-xs text-gray-400 leading-none">পুনরায় পাঠাতে</p>
      </div>
    </div>
  )
}

// ── Email Masker: abc***@gmail.com ────────────────────────────
function maskEmail(email) {
  const [user, domain] = email.split('@')
  if (!domain) return email
  const visible = user.slice(0, Math.min(3, user.length))
  return `${visible}${'*'.repeat(Math.max(2, user.length - 3))}@${domain}`
}

// ── Main Component ────────────────────────────────────────────
export default function SREmailOTPVerify({ email, onVerified, onBack }) {
  const [otp,       setOtp]       = useState('')
  const [sent,      setSent]      = useState(false)
  const [sending,   setSending]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verified,  setVerified]  = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [timerKey,  setTimerKey]  = useState(0)
  const [hasError,  setHasError]  = useState(false)
  const [attempts,  setAttempts]  = useState(0)
  const TIMER = 60

  // Mount হলে OTP পাঠাও
  useEffect(() => { sendOTP() }, [])

  const sendOTP = async () => {
    if (!email) return
    setSending(true)
    setCanResend(false)
    setOtp('')
    setHasError(false)
    try {
      await axios.post(`${API_BASE}/api/recruitment/verify-email/send`, { email })
      setSent(true)
      setTimerKey(k => k + 1)
      toast.success('OTP পাঠানো হয়েছে! ইনবক্স চেক করুন 📧', { duration: 4000 })
    } catch (err) {
      const msg = err.response?.data?.message || 'OTP পাঠানো যায়নি'
      toast.error(msg)
      if (!sent) setSent(true) // Still show the UI
    } finally {
      setSending(false)
    }
  }

  const verifyOTP = async () => {
    const clean = otp.replace(/\s/g, '')
    if (clean.length < 6) {
      toast.error('৬ সংখ্যার OTP কোড দিন')
      setHasError(true)
      setTimeout(() => setHasError(false), 800)
      return
    }
    setVerifying(true)
    setHasError(false)
    try {
      await axios.post(`${API_BASE}/api/recruitment/verify-email/confirm`, { email, otp: clean })
      setVerified(true)
      toast.success('ইমেইল যাচাই সম্পন্ন! ✅', { duration: 3000 })
      setTimeout(() => onVerified(), 1000)
    } catch (err) {
      const msg = err.response?.data?.message || 'OTP ভুল হয়েছে'
      toast.error(msg)
      setHasError(true)
      setAttempts(a => a + 1)
      setOtp('')
      setTimeout(() => setHasError(false), 800)
    } finally {
      setVerifying(false)
    }
  }

  // ── সফল যাচাই UI ─────────────────────────────────────────
  if (verified) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 animate-fade-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center shadow-lg shadow-green-200">
            <FiCheck className="text-4xl text-green-600" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shadow">
            <FiShield className="text-white text-sm" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-800">ইমেইল যাচাই সম্পন্ন!</p>
          <p className="text-sm text-gray-500 mt-1">আবেদন জমা দেওয়া হচ্ছে...</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0,1,2].map(i => (
            <span key={i} className="w-2 h-2 bg-green-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  const maskedEmail = maskEmail(email)
  const isLoading   = sending || verifying

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── শিরোনাম ── */}
      <div className="text-center">
        {/* Animated Icon */}
        <div className="relative inline-flex mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
            <FiMail className="text-2xl text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow animate-pulse">
            <FiLock className="text-white text-xs" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-800 dark:text-white">
          ইমেইল যাচাই করুন
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          নিচের ইমেইলে একটি <span className="font-semibold text-red-600">৬ সংখ্যার OTP</span> কোড পাঠানো হয়েছে
        </p>

        {/* Email Badge */}
        <div className="mt-3 inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl px-4 py-2.5">
          <FiMail className="text-red-500 flex-shrink-0" size={14} />
          <span className="text-red-700 dark:text-red-300 font-semibold text-sm tracking-wide">
            {maskedEmail}
          </span>
        </div>
      </div>

      {/* ── লোডিং (প্রথমবার) ── */}
      {sending && !sent ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-10 h-10 border-3 border-red-100 border-t-red-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">OTP পাঠানো হচ্ছে...</p>
        </div>
      ) : (
        <>
          {/* ── OTP Boxes ── */}
          <div>
            <p className="text-xs text-center text-gray-400 font-medium tracking-wider uppercase mb-1">
              কোডটি এখানে লিখুন
            </p>
            <OTPBoxes
              value={otp}
              onChange={val => { setOtp(val); setHasError(false) }}
              disabled={isLoading}
              hasError={hasError}
            />
            {attempts > 0 && attempts < 5 && (
              <p className="text-xs text-center text-amber-600 flex items-center justify-center gap-1 -mt-2">
                <FiAlertTriangle size={11} />
                {5 - attempts}টি সুযোগ বাকি
              </p>
            )}
          </div>

          {/* ── Verify Button ── */}
          <button
            onClick={verifyOTP}
            disabled={isLoading || otp.replace(/\s/g, '').length < 6}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5
              bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800
              text-white shadow-md shadow-red-500/30 transition-all active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {verifying ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                যাচাই করা হচ্ছে...
              </>
            ) : (
              <>
                <FiShield size={16} />
                ইমেইল যাচাই করুন
              </>
            )}
          </button>

          {/* ── Resend / Countdown ── */}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3.5 text-center">
            {canResend ? (
              <button
                onClick={sendOTP}
                disabled={sending}
                className="inline-flex items-center gap-2 text-sm font-semibold text-red-600
                  hover:text-red-700 transition-colors py-1"
              >
                <FiRefreshCw className={sending ? 'animate-spin' : ''} size={14} />
                নতুন OTP পাঠান
              </button>
            ) : (
              <CountdownTimer
                key={timerKey}
                seconds={TIMER}
                onEnd={() => setCanResend(true)}
              />
            )}
          </div>

          {/* ── Tips ── */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-xl p-3.5 space-y-1.5">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              💡 কোড পাচ্ছেন না?
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">• Spam বা Promotions ফোল্ডার চেক করুন</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">• OTP ১০ মিনিট পর্যন্ত কার্যকর থাকবে</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">• সঠিক ইমেইল দিয়েছেন কিনা নিশ্চিত করুন</p>
          </div>

          {/* ── Back Button ── */}
          {onBack && (
            <button
              onClick={onBack}
              className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-slate-600
                text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center
                justify-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <FiArrowLeft size={14} />
              ইমেইল পরিবর্তন করুন
            </button>
          )}
        </>
      )}
    </div>
  )
}
