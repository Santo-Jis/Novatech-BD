// components/views/OtpLoginView.jsx
// SR-এর WhatsApp লিংকে (?c=customer_code) ক্লিক করে আসা কাস্টমারের
// জন্য নতুন লগইন আর্কিটেকচার — password/Google লাগবে না।
//
// ২ ধাপ:
//   confirm → SR-এর ফর্ম থেকে নেওয়া বেসিক তথ্য (দোকান/মালিকের নাম +
//             ছবি) দেখিয়ে "এটা কি আপনি?" — Continue চাপলে OTP যায়
//   otp     → WhatsApp-এ পাঠানো ৬-ডিজিট OTP দিয়ে যাচাই → dashboard
//
// State/API-লজিক usePortalAuth.js-এ (WelcomeView-এর password ফর্মের
// মতোই প্যাটার্ন) — এই কম্পোনেন্ট শুধু presentational।

import { FiShoppingBag, FiAlertTriangle, FiLock, FiUser } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import CpCard from '../ui/CpCard'
import CpInput from '../ui/CpInput'

export default function OtpLoginView({
  otpLoginStep, otpLoginInfo, otpLoginInfoErr,
  otpValue, setOtpValue, otpSending, otpVerifying, otpError,
  onSendOtp, onVerifyOtp, onUseOtherMethod,
}) {
  const displayError = otpError || otpLoginInfoErr

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
            কাস্টমার পোর্টাল
          </p>

          {/* Error banner */}
          {displayError && (
            <div className="w-full bg-cp-error-bg border border-cp-error/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5">
              <FiAlertTriangle className="text-cp-error flex-shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] text-cp-error leading-relaxed">{displayError}</p>
            </div>
          )}

          {/* ── ধাপ ১: "এটা কি আপনি?" কনফার্ম কার্ড + Continue ──── */}
          {otpLoginStep === 'confirm' && !otpLoginInfoErr && (
            <>
              <CpCard padding="lg" className="w-full text-center mb-6">
                {otpLoginInfo?.shop_photo ? (
                  <img
                    src={otpLoginInfo.shop_photo}
                    alt={otpLoginInfo.shop_name || ''}
                    className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border border-cp-border"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-cp-trust-100 flex items-center justify-center mx-auto mb-3">
                    <FiUser className="text-cp-trust-500" size={26} />
                  </div>
                )}
                <p className="text-cp-text-muted text-[11px] tracking-wider uppercase mb-1.5">
                  এটা কি আপনি?
                </p>
                <p className="text-cp-trust-700 text-lg font-semibold font-cp-head mb-1">
                  {otpLoginInfo?.shop_name || 'লোড হচ্ছে...'}
                </p>
                {otpLoginInfo?.owner_name && (
                  <p className="text-cp-text-secondary text-[13px]">{otpLoginInfo.owner_name}</p>
                )}
              </CpCard>

              <CpButton
                variant="action"
                size="lg"
                fullWidth
                loading={otpSending}
                disabled={!otpLoginInfo}
                onClick={onSendOtp}
              >
                Continue
              </CpButton>

              <p className="text-cp-text-muted text-[11px] mt-3.5 text-center">
                Continue করলে আপনার WhatsApp নম্বরে একটি OTP কোড যাবে
              </p>
            </>
          )}

          {/* ── ধাপ ২: OTP যাচাই ─────────────────────────────── */}
          {otpLoginStep === 'otp' && (
            <form onSubmit={onVerifyOtp} className="w-full flex flex-col gap-3">
              <p className="text-cp-text-secondary text-[13px] leading-relaxed mb-1 text-center">
                আপনার WhatsApp নম্বরে ৬ ডিজিটের একটি OTP পাঠানো হয়েছে (মেয়াদ ১০ মিনিট)।
              </p>
              <CpInput
                icon={FiLock}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="৬ ডিজিটের OTP"
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
              />
              <CpButton type="submit" variant="action" size="lg" fullWidth loading={otpVerifying}>
                যাচাই করুন
              </CpButton>
              <button
                type="button"
                onClick={onSendOtp}
                disabled={otpSending}
                className="text-cp-trust-500 text-[13px] font-medium mt-1 hover:underline disabled:opacity-50"
              >
                OTP পাননি? আবার পাঠান
              </button>
            </form>
          )}

          {/* ফলব্যাক — WhatsApp অ্যাক্সেস না থাকলে/OTP গেটওয়ে সমস্যা হলে */}
          <button
            type="button"
            onClick={onUseOtherMethod}
            className="text-cp-text-muted text-[12px] mt-6 hover:text-cp-text-secondary hover:underline"
          >
            অন্য উপায়ে (Google/পাসওয়ার্ড) ঢুকতে চান?
          </button>
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
