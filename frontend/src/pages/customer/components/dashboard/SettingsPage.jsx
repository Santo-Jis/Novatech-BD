// components/dashboard/SettingsPage.jsx
// ═══════════════════════════════════════════════════════════════
// AccountMenu → "সেটিংস" — fixed full-screen (z-50), ব্যাক চাপলে
// AccountMenu-এ ফেরে। দ্বিতীয় স্তরের নেভিগেশন (sub-view) লোকাল।
//
// "পাসওয়ার্ড ও নিরাপত্তা"      → SecurityPanel (ProfileTab থেকে সরানো, reused)
// "যোগাযোগের তথ্য পরিবর্তন"    → এখানে নতুন প্যানেল বানানো হয়নি —
//                                  ProfileTab-এ এটা আগে থেকেই সম্পূর্ণ
//                                  বিল্ড করা আছে (discoverable-masking
//                                  ব্যাখ্যাসহ), তাই ডুপ্লিকেট না করে
//                                  onGoToProfile দিয়ে সরাসরি প্রোফাইল
//                                  ট্যাবে নিয়ে যাওয়া হয় — code reuse-এর
//                                  সবচেয়ে খাঁটি রূপ।
// "ডেটা এক্সপোর্ট"             → একই কারণে এখানেও নতুন কিছু বানানো হয়নি।
//                                  "রিপোর্ট" ট্যাবে "Statement Download"
//                                  কার্ড (usePortalAuth.js-এর
//                                  downloadStatement, PDFKit ব্যাকএন্ড)
//                                  আগে থেকেই সম্পূর্ণ — শুধু discoverable
//                                  করা হলো onGoToReports দিয়ে।
// "অ্যাকাউন্ট ডিলিট করুন"      → AccountDeletePanel (immediate self-service,
//                                  admin/SR রিভিউ নেই)
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { FiShield, FiEdit3, FiDownload, FiTrash2, FiChevronRight } from 'react-icons/fi'
import MenuPageHeader from './MenuPageHeader'
import SecurityPanel from './settings/SecurityPanel'
import AccountDeletePanel from './settings/AccountDeletePanel'
import CpCard from '../ui/CpCard'

const SUB_TITLES = {
  security: 'পাসওয়ার্ড ও নিরাপত্তা',
  delete:   'অ্যাকাউন্ট ডিলিট করুন',
}

export default function SettingsPage({ portalJWT, onBack, onGoToProfile, onGoToReports, onLogout }) {
  const [sub, setSub] = useState(null) // null | 'security' | 'delete'

  const back = () => (sub ? setSub(null) : onBack())

  return (
    <div className="fixed inset-0 z-50 bg-cp-bg-base flex flex-col">
      <MenuPageHeader title={sub ? SUB_TITLES[sub] : 'সেটিংস'} onBack={back} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {sub === 'security' && <SecurityPanel portalJWT={portalJWT} />}
        {sub === 'delete' && <AccountDeletePanel portalJWT={portalJWT} onLogout={onLogout} />}

        {sub === null && (
          <>
            <CpCard padding="none">
              <div className="divide-y divide-cp-border/60">
                <button
                  onClick={() => setSub('security')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-bg-alt active:bg-cp-bg-alt transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-cp-bg-alt text-cp-trust-700 flex items-center justify-center flex-shrink-0">
                    <FiShield size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-cp-text-primary">পাসওয়ার্ড ও নিরাপত্তা</p>
                    <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">পাসওয়ার্ড বদলান, ডিভাইস ও লগইন হিস্ট্রি দেখুন</p>
                  </div>
                  <FiChevronRight size={16} className="text-cp-text-muted flex-shrink-0" />
                </button>

                {/* ✅ প্রোফাইল ট্যাবে থাকা "যোগাযোগের তথ্য" সেকশনে নিয়ে যায় — নতুন কিছু বানানো হয়নি */}
                <button
                  onClick={onGoToProfile}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-bg-alt active:bg-cp-bg-alt transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-cp-bg-alt text-cp-trust-700 flex items-center justify-center flex-shrink-0">
                    <FiEdit3 size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-cp-text-primary">যোগাযোগের তথ্য পরিবর্তন</p>
                    <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">ফোন নম্বর বা ইমেইল আপডেট করুন — প্রোফাইল ট্যাবে</p>
                  </div>
                  <FiChevronRight size={16} className="text-cp-text-muted flex-shrink-0" />
                </button>

                {/* ✅ "রিপোর্ট" ট্যাবের Statement Download কার্ডে নিয়ে যায় — নতুন কিছু বানানো হয়নি */}
                <button
                  onClick={onGoToReports}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-bg-alt active:bg-cp-bg-alt transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-cp-bg-alt text-cp-trust-700 flex items-center justify-center flex-shrink-0">
                    <FiDownload size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-cp-text-primary">ডেটা এক্সপোর্ট</p>
                    <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">Statement PDF ডাউনলোড করুন — রিপোর্ট ট্যাবে</p>
                  </div>
                  <FiChevronRight size={16} className="text-cp-text-muted flex-shrink-0" />
                </button>
              </div>
            </CpCard>

            {/* অ্যাকাউন্ট ডিলিট — আলাদা কার্ড, ভিজ্যুয়ালি বিপজ্জনক */}
            <CpCard padding="none">
              <button
                onClick={() => setSub('delete')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-error-bg active:bg-cp-error-bg transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-cp-error-bg text-cp-error flex items-center justify-center flex-shrink-0">
                  <FiTrash2 size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-cp-error">অ্যাকাউন্ট ডিলিট করুন</p>
                  <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">এটি স্থায়ী একটি পদক্ষেপ</p>
                </div>
                <FiChevronRight size={16} className="text-cp-error/50 flex-shrink-0" />
              </button>
            </CpCard>
          </>
        )}
      </div>
    </div>
  )
}
