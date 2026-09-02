// components/views/SetPasswordView.jsx
// WhatsApp OTP দিয়ে প্রথমবার লগইনের পর — SECURITY FIX: এতদিন এই পথে
// ঢোকা কাস্টমারের কোনো durable credential থাকতো না (শুধু WhatsApp
// লিংক/OTP-নির্ভর)। এখন verifyCustomerLoginOtp needs_password_setup
// পেলে dashboard-এর আগে এই ধাপে পাঠায় — একবার পাসওয়ার্ড সেট হয়ে
// গেলে ভবিষ্যতে লিংক ছাড়াও ঢোকা যাবে।
//
// State/API-লজিক usePortalAuth.js-এ (submitPasswordSetup) — এই
// কম্পোনেন্ট শুধু presentational, OtpLoginView/WelcomeView-এর মতোই।

import { FiAlertTriangle, FiLock, FiEye, FiEyeOff, FiShield } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import CpInput from '../ui/CpInput'

export default function SetPasswordView({
  setupPassword,        setSetupPassword,
  setupPasswordConfirm, setSetupPasswordConfirm,
  showSetupPassword,    setShowSetupPassword,
  setupPasswordSaving,  setupPasswordError,
  onSubmit,
}) {
  return (
    <div className="min-h-screen bg-cp-bg-base flex flex-col font-cp-body">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[360px] flex flex-col items-center">

          {/* Logo */}
          <div className="w-[72px] h-[72px] rounded-2xl bg-cp-trust-900 flex items-center justify-center mb-5 shadow-lg shadow-cp-trust-900/20">
            <FiShield className="text-cp-trust-300" size={32} />
          </div>

          <h1 className="text-2xl font-semibold text-cp-trust-700 font-cp-head mb-1 text-center">
            পাসওয়ার্ড সেট করুন
          </h1>
          <p className="text-cp-text-secondary text-[13px] leading-relaxed mb-7 text-center">
            আপনি এতক্ষণ শুধু WhatsApp লিংক দিয়ে ঢুকেছেন। একটা পাসওয়ার্ড সেট করে রাখলে
            পরেরবার লিংক ছাড়াও নিরাপদে লগইন করতে পারবেন।
          </p>

          {/* Error banner */}
          {setupPasswordError && (
            <div className="w-full bg-cp-error-bg border border-cp-error/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5">
              <FiAlertTriangle className="text-cp-error flex-shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] text-cp-error leading-relaxed">{setupPasswordError}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-3">
            <CpInput
              icon={FiLock}
              type={showSetupPassword ? 'text' : 'password'}
              placeholder="নতুন পাসওয়ার্ড (ন্যূনতম ৬ ডিজিট/অক্ষর)"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowSetupPassword((s) => !s)}
                  className="text-cp-text-muted hover:text-cp-text-secondary"
                  aria-label={showSetupPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                >
                  {showSetupPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              }
            />
            <CpInput
              icon={FiLock}
              type={showSetupPassword ? 'text' : 'password'}
              placeholder="পাসওয়ার্ড আবার লিখুন"
              value={setupPasswordConfirm}
              onChange={(e) => setSetupPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <CpButton type="submit" variant="action" size="lg" fullWidth loading={setupPasswordSaving}>
              পাসওয়ার্ড সেট করুন
            </CpButton>
          </form>
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
