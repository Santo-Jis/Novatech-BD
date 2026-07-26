// components/views/NoCompanyView.jsx
//
// ⚠️ স্টপগ্যাপ ভিউ — এখনো কোনো কোম্পানির সাথে connection নেই এমন
// person-এর জন্য। এটা "কোম্পানি খুঁজুন/connect করুন" পূর্ণ ফিচার না —
// backend-এ searchCompanies/requestConnectionToCompany কাজ করে, কিন্তু
// সেটার জন্য আলাদা, পূর্ণাঙ্গ UI এখনো বানানো হয়নি (পরবর্তী ধাপ)।
//
// আপাতত: ভুল "Session শেষ হয়েছে" এরর এড়িয়ে একটা সৎ, পরিষ্কার বার্তা
// দেখানো হচ্ছে যাতে self-register-এর পরের লগইন অন্তত ভেঙে না পড়ে।

import { FiShoppingBag, FiUsers } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import CpCard from '../ui/CpCard'

export default function NoCompanyView({ personProfile, onLogout }) {
  return (
    <div className="min-h-screen bg-cp-bg-base flex flex-col font-cp-body">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[360px] flex flex-col items-center">

          <div className="w-[72px] h-[72px] rounded-2xl bg-cp-trust-900 flex items-center justify-center mb-5 shadow-lg shadow-cp-trust-900/20">
            <FiUsers className="text-cp-trust-300" size={32} />
          </div>

          <h1 className="text-2xl font-semibold text-cp-trust-700 font-cp-head mb-1 text-center">
            প্রোফাইল তৈরি সম্পন্ন
          </h1>

          <CpCard padding="lg" className="w-full text-center my-6">
            {personProfile?.shop_name && (
              <p className="text-cp-trust-700 text-lg font-semibold font-cp-head mb-1">
                🏪 {personProfile.shop_name}
              </p>
            )}
            {personProfile?.full_name && (
              <p className="text-cp-text-secondary text-[13px] mb-2">
                {personProfile.full_name}
              </p>
            )}
            <p className="text-cp-text-secondary text-[13px] leading-relaxed">
              আপনার প্রোফাইল প্রস্তুত, কিন্তু এখনো কোনো কোম্পানির সাথে সংযুক্ত নন।
              সংশ্লিষ্ট কোম্পানির প্রতিনিধি (SR)-এর সাথে যোগাযোগ করুন —
              তারা আপনাকে সংযোগের অনুরোধ পাঠাবে।
            </p>
          </CpCard>

          <div className="w-full flex items-center gap-2.5 text-cp-text-muted text-[12px] mb-6">
            <FiShoppingBag size={14} className="flex-shrink-0" />
            কোম্পানি খুঁজে নিজে সংযোগ করার ব্যবস্থা শীঘ্রই আসছে।
          </div>

          <CpButton variant="secondary" size="lg" fullWidth onClick={onLogout}>
            লগআউট
          </CpButton>
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
