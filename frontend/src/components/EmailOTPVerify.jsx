// frontend/src/components/EmailOTPVerify.jsx
// ─────────────────────────────────────────────────────────────
// Reusable Email OTP Verification Component
// Use করুন: কাস্টমার তৈরি / যেকোনো Email যাচাইয়ে
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { FiMail, FiShield, FiCheck, FiRefreshCw, FiX } from 'react-icons/fi'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ── OTP Input: ৬টি আলাদা বক্স ───────────────────────────────
function OTPBoxes({ value, onChange, disabled }) {
  const inputs = useRef([])
  const digits  = value.padEnd(6, ' ').split('').slice(0, 6)

  const handleKey = (i, e) => {
    const key = e.key
    if (key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1)
      onChange(next)
      if (i > 0) inputs.current[i - 1]?.focus()
      return
    }
    if (!/^\d$/.test(key)) return
    const next = value.slice(0, i) + key + value.slice(i + 1)
    onChange(next.slice(0, 6))
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) { onChange(pasted); inputs.current[Math.min(pasted.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div className="flex gap-2 justify-center my-4">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d.trim()}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onChange={() => {}} // controlled via onKeyDown
          disabled={disabled}
          className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl
            focus:outline-none transition-all
            ${d.trim()
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-gray-200 text-gray-400'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:border-primary'}
          `}
        />
      ))}
    </div>
  )
}

// ── Countdown Timer ───────────────────────────────────────────
function Countdown({ seconds, onEnd }) {
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

  const pct = (left / seconds) * 100
  const r   = 16
  const circ = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-2 justify-center text-sm text-gray-500">
      <svg width="40" height="40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={left <= 10 ? '#ef4444' : '#3b82f6'}
          strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
        <text
          x="20" y="20"
          className="rotate-90"
          textAnchor="middle" dominantBaseline="middle"
          style={{ transform: 'rotate(90deg) translate(0, -40px)', fontSize: '10px', fontWeight: 'bold', fill: left <= 10 ? '#ef4444' : '#374151' }}
        >
          {left}s
        </text>
      </svg>
      <span>পুনরায় পাঠাতে অপেক্ষা করুন</span>
    </div>
  )
}

// ── Main EmailOTPVerify Component ─────────────────────────────
export default function EmailOTPVerify({
  email,           // string  — verify করার email
  onVerified,      // fn()    — সফল হলে call হবে
  onSkip,          // fn()?   — skip করার option (ঐচ্ছিক)
  onBack,          // fn()?   — ফর্মে ফিরে যাওয়া
  skipLabel = 'Email বাদ দিয়ে চালিয়ে যান',
}) {
  const [otp,        setOtp]        = useState('')
  const [sent,       setSent]       = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [verified,   setVerified]   = useState(false)
  const [canResend,  setCanResend]  = useState(false)
  const [resendKey,  setResendKey]  = useState(0)    // Countdown reset
  const TIMER = 60

  // মাউন্ট হলে অটো OTP পাঠাও
  useEffect(() => {
    if (email) sendOTP()
  }, [])

  const sendOTP = async () => {
    if (!email) return
    setLoading(true)
    setCanResend(false)
    setOtp('')
    try {
      await api.post('/customers/verify-email/send', { email })
      setSent(true)
      setResendKey(k => k + 1)
      toast.success(`OTP পাঠানো হয়েছে 📧`, { duration: 3000 })
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP পাঠানো যায়নি')
    } finally {
      setLoading(false)
    }
  }

  const confirmOTP = async () => {
    if (otp.replace(/\s/g, '').length < 6) return toast.error('৬ সংখ্যার OTP দিন')
    setLoading(true)
    try {
      await api.post('/customers/verify-email/confirm', { email, otp: otp.trim() })
      setVerified(true)
      toast.success('Email যাচাই সফল! ✅', { duration: 2500 })
      setTimeout(() => onVerified(), 800)
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP ভুল হয়েছে')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  // ── Verified State ─────────────────────────────────────────
  if (verified) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <FiCheck className="text-3xl text-green-600" />
        </div>
        <p className="font-bold text-green-700 text-lg">Email যাচাই সম্পন্ন!</p>
        <p className="text-sm text-gray-500">কাস্টমার তৈরি হচ্ছে...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <FiMail className="text-2xl text-blue-600" />
        </div>
        <p className="font-bold text-gray-800 text-base">Email যাচাই করুন</p>
        <p className="text-sm text-gray-500 mt-1">
          একটি ৬-সংখ্যার কোড পাঠানো হয়েছে
        </p>
        <div className="mt-2 inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2">
          <FiMail className="text-blue-500 text-sm flex-shrink-0" />
          <span className="text-blue-700 font-semibold text-sm break-all">{email}</span>
        </div>
      </div>

      {/* ── Loading skeleton (প্রথমবার পাঠানো হচ্ছে) ── */}
      {loading && !sent ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <span className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin block" />
          <p className="text-sm text-gray-500">OTP পাঠানো হচ্ছে...</p>
        </div>
      ) : (
        <>
          {/* ── OTP Boxes ── */}
          <div>
            <p className="text-xs text-center text-gray-400 mb-1">কোডটি এখানে দিন</p>
            <OTPBoxes
              value={otp}
              onChange={setOtp}
              disabled={loading}
            />
          </div>

          {/* ── Verify Button ── */}
          <button
            onClick={confirmOTP}
            disabled={loading || otp.replace(/\s/g, '').length < 6}
            className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold
              flex items-center justify-center gap-2 text-sm
              disabled:opacity-40 transition-all active:scale-95"
          >
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiShield />
            }
            যাচাই করুন
          </button>

          {/* ── Resend / Countdown ── */}
          <div className="text-center">
            {canResend ? (
              <button
                onClick={sendOTP}
                disabled={loading}
                className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium py-2 px-4 rounded-xl hover:bg-blue-50 transition-colors"
              >
                <FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />
                আবার OTP পাঠান
              </button>
            ) : (
              <Countdown
                key={resendKey}
                seconds={TIMER}
                onEnd={() => setCanResend(true)}
              />
            )}
          </div>

          {/* ── Hint ── */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 space-y-1">
            <p className="font-semibold">💡 টিপস:</p>
            <p>• Spam / Promotions ফোল্ডার চেক করুন</p>
            <p>• OTP ৫ মিনিট কার্যকর থাকবে</p>
            <p>• সঠিক Email দিয়েছেন কিনা নিশ্চিত করুন</p>
          </div>

          {/* ── Back & Skip ── */}
          <div className="flex gap-3 pt-1">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium"
              >
                ← ফিরে যান
              </button>
            )}
            {onSkip && (
              <button
                onClick={onSkip}
                className="flex-1 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-400 font-medium"
              >
                {skipLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
