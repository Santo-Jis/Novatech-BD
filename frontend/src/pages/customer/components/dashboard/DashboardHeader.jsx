// components/dashboard/DashboardHeader.jsx
// ড্যাশবোর্ডের উপরের ডার্ক হেডার — শপ তথ্য, verified ব্যাজ, নোটিফিকেশন বেল,
// লগআউট বাটন, ক্রেডিট রিং ও ব্যালেন্স কার্ড। DashboardView.jsx থেকে আলাদা করা হলো।

import CreditRing from './CreditRing'
import NotificationBell from './NotificationBell'

export default function DashboardHeader({
  customer, fmtCur, portalJWT,
  notifications, unreadCount, showBell, setShowBell, markAllAsRead, markOneRead, onTabChange,
  onLogoutClick,
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-cp-trust-900 via-cp-trust-900 to-cp-trust-700 px-5 pt-12 pb-[90px]">
      {/* সূক্ষ্ম ডট প্যাটার্ন + আলোকরশ্মি — বিশুদ্ধ ভিজ্যুয়াল, ক্লিকযোগ্য না */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div className="absolute -top-14 -right-14 w-[220px] h-[220px] rounded-full bg-cp-trust-500/10 pointer-events-none" />

      {/* Top bar */}
      <div className="relative flex justify-between items-start mb-7">
        <div className="min-w-0">
          <span className="text-[9px] text-white/35 tracking-[2px] uppercase block mb-1">CUSTOMER PORTAL</span>
          {/* ✅ FIX (Session 13): CompanySwitcher (session-switch) সরিয়ে সাধারণ
              শপ-নামে ফেরত আনা হলো। 01-Requirements-Spec.md অনুযায়ী সঠিক প্যাটার্ন
              হলো aggregate + company-ট্যাগ (এক লিস্টে সব কোম্পানি), সেশন সুইচ না —
              তাই এটা header-এর প্রধান নেভিগেশন হিসেবে রাখা ঠিক না। CompanySwitcher.jsx
              কম্পোনেন্ট ও backend switch endpoint কোডে থেকে গেল, ভবিষ্যতে অন্য কোনো
              দরকারে (যেমন per-company সেটিংস স্ক্রিন) কাজে লাগতে পারে। */}
          <h1 className="text-xl font-bold text-white leading-tight font-cp-head truncate">{customer.shop_name}</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cp-confidence-600 flex-shrink-0 shadow-[0_0_8px_rgba(14,155,108,0.9)]" />
            <span className="text-[10px] text-white/40 truncate">{customer.owner_name} • {customer.customer_code}</span>
          </div>
          <span
            className={`inline-flex items-center gap-1 mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              customer.is_verified
                ? 'bg-cp-confidence-600/15 text-cp-confidence-300 border-cp-confidence-600/30'
                : 'bg-cp-warmth-600/15 text-cp-warmth-300 border-cp-warmth-600/30'
            }`}
          >
            {customer.is_verified ? '✅ Verified কাস্টমার' : '⏳ Unverified — SR ভিজিটের অপেক্ষায়'}
          </span>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            showBell={showBell}
            setShowBell={setShowBell}
            portalJWT={portalJWT}
            markAllAsRead={markAllAsRead}
            markOneRead={markOneRead}
            onTabChange={onTabChange}
          />
          <button
            onClick={onLogoutClick}
            className="h-10 px-3.5 rounded-xl bg-white/10 border border-white/15 text-white/70 text-[11px] font-semibold tracking-wide"
          >
            লগআউট
          </button>
        </div>
      </div>

      {/* Credit Ring + Balance Cards */}
      <div className="relative flex items-center gap-3.5">
        <CreditRing current={customer.current_credit} limit={customer.credit_limit} fmtCur={fmtCur} />
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="bg-white/[0.06] rounded-2xl px-3.5 py-2.5 border border-white/[0.08]">
            <p className="text-[10px] text-white/40 font-medium mb-0.5">ক্রেডিট লিমিট</p>
            <p className="text-[19px] text-white font-bold font-cp-mono">৳{fmtCur(customer.credit_limit)}</p>
          </div>
          <div className="bg-cp-confidence-600/[0.14] rounded-2xl px-3.5 py-2.5 border border-cp-confidence-600/20">
            <p className="text-[10px] text-cp-confidence-300 font-medium mb-0.5">জমা ব্যালেন্স</p>
            <p className="text-[19px] text-cp-confidence-300 font-bold font-cp-mono">৳{fmtCur(customer.credit_balance)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
