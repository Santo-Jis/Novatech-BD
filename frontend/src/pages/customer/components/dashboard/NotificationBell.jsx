// components/dashboard/NotificationBell.jsx
// নোটিফিকেশন বেল + ড্রপডাউন প্যানেল — DashboardView.jsx থেকে আলাদা করা হলো + cp- ডিজাইন টোকেন

import { FiBell, FiX, FiCheck } from 'react-icons/fi'

export const NOTIF_CONFIG = {
  payment_received:      { icon: '💰', tab: 'payments',  hint: '👆 পেমেন্ট ট্যাবে দেখুন' },
  new_invoice:           { icon: '🧾', tab: 'invoices',  hint: '👆 ইনভয়েস ট্যাবে দেখুন' },
  order_request:         { icon: '📦', tab: 'orders',    hint: '👆 অর্ডার ট্যাবে দেখুন' },
  credit_reminder:       { icon: '💳', tab: null,        hint: null },
  return_request_update: { icon: '🔄', tab: 'returns',   hint: '👆 ফেরত ট্যাবে দেখুন' },
  general:               { icon: '🔔', tab: null,        hint: null },
}

export default function NotificationBell({
  notifications, unreadCount, showBell, setShowBell,
  portalJWT, markAllAsRead, markOneRead, onTabChange,
}) {
  return (
    <div className="relative">
      <button
        onClick={() => { setShowBell(v => !v); if (unreadCount > 0) markAllAsRead(portalJWT) }}
        className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center relative"
      >
        <FiBell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-cp-error text-white rounded-full min-w-[18px] h-[18px] text-[10px] font-bold flex items-center justify-center border-2 border-cp-trust-900 px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showBell && (
        <div className="absolute right-0 top-12 w-[290px] max-h-[380px] bg-white rounded-2xl shadow-2xl overflow-y-auto z-[100]">
          <div className="px-4 py-3 border-b border-cp-border flex justify-between items-center sticky top-0 bg-white">
            <span className="text-cp-text-primary font-bold text-sm">🔔 Notification</span>
            <button onClick={() => setShowBell(false)} className="text-cp-text-muted">
              <FiX size={16} />
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="text-center text-cp-text-muted text-[13px] py-6 px-4">কোনো notification নেই।</p>
          ) : (
            notifications.map((n) => {
              const cfg = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.general
              return (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) markOneRead(n.id); setShowBell(false); if (cfg.tab) onTabChange(cfg.tab) }}
                  className={`px-4 py-3 border-b border-cp-bg-alt flex gap-2.5 items-start ${n.is_read ? 'bg-white' : 'bg-cp-trust-100'} ${cfg.tab ? 'cursor-pointer' : ''}`}
                >
                  <span className="text-xl mt-0.5">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] text-cp-text-primary">{n.title}</p>
                    <p className="text-xs text-cp-text-secondary leading-relaxed mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-cp-text-muted mt-1">
                      {new Date(n.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {cfg.hint && <p className="text-[10px] text-cp-trust-500 font-semibold mt-1">{cfg.hint}</p>}
                  </div>
                  {!n.is_read ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); markOneRead(n.id) }}
                      className="flex-shrink-0 mt-0.5 bg-cp-trust-100 border border-cp-trust-300 rounded-md p-1 text-cp-trust-500"
                    >
                      <FiCheck size={12} />
                    </button>
                  ) : (
                    <FiCheck size={14} className="text-cp-border mt-1 flex-shrink-0" />
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
