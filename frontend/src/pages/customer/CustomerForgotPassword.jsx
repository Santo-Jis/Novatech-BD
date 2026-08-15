// pages/customer/CustomerForgotPassword.jsx
// পাসওয়ার্ড ভুলে গেলে (অথবা প্রথমবার সেট করতে) — Email অথবা WhatsApp OTP ফ্লো
//
// যাদের এতদিন শুধু Google দিয়ে ঢোকা হতো (password_hash কখনো সেট হয়নি),
// তাদের জন্য এটাই প্রথমবার password সেট করার একমাত্র উপায় — তাই ভাষায়
// "রিসেট" এর বদলে "সেট/রিসেট" ব্যবহার করা হয়েছে।
//
// identifier ইমেইল হলে Email-এ, মোবাইল নম্বর হলে WhatsApp-এ OTP যায়
// (backend স্বয়ংক্রিয়ভাবে চ্যানেল ঠিক করে — /portal/forgot-password)।
// WhatsApp পাঠানো হয় প্ল্যাটফর্মের নিজস্ব Baileys গেটওয়ে দিয়ে — কোনো
// SaaS কোম্পানির ওয়ালেট/ক্রেডিট থেকে কিছু কাটে না।
//
// ৩ ধাপ:
//   ১. ইমেইল/WhatsApp নম্বর  → POST /portal/forgot-password       (OTP পাঠায়)
//   ২. OTP যাচাই             → POST /portal/verify-reset-otp      (reset_token ফেরত)
//   ৩. নতুন পাসওয়ার্ড দিন     → POST /portal/reset-password        (সেভ করে)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiShoppingBag, FiAlertTriangle, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiCheckCircle, FiArrowLeft } from 'react-icons/fi'
import CpButton from './components/ui/CpButton'
import CpInput from './components/ui/CpInput'
import { portalFetch } from './utils/api'

const STEP_LABELS = { request: 'ইমেইল/WhatsApp দিন', verify: 'OTP যাচাই করুন', reset: 'নতুন পাসওয়ার্ড', done: 'সম্পন্ন' }

export default function CustomerForgotPassword() {
  const navigate = useNavigate()

  const [step, setStep]       = useState('request') // request | verify | reset | done
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp]         = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // identifier ইমেইল না মোবাইল নম্বর — চ্যানেল-নির্দিষ্ট মেসেজিং/আইকনের জন্য
  const isEmailIdentifier = identifier.trim().includes('@')
  const channelLabel = isEmailIdentifier ? 'ইমেইলে' : 'WhatsApp-এ'

  const backStep = () => {
    setError('')
    if (step === 'verify') setStep('request')
    else if (step === 'reset') setStep('verify')
    else navigate('/customer-login')
  }

  // ── ধাপ ১: OTP পাঠাও (ইমেইল অথবা WhatsApp — backend স্বয়ংক্রিয় ঠিক করে) ──
  const handleRequestOtp = async (e) => {
    e?.preventDefault?.()
    const clean = identifier.trim()
    const looksLikeEmail = clean.includes('@')
    const looksLikePhone = /^01[0-9]{9}$/.test(clean.replace(/\s/g, ''))
    if (!clean || (!looksLikeEmail && !looksLikePhone)) {
      setError('একটি বৈধ ইমেইল অথবা WhatsApp নম্বর (01XXXXXXXXX) দিন।')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await portalFetch('/portal/forgot-password', {
        method: 'POST',
        body:   JSON.stringify({ identifier: clean }),
      })
      // ⚠️ WhatsApp গেটওয়ে সাময়িকভাবে ডাউন থাকলে backend success:true-ই
      // রাখে (enumeration-নিরাপদ রাখতে — দেখুন controller-এর কমেন্ট),
      // কিন্তু আলাদা flag পাঠায়। এটা না দেখলে ইউজার এমন একটা OTP-ইনপুট
      // স্ক্রিনে আটকে থাকতেন যেখানে কখনো কোনো কোড আসবে না।
      if (data.whatsapp_unavailable) {
        setError(data.message || 'WhatsApp এই মুহূর্তে অনুপলব্ধ। একটু পর আবার চেষ্টা করুন, অথবা ইমেইল ব্যবহার করুন।')
        return
      }
      setStep('verify')
    } catch (err) {
      setError(err.message || 'সমস্যা হয়েছে, আবার চেষ্টা করুন।')
    } finally { setLoading(false) }
  }

  // ── ধাপ ২: OTP যাচাই ────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (!otp.trim() || otp.trim().length < 4) {
      setError('সঠিক OTP কোড দিন।')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await portalFetch('/portal/verify-reset-otp', {
        method: 'POST',
        body:   JSON.stringify({ identifier: identifier.trim(), otp: otp.trim() }),
      })
      setResetToken(data.reset_token)
      setStep('reset')
    } catch (err) {
      setError(err.message || 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।')
    } finally { setLoading(false) }
  }

  // ── ধাপ ৩: নতুন পাসওয়ার্ড সেট ──────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setError('ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।')
      return
    }
    setLoading(true)
    setError('')
    try {
      await portalFetch('/portal/reset-password', {
        method: 'POST',
        body:   JSON.stringify({ identifier: identifier.trim(), reset_token: resetToken, new_password: newPassword }),
      })
      setStep('done')
    } catch (err) {
      setError(err.message || 'সমস্যা হয়েছে, আবার চেষ্টা করুন।')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-cp-bg-base flex flex-col font-cp-body">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[360px] flex flex-col items-center">

          {/* Logo */}
          <div className="w-[72px] h-[72px] rounded-2xl bg-cp-trust-900 flex items-center justify-center mb-5 shadow-lg shadow-cp-trust-900/20">
            <FiShoppingBag className="text-cp-trust-300" size={32} />
          </div>

          <h1 className="text-2xl font-semibold text-cp-trust-700 font-cp-head mb-1 text-center">
            ZovoriX
          </h1>
          <p className="text-cp-text-muted text-xs tracking-wide mb-7">
            {step === 'done' ? 'সম্পন্ন হয়েছে' : `পাসওয়ার্ড সেট/রিসেট — ${STEP_LABELS[step]}`}
          </p>

          {error && (
            <div className="w-full bg-cp-error-bg border border-cp-error/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5">
              <FiAlertTriangle className="text-cp-error flex-shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] text-cp-error leading-relaxed">{error}</p>
            </div>
          )}

          {/* ── ধাপ ১: ইমেইল অথবা WhatsApp নম্বর ─────────────── */}
          {step === 'request' && (
            <form onSubmit={handleRequestOtp} className="w-full flex flex-col gap-3">
              <p className="text-cp-text-secondary text-[13px] leading-relaxed mb-1">
                আপনার রেজিস্ট্রেশনের ইমেইল অথবা WhatsApp নম্বর দিন — আমরা একটি OTP কোড পাঠাবো।
              </p>
              <CpInput
                icon={isEmailIdentifier ? FiMail : FiPhone}
                type="text"
                placeholder="ইমেইল অথবা WhatsApp নম্বর (01XXXXXXXXX)"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoFocus
              />
              <CpButton type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                OTP পাঠান
              </CpButton>
            </form>
          )}

          {/* ── ধাপ ২: OTP যাচাই ─────────────────────────────── */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyOtp} className="w-full flex flex-col gap-3">
              <p className="text-cp-text-secondary text-[13px] leading-relaxed mb-1">
                <strong className="text-cp-text-primary">{identifier}</strong> {channelLabel} ৬ ডিজিটের একটি OTP
                পাঠানো হয়েছে (মেয়াদ ১০ মিনিট)।
              </p>
              <CpInput
                icon={FiLock}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="৬ ডিজিটের OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
              />
              <CpButton type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                যাচাই করুন
              </CpButton>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={loading}
                className="text-cp-trust-500 text-[13px] font-medium mt-1 hover:underline disabled:opacity-50"
              >
                OTP পাননি? আবার পাঠান
              </button>
            </form>
          )}

          {/* ── ধাপ ৩: নতুন পাসওয়ার্ড ────────────────────────── */}
          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="w-full flex flex-col gap-3">
              <CpInput
                icon={FiLock}
                type={showPw ? 'text' : 'password'}
                placeholder="নতুন পাসওয়ার্ড (ন্যূনতম ৬ অক্ষর)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((s) => !s)}
                    className="text-cp-text-muted hover:text-cp-text-secondary"
                    aria-label={showPw ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                  >
                    {showPw ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                }
              />
              <CpInput
                icon={FiLock}
                type={showPw ? 'text' : 'password'}
                placeholder="পাসওয়ার্ড আবার লিখুন"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <CpButton type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                পাসওয়ার্ড সেট করুন
              </CpButton>
            </form>
          )}

          {/* ── সম্পন্ন ───────────────────────────────────────── */}
          {step === 'done' && (
            <div className="w-full flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-cp-confidence-100 flex items-center justify-center mb-4">
                <FiCheckCircle className="text-cp-confidence-600" size={28} />
              </div>
              <p className="text-cp-text-primary text-[15px] font-medium mb-1">পাসওয়ার্ড সফলভাবে সেট হয়েছে!</p>
              <p className="text-cp-text-muted text-[13px] mb-6">এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।</p>
              <CpButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate('/customer-login')}
              >
                লগইন করুন
              </CpButton>
            </div>
          )}

          {/* ── পেছনে ────────────────────────────────────────── */}
          {step !== 'done' && (
            <button
              type="button"
              onClick={backStep}
              className="flex items-center gap-1.5 text-cp-text-muted text-[13px] mt-6 hover:text-cp-text-secondary"
            >
              <FiArrowLeft size={14} />
              {step === 'request' ? 'লগইন পেজে ফিরে যান' : 'পেছনে যান'}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
