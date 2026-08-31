// components/dashboard/BottomNav.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ১ — Facebook-স্টাইল নেভিগেশন স্ট্রাকচার
// ৬টা মূল সেকশন (fixed bottom bar, mobile app-এর মতো):
//   হোম → কানেকশন → E-commerce → রিপোর্ট (Reels-এর জায়গায়) → AI চ্যাট → প্রোফাইল
//
// পুরনো ১০টা flat ট্যাব (summary/network/orders/invoices/payments/returns/
// credit_req/complaints/profile/ai_chat) এখন এই ৬টা সেকশনের নিচে গোছানো —
// ইনভয়েস/পরিশোধ/রিটার্ন/লিমিট/অভিযোগ সব "রিপোর্ট" সেকশনের সাব-ট্যাব হিসেবে থাকছে
// (DashboardView.jsx-এ NAV_SECTIONS দেখুন)। কোনো ব্যাকএন্ড লজিক/ডেটা মোছা হয়নি,
// শুধু নেভিগেশনের জায়গা বদলেছে।
// ═══════════════════════════════════════════════════════════════

import { FiHome, FiUsers, FiShoppingBag, FiBarChart2, FiCpu, FiUser } from 'react-icons/fi'

export const NAV_SECTIONS = [
  { id: 'home',        icon: FiHome,        label: 'হোম',       tab: 'home_feed' },
  { id: 'connections', icon: FiUsers,       label: 'কানেকশন',   tab: 'network' },
  { id: 'ecommerce',   icon: FiShoppingBag, label: 'E-commerce', tab: 'orders' },
  { id: 'reports',     icon: FiBarChart2,   label: 'রিপোর্ট',   tab: 'summary', subTabs: ['summary', 'invoices', 'payments', 'returns', 'credit_req', 'complaints'] },
  { id: 'ai',          icon: FiCpu,         label: 'AI চ্যাট',  tab: 'ai_chat' },
  { id: 'profile',     icon: FiUser,        label: 'প্রোফাইল', tab: 'profile' },
]

export function getActiveSectionId(activeTab) {
  const found = NAV_SECTIONS.find(s => s.tab === activeTab || (s.subTabs || []).includes(activeTab))
  return found ? found.id : 'home'
}

export function getActiveSection(activeTab) {
  return NAV_SECTIONS.find(s => s.id === getActiveSectionId(activeTab)) || NAV_SECTIONS[0]
}

export default function BottomNav({ activeTab, onTabChange, badges = {} }) {
  const activeSectionId = getActiveSectionId(activeTab)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-cp-bg-surface border-t border-cp-border flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -4px 20px rgba(10,46,92,0.08)' }}
    >
      {NAV_SECTIONS.map((section) => {
        const active = section.id === activeSectionId
        const Icon = section.icon
        // ✅ NEW (Phase 4 — কোড অডিট): badges prop-এ section.id ধরে কাউন্ট
        // দিলে আইকনের উপর ছোট রেড ব্যাজ দেখাবে। এখন শুধু 'connections'-এর
        // জন্য DashboardView.jsx থেকে পাঠানো হয় (পেন্ডিং রিকোয়েস্ট কাউন্ট),
        // কিন্তু এই prop জেনেরিক — ভবিষ্যতে অন্য সেকশনেও ব্যবহার করা যাবে।
        const badgeCount = badges[section.id] || 0
        return (
          <button
            key={section.id}
            onClick={() => onTabChange(section.tab)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0"
          >
            <div className="relative">
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? 'text-cp-trust-500' : 'text-cp-text-muted'}
              />
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-cp-error text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </div>
            <span
              className={`text-[9.5px] leading-tight font-cp-body truncate max-w-full px-0.5 ${
                active ? 'text-cp-trust-500 font-semibold' : 'text-cp-text-muted font-medium'
              }`}
            >
              {section.label}
            </span>
            {active && <span className="w-1 h-1 rounded-full bg-cp-trust-500 mt-0.5" />}
          </button>
        )
      })}
    </nav>
  )
}
