// components/dashboard/TopBar.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ৩ — Facebook-স্টাইল টপ বার
// আগের ভারী ডার্ক হেডার (শপ নাম/verified ব্যাজ/SR কার্ড) সরিয়ে এখন একদম
// Facebook-এর মতো সরু সাদা bar: ☰ মেনু → লোগো → + → 🔍 → 💬
// শপ পরিচিতি, verified ব্যাজ, নোটিফিকেশন, SR কন্টাক্ট, লগআউট — সবকিছু
// এখন ☰ (হ্যামবার্গার) চাপলে যেই মেনু খোলে (AccountMenu.jsx) তার ভেতরে।
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { FiMenu, FiPlus, FiSearch, FiMessageCircle } from 'react-icons/fi'

export default function TopBar({ onMenuClick, unreadCount = 0 }) {
  const [comingSoon, setComingSoon] = useState(null) // 'add' | 'search' | 'messenger' | null

  const flashComingSoon = (key) => {
    setComingSoon(key)
    setTimeout(() => setComingSoon(c => (c === key ? null : c)), 1800)
  }

  return (
    <div className="sticky top-0 z-30 bg-cp-bg-surface border-b border-cp-border px-2.5 h-14 flex items-center justify-between">
      {/* ☰ মেনু (শপ তথ্য/নোটিফিকেশন/SR/লগআউট এখানে) */}
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

      {/* লোগো / ব্র্যান্ড ওয়ার্ডমার্ক */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-cp-trust-500 flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0 font-cp-head">N</div>
        <span className="text-[15px] font-bold text-cp-trust-500 font-cp-head truncate">NovaTech</span>
      </div>

      {/* ডান পাশের আইকন — +, সার্চ, মেসেঞ্জার (ব্যাকএন্ড নেই — শীঘ্রই আসছে) */}
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
        <div className="relative">
          <button
            onClick={() => flashComingSoon('messenger')}
            aria-label="মেসেঞ্জার"
            className="w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt"
          >
            <FiMessageCircle size={18} />
          </button>
          {comingSoon === 'messenger' && (
            <div className="absolute top-11 right-0 z-50 bg-cp-trust-900 text-white text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
              মেসেজিং শীঘ্রই আসছে
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
