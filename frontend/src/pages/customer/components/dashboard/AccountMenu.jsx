// components/dashboard/AccountMenu.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ৩ — ☰ হ্যামবার্গার চাপলে যেই মেনু খোলে
// আগে DashboardHeader.jsx-এ যা যা ছিল (শপ নাম, verified ব্যাজ, নোটিফিকেশন
// বেল, লগআউট) — সব এখানে। SR কন্টাক্ট কার্ড (আগে HomeFeed.jsx-এ পিন করা
// ছিল) এখনো এখানে নিয়ে আসা হলো — কোনো ফাংশনালিটি মোছা হয়নি, শুধু
// Facebook-এর মতো ☰ মেনুর ভেতরে সরানো হলো (হোম ফিড এখন পরিষ্কার থাকবে)।
// ═══════════════════════════════════════════════════════════════

import { FiX, FiLogOut } from 'react-icons/fi'
import NotificationBell from './NotificationBell'

export default function AccountMenu({
  open, onClose, customer, portalJWT,
  notifications, unreadCount, showBell, setShowBell, markAllAsRead, markOneRead, onTabChange,
  onLogoutClick,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-16 left-2.5 right-2.5 rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-cp-trust-900 via-cp-trust-900 to-cp-trust-700"
        style={{ animation: 'slideDown 0.18s ease-out' }}
      >
        <style>{`@keyframes slideDown{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        <div className="p-5">
          {/* ── শপ পরিচিতি ── */}
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <span className="text-[9px] text-white/35 tracking-[2px] uppercase block mb-1">CUSTOMER PORTAL</span>
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
            <button
              onClick={onClose}
              aria-label="বন্ধ করুন"
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-white/70 flex items-center justify-center flex-shrink-0"
            >
              <FiX size={16} />
            </button>
          </div>

          {/* ── SR কন্টাক্ট ── */}
          {customer?.assigned_sr_name && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-white/[0.06] border border-white/[0.08] mb-3">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.14] flex items-center justify-center text-lg flex-shrink-0">🧑‍💼</div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-white/50 font-bold uppercase tracking-wider">আপনার বিক্রয় প্রতিনিধি</p>
                <p className="text-[13px] text-white font-bold mt-0.5 truncate">{customer.assigned_sr_name}</p>
              </div>
              {customer?.assigned_sr_phone && (
                <a href={`tel:${customer.assigned_sr_phone}`} className="no-underline bg-white/[0.14] rounded-xl px-3 py-2 flex flex-col items-center gap-0.5 flex-shrink-0">
                  <span className="text-lg">📞</span>
                  <span className="text-[8.5px] text-white font-bold">কল</span>
                </a>
              )}
            </div>
          )}

          {/* ── নোটিফিকেশন + লগআউট ── */}
          <div className="flex items-center gap-2.5">
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
              className="flex-1 h-10 rounded-xl bg-white/10 border border-white/15 text-white/80 text-[12px] font-semibold flex items-center justify-center gap-1.5"
            >
              <FiLogOut size={14} /> লগআউট
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
