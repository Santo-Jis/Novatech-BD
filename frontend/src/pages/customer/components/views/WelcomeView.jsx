// components/views/WelcomeView.jsx
// প্রথমবার আসলে Google login করার আগে welcome screen
//
// ✅ রিডিজাইন করা হলো: customer-design-system.html অনুযায়ী (trust blue থিম)।
// আগে এটা ভুলবশত design.html (business/admin) এর navy+bronze থিম ব্যবহার করছিল —
// এখন সঠিক কাস্টমার-ফেসিং ডিজাইন সিস্টেম প্রয়োগ করা হয়েছে।
//
// props অপরিবর্তিত: tokenInfo, justRegistered, error, loggingIn, onLogin
// (auth logic — usePortalAuth.js — একদমই স্পর্শ করা হয়নি)
//
// ব্র্যান্ড নাম: "ZovoriX" (সঠিক — Novatech BD থেকে ZovoriX-এ rebrand চলছে, উল্টোটা না)

import { useNavigate } from 'react-router-dom'
import { FiShoppingBag, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import CpCard from '../ui/CpCard'
import CpBadge from '../ui/CpBadge'

export default function WelcomeView({ tokenInfo, justRegistered, error, loggingIn, onLogin }) {
  const navigate = useNavigate()

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

          {/* রেজিস্ট্রেশনের পরে সফল-বার্তা */}
          {justRegistered && (
            <div className="w-full bg-cp-confidence-100 border border-cp-confidence-600/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5">
              <FiCheckCircle className="text-cp-confidence-600 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] text-cp-confidence-600 leading-relaxed">
                রেজিস্ট্রেশন সফল হয়েছে! এখন এই দোকানের জন্য নিচে Google দিয়ে প্রবেশ করুন।
              </p>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="w-full bg-cp-error-bg border border-cp-error/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5">
              <FiAlertTriangle className="text-cp-error flex-shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] text-cp-error leading-relaxed">{error}</p>
            </div>
          )}

          {/* Customer info card */}
          {tokenInfo && (
            <CpCard padding="lg" className="w-full text-center mb-6">
              <p className="text-cp-text-muted text-[11px] tracking-wider uppercase mb-1.5">
                আপনার দোকান
              </p>
              <p className="text-cp-trust-700 text-lg font-semibold font-cp-head mb-1">
                🏪 {tokenInfo.shop_name}
              </p>
              <p className="text-cp-text-secondary text-[13px] mb-2">
                {tokenInfo.owner_name}
              </p>
              <CpBadge variant="info">কোড: {tokenInfo.customer_code}</CpBadge>
            </CpCard>
          )}

          <p className="text-cp-text-secondary text-[13px] text-center max-w-[320px] mb-6 leading-relaxed">
            আবার প্রবেশ করতে আপনার Google অ্যাকাউন্ট ব্যবহার করুন।
          </p>

          {/* Google Login button — Google-এর নিজস্ব ব্র্যান্ড গাইডলাইন অনুযায়ী সাদা bg + বহুরঙা লোগো বজায় রাখা হয়েছে */}
          <button
            onClick={onLogin}
            disabled={loggingIn}
            className="w-full h-14 rounded-xl bg-white border border-cp-border text-cp-trust-700 text-[15px] font-semibold
                       flex items-center justify-center gap-2.5 shadow-sm transition-all active:scale-[0.98]
                       disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-cp-bg-alt"
          >
            {loggingIn ? (
              <>
                <span className="w-[18px] h-[18px] border-2 border-cp-trust-100 border-t-cp-trust-700 rounded-full animate-spin flex-shrink-0" />
                লগইন হচ্ছে...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google দিয়ে প্রবেশ করুন
              </>
            )}
          </button>

          <p className="text-cp-text-muted text-[11px] mt-3.5 text-center">
            আপনার Gmail অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন
          </p>

          {/* Divider */}
          <div className="w-full flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-cp-border" />
            <span className="text-cp-text-muted text-[11px]">অথবা</span>
            <div className="flex-1 h-px bg-cp-border" />
          </div>

          {/* নতুন কাস্টমার সেলফ-রেজিস্ট্রেশন */}
          <CpButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate('/customer-register')}
          >
            নতুন কাস্টমার? এখানে রেজিস্ট্রেশন করুন
          </CpButton>
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
