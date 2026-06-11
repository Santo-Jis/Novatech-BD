// components/views/DashboardView.jsx
// Dashboard — tabs, summary, invoices, orders, credit, complaints

import { fmt, fmtDate } from '../../utils/helpers'
import { useEffect, useState } from 'react'
import MonthlyTrendChart from '../MonthlyTrendChart'
import InvoiceCard from '../InvoiceCard'
import OrderRequestTab from '../OrderRequestTab'
import CustomerAIChat from '../../CustomerAIChat'

// ── Skeleton লোডিং কার্ড ──────────────────────────────────────
function SkeletonCard({ rows = 3 }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', border: '1px solid #f0f0f0', animation: 'pulse 1.5s ease-in-out infinite' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < rows - 1 ? 12 : 0 }}>
          <div style={{ height: 12, background: '#e5e7eb', borderRadius: 6, width: `${55 + (i % 3) * 15}%` }} />
          <div style={{ height: 20, background: '#e5e7eb', borderRadius: 10, width: '22%' }} />
        </div>
      ))}
    </div>
  )
}

// ── Notification type → icon / deep-link map ─────────────────
const NOTIF_CONFIG = {
  payment_received:      { icon: '💰', tab: 'payments', hint: '👆 পেমেন্ট ট্যাবে দেখুন' },
  new_invoice:           { icon: '🧾', tab: 'invoices', hint: '👆 ইনভয়েস ট্যাবে দেখুন' },
  order_request:         { icon: '📦', tab: 'orders',   hint: '👆 অর্ডার ট্যাবে দেখুন' },
  credit_reminder:       { icon: '💳', tab: null,       hint: null },
  return_request_update: { icon: '🔄', tab: 'returns',  hint: '👆 ফেরত ট্যাবে দেখুন' },
  general:               { icon: '🔔', tab: null,       hint: null },
}

export default function DashboardView({
  dashboard,
  portalJWT,
  activeTab,
  onTabChange,
  onLogout,
  toast,
  // notification
  notifications,
  unreadCount,
  showBell,
  setShowBell,
  unreadBanner,
  setUnreadBanner,
  markAllAsRead,
  markOneRead,
  // invoices
  invoices,
  invoiceTotal,
  invoicePage,
  invoiceTotalPages,
  invoiceLoading,
  invoiceSearch, setInvoiceSearch,
  invoicePayMethod, setInvoicePayMethod,
  invoiceDateFrom, setInvoiceDateFrom,
  invoiceDateTo, setInvoiceDateTo,
  filterOpen, setFilterOpen,
  loadInvoices,
  applyInvoiceFilter,
  clearInvoiceFilter,
  // credit limit request
  creditReqOpen, setCreditReqOpen,
  creditReqAmt, setCreditReqAmt,
  creditReqReason, setCreditReqReason,
  creditReqLoading,
  myLimitReqs,
  limitReqsLoaded,
  limitReqsLoading,
  loadMyLimitReqs,
  submitCreditRequest,
  // complaints
  complaintOpen, setComplaintOpen,
  cmpType, setCmpType,
  cmpSubject, setCmpSubject,
  cmpDesc, setCmpDesc,
  cmpLoading,
  myComplaints,
  complaintsLoaded,
  complaintsLoading,
  loadMyComplaints,
  submitComplaint,
  // statement
  stmtOpen, setStmtOpen,
  stmtFrom, setStmtFrom,
  stmtTo, setStmtTo,
  stmtLoading,
  downloadStatement,
  // payment history
  paymentHistory = [],
  paymentPage,
  paymentTotalPages,
  paymentTotal,
  paymentLoading,
  paymentSummary,
  paymentTypeFilter, setPaymentTypeFilter,
  paymentDateFrom,   setPaymentDateFrom,
  paymentDateTo,     setPaymentDateTo,
  paymentFilterOpen, setPaymentFilterOpen,
  loadPaymentHistory,
  applyPaymentFilter,
  clearPaymentFilter,
  // return requests
  myReturnReqs       = [],
  returnReqTotal     = 0,
  returnReqPage      = 1,
  returnReqTotalPages = 1,
  returnReqLoading   = false,
  returnReqFilter,   setReturnReqFilter,
  returnFormOpen,    setReturnFormOpen,
  returnInvoice,     setReturnInvoice,
  returnType,        setReturnType,
  returnItems,       setReturnItems,
  returnNote,        setReturnNote,
  returnSubmitLoading = false,
  loadMyReturnReqs,
  submitReturnRequest,
}) {
  const {
    customer,
    credit_payments = [],
    monthly_summary = {},
    total_summary   = {},
    returns         = [],
    sales_note      = null,
  } = dashboard

  // ── Logout confirmation modal state ──────────────────────────
  const [showLogoutConfirm,    setShowLogoutConfirm]    = useState(false)
  const [showComplaintConfirm, setShowComplaintConfirm] = useState(false)
  const [showCreditConfirm,    setShowCreditConfirm]    = useState(false)
  const [showReturnConfirm,    setShowReturnConfirm]    = useState(false)

  // ── Returns tab sub-navigation ────────────────────────────────
  const [returnSubTab, setReturnSubTab] = useState('requests')

  const tabs = [
    { id: 'summary',    label: 'সারসংক্ষেপ' },
    { id: 'orders',     label: '🛒 অর্ডার' },
    { id: 'invoices',   label: `🧾 ইনভয়েস (${invoiceTotal > 0 ? invoiceTotal : total_summary?.total_invoices || 0})` },
    { id: 'payments',   label: `পরিশোধ (${paymentTotal > 0 ? paymentTotal : credit_payments.length})` },
    { id: 'returns',    label: `🔄 রিটার্ন${returnReqTotal > 0 ? ` (${returnReqTotal})` : ''}` },
    { id: 'credit_req', label: '💳 লিমিট' },
    { id: 'complaints', label: '📣 অভিযোগ' },
    { id: 'ai_chat',    label: '🤖 AI চ্যাট' },
  ]

  const fmtCur = (n) => parseFloat(n || 0).toLocaleString('en-US')

  // ── Tab change এ data load ──────────────────────────────────
  useEffect(() => {
    if (activeTab === 'credit_req' && !limitReqsLoaded) loadMyLimitReqs()
    if (activeTab === 'complaints' && !complaintsLoaded) loadMyComplaints()
  }, [activeTab])

  const limitStatusMap = {
    pending:  { l: '⏳ অপেক্ষমাণ', bg: '#FEF9C3', c: '#92400E' },
    approved: { l: '✅ অনুমোদিত',  bg: '#D1FAE5', c: '#065F46' },
    rejected: { l: '❌ নামঞ্জুর',   bg: '#FEE2E2', c: '#991B1B' },
  }

  const cmpStatusMap = {
    open:        { l: '🔴 খোলা',          bg: '#FEF2F2', c: '#991B1B' },
    in_progress: { l: '🔄 প্রক্রিয়াধীন', bg: '#DBEAFE', c: '#1E40AF' },
    resolved:    { l: '✅ সমাধান',        bg: '#D1FAE5', c: '#065F46' },
  }
  const typeOpts = [
    { v: 'complaint',      l: '⚠️ অভিযোগ' },
    { v: 'feedback',       l: '💬 ফিডব্যাক' },
    { v: 'delivery_issue', l: '🚚 ডেলিভারি সমস্যা' },
    { v: 'product_issue',  l: '📦 পণ্য সমস্যা' },
    { v: 'payment_issue',  l: '💳 পেমেন্ট সমস্যা' },
    { v: 'other',          l: '📌 অন্যান্য' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-5 pt-10 pb-16">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-indigo-200 text-xs mb-1">কাস্টমার পোর্টাল</p>
            <h1 className="text-xl font-bold">{customer.shop_name}</h1>
            <p className="text-indigo-200 text-sm">{customer.owner_name} • {customer.customer_code}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bell Icon */}
            <div className="relative">
              <button
                onClick={() => { setShowBell(v => !v); if (unreadCount > 0) markAllAsRead(portalJWT) }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '8px 10px', color: 'white', fontSize: 18, cursor: 'pointer', position: 'relative' }}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showBell && (
                <div style={{ position: 'absolute', right: 0, top: 44, width: 290, maxHeight: 380, background: 'white', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflowY: 'auto', zIndex: 100 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#1e1e1e', fontWeight: 700, fontSize: 14 }}>🔔 Notification</span>
                    <button onClick={() => setShowBell(false)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>✕</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '24px 16px' }}>কোনো notification নেই।</p>
                  ) : (
                    notifications.map(n => {
                      const cfg = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.general
                      const isClickable = !!cfg.tab
                      const handleNotifClick = () => {
                        if (!n.is_read) markOneRead(n.id)
                        setShowBell(false)
                        if (cfg.tab) onTabChange(cfg.tab)
                      }
                      return (
                        <div key={n.id} onClick={handleNotifClick}
                          style={{ padding: '12px 16px', borderBottom: '1px solid #f9f9f9', background: n.is_read ? 'white' : '#eff6ff', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: isClickable ? 'pointer' : 'default', transition: 'background 0.15s' }}
                          onMouseEnter={e => { if (isClickable) e.currentTarget.style.background = '#dbeafe' }}
                          onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? 'white' : '#eff6ff' }}>
                          <span style={{ fontSize: 20, marginTop: 1 }}>{cfg.icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e1e1e' }}>{n.title}</p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#555', lineHeight: 1.5 }}>{n.body}</p>
                            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#aaa' }}>
                              {new Date(n.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {isClickable && <p style={{ margin: '4px 0 0', fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>{cfg.hint}</p>}
                          </div>
                          {/* Individual mark-read button */}
                          {!n.is_read ? (
                            <button
                              onClick={e => { e.stopPropagation(); markOneRead(n.id) }}
                              title="পঠিত চিহ্নিত করুন"
                              style={{ flexShrink: 0, marginTop: 2, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: 11, color: '#1d4ed8', fontWeight: 700, lineHeight: 1.4 }}>
                              ✓
                            </button>
                          ) : (
                            <span style={{ fontSize: 14, color: '#d1d5db', marginTop: 3, flexShrink: 0 }}>✓</span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            <button onClick={() => setShowLogoutConfirm(true)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', fontSize: 12, cursor: 'pointer' }}>
              লগআউট
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-10 space-y-4 pb-10">
        {/* Unread Banner */}
        {unreadBanner && (() => {
          const cfg = NOTIF_CONFIG[unreadBanner.type] || NOTIF_CONFIG.general
          const isClickable = !!cfg.tab
          return (
            <div
              onClick={() => { if (isClickable) { onTabChange(cfg.tab); setUnreadBanner(null); markAllAsRead(portalJWT) } }}
              style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 4px 16px rgba(29,78,216,0.3)', cursor: isClickable ? 'pointer' : 'default' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 14 }}>{unreadBanner.title}</p>
                <p style={{ margin: '4px 0 0', color: '#bfdbfe', fontSize: 12, lineHeight: 1.5 }}>{unreadBanner.body}</p>
                {isClickable && <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 11, fontWeight: 600 }}>{cfg.hint}</p>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); setUnreadBanner(null); markAllAsRead(portalJWT) }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          )
        })()}

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-gray-400 mb-1">বর্তমান বাকি</p>
            <p className="text-lg font-bold text-red-600">৳{fmt(customer.current_credit)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-gray-400 mb-1">ক্রেডিট লিমিট</p>
            <p className="text-lg font-bold text-gray-700">৳{fmt(customer.credit_limit)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-gray-400 mb-1">জমা ব্যালেন্স</p>
            <p className="text-lg font-bold text-green-600">৳{fmt(customer.credit_balance)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => onTabChange(t.id)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors whitespace-nowrap px-2
                  ${activeTab === t.id
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                    : 'text-gray-400 hover:text-gray-600'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className={activeTab === 'ai_chat' ? '' : 'p-4'}>
            {/* ── সারসংক্ষেপ ── */}
            {activeTab === 'summary' && (
              <div className="space-y-5">
                {/* SR Contact Card */}
                {customer?.assigned_sr_name && (
                  <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      🧑‍💼
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>আপনার বিক্রয় প্রতিনিধি</p>
                      <p style={{ margin: '2px 0 0', fontSize: 15, color: 'white', fontWeight: 700 }}>{customer.assigned_sr_name}</p>
                      {customer.assigned_sr_code && (
                        <p style={{ margin: '1px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>কোড: {customer.assigned_sr_code}</p>
                      )}
                    </div>
                    {customer?.assigned_sr_phone && (
                      <a href={`tel:${customer.assigned_sr_phone}`}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '10px 14px', color: 'white', cursor: 'pointer', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 20 }}>📞</span>
                        <span style={{ fontSize: 9, fontWeight: 700 }}>কল করুন</span>
                      </a>
                    )}
                  </div>
                )}

                {/* এই মাস */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">এই মাস</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'মোট কেনাকাটা',  value: `৳${fmt(monthly_summary?.total_purchase)}`, color: 'text-gray-900' },
                      { label: 'ইনভয়েস সংখ্যা', value: monthly_summary?.total_invoices ?? 0,       color: 'text-indigo-600' },
                      { label: 'নগদ দিয়েছেন',   value: `৳${fmt(monthly_summary?.total_cash)}`,     color: 'text-green-600' },
                      { label: 'বাকি রেখেছেন',  value: `৳${fmt(monthly_summary?.total_credit)}`,   color: 'text-red-500' },
                    ].map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ৬ মাসের ট্রেন্ড */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">গত ৬ মাসের ট্রেন্ড</p>
                  <MonthlyTrendChart portalJWT={portalJWT} />
                </div>

                {/* সর্বমোট */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">সর্বমোট</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'মোট কেনাকাটা', value: `৳${fmt(total_summary?.total_purchase)}`, color: 'text-gray-900' },
                      { label: 'মোট ইনভয়েস',  value: total_summary?.total_invoices ?? 0,       color: 'text-indigo-600' },
                      { label: 'মোট নগদ',      value: `৳${fmt(total_summary?.total_cash)}`,     color: 'text-green-600' },
                      { label: 'মোট বাকি',     value: `৳${fmt(total_summary?.total_credit)}`,   color: 'text-red-500' },
                    ].map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── অর্ডার ── */}
            {activeTab === 'orders' && <OrderRequestTab portalJWT={portalJWT} />}

            {/* ── ক্রেডিট লিমিট আবেদন ── */}
            {activeTab === 'credit_req' && (() => {
              return (
                <div className="space-y-4">
                  {/* Credit Info Card */}
                  <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 16, padding: '16px' }}>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>বর্তমান ক্রেডিট তথ্য</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                      <div>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>লিমিট</p>
                        <p style={{ margin: '2px 0 0', color: 'white', fontSize: 18, fontWeight: 800 }}>৳{fmtCur(customer.credit_limit)}</p>
                      </div>
                      <div>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>বর্তমান বাকি</p>
                        <p style={{ margin: '2px 0 0', color: '#fde68a', fontSize: 18, fontWeight: 800 }}>৳{fmtCur(customer.current_credit)}</p>
                      </div>
                    </div>
                  </div>

                  {!creditReqOpen ? (
                    <button onClick={() => setCreditReqOpen(true)}
                      style={{ width: '100%', background: 'white', border: '2px dashed #c4b5fd', borderRadius: 14, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: '#5b21b6', fontWeight: 700, fontSize: 14 }}>
                      <span style={{ fontSize: 20 }}>💳</span> নতুন লিমিট বৃদ্ধির আবেদন করুন
                    </button>
                  ) : (
                    <div style={{ background: 'white', border: '1.5px solid #e0e7ff', borderRadius: 16, padding: 16 }}>
                      <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: '#1e1e1e' }}>💳 ক্রেডিট লিমিট বৃদ্ধির আবেদন</p>
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>আবেদনকৃত পরিমাণ ৳ *</p>
                        <input type="number" value={creditReqAmt} onChange={e => setCreditReqAmt(e.target.value)}
                          placeholder="যেমন: 50000"
                          style={{ width: '100%', border: '2px solid #e0e7ff', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, outline: 'none', boxSizing: 'border-box', color: '#4f46e5' }} />
                        <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>বর্তমান লিমিট: ৳{fmtCur(customer.credit_limit)}</p>
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>কারণ (ঐচ্ছিক)</p>
                        <textarea value={creditReqReason} onChange={e => setCreditReqReason(e.target.value)}
                          placeholder="কেন লিমিট বাড়ানো দরকার তা সংক্ষেপে লিখুন..."
                          rows={3} style={{ width: '100%', border: '2px solid #e0e7ff', borderRadius: 12, padding: '12px', fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <button onClick={() => setCreditReqOpen(false)}
                          style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>বাতিল</button>
                        <button onClick={() => setShowCreditConfirm(true)} disabled={creditReqLoading}
                          style={{ padding: '12px', borderRadius: 12, border: 'none', background: creditReqLoading ? '#94a3b8' : '#4f46e5', color: 'white', fontWeight: 700, fontSize: 13, cursor: creditReqLoading ? 'not-allowed' : 'pointer' }}>
                          {creditReqLoading ? 'জমা হচ্ছে...' : '✅ জমা দিন'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ✅ FIX: Loading skeleton while credit history loads */}
                  {limitReqsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>আবেদনের ইতিহাস</p>
                      {[1,2].map(i => <SkeletonCard key={i} rows={2} />)}
                    </div>
                  ) : myLimitReqs.length > 0 ? (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>আবেদনের ইতিহাস</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {myLimitReqs.map(r => {
                          const s = limitStatusMap[r.status] || { l: r.status, bg: '#f3f4f6', c: '#374151' }
                          return (
                            <div key={r.id} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid #f0f0f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#4f46e5' }}>৳{fmtCur(r.requested_amount)}</p>
                                <span style={{ background: s.bg, color: s.c, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{s.l}</span>
                              </div>
                              {r.reason && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280' }}>{r.reason}</p>}
                              {r.admin_note && <p style={{ margin: '0 0 4px', fontSize: 12, color: r.status === 'approved' ? '#065f46' : '#991b1b', background: r.status === 'approved' ? '#f0fdf4' : '#fff1f2', borderRadius: 6, padding: '4px 8px' }}>{r.admin_note}</p>}
                              <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>
                                {new Date(r.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : limitReqsLoaded ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <p style={{ fontSize: 30, margin: 0 }}>📋</p>
                      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>এখনো কোনো আবেদন নেই।</p>
                    </div>
                  ) : null}
                </div>
              )
            })()}

            {/* ── অভিযোগ / ফিডব্যাক ── */}
            {activeTab === 'complaints' && (() => {
              return (
                <div className="space-y-4">
                  {!complaintOpen ? (
                    <button onClick={() => setComplaintOpen(true)}
                      style={{ width: '100%', background: 'white', border: '2px dashed #fca5a5', borderRadius: 14, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: '#b91c1c', fontWeight: 700, fontSize: 14 }}>
                      <span style={{ fontSize: 20 }}>📣</span> নতুন অভিযোগ / ফিডব্যাক দিন
                    </button>
                  ) : (
                    <div style={{ background: 'white', border: '1.5px solid #fecaca', borderRadius: 16, padding: 16 }}>
                      <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: '#1e1e1e' }}>📣 অভিযোগ / ফিডব্যাক</p>
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ধরন *</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {typeOpts.map(t => (
                            <button key={t.v} onClick={() => setCmpType(t.v)}
                              style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${cmpType === t.v ? '#dc2626' : '#e5e7eb'}`, background: cmpType === t.v ? '#fef2f2' : 'white', color: cmpType === t.v ? '#dc2626' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              {t.l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>বিষয় *</p>
                        <input type="text" value={cmpSubject} onChange={e => setCmpSubject(e.target.value)}
                          placeholder="সংক্ষেপে বিষয়টি লিখুন..."
                          style={{ width: '100%', border: '2px solid #fecaca', borderRadius: 12, padding: '12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>বিস্তারিত বিবরণ *</p>
                        <textarea value={cmpDesc} onChange={e => setCmpDesc(e.target.value)}
                          placeholder="সমস্যাটি বিস্তারিত লিখুন। আমরা দ্রুত সমাধানের চেষ্টা করব।"
                          rows={4} style={{ width: '100%', border: '2px solid #fecaca', borderRadius: 12, padding: '12px', fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <button onClick={() => setComplaintOpen(false)}
                          style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>বাতিল</button>
                        <button onClick={() => setShowComplaintConfirm(true)} disabled={cmpLoading}
                          style={{ padding: '12px', borderRadius: 12, border: 'none', background: cmpLoading ? '#94a3b8' : '#dc2626', color: 'white', fontWeight: 700, fontSize: 13, cursor: cmpLoading ? 'not-allowed' : 'pointer' }}>
                          {cmpLoading ? 'জমা হচ্ছে...' : '📣 জমা দিন'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ✅ FIX: Loading skeleton while complaints load */}
                  {complaintsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>আমার অভিযোগসমূহ</p>
                      {[1,2,3].map(i => <SkeletonCard key={i} rows={3} />)}
                    </div>
                  ) : myComplaints.length > 0 ? (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>আমার অভিযোগসমূহ</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {myComplaints.map(c => {
                          const s = cmpStatusMap[c.status] || { l: c.status, bg: '#f3f4f6', c: '#374151' }
                          const t = typeOpts.find(o => o.v === c.type)
                          return (
                            <div key={c.id} style={{ background: 'white', borderRadius: 14, padding: '14px', border: c.status === 'open' ? '1.5px solid #fecaca' : '1px solid #f0f0f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <div style={{ flex: 1, paddingRight: 8 }}>
                                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e1e1e' }}>{c.subject}</p>
                                  <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af' }}>{t?.l || c.type} • {new Date(c.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <span style={{ background: s.bg, color: s.c, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{s.l}</span>
                              </div>
                              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{c.description}</p>
                              {c.admin_reply && (
                                <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #16a34a' }}>
                                  <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#065f46' }}>📋 কর্তৃপক্ষের উত্তর:</p>
                                  <p style={{ margin: 0, fontSize: 12, color: '#065f46', lineHeight: 1.5 }}>{c.admin_reply}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : complaintsLoaded ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <p style={{ fontSize: 36, margin: 0 }}>🎉</p>
                      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>কোনো অভিযোগ নেই।</p>
                    </div>
                  ) : null}
                </div>
              )
            })()}

            {/* ── ইনভয়েস ── */}
            {activeTab === 'invoices' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="text" value={invoiceSearch}
                    onChange={e => setInvoiceSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyInvoiceFilter()}
                    placeholder="ইনভয়েস নম্বর বা SR নাম..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  <button onClick={() => setFilterOpen(v => !v)}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors
                      ${filterOpen || invoicePayMethod || invoiceDateFrom || invoiceDateTo
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    🔍 ফিল্টার
                  </button>
                  <button onClick={applyInvoiceFilter}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                    খুঁজুন
                  </button>
                </div>

                {filterOpen && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">ফিল্টার</p>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">পেমেন্ট পদ্ধতি</p>
                      <div className="flex gap-2 flex-wrap">
                        {[['', 'সব'], ['cash', 'নগদ'], ['credit', 'বাকি'], ['mixed', 'মিশ্র']].map(([val, label]) => (
                          <button key={val} onClick={() => setInvoicePayMethod(val)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors
                              ${invoicePayMethod === val
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">তারিখ থেকে</p>
                        <input type="date" value={invoiceDateFrom} onChange={e => setInvoiceDateFrom(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">তারিখ পর্যন্ত</p>
                        <input type="date" value={invoiceDateTo} onChange={e => setInvoiceDateTo(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={applyInvoiceFilter}
                        className="flex-1 bg-indigo-600 text-white rounded-xl py-2 text-sm font-bold hover:bg-indigo-700 transition-colors">
                        ফিল্টার প্রয়োগ
                      </button>
                      <button onClick={clearInvoiceFilter}
                        className="px-4 bg-white border border-gray-200 text-gray-500 rounded-xl py-2 text-sm hover:bg-gray-50 transition-colors">
                        রিসেট
                      </button>
                    </div>
                  </div>
                )}

                {(invoicePayMethod || invoiceDateFrom || invoiceDateTo) && (
                  <div className="flex flex-wrap gap-1.5">
                    {invoicePayMethod && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        💳 {invoicePayMethod === 'cash' ? 'নগদ' : invoicePayMethod === 'credit' ? 'বাকি' : 'মিশ্র'}
                        <button onClick={() => { setInvoicePayMethod(''); applyInvoiceFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    {invoiceDateFrom && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        📅 {invoiceDateFrom}
                        <button onClick={() => { setInvoiceDateFrom(''); applyInvoiceFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    {invoiceDateTo && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        📅 {invoiceDateTo} পর্যন্ত
                        <button onClick={() => { setInvoiceDateTo(''); applyInvoiceFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    <span className="text-xs text-gray-400 py-1">— {invoiceTotal}টি পাওয়া গেছে</span>
                  </div>
                )}

                {/* ── sales_note banner ── */}
                {sales_note && !invoiceSearch && !invoicePayMethod && !invoiceDateFrom && !invoiceDateTo && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
                    <p style={{ margin: 0, fontSize: 12, color: '#1d4ed8', fontWeight: 600, lineHeight: 1.5 }}>{sales_note}</p>
                  </div>
                )}

                {invoiceLoading && invoices.length === 0 ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">🔍</p>
                    <p className="text-gray-400 text-sm">কোনো ইনভয়েস পাওয়া যায়নি।</p>
                  </div>
                ) : (
                  <>
                    {invoices.map(sale => <InvoiceCard key={sale.invoice_number} sale={sale} />)}
                    {invoicePage < invoiceTotalPages && (
                      <button
                        onClick={() => loadInvoices(portalJWT, invoicePage + 1, {
                          search: invoiceSearch, payMethod: invoicePayMethod,
                          dateFrom: invoiceDateFrom, dateTo: invoiceDateTo,
                        })}
                        disabled={invoiceLoading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50">
                        {invoiceLoading ? '⏳ লোড হচ্ছে...' : `আরো দেখুন (${invoices.length}/${invoiceTotal})`}
                      </button>
                    )}
                    {invoicePage >= invoiceTotalPages && invoices.length > 0 && (
                      <p className="text-center text-xs text-gray-400 py-2">সব {invoiceTotal}টি ইনভয়েস দেখানো হয়েছে।</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── পরিশোধ ── */}
            {activeTab === 'payments' && (
              <div className="space-y-3">

                {/* ফিল্টার বার */}
                <div className="flex gap-2">
                  <button onClick={() => setPaymentFilterOpen(v => !v)}
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors
                      ${paymentFilterOpen || paymentTypeFilter || paymentDateFrom || paymentDateTo
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    🔍 ফিল্টার {(paymentTypeFilter || paymentDateFrom || paymentDateTo) ? '●' : ''}
                  </button>
                  <button onClick={applyPaymentFilter}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
                    দেখুন
                  </button>
                </div>

                {/* ফিল্টার প্যানেল */}
                {paymentFilterOpen && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">ফিল্টার</p>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">পেমেন্টের ধরন</p>
                      <div className="flex gap-2">
                        {[['', 'সব'], ['cash', '💵 নগদ'], ['credit', '🔄 ক্রেডিট']].map(([val, label]) => (
                          <button key={val} onClick={() => setPaymentTypeFilter(val)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors
                              ${paymentTypeFilter === val
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">তারিখ থেকে</p>
                        <input type="date" value={paymentDateFrom} onChange={e => setPaymentDateFrom(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">তারিখ পর্যন্ত</p>
                        <input type="date" value={paymentDateTo} onChange={e => setPaymentDateTo(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={applyPaymentFilter}
                        className="flex-1 bg-indigo-600 text-white rounded-xl py-2 text-sm font-bold hover:bg-indigo-700 transition-colors">
                        ফিল্টার প্রয়োগ
                      </button>
                      <button onClick={clearPaymentFilter}
                        className="px-4 bg-white border border-gray-200 text-gray-500 rounded-xl py-2 text-sm hover:bg-gray-50 transition-colors">
                        রিসেট
                      </button>
                    </div>
                  </div>
                )}

                {/* সক্রিয় ফিল্টার ট্যাগ */}
                {(paymentTypeFilter || paymentDateFrom || paymentDateTo) && (
                  <div className="flex flex-wrap gap-1.5">
                    {paymentTypeFilter && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        {paymentTypeFilter === 'cash' ? '💵 নগদ' : '🔄 ক্রেডিট'}
                        <button onClick={() => { setPaymentTypeFilter(''); applyPaymentFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    {paymentDateFrom && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        📅 {paymentDateFrom}
                        <button onClick={() => { setPaymentDateFrom(''); applyPaymentFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    {paymentDateTo && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                        📅 {paymentDateTo} পর্যন্ত
                        <button onClick={() => { setPaymentDateTo(''); applyPaymentFilter() }} className="text-indigo-400 hover:text-indigo-700">✕</button>
                      </span>
                    )}
                    <span className="text-xs text-gray-400 py-1">— {paymentTotal}টি পাওয়া গেছে</span>
                  </div>
                )}

                {/* সারসংক্ষেপ কার্ড (প্রথম লোডে দেখায়) */}
                {paymentSummary && !paymentTypeFilter && !paymentDateFrom && !paymentDateTo && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
                      <p className="text-xs text-green-600 font-semibold">💵 মোট নগদ</p>
                      <p className="text-sm font-bold text-green-700 mt-0.5">৳{fmtCur(paymentSummary.total_cash_received)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
                      <p className="text-xs text-blue-600 font-semibold">🔄 মোট ক্রেডিট</p>
                      <p className="text-sm font-bold text-blue-700 mt-0.5">৳{fmtCur(paymentSummary.total_credit_collected)}</p>
                    </div>
                  </div>
                )}

                {/* পেমেন্ট তালিকা */}
                {paymentLoading && paymentHistory.length === 0 ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />
                    ))}
                  </div>
                ) : paymentHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">💳</p>
                    <p className="text-gray-400 text-sm">কোনো পেমেন্ট পাওয়া যায়নি।</p>
                  </div>
                ) : (
                  <>
                    {paymentHistory.map((p, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{fmtDate(p.created_at)}</p>
                          <p className="text-sm font-semibold text-gray-700 mt-0.5 truncate">{p.collected_by} আদায় করেছেন</p>
                          {p.reference && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {p.payment_type === 'cash' ? `INV: ${p.reference}` : p.reference}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="font-bold text-green-600 text-lg">৳{fmtCur(p.amount)}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${p.payment_type === 'cash'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'}`}>
                            {p.payment_type === 'cash' ? '💵 নগদ' : '🔄 ক্রেডিট'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {paymentPage < paymentTotalPages && (
                      <button
                        onClick={() => loadPaymentHistory(portalJWT, paymentPage + 1, {
                          type:     paymentTypeFilter,
                          dateFrom: paymentDateFrom,
                          dateTo:   paymentDateTo,
                        })}
                        disabled={paymentLoading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50">
                        {paymentLoading ? '⏳ লোড হচ্ছে...' : `আরো দেখুন (${paymentHistory.length}/${paymentTotal})`}
                      </button>
                    )}
                    {paymentPage >= paymentTotalPages && paymentHistory.length > 0 && (
                      <p className="text-center text-xs text-gray-400 py-2">সব {paymentTotal}টি পেমেন্ট দেখানো হয়েছে।</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── রিটার্ন / রিপ্লেসমেন্ট ── */}
            {activeTab === 'returns' && (
              <div className="space-y-3">
                {/* Sub-tab nav + নতুন অনুরোধ */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 14, padding: 4, flex: 1 }}>
                    {[
                      { id: 'requests',   label: '📋 আমার অনুরোধ' },
                      { id: 'sr_records', label: '📦 SR রেকর্ড' },
                    ].map(st => (
                      <button key={st.id}
                        onClick={() => setReturnSubTab(st.id)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 10, fontSize: 11, fontWeight: 700,
                          border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                          background: returnSubTab === st.id ? 'white' : 'transparent',
                          color:      returnSubTab === st.id ? '#1d4ed8' : '#64748b',
                          boxShadow:  returnSubTab === st.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                        }}>
                        {st.label}
                      </button>
                    ))}
                  </div>
                  {returnSubTab === 'requests' && (
                    <button onClick={() => setReturnFormOpen(true)}
                      style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', borderRadius: 12, padding: '9px 14px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      + নতুন
                    </button>
                  )}
                </div>

                {/* আমার অনুরোধ sub-tab */}
                {returnSubTab === 'requests' && (
                  <>
                    {/* Status filter pills */}
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                      {[
                        { id: 'all',       label: 'সব' },
                        { id: 'pending',   label: '⏳ অপেক্ষমাণ' },
                        { id: 'approved',  label: '✅ অনুমোদিত' },
                        { id: 'rejected',  label: '❌ বাতিল' },
                        { id: 'completed', label: '✔ সম্পন্ন' },
                      ].map(f => (
                        <button key={f.id}
                          onClick={() => { setReturnReqFilter(f.id); loadMyReturnReqs(1, f.id, true) }}
                          style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            background: returnReqFilter === f.id ? '#1d4ed8' : '#f1f5f9',
                            color:      returnReqFilter === f.id ? 'white'    : '#64748b',
                          }}>
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {returnReqLoading && myReturnReqs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                        <p style={{ color: '#94a3b8', fontSize: 13 }}>লোড হচ্ছে...</p>
                      </div>
                    ) : myReturnReqs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <p style={{ fontSize: 40, marginBottom: 8 }}>↩️</p>
                        <p style={{ color: '#9ca3af', fontSize: 14, fontWeight: 600 }}>কোনো ফেরত অনুরোধ নেই</p>
                        <p style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>নতুন অনুরোধ করতে "+ নতুন" বাটন চাপুন</p>
                      </div>
                    ) : (
                      <>
                        {myReturnReqs.map(r => {
                          let pi = []
                          try { pi = Array.isArray(r.items) ? r.items : JSON.parse(r.items || '[]') } catch {}
                          const SC = {
                            pending:   { bg: '#fef3c7', color: '#92400e', label: '⏳ অপেক্ষমাণ' },
                            approved:  { bg: '#dbeafe', color: '#1e40af', label: '✅ অনুমোদিত' },
                            rejected:  { bg: '#fee2e2', color: '#991b1b', label: '❌ বাতিল' },
                            completed: { bg: '#d1fae5', color: '#065f46', label: '✔ সম্পন্ন' },
                          }
                          const sc     = SC[r.status] || SC.pending
                          const typeBn = r.type === 'replacement' ? '🔄 রিপ্লেসমেন্ট' : '↩️ পণ্য ফেরত'
                          return (
                            <div key={r.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                              <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div>
                                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1e293b' }}>INV: {r.invoice_number}</p>
                                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>{typeBn} • {fmtDate(r.created_at)}</p>
                                </div>
                                <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{sc.label}</span>
                              </div>
                              <div style={{ padding: '10px 16px' }}>
                                {pi.slice(0, 3).map((item, j) => (
                                  <div key={j} style={{ paddingBottom: 6, marginBottom: 6, borderBottom: j < Math.min(pi.length,3)-1 ? '1px solid #f8fafc' : 'none' }}>
                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#374151' }}>{item.product_name}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>পরিমাণ: {item.qty} • {item.reason}</p>
                                  </div>
                                ))}
                                {pi.length > 3 && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>+{pi.length - 3}টি আরো পণ্য</p>}
                                {r.total_return_value > 0 && (
                                  <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>আনুমানিক মূল্য: ৳{fmtCur(r.total_return_value)}</p>
                                )}
                              </div>
                              {r.admin_note && (
                                <div style={{ margin: '0 12px 12px', background: r.status === 'rejected' ? '#fef2f2' : '#f0fdf4', borderRadius: 10, padding: '8px 12px' }}>
                                  <p style={{ margin: 0, fontSize: 11, color: r.status === 'rejected' ? '#dc2626' : '#16a34a', fontWeight: 600 }}>💬 Admin: {r.admin_note}</p>
                                </div>
                              )}
                              {r.note && (
                                <div style={{ margin: '0 12px 12px', background: '#f8fafc', borderRadius: 10, padding: '8px 12px' }}>
                                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>📝 {r.note}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {returnReqPage < returnReqTotalPages && (
                          <button
                            onClick={() => loadMyReturnReqs(returnReqPage + 1, returnReqFilter)}
                            disabled={returnReqLoading}
                            style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: '1.5px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 700, color: '#3b82f6', cursor: returnReqLoading ? 'not-allowed' : 'pointer' }}>
                            {returnReqLoading ? 'লোড হচ্ছে...' : `আরো দেখুন (${returnReqTotal - myReturnReqs.length}টি বাকি)`}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* SR রেকর্ড sub-tab */}
                {returnSubTab === 'sr_records' && (
                  <>
                    {returns.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <p style={{ fontSize: 40, marginBottom: 8 }}>📦</p>
                        <p style={{ color: '#9ca3af', fontSize: 14, fontWeight: 600 }}>কোনো SR রেকর্ড নেই।</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                          <span className="text-2xl">ℹ️</span>
                          <p className="text-xs text-amber-700 font-medium leading-relaxed">
                            SR কর্তৃক প্রদত্ত পণ্য বদল বা রিটার্নের রেকর্ড। মোট <span className="font-bold">{returns.length}টি</span> এন্ট্রি।
                          </p>
                        </div>
                        {returns.map((r, i) => {
                          const srItems = Array.isArray(r.replacement_items) ? r.replacement_items : []
                          return (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-50 bg-amber-50">
                                <div>
                                  <p className="text-xs font-bold text-amber-800">INV: {r.invoice_number}</p>
                                  <p className="text-xs text-amber-600 mt-0.5">{r.sr_name} • {fmtDate(r.created_at)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-amber-700">৳{fmtCur(r.replacement_value)}</p>
                                  <p className="text-xs text-amber-500">পণ্যের মূল্য</p>
                                </div>
                              </div>
                              {srItems.length > 0 && (
                                <div className="px-4 py-2 space-y-1.5">
                                  {srItems.map((item, j) => (
                                    <div key={j} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-700 truncate">{item.product_name}</p>
                                        <p className="text-xs text-gray-400">
                                          {item.qty} × ৳{fmtCur(item.unit_price)}
                                          {item.vat_rate > 0 && ` (+${(item.vat_rate * 100).toFixed(0)}% VAT)`}
                                        </p>
                                      </div>
                                      <p className="text-xs font-bold text-gray-700 ml-3 shrink-0">৳{fmtCur(item.total)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {parseFloat(r.credit_balance_added || 0) > 0 && (
                                <div className="mx-4 mb-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2 flex justify-between items-center">
                                  <p className="text-xs text-green-700 font-medium">💰 ক্রেডিট ব্যালেন্সে যোগ</p>
                                  <p className="text-xs font-bold text-green-700">+৳{fmtCur(r.credit_balance_added)}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── AI চ্যাট ── */}
            {activeTab === 'ai_chat' && (
              <div style={{ height: 'calc(100vh - 220px)', minHeight: 480, background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)', borderRadius: '0 0 16px 16px', overflow: 'hidden' }}>
                <CustomerAIChat />
              </div>
            )}
          </div>
        </div>

        {/* Statement Download */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => setStmtOpen(v => !v)}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <div className="text-left">
                <p className="font-semibold text-gray-800 text-sm">Statement Download</p>
                <p className="text-xs text-gray-400">পুরো হিসাবের PDF ডাউনলোড করুন</p>
              </div>
            </div>
            <span className="text-gray-400 text-sm">{stmtOpen ? '▲' : '▼'}</span>
          </button>

          {stmtOpen && (
            <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">তারিখ পরিসীমা (ঐচ্ছিক)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">তারিখ থেকে</p>
                  <input type="date" value={stmtFrom} onChange={e => setStmtFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400 bg-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">তারিখ পর্যন্ত</p>
                  <input type="date" value={stmtTo} onChange={e => setStmtTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-400 bg-white" />
                </div>
              </div>
              <button onClick={downloadStatement} disabled={stmtLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm">
                {stmtLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> তৈরি হচ্ছে...</>
                ) : (
                  <><span>⬇️</span> {stmtFrom || stmtTo ? 'নির্বাচিত সময়ের Statement' : 'সম্পূর্ণ Statement'} ডাউনলোড</>
                )}
              </button>
              {/* ✅ FIX: Validation hint — একটি তারিখ দিলে সতর্কতা দেখাও */}
              {((stmtFrom && !stmtTo) || (!stmtFrom && stmtTo)) && (
                <p style={{ margin: 0, fontSize: 11, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ⚠️ {stmtFrom && !stmtTo ? '"পর্যন্ত" তারিখটিও দিন।' : '"থেকে" তারিখটিও দিন।'}
                </p>
              )}
              {stmtFrom && stmtTo && stmtFrom > stmtTo && (
                <p style={{ margin: 0, fontSize: 11, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ⚠️ "থেকে" তারিখ "পর্যন্ত" তারিখের আগে হতে হবে।
                </p>
              )}
              <p className="text-xs text-gray-400 text-center">তারিখ না দিলে সব লেনদেনের Statement পাবেন</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 pt-2">
          NovaTech BD • কাস্টমার পোর্টাল<br />
          তথ্য সংক্রান্ত সমস্যায় আপনার SR-এর সাথে যোগাযোগ করুন।
        </p>
      </div>

      {/* ── Toast Notification ── */}
      {toast?.show && (
        <div style={{
          position: 'fixed',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          maxWidth: 380,
          width: 'calc(100% - 32px)',
          borderRadius: 18,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          background:
            toast.type === 'success' ? '#064e3b' :
            toast.type === 'warning' ? '#78350f' : '#7f1d1d',
        }}>
          <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
            {toast.type === 'success' ? '✅' : toast.type === 'warning' ? '⚠️' : '❌'}
          </span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'white', lineHeight: 1.55, flex: 1 }}>
            {toast.message}
          </p>
        </div>
      )}

      {/* ── Return Request Form Bottom Sheet ── */}
      {returnFormOpen && (
        <div
          onClick={() => setReturnFormOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s cubic-bezier(.4,0,.2,1)' }}>
            {/* Header */}
            <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db', margin: '10px auto 16px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid #f0f0f0' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111' }}>↩️ পণ্য ফেরত অনুরোধ</h3>
                <button onClick={() => setReturnFormOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: '#64748b', fontSize: 16 }}>✕</button>
              </div>
            </div>
            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 32px' }}>
              {/* Invoice */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>ইনভয়েস নম্বর *</label>
                <input type="text" value={returnInvoice} onChange={e => setReturnInvoice(e.target.value)}
                  placeholder="যেমন: INV-2024-001"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {/* Type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>অনুরোধের ধরন *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ id: 'return', label: '↩️ পণ্য ফেরত' }, { id: 'replacement', label: '🔄 রিপ্লেসমেন্ট' }].map(t => (
                    <button key={t.id} onClick={() => setReturnType(t.id)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${returnType === t.id ? '#1d4ed8' : '#e2e8f0'}`, background: returnType === t.id ? '#eff6ff' : 'white', fontSize: 12, fontWeight: 700, color: returnType === t.id ? '#1d4ed8' : '#64748b', cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Items */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>পণ্য তালিকা *</label>
                  <button
                    onClick={() => setReturnItems(prev => [...prev, { product_name: '', qty: 1, reason: '' }])}
                    style={{ background: '#eff6ff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}>
                    + পণ্য যোগ
                  </button>
                </div>
                {(returnItems || []).map((item, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', borderRadius: 14, padding: '12px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#64748b' }}>পণ্য #{idx + 1}</p>
                      {(returnItems || []).length > 1 && (
                        <button onClick={() => setReturnItems(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>বাদ</button>
                      )}
                    </div>
                    <input type="text" placeholder="পণ্যের নাম *" value={item.product_name}
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: e.target.value } : it))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, marginBottom: 6, outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                    <input type="number" placeholder="পরিমাণ *" min="1" value={item.qty}
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, marginBottom: 6, outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                    <input type="text" placeholder="ফেরতের কারণ *" value={item.reason}
                      onChange={e => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, reason: e.target.value } : it))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                  </div>
                ))}
              </div>
              {/* Note */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>অতিরিক্ত নোট (ঐচ্ছিক)</label>
                <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)}
                  placeholder="বিস্তারিত লিখুন..." rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 12, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {/* Submit */}
              <button onClick={() => setShowReturnConfirm(true)} disabled={returnSubmitLoading}
                style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: returnSubmitLoading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: 'white', fontSize: 14, fontWeight: 800, cursor: returnSubmitLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(29,78,216,0.3)' }}>
                {returnSubmitLoading ? '⏳ পাঠানো হচ্ছে...' : '↩️ অনুরোধ পাঠান'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Complaint Confirmation Dialog ── */}
      {showComplaintConfirm && (
        <div onClick={() => setShowComplaintConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 32px' }}>
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
            <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>📣 অভিযোগ পাঠাবেন?</p>
            <div style={{ background: '#fef2f2', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', fontWeight: 600 }}>বিষয়</p>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1e1e1e', fontWeight: 700 }}>{cmpSubject}</p>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280', fontWeight: 600 }}>বিবরণ</p>
              <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{cmpDesc}</p>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>একবার পাঠালে সম্পাদনা করা যাবে না।</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setShowComplaintConfirm(false)}
                style={{ padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ← সম্পাদনা করুন
              </button>
              <button onClick={() => { setShowComplaintConfirm(false); submitComplaint() }}
                style={{ padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                📣 পাঠান
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credit Request Confirmation Dialog ── */}
      {showCreditConfirm && (
        <div onClick={() => setShowCreditConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 32px' }}>
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
            <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>💳 আবেদন নিশ্চিত করুন</p>
            <div style={{ background: '#eef2ff', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>বর্তমান লিমিট</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>৳{(customer?.credit_limit || 0).toLocaleString('bn-BD')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>আবেদনকৃত লিমিট</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#4f46e5' }}>৳{(parseInt(creditReqAmt) || 0).toLocaleString('bn-BD')}</span>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>অনুমোদনের জন্য কর্তৃপক্ষের কাছে পাঠানো হবে।</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setShowCreditConfirm(false)}
                style={{ padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ← ফিরে যান
              </button>
              <button onClick={() => { setShowCreditConfirm(false); submitCreditRequest() }}
                style={{ padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#4338ca)', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                ✅ নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Request Confirmation Dialog ── */}
      {showReturnConfirm && (
        <div onClick={() => setShowReturnConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 32px' }}>
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
            <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>↩️ ফেরত অনুরোধ পাঠাবেন?</p>
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '12px 14px', marginBottom: 6 }}>
              {(returnItems || []).filter(it => it.product_name).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: i < returnItems.length - 1 ? 8 : 0, marginBottom: i < returnItems.length - 1 ? 8 : 0, borderBottom: i < returnItems.length - 1 ? '1px solid #dbeafe' : 'none' }}>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{item.product_name}</span>
                  <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 800, background: '#dbeafe', borderRadius: 8, padding: '2px 10px' }}>× {item.qty}</span>
                </div>
              ))}
            </div>
            {returnNote && (
              <div style={{ background: '#fffbeb', borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#92400e' }}>📝 {returnNote}</p>
              </div>
            )}
            <p style={{ margin: '8px 0 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>একবার পাঠালে SR আসার আগে বাতিল করা যাবে না।</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setShowReturnConfirm(false)}
                style={{ padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ← ফিরে যান
              </button>
              <button onClick={() => { setShowReturnConfirm(false); submitReturnRequest() }}
                style={{ padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(29,78,216,0.3)' }}>
                ↩️ নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout Confirmation Bottom Sheet ── */}
      {showLogoutConfirm && (
        <div
          onClick={() => setShowLogoutConfirm(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'fadeIn 0.18s ease',
          }}>
          <style>{`
            @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideUp { from { transform: translateY(60px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: '24px 24px 0 0',
              padding: '8px 20px 36px', width: '100%', maxWidth: 480,
              animation: 'slideUp 0.22s cubic-bezier(.4,0,.2,1)',
            }}>
            {/* drag handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db', margin: '10px auto 20px' }} />

            {/* icon */}
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 28 }}>
              🚪
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#111', textAlign: 'center' }}>
              লগআউট করবেন?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 1.6 }}>
              {customer?.name
                ? <><strong style={{ color: '#374151' }}>{customer.name}</strong>-এর অ্যাকাউন্ট থেকে<br />বের হয়ে যাবেন।</>
                : 'আপনি কি সত্যিই বের হয়ে যেতে চান?'}
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14,
                  border: '1.5px solid #e5e7eb', background: 'white',
                  fontSize: 14, fontWeight: 700, color: '#374151', cursor: 'pointer',
                }}>
                না, থাকুন
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); onLogout() }}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.35)',
                }}>
                হ্যাঁ, লগআউট
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
