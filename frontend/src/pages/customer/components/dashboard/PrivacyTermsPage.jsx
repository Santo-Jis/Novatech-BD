// components/dashboard/PrivacyTermsPage.jsx
// AccountMenu → "প্রাইভেসি ও শর্তাবলী" — fixed full-screen (z-50)।
// ⚠️ প্রাথমিক খসড়া কনটেন্ট — পাবলিশের আগে আইনজীবী রিভিউ করান।

import { useState } from 'react'
import { FiShield, FiFileText, FiAlertTriangle } from 'react-icons/fi'
import MenuPageHeader from './MenuPageHeader'
import CpCard from '../ui/CpCard'

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-cp-text-primary font-cp-head mb-1">{title}</h3>
      <p className="text-[12.5px] text-cp-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export default function PrivacyTermsPage({ onBack }) {
  const [tab, setTab] = useState('privacy')

  return (
    <div className="fixed inset-0 z-50 bg-cp-bg-base flex flex-col">
      <MenuPageHeader title="প্রাইভেসি ও শর্তাবলী" onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* খসড়া নোটিশ */}
        <CpCard variant="sunken" padding="sm">
          <div className="flex gap-2.5 items-start">
            <FiAlertTriangle className="text-cp-warmth-600 flex-shrink-0 mt-0.5" size={14} />
            <p className="text-[11px] text-cp-text-secondary leading-relaxed">
              প্রাথমিক খসড়া — প্রকাশের আগে আইনজীবী দিয়ে যাচাই করিয়ে নিন (বিশেষত ক্রেডিট ও আর্থিক তথ্য সংক্রান্ত অংশ)।
            </p>
          </div>
        </CpCard>

        {/* ট্যাব সুইচ */}
        <div className="flex gap-2 bg-cp-bg-alt rounded-full p-1">
          {[
            { k: 'privacy', l: 'প্রাইভেসি নীতি', icon: FiShield },
            { k: 'terms',   l: 'শর্তাবলী',       icon: FiFileText },
          ].map(({ k, l, icon: Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 h-9 rounded-full text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === k
                  ? 'bg-cp-bg-surface text-cp-trust-700 shadow-sm'
                  : 'text-cp-text-muted'
              }`}
            >
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>

        <CpCard padding="lg">
          <div className="flex flex-col gap-4">
            <p className="text-[11px] text-cp-text-muted">সর্বশেষ আপডেট: আগস্ট ২০২৬</p>

            {tab === 'privacy' ? (
              <>
                <Section title="১. কী তথ্য সংগ্রহ করা হয়">
                  শপের নাম ও ঠিকানা, মালিকের নাম, ফোন নম্বর ও ইমেইল, ব্যবসার ধরন, সার্ভিস এরিয়া, লেনদেন ও ক্রেডিট ইতিহাস, এবং অ্যাকাউন্ট সুরক্ষার জন্য ডিভাইস ও লগইন তথ্য।
                </Section>
                <Section title="২. তথ্য কীভাবে ব্যবহার হয়">
                  অর্ডার প্রসেস করতে, বিক্রয় প্রতিনিধির (SR) সাথে সমন্বয় করতে, ক্রেডিট লিমিট নির্ধারণে, ইনভয়েস/পেমেন্ট হিসাব রাখতে, এবং প্রয়োজনীয় নোটিফিকেশন পাঠাতে।
                </Section>
                <Section title="৩. কার সাথে শেয়ার করা হয়">
                  শুধুমাত্র আপনার connected ডিস্ট্রিবিউটর কোম্পানি(গুলো) ও তাদের নিয়োজিত SR/স্টাফ আপনার তথ্য দেখতে পারে। কোনো তৃতীয় পক্ষের কাছে বিক্রি বা বিজ্ঞাপনের উদ্দেশ্যে শেয়ার করা হয় না।
                </Section>
                <Section title="৪. আপনার অধিকার">
                  আপনি যেকোনো সময় নিজের তথ্য দেখতে, সংশোধন করতে, বা অ্যাকাউন্ট ডিলিটের অনুরোধ করতে পারেন (Settings থেকে)।
                </Section>
              </>
            ) : (
              <>
                <Section title="১. অ্যাকাউন্টের দায়িত্ব">
                  লগইন তথ্য (পাসওয়ার্ড/OTP) গোপন রাখার দায়িত্ব ব্যবহারকারীর। সন্দেহজনক কার্যকলাপ দেখলে সাথে সাথে SR বা সাপোর্টকে জানান।
                </Section>
                <Section title="২. ব্যবহারের নিয়ম">
                  এই পোর্টাল শুধুমাত্র বৈধ ব্যবসায়িক উদ্দেশ্যে ব্যবহারযোগ্য — অর্ডার, পেমেন্ট ট্র্যাকিং, এবং সংশ্লিষ্ট কোম্পানির সাথে যোগাযোগের জন্য।
                </Section>
                <Section title="৩. অর্ডার, ক্রেডিট ও পেমেন্ট">
                  ক্রেডিট লিমিট, পেমেন্টের শর্ত ও সময়সীমা প্রতিটি connected ডিস্ট্রিবিউটর কোম্পানি নির্ধারণ করে।
                </Section>
                <Section title="৪. প্রযোজ্য আইন">
                  এই শর্তাবলী বাংলাদেশের প্রচলিত আইন অনুযায়ী পরিচালিত হয়।
                </Section>
              </>
            )}
          </div>
        </CpCard>
      </div>
    </div>
  )
}
