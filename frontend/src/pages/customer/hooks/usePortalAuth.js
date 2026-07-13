// hooks/usePortalAuth.js
// Authentication, dashboard loading, notifications, push permission — সব এখানে
//
// ✅ SECURITY FIX: JWT আর localStorage-এ নেই।
//
// ❌ আগের system:
//     Google login → 30d JWT → localStorage  (XSS-এ চুরি সম্ভব)
//     page refresh → localStorage থেকে JWT → auto-login
//
// ✅ নতুন system:
//     Google login → backend 15-min access JWT (memory) + 30-day refresh (HttpOnly cookie)
//     page refresh → /portal/refresh (cookie auto-পাঠায়) → নতুন access token
//     JS refresh token পড়তে পারে না — HttpOnly cookie

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { portalFetch, BACKEND } from '../utils/api'
import { getDeviceFingerprint, webGoogleLogin } from '../utils/fingerprint'
import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'
import { getCustomerCode, setCustomerCode } from '../utils/helpers'
import { portalTokenStore } from '../utils/portalTokenStore'

export function usePortalAuth(defaultTab = 'summary') {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const customerCodeFromURL = searchParams.get('c')  // SR link-এ থাকে, প্রথমবার login এ

  // ✅ নতুন সেলফ-রেজিস্ট্রেশনের পর CustomerSelfRegister.jsx navigate() করার সময়
  // state হিসেবে দোকানের নাম/মালিকের নাম/কোড পাঠায় — এখান থেকে Welcome স্ক্রিনে
  // "দোকান" কার্ড ও সফল-বার্তা দেখানো হয় (আগে tokenInfo কখনো set হতো না বলে
  // এই কার্ডটা কখনো দেখা যেত না — এটাই ছিল মূল বাগ)
  const regState      = location.state || {}
  const justRegistered = !!regState.justRegistered

  const [phase,       setPhase]       = useState('loading')
  const portalJWTRef  = useRef(null)   // stale closure এড়াতে (React state mirror)
  const toastTimerRef = useRef(null)
  const [tokenInfo,   setTokenInfo]   = useState(
    justRegistered
      ? { shop_name: regState.shopName, owner_name: regState.ownerName, customer_code: regState.customerCode }
      : null
  )
  const [portalJWT,   setPortalJWT]   = useState(null)
  const [dashboard,   setDashboard]   = useState(null)
  const [activeTab,   setActiveTab]   = useState(defaultTab)
  const [error,       setError]       = useState('')
  const [loggingIn,   setLoggingIn]   = useState(false)

  // ── Toast ───────────────────────────────────────────────────
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ show: true, message, type })
    toastTimerRef.current = setTimeout(
      () => setToast(t => ({ ...t, show: false })),
      3500
    )
  }

  // ── Notification state ──────────────────────────────────────
  const [notifications,  setNotifications]  = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showBell,       setShowBell]       = useState(false)
  const [unreadBanner,   setUnreadBanner]   = useState(null)

  // ── Invoice state ───────────────────────────────────────────
  const [invoices,          setInvoices]          = useState([])
  const [invoicePage,       setInvoicePage]       = useState(1)
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1)
  const [invoiceTotal,      setInvoiceTotal]      = useState(0)
  const [invoiceLoading,    setInvoiceLoading]    = useState(false)

  // ── Credit Limit Request state ──────────────────────────────
  const [creditReqOpen,    setCreditReqOpen]    = useState(false)
  const [creditReqAmt,     setCreditReqAmt]     = useState('')
  const [creditReqReason,  setCreditReqReason]  = useState('')
  const [creditReqLoading, setCreditReqLoading] = useState(false)
  const [myLimitReqs,      setMyLimitReqs]      = useState([])
  const [limitReqsLoaded,  setLimitReqsLoaded]  = useState(false)
  const [limitReqsLoading, setLimitReqsLoading] = useState(false)

  // ── Complaint state ─────────────────────────────────────────
  const [complaintOpen,     setComplaintOpen]     = useState(false)
  const [cmpType,           setCmpType]           = useState('complaint')
  const [cmpSubject,        setCmpSubject]        = useState('')
  const [cmpDesc,           setCmpDesc]           = useState('')
  const [cmpLoading,        setCmpLoading]        = useState(false)
  const [myComplaints,      setMyComplaints]      = useState([])
  const [complaintsLoaded,  setComplaintsLoaded]  = useState(false)
  const [complaintsLoading, setComplaintsLoading] = useState(false)

  // ── Invoice filter state ────────────────────────────────────
  const [invoiceSearch,    setInvoiceSearch]    = useState('')
  const [invoicePayMethod, setInvoicePayMethod] = useState('')
  const [invoiceDateFrom,  setInvoiceDateFrom]  = useState('')
  const [invoiceDateTo,    setInvoiceDateTo]    = useState('')
  const [filterOpen,       setFilterOpen]       = useState(false)

  // ── Statement state ─────────────────────────────────────────
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtFrom,    setStmtFrom]    = useState('')
  const [stmtTo,      setStmtTo]      = useState('')
  const [stmtOpen,    setStmtOpen]    = useState(false)

  // ── Payment History state ────────────────────────────────────
  const [paymentHistory,    setPaymentHistory]    = useState([])
  const [paymentPage,       setPaymentPage]       = useState(1)
  const [paymentTotalPages, setPaymentTotalPages] = useState(1)
  const [paymentTotal,      setPaymentTotal]      = useState(0)
  const [paymentLoading,    setPaymentLoading]    = useState(false)
  const [paymentSummary,    setPaymentSummary]    = useState(null)
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('')
  const [paymentDateFrom,   setPaymentDateFrom]   = useState('')
  const [paymentDateTo,     setPaymentDateTo]     = useState('')
  const [paymentFilterOpen, setPaymentFilterOpen] = useState(false)

  // ── Return Request state ─────────────────────────────────────
  const [myReturnReqs,        setMyReturnReqs]        = useState([])
  const [returnReqTotal,      setReturnReqTotal]      = useState(0)
  const [returnReqPage,       setReturnReqPage]       = useState(1)
  const [returnReqTotalPages, setReturnReqTotalPages] = useState(1)
  const [returnReqLoading,    setReturnReqLoading]    = useState(false)
  const [returnReqLoaded,     setReturnReqLoaded]     = useState(false)
  const [returnReqFilter,     setReturnReqFilter]     = useState('all')
  const [returnFormOpen,      setReturnFormOpen]      = useState(false)
  const [returnInvoice,       setReturnInvoice]       = useState('')
  const [returnType,          setReturnType]          = useState('return')
  const [returnItems,         setReturnItems]         = useState([{ product_name: '', qty: 1, reason: '' }])
  const [returnNote,          setReturnNote]          = useState('')
  const [returnSubmitLoading, setReturnSubmitLoading] = useState(false)

  // ── Notifications ────────────────────────────────────────────
  // jwt parameter সরানো হয়েছে — portalFetch auto-inject করে (portalTokenStore থেকে)
  const loadNotifications = async () => {
    try {
      const data   = await portalFetch('/portal/notifications')
      const notifs = data.data.notifications || []
      setNotifications(notifs)
      setUnreadCount(data.data.unread_count || 0)
      const newest = notifs.find(n => !n.is_read)
      if (newest) setUnreadBanner(newest)
    } catch (e) { console.error('Notification load error:', e) }
  }

  const markAllAsRead = async () => {
    try {
      await portalFetch('/portal/notifications/read-all', { method: 'PATCH' })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      setUnreadBanner(null)
    } catch (e) { console.error(e) }
  }

  const markOneRead = async (notifId) => {
    if (!portalTokenStore.get()) return
    try {
      await portalFetch(`/portal/notifications/${notifId}/read`, { method: 'PATCH' })
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) { console.error('markOneRead error:', e) }
  }

  // ── Push Permission ──────────────────────────────────────────
  const requestPushPermission = async () => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      if (Notification.permission === 'denied') return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const swReg = await navigator.serviceWorker.ready
      const app   = getApps().length > 0 ? getApps()[0] : initializeApp({
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      })
      const messaging = getMessaging(app)
      const fcmToken  = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      })
      if (!fcmToken) return
      const cacheKey = 'portal_fcm_token'
      if (sessionStorage.getItem(cacheKey) === fcmToken) return
      await portalFetch('/portal/save-fcm-token', {
        method: 'POST',
        body:   JSON.stringify({ fcm_token: fcmToken }),
      })
      sessionStorage.setItem(cacheKey, fcmToken)
    } catch (e) { console.warn('[Portal FCM] Permission/token error:', e.message) }
  }

  // ── Dashboard ────────────────────────────────────────────────
  const loadDashboard = async () => {
    try {
      const data = await portalFetch('/portal/dashboard')
      setDashboard(data.data)
      const totalFromDashboard = data.data?.total_summary?.total_invoices
      if (totalFromDashboard) setInvoiceTotal(parseInt(totalFromDashboard))
      setPhase('dashboard')
      loadNotifications()
      requestPushPermission()
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Session শেষ হয়েছে। আবার লগইন করুন।')
      setPhase('welcome')
    }
  }

  // ── Invoices ─────────────────────────────────────────────────
  const loadInvoices = async (page = 1, filters = {}) => {
    setInvoiceLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (filters.search)    params.set('search',         filters.search)
      if (filters.payMethod) params.set('payment_method', filters.payMethod)
      if (filters.dateFrom)  params.set('date_from',      filters.dateFrom)
      if (filters.dateTo)    params.set('date_to',        filters.dateTo)
      const data = await portalFetch(`/portal/invoices?${params}`)
      if (page === 1) setInvoices(data.data || [])
      else setInvoices(prev => [...prev, ...(data.data || [])])
      setInvoicePage(data.pagination?.page || page)
      setInvoiceTotalPages(data.pagination?.totalPages || 1)
      setInvoiceTotal(data.pagination?.total || 0)
    } catch (err) { console.error('Invoice load error:', err) }
    finally { setInvoiceLoading(false) }
  }

  const applyInvoiceFilter = () => {
    setInvoices([])
    setFilterOpen(false)
    loadInvoices(1, {
      search:    invoiceSearch,
      payMethod: invoicePayMethod,
      dateFrom:  invoiceDateFrom,
      dateTo:    invoiceDateTo,
    })
  }

  const clearInvoiceFilter = () => {
    setInvoiceSearch('')
    setInvoicePayMethod('')
    setInvoiceDateFrom('')
    setInvoiceDateTo('')
    setInvoices([])
    setFilterOpen(false)
    loadInvoices(1, {})
  }

  // ── Credit Limit Request ─────────────────────────────────────
  const submitCreditRequest = async () => {
    if (!creditReqAmt || isNaN(creditReqAmt) || parseFloat(creditReqAmt) <= 0) {
      return showToast('সঠিক পরিমাণ দিন।', 'warning')
    }
    setCreditReqLoading(true)
    try {
      await portalFetch('/portal/credit-limit-request', {
        method: 'POST',
        body:   JSON.stringify({ requested_amount: parseFloat(creditReqAmt), reason: creditReqReason }),
      })
      setCreditReqOpen(false)
      setCreditReqAmt('')
      setCreditReqReason('')
      setLimitReqsLoaded(false)
      showToast('আবেদন সফলভাবে জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।', 'success')
    } catch (e) { showToast(e.message || 'সমস্যা হয়েছে', 'error') }
    finally { setCreditReqLoading(false) }
  }

  const loadMyLimitReqs = async () => {
    if (limitReqsLoaded) return
    setLimitReqsLoading(true)
    try {
      const data = await portalFetch('/portal/credit-limit-request')
      setMyLimitReqs(data.data || [])
      setLimitReqsLoaded(true)
    } catch {}
    finally { setLimitReqsLoading(false) }
  }

  // ── Complaint ────────────────────────────────────────────────
  const submitComplaint = async () => {
    if (!cmpSubject.trim() || !cmpDesc.trim()) {
      return showToast('বিষয় এবং বিস্তারিত বিবরণ লিখুন।', 'warning')
    }
    setCmpLoading(true)
    try {
      await portalFetch('/portal/complaint', {
        method: 'POST',
        body:   JSON.stringify({ type: cmpType, subject: cmpSubject.trim(), description: cmpDesc.trim() }),
      })
      setComplaintOpen(false)
      setCmpSubject('')
      setCmpDesc('')
      setCmpType('complaint')
      setComplaintsLoaded(false)
      showToast('অভিযোগ/ফিডব্যাক গ্রহণ করা হয়েছে। শীঘ্রই সাড়া পাবেন।', 'success')
    } catch (e) { showToast(e.message || 'সমস্যা হয়েছে', 'error') }
    finally { setCmpLoading(false) }
  }

  const loadMyComplaints = async () => {
    if (complaintsLoaded) return
    setComplaintsLoading(true)
    try {
      const data = await portalFetch('/portal/complaint')
      setMyComplaints(data.data || [])
      setComplaintsLoaded(true)
    } catch {}
    finally { setComplaintsLoading(false) }
  }

  // ── Statement PDF download ───────────────────────────────────
  // raw fetch ব্যবহার করতে হয় (blob response) — portalFetch শুধু JSON করে
  const downloadStatement = async () => {
    if (stmtFrom && !stmtTo)
      return showToast('"পর্যন্ত" তারিখটিও দিন।', 'warning')
    if (!stmtFrom && stmtTo)
      return showToast('"থেকে" তারিখটিও দিন।', 'warning')
    if (stmtFrom && stmtTo && stmtFrom > stmtTo)
      return showToast('"থেকে" তারিখ "পর্যন্ত" তারিখের আগে হতে হবে।', 'warning')

    setStmtLoading(true)
    try {
      const params = new URLSearchParams()
      if (stmtFrom) params.set('from', stmtFrom)
      if (stmtTo)   params.set('to',   stmtTo)

      const doFetch = (token) =>
        fetch(`${BACKEND}/portal/statement?${params}`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        })

      let res = await doFetch(portalTokenStore.get())

      // 401 → একবার refresh করে retry
      if (res.status === 401) {
        const rr = await fetch(`${BACKEND}/portal/refresh`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!rr.ok) throw new Error('Session শেষ হয়েছে। পুনরায় লগইন করুন।')
        const rd = await rr.json()
        portalTokenStore.set(rd.data.portal_jwt, rd.data.expires_in || 900)
        res = await doFetch(portalTokenStore.get())
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Download failed')
      }

      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      const label = stmtFrom && stmtTo ? `${stmtFrom}_to_${stmtTo}` : 'full'
      a.download  = `statement_${label}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStmtOpen(false)
    } catch (e) { showToast('Statement ডাউনলোড ব্যর্থ: ' + e.message, 'error') }
    finally { setStmtLoading(false) }
  }

  // ── Payment History ──────────────────────────────────────────
  const loadPaymentHistory = async (page = 1, filters = {}) => {
    setPaymentLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filters.type)     params.set('type',      filters.type)
      if (filters.dateFrom) params.set('date_from', filters.dateFrom)
      if (filters.dateTo)   params.set('date_to',   filters.dateTo)
      const data = await portalFetch(`/portal/payment-history?${params}`)
      if (page === 1) setPaymentHistory(data.data || [])
      else setPaymentHistory(prev => [...prev, ...(data.data || [])])
      setPaymentPage(data.pagination?.page || page)
      setPaymentTotalPages(data.pagination?.totalPages || 1)
      setPaymentTotal(data.pagination?.total || 0)
      if (page === 1) setPaymentSummary(data.summary || null)
    } catch (err) { console.error('Payment history load error:', err) }
    finally { setPaymentLoading(false) }
  }

  const applyPaymentFilter = () => {
    setPaymentHistory([])
    setPaymentPage(1)
    setPaymentFilterOpen(false)
    loadPaymentHistory(1, { type: paymentTypeFilter, dateFrom: paymentDateFrom, dateTo: paymentDateTo })
  }

  const clearPaymentFilter = () => {
    setPaymentTypeFilter('')
    setPaymentDateFrom('')
    setPaymentDateTo('')
    setPaymentHistory([])
    setPaymentFilterOpen(false)
    loadPaymentHistory(1, {})
  }

  // ── Return Requests ──────────────────────────────────────────
  const loadMyReturnReqs = async (page = 1, status = 'all', reset = false) => {
    if (!portalTokenStore.get()) return
    setReturnReqLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 10 })
      if (status !== 'all') params.set('status', status)
      const data = await portalFetch(`/portal/return-requests?${params}`)
      const rows = data.data || []
      if (reset || page === 1) setMyReturnReqs(rows)
      else setMyReturnReqs(prev => [...prev, ...rows])
      setReturnReqPage(data.pagination?.page || page)
      setReturnReqTotalPages(data.pagination?.totalPages || 1)
      setReturnReqTotal(data.pagination?.total || 0)
      setReturnReqLoaded(true)
    } catch (e) { console.error('Return req load error:', e) }
    finally { setReturnReqLoading(false) }
  }

  const submitReturnRequest = async () => {
    if (!returnInvoice.trim()) return showToast('ইনভয়েস নম্বর দিন।', 'warning')
    const validItems = returnItems.filter(
      i => i.product_name.trim() && parseInt(i.qty) > 0 && i.reason.trim()
    )
    if (validItems.length === 0)
      return showToast('কমপক্ষে একটি পণ্যের নাম, পরিমাণ ও কারণ দিন।', 'warning')
    setReturnSubmitLoading(true)
    try {
      const data = await portalFetch('/portal/return-request', {
        method: 'POST',
        body:   JSON.stringify({
          invoice_number: returnInvoice.trim(),
          type:           returnType,
          items:          validItems.map(i => ({
            product_name: i.product_name.trim(),
            qty:          parseInt(i.qty),
            reason:       i.reason.trim(),
          })),
          note: returnNote.trim() || undefined,
        }),
      })
      showToast(data.message || 'অনুরোধ পাঠানো হয়েছে।', 'success')
      setReturnFormOpen(false)
      setReturnInvoice('')
      setReturnType('return')
      setReturnItems([{ product_name: '', qty: 1, reason: '' }])
      setReturnNote('')
      setReturnReqLoaded(false)
      setReturnReqFilter('all')
      loadMyReturnReqs(1, 'all', true)
    } catch (e) { showToast(e.message || 'সমস্যা হয়েছে।', 'error') }
    finally { setReturnSubmitLoading(false) }
  }

  // ── Tab change ───────────────────────────────────────────────
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'invoices' && invoices.length === 0 && !invoiceLoading)
      loadInvoices(1, {})
    if (tabId === 'payments' && paymentHistory.length === 0 && !paymentLoading)
      loadPaymentHistory(1, {})
    if (tabId === 'returns' && !returnReqLoaded && !returnReqLoading)
      loadMyReturnReqs(1, 'all', true)
  }

  // ── Logout ───────────────────────────────────────────────────
  // ✅ memory clear + backend HttpOnly cookie মুছে দেয়
  const handleLogout = async () => {
    portalTokenStore.clear()
    portalJWTRef.current = null
    setPortalJWT(null)
    setDashboard(null)
    setPhase('welcome')
    try {
      await fetch(`${BACKEND}/portal/logout`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
      })
    } catch { /* silent — local state already cleared */ }
  }

  // ── Google Login ─────────────────────────────────────────────
  const googleLogin = async () => {
    setLoggingIn(true)
    setError('')
    try {
      let access_token
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        await GoogleAuth.initialize({ clientId, scopes: ['profile', 'email'] })
        const googleUser = await GoogleAuth.signIn()
        access_token = googleUser.authentication.accessToken
      } else {
        if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID .env-এ সেট করা হয়নি।')
        access_token = await webGoogleLogin(clientId)
      }

      const deviceId     = await getDeviceFingerprint()
      const customerCode = getCustomerCode()  // প্রথমবার SR link থেকে save হওয়া code

      const data = await portalFetch('/portal/direct-auth', {
        method: 'POST',
        body:   JSON.stringify({
          google_token:  access_token,
          device_id:     deviceId,
          ...(customerCode ? { customer_code: customerCode } : {}),  // optional
        }),
      })

      // ✅ access token  → memory (15 মিনিট)
      // ✅ refresh token → HttpOnly cookie (backend set করেছে, JS জানে না)
      const { portal_jwt, expires_in = 900 } = data.data
      portalTokenStore.set(portal_jwt, expires_in)
      portalJWTRef.current = portal_jwt
      setPortalJWT(portal_jwt)
      await loadDashboard()

    } catch (err) {
      if (!err?.message?.includes('cancel') && !err?.message?.includes('dismissed'))
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
    } finally { setLoggingIn(false) }
  }

  // ── Init effect ──────────────────────────────────────────────
  //
  // ❌ আগের flow:
  //   1. localStorage থেকে JWT পড়ো
  //   2. Valid? → auto-login
  //   3. না? → Google login screen
  //
  // ✅ নতুন flow:
  //   1. পুরনো localStorage JWT সরিয়ে দাও (migration cleanup)
  //   2. POST /portal/refresh → browser HttpOnly cookie auto-পাঠায়
  //   3. সফল? → নতুন access token memory-তে → dashboard
  //   4. ব্যর্থ (cookie নেই/মেয়াদোত্তীর্ণ)? → Google login screen
  useEffect(() => {
    const init = async () => {

      // 🧹 Migration: পুরনো localStorage JWT সরিয়ে দাও
      Object.keys(localStorage)
        .filter(k => k.startsWith('portal_jwt_'))
        .forEach(k => localStorage.removeItem(k))

      // ✅ SR link-এ customer_code থাকলে save করো (প্রথমবার login এর জন্য)
      if (customerCodeFromURL) setCustomerCode(customerCodeFromURL)

      // HttpOnly cookie দিয়ে silent re-auth চেষ্টা করো
      // সফল হলে → dashboard, ব্যর্থ হলে → Google login screen
      // ❌ আগের মতো invalid phase নেই — customer_code ছাড়াও login screen দেখাবে
      try {
        const data = await portalFetch('/portal/refresh', { method: 'POST' })
        const { portal_jwt, expires_in = 900 } = data.data
        portalTokenStore.set(portal_jwt, expires_in)
        portalJWTRef.current = portal_jwt
        setPortalJWT(portal_jwt)
        await loadDashboard()
      } catch {
        // Cookie নেই বা মেয়াদোত্তীর্ণ → Google login screen
        setPhase('welcome')
      }
    }
    init()
  }, [customerCodeFromURL])

  return {
    phase, tokenInfo, justRegistered, portalJWT, dashboard,
    activeTab, error, loggingIn,
    googleLogin, handleLogout, handleTabChange,
    toast,
    notifications, unreadCount, showBell, setShowBell,
    unreadBanner, setUnreadBanner, markAllAsRead, markOneRead,
    invoices, invoicePage, invoiceTotalPages, invoiceTotal, invoiceLoading,
    invoiceSearch, setInvoiceSearch,
    invoicePayMethod, setInvoicePayMethod,
    invoiceDateFrom, setInvoiceDateFrom,
    invoiceDateTo, setInvoiceDateTo,
    filterOpen, setFilterOpen,
    loadInvoices, applyInvoiceFilter, clearInvoiceFilter,
    creditReqOpen, setCreditReqOpen,
    creditReqAmt, setCreditReqAmt,
    creditReqReason, setCreditReqReason,
    creditReqLoading, myLimitReqs, limitReqsLoaded, limitReqsLoading,
    loadMyLimitReqs, submitCreditRequest,
    complaintOpen, setComplaintOpen,
    cmpType, setCmpType,
    cmpSubject, setCmpSubject,
    cmpDesc, setCmpDesc,
    cmpLoading, myComplaints, complaintsLoaded, complaintsLoading,
    loadMyComplaints, submitComplaint,
    stmtOpen, setStmtOpen,
    stmtFrom, setStmtFrom,
    stmtTo, setStmtTo,
    stmtLoading, downloadStatement,
    paymentHistory, paymentPage, paymentTotalPages, paymentTotal, paymentLoading,
    paymentSummary,
    paymentTypeFilter, setPaymentTypeFilter,
    paymentDateFrom,   setPaymentDateFrom,
    paymentDateTo,     setPaymentDateTo,
    paymentFilterOpen, setPaymentFilterOpen,
    loadPaymentHistory, applyPaymentFilter, clearPaymentFilter,
    myReturnReqs, returnReqTotal, returnReqPage, returnReqTotalPages,
    returnReqLoading, returnReqLoaded,
    returnReqFilter, setReturnReqFilter,
    returnFormOpen,  setReturnFormOpen,
    returnInvoice,   setReturnInvoice,
    returnType,      setReturnType,
    returnItems,     setReturnItems,
    returnNote,      setReturnNote,
    returnSubmitLoading,
    loadMyReturnReqs, submitReturnRequest,
  }
}
