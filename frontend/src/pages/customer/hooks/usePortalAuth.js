// hooks/usePortalAuth.js
// Authentication, dashboard loading, notifications, push permission — সব এখানে
//
// ✅ NEW SYSTEM: Permanent Link (?c=customer_code)
//   - SR একবার permanent link পাঠায় — কখনো expire হয় না
//   - প্রথমবার: Google login → 30-day JWT localStorage-এ সেভ
//   - পরের বার: JWT valid থাকলে auto-login (Google লাগে না)
//   - 30 দিন পরে: JWT expire → Google দিয়ে আবার login

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { portalFetch, BACKEND } from '../utils/api'
import { getDeviceFingerprint, webGoogleLogin } from '../utils/fingerprint'
import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'
import {
  getStorageKey, storageGet, storageSet, storageRemove, storageKeys,
  getCustomerCode, setCustomerCode, isJWTValid
} from '../utils/helpers'

export function usePortalAuth(defaultTab = 'summary') {
  const [searchParams] = useSearchParams()

  // ✅ NEW: ?c=customer_code (permanent, কখনো expire হয় না)
  const customerCodeFromURL = searchParams.get('c')

  const [phase,       setPhase]       = useState('loading')
  const portalJWTRef  = useRef(null)
  const toastTimerRef = useRef(null)
  const [tokenInfo,   setTokenInfo]   = useState(null)
  const [portalJWT,   setPortalJWT]   = useState(null)
  const [dashboard,   setDashboard]   = useState(null)
  const [activeTab,   setActiveTab]   = useState(defaultTab)
  const [error,       setError]       = useState('')
  const [loggingIn,   setLoggingIn]   = useState(false)

  // ── Toast Notification ───────────────────────────────────────
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

  // ── Invoice Pagination State ────────────────────────────────
  const [invoices,          setInvoices]          = useState([])
  const [invoicePage,       setInvoicePage]       = useState(1)
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1)
  const [invoiceTotal,      setInvoiceTotal]      = useState(0)
  const [invoiceLoading,    setInvoiceLoading]    = useState(false)

  // ── Credit Limit Request State ──────────────────────────────
  const [creditReqOpen,    setCreditReqOpen]    = useState(false)
  const [creditReqAmt,     setCreditReqAmt]     = useState('')
  const [creditReqReason,  setCreditReqReason]  = useState('')
  const [creditReqLoading, setCreditReqLoading] = useState(false)
  const [myLimitReqs,      setMyLimitReqs]      = useState([])
  const [limitReqsLoaded,  setLimitReqsLoaded]  = useState(false)
  const [limitReqsLoading, setLimitReqsLoading] = useState(false)

  // ── Complaint State ─────────────────────────────────────────
  const [complaintOpen,    setComplaintOpen]    = useState(false)
  const [cmpType,          setCmpType]          = useState('complaint')
  const [cmpSubject,       setCmpSubject]       = useState('')
  const [cmpDesc,          setCmpDesc]          = useState('')
  const [cmpLoading,       setCmpLoading]       = useState(false)
  const [myComplaints,     setMyComplaints]     = useState([])
  const [complaintsLoaded, setComplaintsLoaded] = useState(false)
  const [complaintsLoading, setComplaintsLoading] = useState(false)

  // ── Invoice Filter State ────────────────────────────────────
  const [invoiceSearch,    setInvoiceSearch]    = useState('')
  const [invoicePayMethod, setInvoicePayMethod] = useState('')
  const [invoiceDateFrom,  setInvoiceDateFrom]  = useState('')
  const [invoiceDateTo,    setInvoiceDateTo]    = useState('')
  const [filterOpen,       setFilterOpen]       = useState(false)

  // ── Statement download state ────────────────────────────────
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtFrom,    setStmtFrom]    = useState('')
  const [stmtTo,      setStmtTo]      = useState('')
  const [stmtOpen,    setStmtOpen]    = useState(false)

  // ── Payment History State ────────────────────────────────────
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

  // ── Return Request State ─────────────────────────────────────
  const [myReturnReqs,        setMyReturnReqs]        = useState([])
  const [returnReqTotal,      setReturnReqTotal]      = useState(0)
  const [returnReqPage,       setReturnReqPage]       = useState(1)
  const [returnReqTotalPages, setReturnReqTotalPages] = useState(1)
  const [returnReqLoading,    setReturnReqLoading]    = useState(false)
  const [returnReqLoaded,     setReturnReqLoaded]     = useState(false)
  const [returnReqFilter,     setReturnReqFilter]     = useState('all')
  // Form state
  const [returnFormOpen,      setReturnFormOpen]      = useState(false)
  const [returnInvoice,       setReturnInvoice]       = useState('')
  const [returnType,          setReturnType]          = useState('return')
  const [returnItems,         setReturnItems]         = useState([{ product_name: '', qty: 1, reason: '' }])
  const [returnNote,          setReturnNote]          = useState('')
  const [returnSubmitLoading, setReturnSubmitLoading] = useState(false)

  // ── Helpers ─────────────────────────────────────────────────
  const loadNotifications = async (jwt) => {
    try {
      const data = await portalFetch('/portal/notifications', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      const notifs = data.data.notifications || []
      setNotifications(notifs)
      setUnreadCount(data.data.unread_count || 0)
      const newest = notifs.find(n => !n.is_read)
      if (newest) setUnreadBanner(newest)
    } catch (e) { console.error('Notification load error:', e) }
  }

  const markAllAsRead = async (jwt) => {
    try {
      await portalFetch('/portal/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      setUnreadBanner(null)
    } catch (e) { console.error(e) }
  }

  const markOneRead = async (notifId) => {
    const jwt = portalJWTRef.current || portalJWT
    if (!jwt) return
    try {
      await portalFetch(`/portal/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) { console.error('markOneRead error:', e) }
  }

  const requestPushPermission = async (jwt) => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      if (Notification.permission === 'denied') return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const swReg = await navigator.serviceWorker.ready
      const app = getApps().length > 0 ? getApps()[0] : initializeApp({
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      })
      const messaging = getMessaging(app)
      const fcmToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      })
      if (!fcmToken) return
      const cacheKey = 'portal_fcm_token'
      if (sessionStorage.getItem(cacheKey) === fcmToken) return
      await portalFetch('/portal/save-fcm-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ fcm_token: fcmToken }),
      })
      sessionStorage.setItem(cacheKey, fcmToken)
    } catch (e) { console.warn('[Portal FCM] Permission/token error:', e.message) }
  }

  const loadDashboard = async (jwt) => {
    try {
      const data = await portalFetch('/portal/dashboard', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setDashboard(data.data)
      const totalFromDashboard = data.data?.total_summary?.total_invoices
      if (totalFromDashboard) setInvoiceTotal(parseInt(totalFromDashboard))
      setPhase('dashboard')
      loadNotifications(jwt)
      requestPushPermission(jwt)
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Session শেষ হয়েছে। আবার লগইন করুন।')
      setPhase('login')
    }
  }

  // ── Paginated invoice loader ─────────────────────────────────
  const loadInvoices = async (jwt, page = 1, filters = {}) => {
    setInvoiceLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (filters.search)    params.set('search',         filters.search)
      if (filters.payMethod) params.set('payment_method', filters.payMethod)
      if (filters.dateFrom)  params.set('date_from',      filters.dateFrom)
      if (filters.dateTo)    params.set('date_to',        filters.dateTo)
      const data = await portalFetch(`/portal/invoices?${params}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      if (page === 1) setInvoices(data.data || [])
      else setInvoices(prev => [...prev, ...(data.data || [])])
      setInvoicePage(data.pagination?.page || page)
      setInvoiceTotalPages(data.pagination?.totalPages || 1)
      setInvoiceTotal(data.pagination?.total || 0)
    } catch (err) { console.error('Invoice load error:', err) }
    finally { setInvoiceLoading(false) }
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
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_amount: parseFloat(creditReqAmt), reason: creditReqReason }),
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
      const data = await portalFetch('/portal/credit-limit-request', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
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
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: cmpType, subject: cmpSubject.trim(), description: cmpDesc.trim() }),
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
      const data = await portalFetch('/portal/complaint', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setMyComplaints(data.data || [])
      setComplaintsLoaded(true)
    } catch {}
    finally { setComplaintsLoading(false) }
  }

  // ── Statement PDF download ───────────────────────────────────
  const downloadStatement = async () => {
    // ✅ FIX: Date validation — একটি তারিখ দিলে অন্যটিও দিতে হবে
    if (stmtFrom && !stmtTo) {
      return showToast('"পর্যন্ত" তারিখটিও দিন।', 'warning')
    }
    if (!stmtFrom && stmtTo) {
      return showToast('"থেকে" তারিখটিও দিন।', 'warning')
    }
    if (stmtFrom && stmtTo && stmtFrom > stmtTo) {
      return showToast('"থেকে" তারিখ "পর্যন্ত" তারিখের আগে হতে হবে।', 'warning')
    }
    setStmtLoading(true)
    try {
      const params = new URLSearchParams()
      if (stmtFrom) params.set('from', stmtFrom)
      if (stmtTo)   params.set('to',   stmtTo)
      const res = await fetch(`${BACKEND}/portal/statement?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
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

  // ── Invoice filter helpers ───────────────────────────────────
  const applyInvoiceFilter = () => {
    setInvoices([])
    setFilterOpen(false)
    loadInvoices(portalJWT, 1, {
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
    loadInvoices(portalJWT, 1, {})
  }

  // ── Payment History ──────────────────────────────────────────
  const loadPaymentHistory = async (jwt, page = 1, filters = {}) => {
    setPaymentLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filters.type)     params.set('type',      filters.type)
      if (filters.dateFrom) params.set('date_from', filters.dateFrom)
      if (filters.dateTo)   params.set('date_to',   filters.dateTo)
      const data = await portalFetch(`/portal/payment-history?${params}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      })
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
    loadPaymentHistory(portalJWTRef.current || portalJWT, 1, {
      type:     paymentTypeFilter,
      dateFrom: paymentDateFrom,
      dateTo:   paymentDateTo,
    })
  }

  const clearPaymentFilter = () => {
    setPaymentTypeFilter('')
    setPaymentDateFrom('')
    setPaymentDateTo('')
    setPaymentHistory([])
    setPaymentFilterOpen(false)
    loadPaymentHistory(portalJWTRef.current || portalJWT, 1, {})
  }

  // ── Return Requests ──────────────────────────────────────────
  const loadMyReturnReqs = async (page = 1, status = 'all', reset = false) => {
    const jwt = portalJWTRef.current || portalJWT
    if (!jwt) return
    setReturnReqLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 10 })
      if (status !== 'all') params.set('status', status)
      const data = await portalFetch(`/portal/return-requests?${params}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      const rows = data.data || []
      if (reset || page === 1) setMyReturnReqs(rows)
      else setMyReturnReqs(prev => [...prev, ...rows])
      setReturnReqPage(data.pagination?.page || page)
      setReturnReqTotalPages(data.pagination?.totalPages || 1)
      setReturnReqTotal(data.pagination?.total || 0)
      setReturnReqLoaded(true)
    } catch (e) { console.error('Return req load error:', e) }
    setReturnReqLoading(false)
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
      const jwt = portalJWTRef.current || portalJWT
      const data = await portalFetch('/portal/return-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_number: returnInvoice.trim(),
          type:           returnType,
          items:          validItems.map(i => ({
            product_name: i.product_name.trim(),
            qty:          parseInt(i.qty),
            reason:       i.reason.trim(),
          })),
          note: returnNote.trim() || undefined,
        })
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
    setReturnSubmitLoading(false)
  }

  // ── Tab change ───────────────────────────────────────────────
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'invoices' && invoices.length === 0 && !invoiceLoading) {
      loadInvoices(portalJWTRef.current || portalJWT, 1, {})
    }
    if (tabId === 'payments' && paymentHistory.length === 0 && !paymentLoading) {
      loadPaymentHistory(portalJWTRef.current || portalJWT, 1, {})
    }
    if (tabId === 'returns' && !returnReqLoaded && !returnReqLoading) {
      loadMyReturnReqs(1, 'all', true)
    }
  }

  // ── Logout ───────────────────────────────────────────────────
  // ✅ NEW: customer_code দিয়ে JWT সরানো হয়, customer_code রাখা হয়
  // যাতে পরের বার login স্ক্রিন সরাসরি আসে (link লাগবে না)
  const handleLogout = () => {
    const code = getCustomerCode()
    if (code) storageRemove(getStorageKey(code))
    storageRemove('portal_fcm_token')
    setPhase('welcome')
    setDashboard(null)
    setPortalJWT(null)
    portalJWTRef.current = null
  }

  // ── Google Login ─────────────────────────────────────────────
  // ✅ NEW: link_token লাগে না — customer_code + google_token দিয়ে /portal/direct-auth
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
      const customerCode = getCustomerCode()

      if (!customerCode) throw new Error('Customer code পাওয়া যায়নি। SR-এর লিংক থেকে প্রবেশ করুন।')

      // ✅ NEW: /portal/direct-auth — permanent link system
      const data = await portalFetch('/portal/direct-auth', {
        method: 'POST',
        body: JSON.stringify({
          google_token:  access_token,
          customer_code: customerCode,
          device_id:     deviceId,
        })
      })

      const jwtToken = data.data.portal_jwt
      // JWT localStorage-এ সেভ — customer_code দিয়ে key তৈরি
      storageSet(getStorageKey(customerCode), jwtToken)
      portalJWTRef.current = jwtToken
      setPortalJWT(jwtToken)
      await loadDashboard(jwtToken)
    } catch (err) {
      if (!err?.message?.includes('cancel') && !err?.message?.includes('dismissed')) {
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
      }
    } finally { setLoggingIn(false) }
  }

  // ── Init effect ──────────────────────────────────────────────
  // ✅ NEW SYSTEM: Permanent Link (?c=customer_code)
  //
  // Flow:
  //  1. URL-এ ?c=CODE → localStorage-এ সেভ করো
  //  2. localStorage-এ valid JWT আছে? → auto-login (dashboard)
  //  3. JWT নেই বা 30 দিন শেষ? → Google login screen
  useEffect(() => {
    const init = async () => {
      // ── Step 1: customer_code সংগ্রহ ──────────────────────
      // URL-এ থাকলে সেভ করো (permanent reference হিসেবে)
      if (customerCodeFromURL) {
        setCustomerCode(customerCodeFromURL)
      }

      const customerCode = customerCodeFromURL || getCustomerCode()

      if (!customerCode) {
        // কোনো customer_code নেই — SR-এর লিংক দরকার
        setError('লিংক পাওয়া যায়নি।')
        setPhase('invalid')
        return
      }

      // ── Step 2: Valid JWT আছে? → Auto-login ───────────────
      const jwtKey   = getStorageKey(customerCode)
      const savedJWT = storageGet(jwtKey)

      if (savedJWT && isJWTValid(savedJWT)) {
        // JWT valid এবং 30 দিনের মধ্যে → সরাসরি dashboard
        portalJWTRef.current = savedJWT
        setPortalJWT(savedJWT)
        await loadDashboard(savedJWT)
        return
      }

      // ── Step 3: JWT নেই বা Expired → Google Login ─────────
      if (savedJWT) {
        // Expired JWT সরিয়ে দাও
        storageRemove(jwtKey)
      }

      // Google login screen দেখাও
      setPhase('welcome')
    }
    init()
  }, [customerCodeFromURL])

  return {
    // phase & auth
    phase, tokenInfo, portalJWT, dashboard,
    activeTab, error, loggingIn,
    googleLogin, handleLogout, handleTabChange,
    // toast
    toast,
    // notifications
    notifications, unreadCount, showBell, setShowBell,
    unreadBanner, setUnreadBanner, markAllAsRead, markOneRead,
    // invoices
    invoices, invoicePage, invoiceTotalPages, invoiceTotal, invoiceLoading,
    invoiceSearch, setInvoiceSearch,
    invoicePayMethod, setInvoicePayMethod,
    invoiceDateFrom, setInvoiceDateFrom,
    invoiceDateTo, setInvoiceDateTo,
    filterOpen, setFilterOpen,
    loadInvoices, applyInvoiceFilter, clearInvoiceFilter,
    // credit
    creditReqOpen, setCreditReqOpen,
    creditReqAmt, setCreditReqAmt,
    creditReqReason, setCreditReqReason,
    creditReqLoading, myLimitReqs, limitReqsLoaded, limitReqsLoading,
    loadMyLimitReqs, submitCreditRequest,
    // complaints
    complaintOpen, setComplaintOpen,
    cmpType, setCmpType,
    cmpSubject, setCmpSubject,
    cmpDesc, setCmpDesc,
    cmpLoading, myComplaints, complaintsLoaded, complaintsLoading,
    loadMyComplaints, submitComplaint,
    // statement
    stmtOpen, setStmtOpen,
    stmtFrom, setStmtFrom,
    stmtTo, setStmtTo,
    stmtLoading, downloadStatement,
    // payment history
    paymentHistory, paymentPage, paymentTotalPages, paymentTotal, paymentLoading,
    paymentSummary,
    paymentTypeFilter, setPaymentTypeFilter,
    paymentDateFrom,   setPaymentDateFrom,
    paymentDateTo,     setPaymentDateTo,
    paymentFilterOpen, setPaymentFilterOpen,
    loadPaymentHistory, applyPaymentFilter, clearPaymentFilter,
    // return requests
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
