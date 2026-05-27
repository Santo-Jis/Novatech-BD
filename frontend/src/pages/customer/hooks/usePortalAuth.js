// hooks/usePortalAuth.js
// Authentication, dashboard loading, notifications, push permission — সব এখানে

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { portalFetch, BACKEND } from '../utils/api'
import { getDeviceFingerprint, webGoogleLogin } from '../utils/fingerprint'
import {
  getStorageKey, storageGet, storageSet, storageRemove, storageKeys
} from '../utils/helpers'

export function usePortalAuth(defaultTab = 'summary') {
  const [searchParams] = useSearchParams()
  const portalToken    = searchParams.get('token')

  const [phase,       setPhase]       = useState('loading')
  const portalJWTRef = useRef(null)  // BUG FIX: stale closure এড়াতে latest JWT ref
  const [tokenInfo,   setTokenInfo]   = useState(null)
  const [portalJWT,   setPortalJWT]   = useState(null)
  const [dashboard,   setDashboard]   = useState(null)
  const [activeTab,   setActiveTab]   = useState(defaultTab)
  const [error,       setError]       = useState('')
  const [loggingIn,   setLoggingIn]   = useState(false)

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

  // ── Complaint State ─────────────────────────────────────────
  const [complaintOpen,    setComplaintOpen]    = useState(false)
  const [cmpType,          setCmpType]          = useState('complaint')
  const [cmpSubject,       setCmpSubject]       = useState('')
  const [cmpDesc,          setCmpDesc]          = useState('')
  const [cmpLoading,       setCmpLoading]       = useState(false)
  const [myComplaints,     setMyComplaints]     = useState([])
  const [complaintsLoaded, setComplaintsLoaded] = useState(false)

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

  const requestPushPermission = async (jwt) => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      if (Notification.permission === 'denied') return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const swReg = await navigator.serviceWorker.ready
      const { initializeApp, getApps } = await import('firebase/app')
      const { getMessaging, getToken }  = await import('firebase/messaging')
      const firebaseConfig = {
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      }
      const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
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
      return alert('সঠিক পরিমাণ দিন।')
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
      alert('✅ আবেদন সফলভাবে জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।')
    } catch (e) { alert('❌ ' + (e.message || 'সমস্যা হয়েছে')) }
    finally { setCreditReqLoading(false) }
  }

  const loadMyLimitReqs = async () => {
    if (limitReqsLoaded) return
    try {
      const data = await portalFetch('/portal/credit-limit-request', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setMyLimitReqs(data.data || [])
      setLimitReqsLoaded(true)
    } catch {}
  }

  // ── Complaint ────────────────────────────────────────────────
  const submitComplaint = async () => {
    if (!cmpSubject.trim() || !cmpDesc.trim()) {
      return alert('বিষয় এবং বিস্তারিত বিবরণ লিখুন।')
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
      alert('✅ আপনার অভিযোগ/ফিডব্যাক গ্রহণ করা হয়েছে। শীঘ্রই সাড়া পাবেন।')
    } catch (e) { alert('❌ ' + (e.message || 'সমস্যা হয়েছে')) }
    finally { setCmpLoading(false) }
  }

  const loadMyComplaints = async () => {
    if (complaintsLoaded) return
    try {
      const data = await portalFetch('/portal/complaint', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setMyComplaints(data.data || [])
      setComplaintsLoaded(true)
    } catch {}
  }

  // ── Statement PDF download ───────────────────────────────────
  const downloadStatement = async () => {
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
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const label = stmtFrom && stmtTo ? `${stmtFrom}_to_${stmtTo}` : 'full'
      a.download = `statement_${label}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStmtOpen(false)
    } catch (e) { alert('Statement ডাউনলোড ব্যর্থ: ' + e.message) }
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

  // ── Tab change ───────────────────────────────────────────────
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'invoices' && invoices.length === 0 && !invoiceLoading) {
      // BUG FIX: portalJWTRef.current ব্যবহার — stale closure এড়াতে
      loadInvoices(portalJWTRef.current || portalJWT, 1, {})
    }
  }

  // ── Logout ───────────────────────────────────────────────────
  const handleLogout = () => {
    storageKeys().forEach(k => storageRemove(k))
    storageRemove('portal_fcm_token')
    setPhase('login')
    setDashboard(null)
    setPortalJWT(null)
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

      const deviceId = await getDeviceFingerprint()
      const data = await portalFetch('/portal/google-auth', {
        method: 'POST',
        body: JSON.stringify({
          google_token: access_token,
          portal_token: portalToken,
          device_id:    deviceId,
        })
      })
      const jwt        = data.data.portal_jwt
      const customerId = data.data.customer?.id
      if (customerId) storageSet(getStorageKey(customerId), jwt)
      portalJWTRef.current = jwt
      setPortalJWT(jwt)
      await loadDashboard(jwt)
    } catch (err) {
      if (!err?.message?.includes('cancel') && !err?.message?.includes('dismissed')) {
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
      }
    } finally { setLoggingIn(false) }
  }

  // ── Init effect ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const deviceId = await getDeviceFingerprint()

      if (portalToken) {
        try {
          const data = await portalFetch(
            `/portal/verify-token?token=${portalToken}&device_id=${encodeURIComponent(deviceId)}`
          )
          const info = data.data
          setTokenInfo(info)

          if (info.can_skip_google) {
            try {
              const loginData = await portalFetch('/portal/device-login', {
                method: 'POST',
                body: JSON.stringify({ portal_token: portalToken, device_id: deviceId })
              })
              const jwt        = loginData.data.portal_jwt
              const customerId = loginData.data.customer?.id
              if (customerId) storageSet(getStorageKey(customerId), jwt)
              setPortalJWT(jwt)
              await loadDashboard(jwt)
            } catch {
              setPhase('login')
            }
            return
          }

          const savedJWT = storageGet(getStorageKey(info.customer_id))
          if (savedJWT) {
            setPortalJWT(savedJWT)
            await loadDashboard(savedJWT)
          } else {
            setPhase('welcome')
          }
        } catch (err) {
          if (err.status === 403) {
            setError(err.message || 'এই লিংক অন্য ডিভাইসে lock করা আছে।')
          } else {
            setError(err.message || 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।')
          }
          setPhase('invalid')
        }
        return
      }

      // URL-এ token নেই → sessionStorage চেক
      const allKeys = storageKeys()
      if (allKeys.length > 0) {
        const savedJWT = storageGet(allKeys[0])
        if (savedJWT) {
          portalJWTRef.current = savedJWT
          setPortalJWT(savedJWT)
          await loadDashboard(savedJWT)
          return
        }
      }

      setError('লিংক পাওয়া যায়নি।')
      setPhase('invalid')
    }
    init()
  }, [portalToken])

  return {
    // phase & auth
    phase, tokenInfo, portalJWT, dashboard,
    activeTab, error, loggingIn,
    googleLogin, handleLogout, handleTabChange,
    // notifications
    notifications, unreadCount, showBell, setShowBell,
    unreadBanner, setUnreadBanner, markAllAsRead,
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
    creditReqLoading, myLimitReqs, limitReqsLoaded,
    loadMyLimitReqs, submitCreditRequest,
    // complaints
    complaintOpen, setComplaintOpen,
    cmpType, setCmpType,
    cmpSubject, setCmpSubject,
    cmpDesc, setCmpDesc,
    cmpLoading, myComplaints, complaintsLoaded,
    loadMyComplaints, submitComplaint,
    // statement
    stmtOpen, setStmtOpen,
    stmtFrom, setStmtFrom,
    stmtTo, setStmtTo,
    stmtLoading, downloadStatement,
  }
}
