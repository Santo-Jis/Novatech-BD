// components/views/DashboardView.jsx
// Dashboard — tabs, summary, invoices, orders, credit, complaints

import { fmt, fmtDate } from '../../utils/helpers'
import { useEffect } from 'react'
import MonthlyTrendChart from '../MonthlyTrendChart'
import InvoiceCard from '../InvoiceCard'
import OrderRequestTab from '../OrderRequestTab'

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
}) {
  const {
    customer,
    credit_payments = [],
    monthly_summary = {},
    total_summary   = {},
    returns         = [],
  } = dashboard

  const tabs = [
    { id: 'summary',    label: 'সারসংক্ষেপ' },
    { id: 'orders',     label: '🛒 অর্ডার' },
    { id: 'invoices',   label: `ইনভয়েস (${invoiceTotal > 0 ? invoiceTotal : total_summary?.total_invoices || 0})` },
    { id: 'payments',   label: `পরিশোধ (${paymentTotal > 0 ? paymentTotal : credit_payments.length})` },
    { id: 'returns',    label: `🔄 রিটার্ন${returns.length > 0 ? ` (${returns.length})` : ''}` },
    { id: 'credit_req', label: '💳 লিমিট' },
    { id: 'complaints', label: '📣 অভিযোগ' },
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
                    notifications.map(n => (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9f9f9', background: n.is_read ? 'white' : '#eff6ff', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 20, marginTop: 1 }}>{n.type === 'credit_reminder' ? '💳' : '🔔'}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e1e1e' }}>{n.title}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#555', lineHeight: 1.5 }}>{n.body}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#aaa' }}>
                            {new Date(n.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginTop: 5, flexShrink: 0 }} />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button onClick={onLogout}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', fontSize: 12, cursor: 'pointer' }}>
              লগআউট
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-10 space-y-4 pb-10">
        {/* Unread Banner */}
        {unreadBanner && (
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 4px 16px rgba(29,78,216,0.3)' }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>💳</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 14 }}>{unreadBanner.title}</p>
              <p style={{ margin: '4px 0 0', color: '#bfdbfe', fontSize: 12, lineHeight: 1.5 }}>{unreadBanner.body}</p>
            </div>
            <button onClick={() => { setUnreadBanner(null); markAllAsRead(portalJWT) }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        )}

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

          <div className="p-4">
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
                        <button onClick={submitCreditRequest} disabled={creditReqLoading}
                          style={{ padding: '12px', borderRadius: 12, border: 'none', background: creditReqLoading ? '#94a3b8' : '#4f46e5', color: 'white', fontWeight: 700, fontSize: 13, cursor: creditReqLoading ? 'not-allowed' : 'pointer' }}>
                          {creditReqLoading ? 'জমা হচ্ছে...' : '✅ জমা দিন'}
                        </button>
                      </div>
                    </div>
                  )}

                  {myLimitReqs.length > 0 && (
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
                  )}
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
                        <button onClick={submitComplaint} disabled={cmpLoading}
                          style={{ padding: '12px', borderRadius: 12, border: 'none', background: cmpLoading ? '#94a3b8' : '#dc2626', color: 'white', fontWeight: 700, fontSize: 13, cursor: cmpLoading ? 'not-allowed' : 'pointer' }}>
                          {cmpLoading ? 'জমা হচ্ছে...' : '📣 জমা দিন'}
                        </button>
                      </div>
                    </div>
                  )}

                  {myComplaints.length > 0 ? (
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
                {returns.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-4xl mb-2">📦</p>
                    <p className="text-gray-400 text-sm">কোনো রিটার্ন বা রিপ্লেসমেন্ট নেই।</p>
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
                      const items = Array.isArray(r.replacement_items) ? r.replacement_items : []
                      return (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                          {/* Card Header */}
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

                          {/* Items list */}
                          {items.length > 0 && (
                            <div className="px-4 py-2 space-y-1.5">
                              {items.map((item, j) => (
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

                          {/* Footer: credit balance info */}
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
    </div>
  )
}
