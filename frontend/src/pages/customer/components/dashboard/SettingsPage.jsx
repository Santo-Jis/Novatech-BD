// components/dashboard/SettingsPage.jsx
// ═══════════════════════════════════════════════════════════════
// AccountMenu → "সেটিংস" — fixed full-screen (z-50), ব্যাক চাপলে
// AccountMenu-এ ফেরে। দ্বিতীয় স্তরের নেভিগেশন (sub-view) লোকাল।
//
// "পাসওয়ার্ড ও নিরাপত্তা" ও "ডিভাইস ও লগইন হিস্ট্রি" →
//   SecurityPanel (ProfileTab থেকে সরানো কোড, reused)
// "যোগাযোগের তথ্য" ও "অ্যাকাউন্ট ডিলিট" → শীঘ্রই আসছে (flash tooltip)
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { FiShield, FiEdit3, FiTrash2, FiChevronRight } from 'react-icons/fi'
import MenuPageHeader from './MenuPageHeader'
import SecurityPanel from './settings/SecurityPanel'
import CpCard from '../ui/CpCard'

const ROWS = [
  { key: 'security', icon: FiShield, label: 'পাসওয়ার্ড ও নিরাপত্তা', desc: 'পাসওয়ার্ড বদলান, ডিভাইস ও লগইন হিস্ট্রি দেখুন', live: true },
  { key: 'contact',  icon: FiEdit3,  label: 'যোগাযোগের তথ্য পরিবর্তন', desc: 'ফোন নম্বর বা ইমেইল আপডেট করুন',               live: false },
]

const SUB_TITLES = {
  security: 'পাসওয়ার্ড ও নিরাপত্তা',
}

export default function SettingsPage({ portalJWT, onBack }) {
  const [sub,   setSub]   = useState(null)   // null | 'security'
  const [flash, setFlash] = useState(null)

  const handleRow = (row) => {
    if (row.live) {
      setSub(row.key)
    } else {
      setFlash(row.key)
      setTimeout(() => setFlash(f => (f === row.key ? null : f)), 1600)
    }
  }

  const back = () => (sub ? setSub(null) : onBack())

  return (
    <div className="fixed inset-0 z-50 bg-cp-bg-base flex flex-col">
      <MenuPageHeader title={sub ? SUB_TITLES[sub] : 'সেটিংস'} onBack={back} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {sub === 'security' && <SecurityPanel portalJWT={portalJWT} />}

        {sub === null && (
          <>
            <CpCard padding="none">
              <div className="divide-y divide-cp-border/60">
                {ROWS.map(row => (
                  <div key={row.key} className="relative">
                    <button
                      onClick={() => handleRow(row)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-bg-alt active:bg-cp-bg-alt transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-cp-bg-alt text-cp-trust-700 flex items-center justify-center flex-shrink-0">
                        <row.icon size={17} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-cp-text-primary">{row.label}</p>
                        <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">{row.desc}</p>
                      </div>
                      <FiChevronRight size={16} className="text-cp-text-muted flex-shrink-0" />
                    </button>
                    {flash === row.key && (
                      <div className="absolute top-1/2 right-11 -translate-y-1/2 z-20 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                        শীঘ্রই আসছে
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CpCard>

            {/* অ্যাকাউন্ট ডিলিট — আলাদা কার্ড, ভিজ্যুয়ালি বিপজ্জনক */}
            <CpCard padding="none">
              <div className="relative">
                <button
                  onClick={() => handleRow({ key: 'delete', live: false })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cp-error-bg active:bg-cp-error-bg transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-cp-error-bg text-cp-error flex items-center justify-center flex-shrink-0">
                    <FiTrash2 size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-cp-error">অ্যাকাউন্ট ডিলিট করুন</p>
                    <p className="text-[11px] text-cp-text-muted leading-snug mt-0.5">এটি স্থায়ী একটি পদক্ষেপ</p>
                  </div>
                </button>
                {flash === 'delete' && (
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 z-20 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    শীঘ্রই আসছে
                  </div>
                )}
              </div>
            </CpCard>
          </>
        )}
      </div>
    </div>
  )
}
