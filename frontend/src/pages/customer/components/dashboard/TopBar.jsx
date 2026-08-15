// components/dashboard/TopBar.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ৩ (রিভাইজড) — Facebook-স্টাইল টপ বার
//
// হোম পেইজ:      ☰  ZovoriX (হ্যামবার্গারের কাছাকাছি)  ······  + 🔍 💬
// অন্যান্য পেইজ:  ☰  🔵 পেইজের নাম (যেমন কানেকশন/রিপোর্ট)  ······  [সার্চ বার]
//                 (+ আইকন ও মেসেঞ্জার আইকন অন্যান্য পেইজে দেখানো হয় না)
//
// ✅ আপডেট — Part 4-এর আগে: মেসেঞ্জার আইকন আর "শীঘ্রই আসছে" না, সরাসরি
// MessagesTab-এ নিয়ে যায় (onTabChange('messages'))। + আর সার্চ এখনো বাকি।
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { FiMenu, FiPlus, FiSearch, FiMessageCircle } from 'react-icons/fi'

function LogoDot({ small }) {
  return (
    <div className={`${small ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-[13px]'} rounded-full bg-cp-trust-500 flex items-center justify-center text-white font-bold flex-shrink-0 font-cp-head`}>
      Z
    </div>
  )
}

export default function TopBar({ onMenuClick, onTabChange, unreadCount = 0, pageTitle = null }) {
  const isHome = !pageTitle
  const [comingSoon, setComingSoon] = useState(null) // 'add' | 'search' | null

  const flashComingSoon = (key) => {
    setComingSoon(key)
    setTimeout(() => setComingSoon(c => (c === key ? null : c)), 1800)
  }

  return (
    <div className="sticky top-0 z-30 bg-cp-bg-surface border-b border-cp-border px-2 h-14 flex items-center gap-1">
      {/* ☰ মেনু */}
      <button
        onClick={onMenuClick}
        aria-label="মেনু"
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt flex-shrink-0"
      >
        <FiMenu size={21} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cp-error border border-white" />
        )}
      </button>

      {/* লোগো — হ্যামবার্গারের একদম কাছে (গ্যাপ মাঝখানে/ডানে ঠেলে দেওয়া হয়েছে) */}
      <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
        <LogoDot small={!isHome} />
        {isHome ? (
          <span className="text-[15px] font-bold text-cp-trust-500 font-cp-head truncate">ZovoriX</span>
        ) : (
          <span className="text-[15px] font-bold text-cp-text-primary font-cp-head truncate">{pageTitle}</span>
        )}
      </div>

      {/* মাঝের ফাঁকা জায়গা — বাকি স্পেসটা এখানে চলে যায় */}
      <div className="flex-1 min-w-2" />

      {isHome ? (
        /* ── হোম: +, সার্চ (এখনো শীঘ্রই আসছে), মেসেঞ্জার (✅ এখন রিয়েল) ── */
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => flashComingSoon('add')}
              aria-label="নতুন"
              className="w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt"
            >
              <FiPlus size={19} />
            </button>
            {comingSoon === 'add' && (
              <div className="absolute top-11 right-0 z-50 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                শীঘ্রই আসছে
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => flashComingSoon('search')}
              aria-label="সার্চ"
              className="w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt"
            >
              <FiSearch size={18} />
            </button>
            {comingSoon === 'search' && (
              <div className="absolute top-11 right-0 z-50 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                সার্চ শীঘ্রই আসছে
              </div>
            )}
          </div>
          {/* ✅ মেসেঞ্জার — MessagesTab-এ নিয়ে যায় */}
          <button
            onClick={() => onTabChange?.('messages')}
            aria-label="মেসেজ"
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt"
          >
            <FiMessageCircle size={18} />
          </button>
        </div>
      ) : (
        /* ── অন্যান্য পেইজ: শুধু সার্চ বার ── */
        <div className="relative flex-shrink-0">
          <button
            onClick={() => flashComingSoon('search')}
            className="flex items-center gap-2 bg-cp-bg-alt rounded-full pl-3 pr-3.5 h-9 text-cp-text-muted"
          >
            <FiSearch size={15} />
            <span className="text-[11.5px]">সার্চ করুন...</span>
          </button>
          {comingSoon === 'search' && (
            <div className="absolute top-11 right-0 z-50 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
              সার্চ শীঘ্রই আসছে
            </div>
          )}
        </div>
      )}
    </div>
  )
}
