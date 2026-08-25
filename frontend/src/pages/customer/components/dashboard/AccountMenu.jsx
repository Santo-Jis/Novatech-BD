// components/dashboard/AccountMenu.jsx
// ═══════════════════════════════════════════════════════════════
// ☰ হ্যামবার্গার মেনু — Facebook মোবাইলের side-drawer প্যাটার্ন।
//
//   ┌──────────────────┬──────────────────────────┐
//   │  backdrop (dim)  │  drawer (ডান দিক, 85vw) │
//   │  tap → বন্ধ     │  প্রোফাইল পিল            │
//   │                  │  SR কন্টাক্ট             │
//   │                  │  সেটিংস / পারসোনালাই... │
//   │                  │  প্রাইভেসি               │
//   │                  │  লগআউট                   │
//   └──────────────────┴──────────────────────────┘
//
// নতুন prop: `onNavigate(key)` — 'settings' | 'personalization' | 'privacy'
// DashboardView.jsx-এ menuPage state রেন্ডার করে সাব-পেজ খোলে।
// বাকি সব prop আগের মতোই।
// ═══════════════════════════════════════════════════════════════

import { FiX, FiLogOut, FiSettings, FiSliders, FiShield, FiChevronRight, FiUser, FiPhone, FiCheckCircle } from 'react-icons/fi'
import NotificationBell from './NotificationBell'

const MENU_ITEMS = [
  { key: 'settings',        icon: FiSettings, label: 'সেটিংস' },
  { key: 'personalization', icon: FiSliders,  label: 'পারসোনালাইজেশন' },
  { key: 'privacy',         icon: FiShield,   label: 'প্রাইভেসি ও শর্তাবলী' },
]

export default function AccountMenu({
  open, onClose, customer, portalJWT,
  notifications, unreadCount, showBell, setShowBell, markAllAsRead, markOneRead, onTabChange,
  onLogoutClick, onNavigate,
}) {
  if (!open) return null

  const initial = customer?.shop_name?.trim?.()?.[0]?.toUpperCase() || '?'

  return (
    <div className="fixed inset-0 z-40">
      <style>{`
        @keyframes cpSlideFromRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
        @keyframes cpFadeBackdrop   { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* Backdrop — tap করলে বন্ধ */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ animation: 'cpFadeBackdrop 0.22s ease-out' }}
      />

      {/* Drawer — ডান দিক থেকে slide in */}
      <div
        className="absolute right-0 top-0 bottom-0 bg-cp-bg-alt flex flex-col overflow-y-auto"
        style={{
          width: '85vw',
          maxWidth: 360,
          animation: 'cpSlideFromRight 0.22s ease-out',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        }}
      >
        {/* ── প্রোফাইল পিল ── */}
        <div className="px-3 pt-4 pb-1 flex-shrink-0">
          <div className="bg-cp-bg-surface rounded-full pl-2 pr-2 py-2 flex items-center gap-2.5 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-cp-trust-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-[15px] font-bold text-cp-text-primary font-cp-head truncate">
                  {customer.shop_name}
                </p>
                {customer.is_verified && (
                  <FiCheckCircle size={12} className="text-cp-confidence-600 flex-shrink-0" />
                )}
              </div>
              <p className="text-[10.5px] text-cp-text-muted truncate">
                {customer.owner_name}
              </p>
            </div>

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
              onClick={onClose}
              aria-label="বন্ধ করুন"
              className="w-8 h-8 rounded-full bg-cp-bg-alt text-cp-text-secondary flex items-center justify-center flex-shrink-0"
            >
              <FiX size={17} />
            </button>
          </div>
        </div>

        {/* ── SR কন্টাক্ট ── */}
        {customer?.assigned_sr_name && (
          <div className="px-3 pt-4 pb-1 flex-shrink-0">
            <p className="text-[11px] font-bold text-cp-text-muted uppercase tracking-wide mb-2 px-1">
              আপনার বিক্রয় প্রতিনিধি
            </p>
            <div className="bg-cp-bg-surface rounded-2xl px-3 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cp-bg-alt text-cp-trust-700 flex items-center justify-center flex-shrink-0">
                <FiUser size={15} />
              </div>
              <p className="flex-1 text-[14px] font-semibold text-cp-text-primary truncate">
                {customer.assigned_sr_name}
              </p>
              {customer?.assigned_sr_phone && (
                <a
                  href={`tel:${customer.assigned_sr_phone}`}
                  className="no-underline w-9 h-9 rounded-full bg-cp-trust-100 text-cp-trust-600 flex items-center justify-center flex-shrink-0"
                  aria-label="কল করুন"
                >
                  <FiPhone size={14} />
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── মেনু লিস্ট ── */}
        <div className="px-3 pt-4 flex-shrink-0">
          <p className="text-[11px] font-bold text-cp-text-muted uppercase tracking-wide mb-2 px-1">
            অ্যাকাউন্ট
          </p>
          <div className="bg-cp-bg-surface rounded-2xl overflow-hidden divide-y divide-cp-border/70">
            {MENU_ITEMS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => onNavigate?.(key)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-cp-bg-alt transition-colors"
              >
                <Icon size={19} className="text-cp-text-primary flex-shrink-0" />
                <span className="flex-1 text-[14.5px] font-medium text-cp-text-primary">{label}</span>
                <FiChevronRight size={15} className="text-cp-text-muted flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* স্পেসার — লগআউট নিচে রাখে */}
        <div className="flex-1" />

        {/* ── লগআউট ── */}
        <div className="px-3 pt-3 pb-6 flex-shrink-0">
          <button
            onClick={onLogoutClick}
            className="w-full h-11 rounded-full bg-cp-bg-sunken text-cp-text-primary text-[14px] font-semibold flex items-center justify-center gap-2"
          >
            <FiLogOut size={15} /> লগআউট
          </button>
        </div>
      </div>
    </div>
  )
}
