// components/views/DashboardView.jsx
// ✅ REDESIGNED — same props, same imports, same backend logic
// ✅ Premium dark-header + Credit Ring + color-coded cards

import { fmt, fmtDate } from '../../utils/helpers'
import { useEffect, useState } from 'react'
import MonthlyTrendChart from '../MonthlyTrendChart'
import InvoiceCard from '../InvoiceCard'
import OrderRequestTab from '../OrderRequestTab'
import CustomerAIChat from '../../CustomerAIChat'

// ── Design Tokens ─────────────────────────────────────────────
const C = {
  hBg: '#09111F', hBg2: '#0E1F3D',
  primary: '#2563EB', pL: '#EFF6FF', pB: '#BFDBFE',
  success: '#059669', sL: '#ECFDF5', sB: '#A7F3D0',
  danger:  '#DC2626', dL: '#FEF2F2', dB: '#FECACA',
  warning: '#D97706', wL: '#FFFBEB', wB: '#FDE68A',
  purple:  '#7C3AED', vL: '#F5F3FF', vB: '#DDD6FE',
  bg: '#EDF1F7', card: '#FFFFFF', border: '#E8ECF2',
  text: '#111827', sec: '#6B7280', muted: '#9CA3AF', surface: '#F8FAFC',
}

// ── Skeleton লোডিং কার্ড ─────────────────────────────────────
function SkeletonCard({ rows = 3 }) {
  return (
    <div style={{ background:'white', borderRadius:14, padding:'14px 16px', border:`1px solid ${C.border}`, animation:'pulse 1.5s ease-in-out infinite' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i < rows-1 ? 12 : 0 }}>
          <div style={{ height:12, background:'#e5e7eb', borderRadius:6, width:`${55+(i%3)*15}%` }} />
          <div style={{ height:20, background:'#e5e7eb', borderRadius:10, width:'22%' }} />
        </div>
      ))}
    </div>
  )
}

// ── Credit Utilisation Ring ───────────────────────────────────
function CreditRing({ current, limit, fmtCur }) {
  const pct   = Math.min(limit > 0 ? (current / limit) * 100 : 0, 100)
  const r     = 44, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  const color = pct > 85 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#10B981'
  const glow  = pct > 85 ? 'rgba(239,68,68,0.5)' : pct > 60 ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)'
  return (
    <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
      <svg width="100" height="100" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 8px ${glow})`, transition:'stroke-dasharray 1s ease' }}/>
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:8, color:'rgba(255,255,255,0.4)', fontWeight:600, letterSpacing:0.8, textTransform:'uppercase' }}>বাকি</span>
        <span style={{ fontSize:14, color:'white', fontWeight:800, lineHeight:1.1, marginTop:1 }}>৳{fmtCur(current)}</span>
        <span style={{ fontSize:8, color, fontWeight:700, marginTop:1 }}>{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

// ── Section Label ─────────────────────────────────────────────
function SL({ label, color = C.primary }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
      <div style={{ width:3, height:15, background:color, borderRadius:2, flexShrink:0 }}/>
      <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:1 }}>{label}</p>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, color, bg, border }) {
  return (
    <div style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:16, padding:'12px 14px' }}>
      <p style={{ margin:'0 0 5px', fontSize:11, color:C.muted, fontWeight:500 }}>{label}</p>
      <p style={{ margin:0, fontSize:20, fontWeight:800, color, lineHeight:1 }}>{value}</p>
    </div>
  )
}

// ── Notification config ───────────────────────────────────────
const NOTIF_CONFIG = {
  payment_received:      { icon:'💰', tab:'payments', hint:'👆 পেমেন্ট ট্যাবে দেখুন' },
  new_invoice:           { icon:'🧾', tab:'invoices', hint:'👆 ইনভয়েস ট্যাবে দেখুন' },
  order_request:         { icon:'📦', tab:'orders',   hint:'👆 অর্ডার ট্যাবে দেখুন' },
  credit_reminder:       { icon:'💳', tab:null,       hint:null },
  return_request_update: { icon:'🔄', tab:'returns',  hint:'👆 ফেরত ট্যাবে দেখুন' },
  general:               { icon:'🔔', tab:null,       hint:null },
}

// ═══════════════════════════════════════════════════════════════
export default function DashboardView({
  dashboard, portalJWT, activeTab, onTabChange, onLogout, toast,
  notifications, unreadCount, showBell, setShowBell, unreadBanner, setUnreadBanner, markAllAsRead, markOneRead,
  invoices, invoiceTotal, invoicePage, invoiceTotalPages, invoiceLoading,
  invoiceSearch, setInvoiceSearch, invoicePayMethod, setInvoicePayMethod,
  invoiceDateFrom, setInvoiceDateFrom, invoiceDateTo, setInvoiceDateTo,
  filterOpen, setFilterOpen, loadInvoices, applyInvoiceFilter, clearInvoiceFilter,
  creditReqOpen, setCreditReqOpen, creditReqAmt, setCreditReqAmt, creditReqReason, setCreditReqReason,
  creditReqLoading, myLimitReqs, limitReqsLoaded, limitReqsLoading, loadMyLimitReqs, submitCreditRequest,
  complaintOpen, setComplaintOpen, cmpType, setCmpType, cmpSubject, setCmpSubject,
  cmpDesc, setCmpDesc, cmpLoading, myComplaints, complaintsLoaded, complaintsLoading,
  loadMyComplaints, submitComplaint,
  stmtOpen, setStmtOpen, stmtFrom, setStmtFrom, stmtTo, setStmtTo, stmtLoading, downloadStatement,
  paymentHistory = [], paymentPage, paymentTotalPages, paymentTotal, paymentLoading, paymentSummary,
  paymentTypeFilter, setPaymentTypeFilter, paymentDateFrom, setPaymentDateFrom,
  paymentDateTo, setPaymentDateTo, paymentFilterOpen, setPaymentFilterOpen,
  loadPaymentHistory, applyPaymentFilter, clearPaymentFilter,
  myReturnReqs = [], returnReqTotal = 0, returnReqPage = 1, returnReqTotalPages = 1,
  returnReqLoading = false, returnReqFilter, setReturnReqFilter,
  returnFormOpen, setReturnFormOpen, returnInvoice, setReturnInvoice,
  returnType, setReturnType, returnItems, setReturnItems, returnNote, setReturnNote,
  returnSubmitLoading = false, loadMyReturnReqs, submitReturnRequest,
}) {
  const { customer, credit_payments = [], monthly_summary = {}, total_summary = {}, returns = [], sales_note = null } = dashboard

  const [showLogoutConfirm,    setShowLogoutConfirm]    = useState(false)
  const [showComplaintConfirm, setShowComplaintConfirm] = useState(false)
  const [showCreditConfirm,    setShowCreditConfirm]    = useState(false)
  const [showReturnConfirm,    setShowReturnConfirm]    = useState(false)
  const [returnSubTab,         setReturnSubTab]         = useState('requests')

  const fmtCur = (n) => parseFloat(n || 0).toLocaleString('en-US')

  const tabs = [
    { id:'summary',    label:'সারসংক্ষেপ' },
    { id:'orders',     label:'🛒 অর্ডার' },
    { id:'invoices',   label:`🧾 ইনভয়েস (${invoiceTotal > 0 ? invoiceTotal : total_summary?.total_invoices || 0})` },
    { id:'payments',   label:`পরিশোধ (${paymentTotal > 0 ? paymentTotal : credit_payments.length})` },
    { id:'returns',    label:`🔄 রিটার্ন${returnReqTotal > 0 ? ` (${returnReqTotal})` : ''}` },
    { id:'credit_req', label:'💳 লিমিট' },
    { id:'complaints', label:'📣 অভিযোগ' },
    { id:'ai_chat',    label:'🤖 AI চ্যাট' },
  ]

  useEffect(() => {
    if (activeTab === 'credit_req' && !limitReqsLoaded) loadMyLimitReqs()
    if (activeTab === 'complaints' && !complaintsLoaded) loadMyComplaints()
  }, [activeTab])

  const limitStatusMap = {
    pending:  { l:'⏳ অপেক্ষমাণ', bg:'#FEF9C3', c:'#92400E' },
    approved: { l:'✅ অনুমোদিত',  bg:'#D1FAE5', c:'#065F46' },
    rejected: { l:'❌ নামঞ্জুর',   bg:'#FEE2E2', c:'#991B1B' },
  }
  const cmpStatusMap = {
    open:        { l:'🔴 খোলা',          bg:'#FEF2F2', c:'#991B1B' },
    in_progress: { l:'🔄 প্রক্রিয়াধীন', bg:'#DBEAFE', c:'#1E40AF' },
    resolved:    { l:'✅ সমাধান',        bg:'#D1FAE5', c:'#065F46' },
  }
  const typeOpts = [
    { v:'complaint',      l:'⚠️ অভিযোগ' },
    { v:'feedback',       l:'💬 ফিডব্যাক' },
    { v:'delivery_issue', l:'🚚 ডেলিভারি সমস্যা' },
    { v:'product_issue',  l:'📦 পণ্য সমস্যা' },
    { v:'payment_issue',  l:'💳 পেমেন্ট সমস্যা' },
    { v:'other',          l:'📌 অন্যান্য' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
        body { font-family: 'Hind Siliguri', system-ui, sans-serif; }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(60px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      {/* ═══ HEADER ══════════════════════════════════════════════ */}
      <div style={{
        background:`linear-gradient(155deg,${C.hBg} 0%,${C.hBg2} 50%,#1A1040 100%)`,
        padding:'50px 20px 90px', position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px,transparent 1px)', backgroundSize:'22px 22px', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:-60, right:-60, width:220, height:220, borderRadius:'50%', background:'rgba(37,99,235,0.07)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:10, left:-40, width:160, height:160, borderRadius:'50%', background:'rgba(124,58,237,0.07)', pointerEvents:'none' }}/>

        {/* Top bar */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative', marginBottom:28 }}>
          <div>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', letterSpacing:2, textTransform:'uppercase', display:'block', marginBottom:4 }}>CUSTOMER PORTAL</span>
            <h1 style={{ margin:0, fontSize:20, fontWeight:800, color:'white', lineHeight:1.2 }}>{customer.shop_name}</h1>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#10B981', flexShrink:0, boxShadow:'0 0 8px rgba(16,185,129,0.9)' }}/>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.38)' }}>{customer.owner_name} • {customer.customer_code}</span>
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            {/* Bell */}
            <div style={{ position:'relative' }}>
              <button
                onClick={() => { setShowBell(v => !v); if (unreadCount > 0) markAllAsRead(portalJWT) }}
                style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'white', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                🔔
                {unreadCount > 0 && (
                  <span style={{ position:'absolute', top:-3, right:-3, background:'#ef4444', color:'white', borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.hBg}` }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showBell && (
                <div style={{ position:'absolute', right:0, top:48, width:290, maxHeight:380, background:'white', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', overflowY:'auto', zIndex:100 }}>
                  <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ color:C.text, fontWeight:700, fontSize:14 }}>🔔 Notification</span>
                    <button onClick={() => setShowBell(false)} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:C.muted }}>✕</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ textAlign:'center', color:C.muted, fontSize:13, padding:'24px 16px' }}>কোনো notification নেই।</p>
                  ) : notifications.map(n => {
                    const cfg = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.general
                    return (
                      <div key={n.id}
                        onClick={() => { if (!n.is_read) markOneRead(n.id); setShowBell(false); if (cfg.tab) onTabChange(cfg.tab) }}
                        style={{ padding:'12px 16px', borderBottom:`1px solid ${C.surface}`, background:n.is_read ? 'white' : C.pL, display:'flex', gap:10, alignItems:'flex-start', cursor:cfg.tab ? 'pointer' : 'default' }}>
                        <span style={{ fontSize:20, marginTop:1 }}>{cfg.icon}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ margin:0, fontWeight:700, fontSize:13, color:C.text }}>{n.title}</p>
                          <p style={{ margin:'3px 0 0', fontSize:12, color:C.sec, lineHeight:1.5 }}>{n.body}</p>
                          <p style={{ margin:'4px 0 0', fontSize:10, color:C.muted }}>{new Date(n.created_at).toLocaleString('bn-BD', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                          {cfg.hint && <p style={{ margin:'4px 0 0', fontSize:10, color:C.primary, fontWeight:600 }}>{cfg.hint}</p>}
                        </div>
                        {!n.is_read ? (
                          <button onClick={e => { e.stopPropagation(); markOneRead(n.id) }}
                            style={{ flexShrink:0, marginTop:2, background:C.pL, border:`1px solid ${C.pB}`, borderRadius:6, padding:'2px 7px', cursor:'pointer', fontSize:11, color:C.primary, fontWeight:700, lineHeight:1.4 }}>✓</button>
                        ) : (
                          <span style={{ fontSize:14, color:C.border, marginTop:3, flexShrink:0 }}>✓</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <button onClick={() => setShowLogoutConfirm(true)}
              style={{ height:40, padding:'0 14px', borderRadius:12, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.7)', fontSize:11, cursor:'pointer', fontWeight:600, letterSpacing:0.3 }}>
              লগআউট
            </button>
          </div>
        </div>

        {/* Credit Ring + Balance Cards */}
        <div style={{ display:'flex', alignItems:'center', gap:14, position:'relative' }}>
          <CreditRing current={customer.current_credit} limit={customer.credit_limit} fmtCur={fmtCur}/>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:14, padding:'10px 14px', border:'1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ margin:'0 0 2px', fontSize:10, color:'rgba(255,255,255,0.38)', fontWeight:500 }}>ক্রেডিট লিমিট</p>
              <p style={{ margin:0, fontSize:19, color:'white', fontWeight:800 }}>৳{fmtCur(customer.credit_limit)}</p>
            </div>
            <div style={{ background:'rgba(16,185,129,0.13)', borderRadius:14, padding:'10px 14px', border:'1px solid rgba(16,185,129,0.22)' }}>
              <p style={{ margin:'0 0 2px', fontSize:10, color:'rgba(16,185,129,0.7)', fontWeight:500 }}>জমা ব্যালেন্স</p>
              <p style={{ margin:0, fontSize:19, color:'#10B981', fontWeight:800 }}>৳{fmtCur(customer.credit_balance)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ════════════════════════════════════════ */}
      <div style={{ padding:'0 16px 40px', marginTop:-46 }}>

        {/* Unread Banner */}
        {unreadBanner && (() => {
          const cfg = NOTIF_CONFIG[unreadBanner.type] || NOTIF_CONFIG.general
          return (
            <div onClick={() => { if (cfg.tab) { onTabChange(cfg.tab); setUnreadBanner(null); markAllAsRead(portalJWT) } }}
              style={{ background:'linear-gradient(135deg,#1e3a8a,#1d4ed8)', borderRadius:20, padding:'14px 16px', display:'flex', gap:12, alignItems:'flex-start', boxShadow:'0 4px 16px rgba(29,78,216,0.3)', cursor:cfg.tab ? 'pointer' : 'default', marginBottom:14 }}>
              <span style={{ fontSize:24, flexShrink:0 }}>{cfg.icon}</span>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, color:'white', fontWeight:700, fontSize:14 }}>{unreadBanner.title}</p>
                <p style={{ margin:'4px 0 0', color:'#bfdbfe', fontSize:12, lineHeight:1.5 }}>{unreadBanner.body}</p>
                {cfg.hint && <p style={{ margin:'6px 0 0', color:'#93c5fd', fontSize:11, fontWeight:600 }}>{cfg.hint}</p>}
              </div>
              <button onClick={e => { e.stopPropagation(); setUnreadBanner(null); markAllAsRead(portalJWT) }}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, padding:'4px 8px', color:'white', fontSize:12, cursor:'pointer', flexShrink:0 }}>✕</button>
            </div>
          )
        })()}

        {/* ── Tab Card ─────────────────────────────────────────── */}
        <div style={{ background:C.card, borderRadius:24, overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' }}>

          {/* Tab Bar */}
          <div style={{ display:'flex', overflowX:'auto', padding:'6px 6px 0', gap:2, borderBottom:`1px solid ${C.border}` }}>
            {tabs.map(t => {
              const active = activeTab === t.id
              return (
                <button key={t.id} onClick={() => onTabChange(t.id)} style={{
                  flexShrink:0, padding:'9px 12px 10px', border:'none', cursor:'pointer',
                  fontSize:11, fontWeight:active ? 700 : 600, borderRadius:'10px 10px 0 0',
                  transition:'all 0.2s', whiteSpace:'nowrap',
                  background:active ? C.pL : 'transparent',
                  color:active ? C.primary : C.muted,
                  borderBottom:active ? `2px solid ${C.primary}` : '2px solid transparent',
                }}>
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* ── Content ─────────────────────────────────────────── */}
          <div style={{ padding: activeTab === 'ai_chat' ? 0 : 16 }}>

            {/* ══ সারসংক্ষেপ ══ */}
            {activeTab === 'summary' && (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* SR Contact Card */}
                {customer?.assigned_sr_name && (
                  <div style={{ background:'linear-gradient(135deg,#1D4ED8 0%,#7C3AED 100%)', borderRadius:18, padding:'13px 16px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 10px 28px rgba(29,78,216,0.25)' }}>
                    <div style={{ width:44, height:44, borderRadius:14, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🧑‍💼</div>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:9, color:'rgba(255,255,255,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>আপনার বিক্রয় প্রতিনিধি</p>
                      <p style={{ margin:'2px 0 0', fontSize:14, color:'white', fontWeight:700 }}>{customer.assigned_sr_name}</p>
                      {customer.assigned_sr_code && <p style={{ margin:'1px 0 0', fontSize:10, color:'rgba(255,255,255,0.5)' }}>কোড: {customer.assigned_sr_code}</p>}
                    </div>
                    {customer?.assigned_sr_phone && (
                      <a href={`tel:${customer.assigned_sr_phone}`}
                        style={{ textDecoration:'none', background:'rgba(255,255,255,0.18)', borderRadius:12, padding:'10px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 }}>
                        <span style={{ fontSize:20 }}>📞</span>
                        <span style={{ fontSize:9, color:'white', fontWeight:700 }}>কল</span>
                      </a>
                    )}
                  </div>
                )}

                {/* এই মাস */}
                <div>
                  <SL label="এই মাস" color={C.primary}/>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <StatCard label="মোট কেনাকাটা"  value={`৳${fmt(monthly_summary?.total_purchase)}`}  color={C.text}    bg={C.surface} border={C.border}/>
                    <StatCard label="ইনভয়েস সংখ্যা" value={monthly_summary?.total_invoices ?? 0}         color={C.primary} bg={C.pL}      border={C.pB}/>
                    <StatCard label="নগদ দিয়েছেন"   value={`৳${fmt(monthly_summary?.total_cash)}`}       color={C.success} bg={C.sL}      border={C.sB}/>
                    <StatCard label="বাকি রেখেছেন"   value={`৳${fmt(monthly_summary?.total_credit)}`}     color={C.danger}  bg={C.dL}      border={C.dB}/>
                  </div>
                </div>

                {/* ৬ মাসের ট্রেন্ড */}
                <div>
                  <SL label="গত ৬ মাসের ট্রেন্ড" color={C.purple}/>
                  <MonthlyTrendChart portalJWT={portalJWT}/>
                </div>

                {/* সর্বমোট */}
                <div>
                  <SL label="সর্বমোট" color={C.success}/>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <StatCard label="মোট কেনাকাটা" value={`৳${fmt(total_summary?.total_purchase)}`} color={C.text}    bg={C.surface} border={C.border}/>
                    <StatCard label="মোট ইনভয়েস"  value={total_summary?.total_invoices ?? 0}         color={C.primary} bg={C.pL}      border={C.pB}/>
                    <StatCard label="মোট নগদ"      value={`৳${fmt(total_summary?.total_cash)}`}      color={C.success} bg={C.sL}      border={C.sB}/>
                    <StatCard label="মোট বাকি"     value={`৳${fmt(total_summary?.total_credit)}`}    color={C.danger}  bg={C.dL}      border={C.dB}/>
                  </div>
                </div>
              </div>
            )}

            {/* ══ অর্ডার ══ */}
            {activeTab === 'orders' && <OrderRequestTab portalJWT={portalJWT}/>}

            {/* ══ ইনভয়েস ══ */}
            {activeTab === 'invoices' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="text" value={invoiceSearch}
                    onChange={e => setInvoiceSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyInvoiceFilter()}
                    placeholder="ইনভয়েস নম্বর বা SR নাম..."
                    style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:12, padding:'10px 14px', fontSize:12, outline:'none', background:C.surface, color:C.text }}/>
                  <button onClick={() => setFilterOpen(v => !v)}
                    style={{ padding:'10px 14px', borderRadius:12, border:`1.5px solid ${filterOpen || invoicePayMethod || invoiceDateFrom || invoiceDateTo ? C.primary : C.border}`, background:filterOpen || invoicePayMethod || invoiceDateFrom || invoiceDateTo ? C.pL : C.card, color:filterOpen || invoicePayMethod || invoiceDateFrom || invoiceDateTo ? C.primary : C.sec, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    🔍 ফিল্টার
                  </button>
                  <button onClick={applyInvoiceFilter}
                    style={{ padding:'10px 16px', background:C.primary, border:'none', borderRadius:12, color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    খুঁজুন
                  </button>
                </div>

                {filterOpen && (
                  <div style={{ background:C.pL, border:`1.5px solid ${C.pB}`, borderRadius:18, padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                    <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.primary, textTransform:'uppercase', letterSpacing:0.8 }}>ফিল্টার</p>
                    <div>
                      <p style={{ margin:'0 0 8px', fontSize:11, color:C.sec, fontWeight:600 }}>পেমেন্ট পদ্ধতি</p>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {[['','সব'],['cash','নগদ'],['credit','বাকি'],['mixed','মিশ্র']].map(([val,label]) => (
                          <button key={val} onClick={() => setInvoicePayMethod(val)}
                            style={{ padding:'5px 14px', borderRadius:20, border:`1.5px solid ${invoicePayMethod===val ? C.primary : C.pB}`, background:invoicePayMethod===val ? C.primary : 'white', color:invoicePayMethod===val ? 'white' : C.primary, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[['তারিখ থেকে',invoiceDateFrom,setInvoiceDateFrom],['তারিখ পর্যন্ত',invoiceDateTo,setInvoiceDateTo]].map(([l,v,s]) => (
                        <div key={l}>
                          <p style={{ margin:'0 0 4px', fontSize:11, color:C.sec }}>{l}</p>
                          <input type="date" value={v} onChange={e => s(e.target.value)}
                            style={{ width:'100%', border:`1.5px solid ${C.border}`, borderRadius:10, padding:'8px 10px', fontSize:11, outline:'none', background:C.card, boxSizing:'border-box' }}/>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={applyInvoiceFilter}
                        style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:C.primary, color:'white', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                        ফিল্টার প্রয়োগ
                      </button>
                      <button onClick={clearInvoiceFilter}
                        style={{ padding:'11px 16px', borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, color:C.sec, fontSize:12, cursor:'pointer' }}>
                        রিসেট
                      </button>
                    </div>
                  </div>
                )}

                {(invoicePayMethod || invoiceDateFrom || invoiceDateTo) && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {invoicePayMethod && <span style={{ background:C.pL, color:C.primary, fontSize:11, padding:'4px 12px', borderRadius:20, display:'flex', alignItems:'center', gap:6 }}>
                      💳 {invoicePayMethod === 'cash' ? 'নগদ' : invoicePayMethod === 'credit' ? 'বাকি' : 'মিশ্র'}
                      <button onClick={() => { setInvoicePayMethod(''); applyInvoiceFilter() }} style={{ background:'none', border:'none', color:C.primary, cursor:'pointer', padding:0, fontSize:12 }}>✕</button>
                    </span>}
                    <span style={{ fontSize:11, color:C.muted, padding:'4px 0' }}>— {invoiceTotal}টি পাওয়া গেছে</span>
                  </div>
                )}

                {sales_note && !invoiceSearch && !invoicePayMethod && !invoiceDateFrom && !invoiceDateTo && (
                  <div style={{ background:C.pL, border:`1px solid ${C.pB}`, borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>ℹ️</span>
                    <p style={{ margin:0, fontSize:12, color:'#1d4ed8', fontWeight:600, lineHeight:1.5 }}>{sales_note}</p>
                  </div>
                )}

                {invoiceLoading && invoices.length === 0 ? (
                  [...Array(3)].map((_,i) => <div key={i} style={{ height:80, background:'white', borderRadius:18, border:`1px solid ${C.border}`, animation:'pulse 1.5s ease-in-out infinite' }}/>)
                ) : invoices.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0' }}>
                    <p style={{ fontSize:30, marginBottom:8 }}>🔍</p>
                    <p style={{ color:C.muted, fontSize:13 }}>কোনো ইনভয়েস পাওয়া যায়নি।</p>
                  </div>
                ) : (
                  <>
                    {invoices.map(sale => <InvoiceCard key={sale.invoice_number} sale={sale}/>)}
                    {invoicePage < invoiceTotalPages && (
                      <button
                        onClick={() => loadInvoices(portalJWT, invoicePage+1, { search:invoiceSearch, payMethod:invoicePayMethod, dateFrom:invoiceDateFrom, dateTo:invoiceDateTo })}
                        disabled={invoiceLoading}
                        style={{ width:'100%', padding:'13px 0', borderRadius:16, border:`1.5px solid ${C.pB}`, background:C.pL, color:C.primary, fontWeight:700, fontSize:13, cursor:invoiceLoading ? 'not-allowed' : 'pointer', opacity:invoiceLoading ? 0.6 : 1 }}>
                        {invoiceLoading ? '⏳ লোড হচ্ছে...' : `আরো দেখুন (${invoices.length}/${invoiceTotal})`}
                      </button>
                    )}
                    {invoicePage >= invoiceTotalPages && invoices.length > 0 && (
                      <p style={{ textAlign:'center', fontSize:11, color:C.muted, padding:'8px 0' }}>সব {invoiceTotal}টি ইনভয়েস দেখানো হয়েছে।</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ══ পরিশোধ ══ */}
            {activeTab === 'payments' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setPaymentFilterOpen(v => !v)}
                    style={{ flex:1, padding:'10px 14px', borderRadius:12, border:`1.5px solid ${paymentFilterOpen || paymentTypeFilter || paymentDateFrom || paymentDateTo ? C.primary : C.border}`, background:paymentFilterOpen || paymentTypeFilter || paymentDateFrom || paymentDateTo ? C.pL : C.card, color:paymentFilterOpen || paymentTypeFilter || paymentDateFrom || paymentDateTo ? C.primary : C.sec, fontSize:12, fontWeight:700, cursor:'pointer', textAlign:'center' }}>
                    🔍 ফিল্টার {(paymentTypeFilter || paymentDateFrom || paymentDateTo) ? '●' : ''}
                  </button>
                  <button onClick={applyPaymentFilter}
                    style={{ padding:'10px 18px', background:C.primary, border:'none', borderRadius:12, color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    দেখুন
                  </button>
                </div>

                {paymentFilterOpen && (
                  <div style={{ background:C.pL, border:`1.5px solid ${C.pB}`, borderRadius:18, padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
                    <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.primary, textTransform:'uppercase', letterSpacing:0.8 }}>পেমেন্টের ধরন</p>
                    <div style={{ display:'flex', gap:6 }}>
                      {[['','সব'],['cash','💵 নগদ'],['credit','🔄 ক্রেডিট']].map(([val,label]) => (
                        <button key={val} onClick={() => setPaymentTypeFilter(val)}
                          style={{ padding:'5px 14px', borderRadius:20, border:`1.5px solid ${paymentTypeFilter===val ? C.primary : C.pB}`, background:paymentTypeFilter===val ? C.primary : 'white', color:paymentTypeFilter===val ? 'white' : C.primary, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[['তারিখ থেকে',paymentDateFrom,setPaymentDateFrom],['তারিখ পর্যন্ত',paymentDateTo,setPaymentDateTo]].map(([l,v,s]) => (
                        <div key={l}>
                          <p style={{ margin:'0 0 4px', fontSize:11, color:C.sec }}>{l}</p>
                          <input type="date" value={v} onChange={e => s(e.target.value)}
                            style={{ width:'100%', border:`1.5px solid ${C.border}`, borderRadius:10, padding:'8px 10px', fontSize:11, outline:'none', background:C.card, boxSizing:'border-box' }}/>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={applyPaymentFilter}
                        style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:C.primary, color:'white', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                        ফিল্টার প্রয়োগ
                      </button>
                      <button onClick={clearPaymentFilter}
                        style={{ padding:'11px 16px', borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, color:C.sec, fontSize:12, cursor:'pointer' }}>
                        রিসেট
                      </button>
                    </div>
                  </div>
                )}

                {paymentSummary && !paymentTypeFilter && !paymentDateFrom && !paymentDateTo && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <StatCard label="💵 মোট নগদ"   value={`৳${fmtCur(paymentSummary.total_cash_received)}`}   color={C.success} bg={C.sL} border={C.sB}/>
                    <StatCard label="🔄 মোট ক্রেডিট" value={`৳${fmtCur(paymentSummary.total_credit_collected)}`} color={C.primary} bg={C.pL} border={C.pB}/>
                  </div>
                )}

                {paymentLoading && paymentHistory.length === 0 ? (
                  [...Array(4)].map((_,i) => <div key={i} style={{ height:80, background:'white', borderRadius:16, border:`1px solid ${C.border}`, animation:'pulse 1.5s ease-in-out infinite' }}/>)
                ) : paymentHistory.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0' }}>
                    <p style={{ fontSize:30, marginBottom:8 }}>💳</p>
                    <p style={{ color:C.muted, fontSize:13 }}>কোনো পেমেন্ট পাওয়া যায়নি।</p>
                  </div>
                ) : (
                  <>
                    {paymentHistory.map((p, i) => (
                      <div key={i} style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:38, height:38, borderRadius:12, background:p.payment_type==='cash' ? C.sL : C.pL, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                          {p.payment_type === 'cash' ? '💵' : '🔄'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight:600, color:C.text }}>{p.collected_by} আদায় করেছেন</p>
                          <p style={{ margin:'2px 0 0', fontSize:10, color:C.muted }}>{fmtDate(p.created_at)}</p>
                          {p.reference && <p style={{ margin:'2px 0 0', fontSize:10, color:C.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.payment_type === 'cash' ? `INV: ${p.reference}` : p.reference}</p>}
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ margin:0, fontWeight:800, fontSize:16, color:C.success }}>৳{fmtCur(p.amount)}</p>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:20, background:p.payment_type==='cash' ? C.sL : C.pL, color:p.payment_type==='cash' ? C.success : C.primary }}>
                            {p.payment_type === 'cash' ? '● নগদ' : '● ক্রেডিট'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {paymentPage < paymentTotalPages && (
                      <button
                        onClick={() => loadPaymentHistory(portalJWT, paymentPage+1, { type:paymentTypeFilter, dateFrom:paymentDateFrom, dateTo:paymentDateTo })}
                        disabled={paymentLoading}
                        style={{ width:'100%', padding:'13px 0', borderRadius:16, border:`1.5px solid ${C.pB}`, background:C.pL, color:C.primary, fontWeight:700, fontSize:13, cursor:paymentLoading ? 'not-allowed' : 'pointer', opacity:paymentLoading ? 0.6 : 1 }}>
                        {paymentLoading ? '⏳ লোড হচ্ছে...' : `আরো দেখুন (${paymentHistory.length}/${paymentTotal})`}
                      </button>
                    )}
                    {paymentPage >= paymentTotalPages && paymentHistory.length > 0 && (
                      <p style={{ textAlign:'center', fontSize:11, color:C.muted, padding:'8px 0' }}>সব {paymentTotal}টি পেমেন্ট দেখানো হয়েছে।</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ══ ক্রেডিট লিমিট ══ */}
            {activeTab === 'credit_req' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ background:'linear-gradient(135deg,#1D4ED8,#7C3AED)', borderRadius:18, padding:16 }}>
                  <p style={{ margin:'0 0 10px', fontSize:9, color:'rgba(255,255,255,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>বর্তমান ক্রেডিট তথ্য</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <p style={{ margin:'0 0 3px', fontSize:10, color:'rgba(255,255,255,0.5)' }}>লিমিট</p>
                      <p style={{ margin:0, fontSize:22, color:'white', fontWeight:800 }}>৳{fmtCur(customer.credit_limit)}</p>
                    </div>
                    <div>
                      <p style={{ margin:'0 0 3px', fontSize:10, color:'rgba(255,255,255,0.5)' }}>বর্তমান বাকি</p>
                      <p style={{ margin:0, fontSize:22, color:'#fde68a', fontWeight:800 }}>৳{fmtCur(customer.current_credit)}</p>
                    </div>
                  </div>
                </div>

                {!creditReqOpen ? (
                  <button onClick={() => setCreditReqOpen(true)}
                    style={{ width:'100%', background:C.card, border:`2px dashed ${C.pB}`, borderRadius:16, padding:16, display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer', color:C.primary, fontWeight:700, fontSize:14 }}>
                    <span style={{ fontSize:22 }}>💳</span> নতুন লিমিট বৃদ্ধির আবেদন করুন
                  </button>
                ) : (
                  <div style={{ background:C.card, border:`1.5px solid ${C.pB}`, borderRadius:16, padding:16 }}>
                    <p style={{ margin:'0 0 14px', fontWeight:700, fontSize:14, color:C.text }}>💳 ক্রেডিট লিমিট বৃদ্ধির আবেদন</p>
                    <div style={{ marginBottom:12 }}>
                      <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:600, color:C.sec }}>আবেদনকৃত পরিমাণ ৳ *</p>
                      <input type="number" value={creditReqAmt} onChange={e => setCreditReqAmt(e.target.value)} placeholder="যেমন: 50000"
                        style={{ width:'100%', border:`2px solid ${C.pB}`, borderRadius:12, padding:12, fontSize:15, fontWeight:700, outline:'none', boxSizing:'border-box', color:C.primary }}/>
                      <p style={{ margin:'4px 0 0', fontSize:10, color:C.muted }}>বর্তমান লিমিট: ৳{fmtCur(customer.credit_limit)}</p>
                    </div>
                    <div style={{ marginBottom:16 }}>
                      <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:600, color:C.sec }}>কারণ (ঐচ্ছিক)</p>
                      <textarea value={creditReqReason} onChange={e => setCreditReqReason(e.target.value)}
                        placeholder="কেন লিমিট বাড়ানো দরকার তা সংক্ষেপে লিখুন..." rows={3}
                        style={{ width:'100%', border:`2px solid ${C.pB}`, borderRadius:12, padding:12, fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <button onClick={() => setCreditReqOpen(false)}
                        style={{ padding:12, borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, color:C.sec, fontWeight:700, fontSize:13, cursor:'pointer' }}>বাতিল</button>
                      <button onClick={() => setShowCreditConfirm(true)} disabled={creditReqLoading}
                        style={{ padding:12, borderRadius:12, border:'none', background:creditReqLoading ? '#94a3b8' : C.primary, color:'white', fontWeight:700, fontSize:13, cursor:creditReqLoading ? 'not-allowed' : 'pointer' }}>
                        {creditReqLoading ? 'জমা হচ্ছে...' : '✅ জমা দিন'}
                      </button>
                    </div>
                  </div>
                )}

                {limitReqsLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:0.5 }}>আবেদনের ইতিহাস</p>
                    {[1,2].map(i => <SkeletonCard key={i} rows={2}/>)}
                  </div>
                ) : myLimitReqs.length > 0 ? (
                  <div>
                    <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:0.5 }}>আবেদনের ইতিহাস</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {myLimitReqs.map(r => {
                        const s = limitStatusMap[r.status] || { l:r.status, bg:'#f3f4f6', c:'#374151' }
                        return (
                          <div key={r.id} style={{ background:C.card, borderRadius:14, padding:'12px 14px', border:`1px solid ${C.border}` }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                              <p style={{ margin:0, fontSize:14, fontWeight:700, color:C.primary }}>৳{fmtCur(r.requested_amount)}</p>
                              <span style={{ background:s.bg, color:s.c, padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700 }}>{s.l}</span>
                            </div>
                            {r.reason && <p style={{ margin:'0 0 4px', fontSize:12, color:C.sec }}>{r.reason}</p>}
                            {r.admin_note && <p style={{ margin:'0 0 4px', fontSize:12, color:r.status==='approved' ? '#065f46' : '#991b1b', background:r.status==='approved' ? '#f0fdf4' : '#fff1f2', borderRadius:6, padding:'4px 8px' }}>{r.admin_note}</p>}
                            <p style={{ margin:0, fontSize:10, color:C.muted }}>{new Date(r.created_at).toLocaleDateString('bn-BD', { day:'2-digit', month:'short', year:'numeric' })}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : limitReqsLoaded ? (
                  <div style={{ textAlign:'center', padding:'24px 0' }}>
                    <p style={{ fontSize:30, margin:0 }}>📋</p>
                    <p style={{ color:C.muted, fontSize:13, marginTop:8 }}>এখনো কোনো আবেদন নেই।</p>
                  </div>
                ) : null}
              </div>
            )}

            {/* ══ অভিযোগ ══ */}
            {activeTab === 'complaints' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {!complaintOpen ? (
                  <button onClick={() => setComplaintOpen(true)}
                    style={{ width:'100%', background:C.card, border:`2px dashed ${C.dB}`, borderRadius:16, padding:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', color:C.danger, fontWeight:700, fontSize:14 }}>
                    <span style={{ fontSize:20 }}>📣</span> নতুন অভিযোগ / ফিডব্যাক দিন
                  </button>
                ) : (
                  <div style={{ background:C.card, border:`1.5px solid ${C.dB}`, borderRadius:16, padding:16 }}>
                    <p style={{ margin:'0 0 14px', fontWeight:700, fontSize:14, color:C.text }}>📣 অভিযোগ / ফিডব্যাক</p>
                    <div style={{ marginBottom:12 }}>
                      <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:600, color:C.sec }}>ধরন *</p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {typeOpts.map(t => (
                          <button key={t.v} onClick={() => setCmpType(t.v)}
                            style={{ padding:'6px 12px', borderRadius:20, border:`1.5px solid ${cmpType===t.v ? C.danger : C.border}`, background:cmpType===t.v ? C.dL : 'white', color:cmpType===t.v ? C.danger : C.sec, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {t.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:600, color:C.sec }}>বিষয় *</p>
                      <input type="text" value={cmpSubject} onChange={e => setCmpSubject(e.target.value)} placeholder="সংক্ষেপে বিষয়টি লিখুন..."
                        style={{ width:'100%', border:`2px solid ${C.dB}`, borderRadius:12, padding:12, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
                    </div>
                    <div style={{ marginBottom:16 }}>
                      <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:600, color:C.sec }}>বিস্তারিত *</p>
                      <textarea value={cmpDesc} onChange={e => setCmpDesc(e.target.value)} placeholder="সমস্যাটি বিস্তারিত লিখুন।" rows={4}
                        style={{ width:'100%', border:`2px solid ${C.dB}`, borderRadius:12, padding:12, fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <button onClick={() => setComplaintOpen(false)}
                        style={{ padding:12, borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, color:C.sec, fontWeight:700, fontSize:13, cursor:'pointer' }}>বাতিল</button>
                      <button onClick={() => setShowComplaintConfirm(true)} disabled={cmpLoading}
                        style={{ padding:12, borderRadius:12, border:'none', background:cmpLoading ? '#94a3b8' : C.danger, color:'white', fontWeight:700, fontSize:13, cursor:cmpLoading ? 'not-allowed' : 'pointer' }}>
                        {cmpLoading ? 'জমা হচ্ছে...' : '📣 জমা দিন'}
                      </button>
                    </div>
                  </div>
                )}

                {complaintsLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[1,2,3].map(i => <SkeletonCard key={i} rows={3}/>)}
                  </div>
                ) : myComplaints.length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {myComplaints.map(c => {
                      const s = cmpStatusMap[c.status] || { l:c.status, bg:'#f3f4f6', c:'#374151' }
                      const t = typeOpts.find(o => o.v === c.type)
                      return (
                        <div key={c.id} style={{ background:C.card, borderRadius:14, padding:14, border:`${c.status==='open' ? `1.5px solid ${C.dB}` : `1px solid ${C.border}`}` }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                            <div style={{ flex:1, paddingRight:8 }}>
                              <p style={{ margin:0, fontSize:13, fontWeight:700, color:C.text }}>{c.subject}</p>
                              <p style={{ margin:'3px 0 0', fontSize:10, color:C.muted }}>{t?.l || c.type} • {new Date(c.created_at).toLocaleDateString('bn-BD', { day:'2-digit', month:'short', year:'numeric' })}</p>
                            </div>
                            <span style={{ background:s.bg, color:s.c, padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, flexShrink:0 }}>{s.l}</span>
                          </div>
                          <p style={{ margin:'0 0 8px', fontSize:12, color:C.sec, lineHeight:1.5 }}>{c.description}</p>
                          {c.admin_reply && (
                            <div style={{ background:'#f0fdf4', borderRadius:8, padding:'10px 12px', borderLeft:'3px solid #16a34a' }}>
                              <p style={{ margin:'0 0 3px', fontSize:10, fontWeight:700, color:'#065f46' }}>📋 কর্তৃপক্ষের উত্তর:</p>
                              <p style={{ margin:0, fontSize:12, color:'#065f46', lineHeight:1.5 }}>{c.admin_reply}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : complaintsLoaded ? (
                  <div style={{ textAlign:'center', padding:'32px 0' }}>
                    <p style={{ fontSize:36, margin:0 }}>🎉</p>
                    <p style={{ color:C.muted, fontSize:13, marginTop:8 }}>কোনো অভিযোগ নেই।</p>
                  </div>
                ) : null}
              </div>
            )}

            {/* ══ রিটার্ন ══ */}
            {activeTab === 'returns' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:14, padding:4, flex:1 }}>
                    {[{ id:'requests', label:'📋 আমার অনুরোধ' }, { id:'sr_records', label:'📦 SR রেকর্ড' }].map(st => (
                      <button key={st.id} onClick={() => setReturnSubTab(st.id)}
                        style={{ flex:1, padding:'7px 0', borderRadius:10, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', transition:'all 0.15s', background:returnSubTab===st.id ? 'white' : 'transparent', color:returnSubTab===st.id ? C.primary : '#64748b', boxShadow:returnSubTab===st.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                        {st.label}
                      </button>
                    ))}
                  </div>
                  {returnSubTab === 'requests' && (
                    <button onClick={() => setReturnFormOpen(true)}
                      style={{ background:`linear-gradient(135deg,${C.primary},#1e40af)`, border:'none', borderRadius:12, padding:'9px 14px', color:'white', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                      + নতুন
                    </button>
                  )}
                </div>

                {returnSubTab === 'requests' && (
                  <>
                    <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                      {[{ id:'all', label:'সব' }, { id:'pending', label:'⏳ অপেক্ষমাণ' }, { id:'approved', label:'✅ অনুমোদিত' }, { id:'rejected', label:'❌ বাতিল' }, { id:'completed', label:'✔ সম্পন্ন' }].map(f => (
                        <button key={f.id} onClick={() => { setReturnReqFilter(f.id); loadMyReturnReqs(1, f.id, true) }}
                          style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, background:returnReqFilter===f.id ? C.primary : '#f1f5f9', color:returnReqFilter===f.id ? 'white' : '#64748b' }}>
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {returnReqLoading && myReturnReqs.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'40px 0' }}>
                        <div style={{ width:28, height:28, border:'3px solid #e2e8f0', borderTopColor:C.primary, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }}/>
                        <p style={{ color:C.muted, fontSize:13 }}>লোড হচ্ছে...</p>
                      </div>
                    ) : myReturnReqs.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'40px 20px' }}>
                        <p style={{ fontSize:40, marginBottom:8 }}>↩️</p>
                        <p style={{ color:C.sec, fontSize:14, fontWeight:600 }}>কোনো ফেরত অনুরোধ নেই</p>
                      </div>
                    ) : (
                      <>
                        {myReturnReqs.map(r => {
                          let pi = []
                          try { pi = Array.isArray(r.items) ? r.items : JSON.parse(r.items || '[]') } catch {}
                          const SC2 = {
                            pending:   { bg:'#fef3c7', color:'#92400e', label:'⏳ অপেক্ষমাণ' },
                            approved:  { bg:'#dbeafe', color:'#1e40af', label:'✅ অনুমোদিত' },
                            rejected:  { bg:'#fee2e2', color:'#991b1b', label:'❌ বাতিল' },
                            completed: { bg:'#d1fae5', color:'#065f46', label:'✔ সম্পন্ন' },
                          }
                          const sc = SC2[r.status] || SC2.pending
                          return (
                            <div key={r.id} style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                              <div style={{ background:C.surface, padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                                <div>
                                  <p style={{ margin:0, fontSize:13, fontWeight:800, color:C.text }}>INV: {r.invoice_number}</p>
                                  <p style={{ margin:'3px 0 0', fontSize:11, color:C.sec }}>{r.type === 'replacement' ? '🔄 রিপ্লেসমেন্ট' : '↩️ পণ্য ফেরত'} • {fmtDate(r.created_at)}</p>
                                </div>
                                <span style={{ background:sc.bg, color:sc.color, fontSize:10, fontWeight:800, padding:'4px 10px', borderRadius:20, flexShrink:0 }}>{sc.label}</span>
                              </div>
                              <div style={{ padding:'10px 16px' }}>
                                {pi.slice(0,3).map((item,j) => (
                                  <div key={j} style={{ paddingBottom:6, marginBottom:6, borderBottom:j < Math.min(pi.length,3)-1 ? `1px solid ${C.surface}` : 'none' }}>
                                    <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.text }}>{item.product_name}</p>
                                    <p style={{ margin:'2px 0 0', fontSize:11, color:C.muted }}>পরিমাণ: {item.qty} • {item.reason}</p>
                                  </div>
                                ))}
                                {pi.length > 3 && <p style={{ margin:'2px 0 0', fontSize:11, color:C.muted }}>+{pi.length-3}টি আরো</p>}
                                {r.total_return_value > 0 && <p style={{ margin:'8px 0 0', fontSize:12, fontWeight:700, color:C.primary }}>আনুমানিক: ৳{fmtCur(r.total_return_value)}</p>}
                              </div>
                              {r.admin_note && (
                                <div style={{ margin:'0 12px 12px', background:r.status==='rejected' ? C.dL : '#f0fdf4', borderRadius:10, padding:'8px 12px' }}>
                                  <p style={{ margin:0, fontSize:11, color:r.status==='rejected' ? C.danger : '#16a34a', fontWeight:600 }}>💬 Admin: {r.admin_note}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {returnReqPage < returnReqTotalPages && (
                          <button onClick={() => loadMyReturnReqs(returnReqPage+1, returnReqFilter)} disabled={returnReqLoading}
                            style={{ width:'100%', padding:'12px 0', borderRadius:14, border:`1.5px solid ${C.pB}`, background:C.pL, fontSize:13, fontWeight:700, color:C.primary, cursor:returnReqLoading ? 'not-allowed' : 'pointer' }}>
                            {returnReqLoading ? 'লোড হচ্ছে...' : `আরো দেখুন (${returnReqTotal - myReturnReqs.length}টি বাকি)`}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                {returnSubTab === 'sr_records' && (
                  <>
                    {returns.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'40px 20px' }}>
                        <p style={{ fontSize:40, marginBottom:8 }}>📦</p>
                        <p style={{ color:C.sec, fontSize:14, fontWeight:600 }}>কোনো SR রেকর্ড নেই।</p>
                      </div>
                    ) : (
                      <>
                        <div style={{ background:C.wL, border:`1px solid ${C.wB}`, borderRadius:16, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                          <span style={{ fontSize:22 }}>ℹ️</span>
                          <p style={{ margin:0, fontSize:12, color:C.warning, fontWeight:500, lineHeight:1.6 }}>
                            SR কর্তৃক প্রদত্ত পণ্য বদল বা রিটার্নের রেকর্ড। মোট <strong>{returns.length}টি</strong> এন্ট্রি।
                          </p>
                        </div>
                        {returns.map((r,i) => {
                          const srItems = Array.isArray(r.replacement_items) ? r.replacement_items : []
                          return (
                            <div key={i} style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${C.wL}`, background:C.wL }}>
                                <div>
                                  <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#92400e' }}>INV: {r.invoice_number}</p>
                                  <p style={{ margin:'2px 0 0', fontSize:11, color:'#b45309' }}>{r.sr_name} • {fmtDate(r.created_at)}</p>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                  <p style={{ margin:0, fontSize:14, fontWeight:800, color:'#92400e' }}>৳{fmtCur(r.replacement_value)}</p>
                                  <p style={{ margin:0, fontSize:10, color:'#b45309' }}>পণ্যের মূল্য</p>
                                </div>
                              </div>
                              {srItems.length > 0 && (
                                <div style={{ padding:'8px 16px' }}>
                                  {srItems.map((item,j) => (
                                    <div key={j} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:j < srItems.length-1 ? `1px solid ${C.surface}` : 'none' }}>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <p style={{ margin:0, fontSize:12, fontWeight:600, color:C.text }}>{item.product_name}</p>
                                        <p style={{ margin:'1px 0 0', fontSize:11, color:C.muted }}>{item.qty} × ৳{fmtCur(item.unit_price)}{item.vat_rate > 0 ? ` (+${(item.vat_rate*100).toFixed(0)}% VAT)` : ''}</p>
                                      </div>
                                      <p style={{ margin:0, fontSize:12, fontWeight:700, color:C.text, marginLeft:8 }}>৳{fmtCur(item.total)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {parseFloat(r.credit_balance_added || 0) > 0 && (
                                <div style={{ margin:'0 12px 12px', background:C.sL, border:`1px solid ${C.sB}`, borderRadius:10, padding:'8px 12px', display:'flex', justifyContent:'space-between' }}>
                                  <p style={{ margin:0, fontSize:11, color:C.success, fontWeight:600 }}>💰 ক্রেডিট ব্যালেন্সে যোগ</p>
                                  <p style={{ margin:0, fontSize:11, fontWeight:800, color:C.success }}>+৳{fmtCur(r.credit_balance_added)}</p>
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

            {/* ══ AI চ্যাট ══ */}
            {activeTab === 'ai_chat' && (
              <div style={{ height:'calc(100vh - 220px)', minHeight:480, background:'linear-gradient(160deg,#0f172a 0%,#1e1b4b 100%)', borderRadius:'0 0 20px 20px', overflow:'hidden' }}>
                <CustomerAIChat />
              </div>
            )}

          </div>
        </div>

        {/* ── Statement Download ──────────────────────────────── */}
        <div style={{ background:C.card, borderRadius:20, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.05)', marginTop:14 }}>
          <button onClick={() => setStmtOpen(v => !v)}
            style={{ width:'100%', padding:'15px 18px', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:46, height:46, background:C.pL, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📄</div>
            <div style={{ flex:1, textAlign:'left' }}>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:C.text }}>Statement Download</p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:C.muted }}>পুরো হিসাবের PDF ডাউনলোড করুন</p>
            </div>
            <span style={{ fontSize:12, color:C.muted }}>{stmtOpen ? '▲' : '▼'}</span>
          </button>
          {stmtOpen && (
            <div style={{ borderTop:`1px solid ${C.border}`, padding:'14px 18px', background:C.surface, display:'flex', flexDirection:'column', gap:10 }}>
              <p style={{ margin:0, fontSize:10, fontWeight:700, color:C.sec, textTransform:'uppercase', letterSpacing:0.8 }}>তারিখ পরিসীমা (ঐচ্ছিক)</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[['তারিখ থেকে',stmtFrom,setStmtFrom],['তারিখ পর্যন্ত',stmtTo,setStmtTo]].map(([l,v,s]) => (
                  <div key={l}>
                    <p style={{ margin:'0 0 4px', fontSize:10, color:C.muted }}>{l}</p>
                    <input type="date" value={v} onChange={e => s(e.target.value)}
                      style={{ width:'100%', border:`1.5px solid ${C.border}`, borderRadius:10, padding:'8px 10px', fontSize:11, outline:'none', background:C.card, boxSizing:'border-box' }}/>
                  </div>
                ))}
              </div>
              <button onClick={downloadStatement} disabled={stmtLoading}
                style={{ width:'100%', padding:'13px 0', borderRadius:12, border:'none', background:stmtLoading ? '#94a3b8' : C.primary, color:'white', fontWeight:700, fontSize:13, cursor:stmtLoading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {stmtLoading
                  ? <><div style={{ width:16, height:16, border:'2px solid white', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> তৈরি হচ্ছে...</>
                  : <><span>⬇️</span> {stmtFrom || stmtTo ? 'নির্বাচিত সময়ের Statement' : 'সম্পূর্ণ Statement'} ডাউনলোড</>
                }
              </button>
              {((stmtFrom && !stmtTo) || (!stmtFrom && stmtTo)) && (
                <p style={{ margin:0, fontSize:11, color:C.warning, fontWeight:600 }}>
                  ⚠️ {stmtFrom && !stmtTo ? '"পর্যন্ত" তারিখটিও দিন।' : '"থেকে" তারিখটিও দিন।'}
                </p>
              )}
              {stmtFrom && stmtTo && stmtFrom > stmtTo && (
                <p style={{ margin:0, fontSize:11, color:C.danger, fontWeight:600 }}>⚠️ "থেকে" তারিখ "পর্যন্ত" তারিখের আগে হতে হবে।</p>
              )}
              <p style={{ margin:0, textAlign:'center', fontSize:11, color:C.muted }}>তারিখ না দিলে সব লেনদেনের Statement পাবেন</p>
            </div>
          )}
        </div>

        <p style={{ textAlign:'center', fontSize:10, color:'#c4cbd6', marginTop:24, lineHeight:1.7 }}>
          ZovoriX • কাস্টমার পোর্টাল<br/>
          <span style={{ fontSize:9 }}>তথ্য সংক্রান্ত সমস্যায় আপনার SR-এর সাথে যোগাযোগ করুন।</span>
        </p>
      </div>

      {/* ═══ TOAST ════════════════════════════════════════════════ */}
      {toast?.show && (
        <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', zIndex:9999, maxWidth:380, width:'calc(100% - 32px)', borderRadius:18, padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12, boxShadow:'0 8px 32px rgba(0,0,0,0.22)', background:toast.type==='success' ? '#064e3b' : toast.type==='warning' ? '#78350f' : '#7f1d1d' }}>
          <span style={{ fontSize:22, lineHeight:1, flexShrink:0, marginTop:1 }}>{toast.type==='success' ? '✅' : toast.type==='warning' ? '⚠️' : '❌'}</span>
          <p style={{ margin:0, fontSize:13, fontWeight:600, color:'white', lineHeight:1.55, flex:1 }}>{toast.message}</p>
        </div>
      )}

      {/* ═══ RETURN FORM BOTTOM SHEET ════════════════════════════ */}
      {returnFormOpen && (
        <div onClick={() => setReturnFormOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9998, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', animation:'slideUp 0.22s cubic-bezier(.4,0,.2,1)' }}>
            <div style={{ padding:'8px 20px 0', flexShrink:0 }}>
              <div style={{ width:40, height:4, borderRadius:2, background:'#d1d5db', margin:'10px auto 16px' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
                <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:C.text }}>↩️ পণ্য ফেরত অনুরোধ</h3>
                <button onClick={() => setReturnFormOpen(false)} style={{ background:C.surface, border:'none', borderRadius:10, padding:'6px 10px', cursor:'pointer', color:C.sec, fontSize:16 }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY:'auto', flex:1, padding:'16px 20px 32px' }}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.text, display:'block', marginBottom:6 }}>ইনভয়েস নম্বর *</label>
                <input type="text" value={returnInvoice} onChange={e => setReturnInvoice(e.target.value)} placeholder="যেমন: INV-2024-001"
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.text, display:'block', marginBottom:6 }}>অনুরোধের ধরন *</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{ id:'return', label:'↩️ পণ্য ফেরত' }, { id:'replacement', label:'🔄 রিপ্লেসমেন্ট' }].map(t => (
                    <button key={t.id} onClick={() => setReturnType(t.id)}
                      style={{ flex:1, padding:'10px 0', borderRadius:12, border:`2px solid ${returnType===t.id ? C.primary : C.border}`, background:returnType===t.id ? C.pL : 'white', fontSize:12, fontWeight:700, color:returnType===t.id ? C.primary : C.sec, cursor:'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:C.text }}>পণ্য তালিকা *</label>
                  <button onClick={() => setReturnItems(prev => [...prev, { product_name:'', qty:1, reason:'' }])}
                    style={{ background:C.pL, border:'none', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:C.primary, cursor:'pointer' }}>
                    + পণ্য যোগ
                  </button>
                </div>
                {(returnItems || []).map((item, idx) => (
                  <div key={idx} style={{ background:C.surface, borderRadius:14, padding:12, marginBottom:10, border:`1px solid ${C.border}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <p style={{ margin:0, fontSize:11, fontWeight:800, color:C.sec }}>পণ্য #{idx+1}</p>
                      {(returnItems || []).length > 1 && (
                        <button onClick={() => setReturnItems(prev => prev.filter((_,i) => i !== idx))}
                          style={{ background:C.dL, border:'none', borderRadius:6, padding:'2px 8px', fontSize:11, color:C.danger, cursor:'pointer', fontWeight:700 }}>বাদ</button>
                      )}
                    </div>
                    {[['text','পণ্যের নাম *','product_name'],['number','পরিমাণ *','qty'],['text','ফেরতের কারণ *','reason']].map(([type,ph,key]) => (
                      <input key={key} type={type} placeholder={ph} min={type==='number' ? 1 : undefined} value={item[key]}
                        onChange={e => setReturnItems(prev => prev.map((it,i) => i===idx ? {...it, [key]:e.target.value} : it))}
                        style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:12, marginBottom:6, outline:'none', boxSizing:'border-box', background:'white' }}/>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.text, display:'block', marginBottom:6 }}>অতিরিক্ত নোট (ঐচ্ছিক)</label>
                <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} placeholder="বিস্তারিত লিখুন..." rows={3}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:12, resize:'none', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
              </div>
              <button onClick={() => setShowReturnConfirm(true)} disabled={returnSubmitLoading}
                style={{ width:'100%', padding:'14px 0', borderRadius:14, border:'none', background:returnSubmitLoading ? '#94a3b8' : `linear-gradient(135deg,${C.primary},#1e40af)`, color:'white', fontSize:14, fontWeight:800, cursor:returnSubmitLoading ? 'not-allowed' : 'pointer', boxShadow:`0 4px 14px rgba(29,78,216,0.3)` }}>
                {returnSubmitLoading ? '⏳ পাঠানো হচ্ছে...' : '↩️ অনুরোধ পাঠান'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COMPLAINT CONFIRM ════════════════════════════════════ */}
      {showComplaintConfirm && (
        <div onClick={() => setShowComplaintConfirm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 32px' }}>
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 20px' }}/>
            <p style={{ margin:'0 0 8px', fontWeight:800, fontSize:16, color:C.text }}>📣 অভিযোগ পাঠাবেন?</p>
            <div style={{ background:C.dL, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <p style={{ margin:'0 0 4px', fontSize:12, color:C.sec, fontWeight:600 }}>বিষয়</p>
              <p style={{ margin:'0 0 8px', fontSize:13, color:C.text, fontWeight:700 }}>{cmpSubject}</p>
              <p style={{ margin:'0 0 4px', fontSize:12, color:C.sec, fontWeight:600 }}>বিবরণ</p>
              <p style={{ margin:0, fontSize:12, color:'#374151', lineHeight:1.5 }}>{cmpDesc}</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={() => setShowComplaintConfirm(false)} style={{ padding:14, borderRadius:14, border:`1.5px solid ${C.border}`, background:'white', color:C.text, fontWeight:700, fontSize:14, cursor:'pointer' }}>← সম্পাদনা</button>
              <button onClick={() => { setShowComplaintConfirm(false); submitComplaint() }} style={{ padding:14, borderRadius:14, border:'none', background:`linear-gradient(135deg,${C.danger},#b91c1c)`, color:'white', fontWeight:800, fontSize:14, cursor:'pointer' }}>📣 পাঠান</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREDIT CONFIRM ═══════════════════════════════════════ */}
      {showCreditConfirm && (
        <div onClick={() => setShowCreditConfirm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 32px' }}>
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 20px' }}/>
            <p style={{ margin:'0 0 8px', fontWeight:800, fontSize:16, color:C.text }}>💳 আবেদন নিশ্চিত করুন</p>
            <div style={{ background:C.pL, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:12, color:C.sec }}>বর্তমান লিমিট</span>
                <span style={{ fontSize:13, fontWeight:700, color:C.text }}>৳{(customer?.credit_limit||0).toLocaleString('bn-BD')}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:C.sec }}>আবেদনকৃত লিমিট</span>
                <span style={{ fontSize:15, fontWeight:800, color:C.primary }}>৳{(parseInt(creditReqAmt)||0).toLocaleString('bn-BD')}</span>
              </div>
            </div>
            <p style={{ margin:'0 0 16px', fontSize:12, color:C.muted, textAlign:'center' }}>অনুমোদনের জন্য কর্তৃপক্ষের কাছে পাঠানো হবে।</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={() => setShowCreditConfirm(false)} style={{ padding:14, borderRadius:14, border:`1.5px solid ${C.border}`, background:'white', color:C.text, fontWeight:700, fontSize:14, cursor:'pointer' }}>← ফিরে যান</button>
              <button onClick={() => { setShowCreditConfirm(false); submitCreditRequest() }} style={{ padding:14, borderRadius:14, border:'none', background:`linear-gradient(135deg,${C.primary},#4338ca)`, color:'white', fontWeight:800, fontSize:14, cursor:'pointer' }}>✅ নিশ্চিত করুন</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RETURN CONFIRM ═══════════════════════════════════════ */}
      {showReturnConfirm && (
        <div onClick={() => setShowReturnConfirm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, padding:'24px 20px 32px' }}>
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 20px' }}/>
            <p style={{ margin:'0 0 8px', fontWeight:800, fontSize:16, color:C.text }}>↩️ ফেরত অনুরোধ পাঠাবেন?</p>
            <div style={{ background:C.pL, borderRadius:12, padding:'12px 14px', marginBottom:6 }}>
              {(returnItems || []).filter(it => it.product_name).map((item,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:i<(returnItems.length-1)?8:0, marginBottom:i<(returnItems.length-1)?8:0, borderBottom:i<(returnItems.length-1)?`1px solid ${C.pB}`:'none' }}>
                  <span style={{ fontSize:13, color:'#374151', fontWeight:600 }}>{item.product_name}</span>
                  <span style={{ fontSize:13, color:C.primary, fontWeight:800, background:C.pB, borderRadius:8, padding:'2px 10px' }}>× {item.qty}</span>
                </div>
              ))}
            </div>
            {returnNote && (
              <div style={{ background:C.wL, borderRadius:10, padding:'8px 12px', marginBottom:6 }}>
                <p style={{ margin:0, fontSize:11, color:'#92400e' }}>📝 {returnNote}</p>
              </div>
            )}
            <p style={{ margin:'8px 0 16px', fontSize:12, color:C.muted, textAlign:'center' }}>একবার পাঠালে SR আসার আগে বাতিল করা যাবে না।</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={() => setShowReturnConfirm(false)} style={{ padding:14, borderRadius:14, border:`1.5px solid ${C.border}`, background:'white', color:C.text, fontWeight:700, fontSize:14, cursor:'pointer' }}>← ফিরে যান</button>
              <button onClick={() => { setShowReturnConfirm(false); submitReturnRequest() }} style={{ padding:14, borderRadius:14, border:'none', background:`linear-gradient(135deg,${C.primary},#1e40af)`, color:'white', fontWeight:800, fontSize:14, cursor:'pointer', boxShadow:`0 4px 14px rgba(29,78,216,0.3)` }}>↩️ নিশ্চিত করুন</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LOGOUT CONFIRM ═══════════════════════════════════════ */}
      {showLogoutConfirm && (
        <div onClick={() => setShowLogoutConfirm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'fadeIn 0.18s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'24px 24px 0 0', padding:'8px 20px 36px', width:'100%', maxWidth:480, animation:'slideUp 0.22s cubic-bezier(.4,0,.2,1)' }}>
            <div style={{ width:40, height:4, borderRadius:2, background:'#d1d5db', margin:'10px auto 20px' }}/>
            <div style={{ width:60, height:60, borderRadius:'50%', background:C.dL, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:28 }}>🚪</div>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:800, color:C.text, textAlign:'center' }}>লগআউট করবেন?</h3>
            <p style={{ margin:'0 0 24px', fontSize:13, color:C.sec, textAlign:'center', lineHeight:1.6 }}>
              {customer?.name
                ? <>{customer.name}-এর অ্যাকাউন্ট থেকে বের হয়ে যাবেন।</>
                : 'আপনি কি সত্যিই বের হয়ে যেতে চান?'}
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex:1, padding:14, borderRadius:14, border:`1.5px solid ${C.border}`, background:'white', fontSize:14, fontWeight:700, color:C.text, cursor:'pointer' }}>না, থাকুন</button>
              <button onClick={() => { setShowLogoutConfirm(false); onLogout() }} style={{ flex:1, padding:14, borderRadius:14, border:'none', background:`linear-gradient(135deg,${C.danger},#b91c1c)`, fontSize:14, fontWeight:700, color:'white', cursor:'pointer', boxShadow:'0 4px 12px rgba(220,38,38,0.35)' }}>হ্যাঁ, লগআউট</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
