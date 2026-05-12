// frontend/src/pages/customer/CustomerPortal.jsx
// কাস্টমার পোর্টাল — WhatsApp লিংক → Google Login → Dashboard

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

// ── Google Identity Services (GSI) — redirect URI লাগে না ──
// Google এর নতুন recommended approach
const loadGSI = () => new Promise((resolve, reject) => {
  if (window.google?.accounts) { resolve(window.google.accounts); return }
  const script = document.createElement('script')
  script.src   = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = () => resolve(window.google.accounts)
  script.onerror = () => reject(new Error('Google login library load হয়নি।'))
  document.head.appendChild(script)
})

const webGoogleLogin = (clientId) => new Promise(async (resolve, reject) => {
  try {
    const accounts = await loadGSI()
    accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     'openid email profile',
      callback:  (response) => {
        if (response.error) {
          reject(new Error(response.error === 'access_denied'
            ? 'লগইন বাতিল করা হয়েছে।'
            : `Google error: ${response.error}`))
        } else {
          resolve(response.access_token)
        }
      },
    }).requestAccessToken()
  } catch (err) {
    reject(err)
  }
})

// ── Backend URL ───────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// ── axios ব্যবহার না করে সরাসরি fetch — interceptor bypass ──
const portalFetch = async (path, options = {}) => {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw { status: res.status, message: data.message || 'Error' }
  return data
}

// ── Helpers ───────────────────────────────────────────────────
const fmt     = (n) => parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Payment Badge ─────────────────────────────────────────────
const PayBadge = ({ method }) => {
  const map = {
    cash:        { label: 'নগদ',          color: 'bg-green-100 text-green-700' },
    credit:      { label: 'বাকি',          color: 'bg-red-100 text-red-700' },
    replacement: { label: 'রিপ্লেসমেন্ট', color: 'bg-blue-100 text-blue-700' },
  }
  const m = map[method] || { label: method, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>
}

// ── Order Status Badge ────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    pending:   { label: '⏳ অপেক্ষমাণ',  color: 'bg-yellow-100 text-yellow-700' },
    confirmed: { label: '✅ কনফার্ম',     color: 'bg-blue-100 text-blue-700' },
    assigned:  { label: '🚶 SR আসছে',    color: 'bg-purple-100 text-purple-700' },
    delivered: { label: '📦 সম্পন্ন',     color: 'bg-green-100 text-green-700' },
    cancelled: { label: '❌ বাতিল',       color: 'bg-red-100 text-red-700' },
  }
  const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
}

// ── Invoice Card ──────────────────────────────────────────────
function InvoiceCard({ sale }) {
  const [open, setOpen] = useState(false)
  const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <p className="text-xs text-gray-400">{fmtDate(sale.created_at)}</p>
          <p className="font-semibold text-gray-800 text-sm">{sale.invoice_number}</p>
          <p className="text-xs text-gray-400">SR: {sale.sr_name}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-900">৳{fmt(sale.net_amount)}</p>
          <PayBadge method={sale.payment_method} />
          <p className="text-xs mt-1 text-gray-400">{open ? '▲ বন্ধ করুন' : '▼ বিস্তারিত'}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                <span className="font-medium text-gray-900">৳{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>মোট</span><span>৳{fmt(sale.total_amount)}</span>
            </div>
            {parseFloat(sale.discount_amount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>ছাড়</span><span>- ৳{fmt(sale.discount_amount)}</span>
              </div>
            )}
            {parseFloat(sale.replacement_value) > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>রিপ্লেসমেন্ট</span><span>- ৳{fmt(sale.replacement_value)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>পরিশোধযোগ্য</span><span>৳{fmt(sale.net_amount)}</span>
            </div>
            {parseFloat(sale.cash_received) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>নগদ পেয়েছি</span><span>৳{fmt(sale.cash_received)}</span>
              </div>
            )}
            {parseFloat(sale.credit_used) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>বাকি রাখা হয়েছে</span><span>৳{fmt(sale.credit_used)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Order Request Tab ─────────────────────────────────────────
function OrderRequestTab({ portalJWT }) {
  const [phase,      setPhase]      = useState('list')
  const [products,   setProducts]   = useState([])
  const [requests,   setRequests]   = useState([])
  const [cart,       setCart]       = useState({})
  const [note,       setNote]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg,   setErrorMsg]   = useState('')

  const loadRequests = async () => {
    setLoading(true)
    try {
      const data = await portalFetch('/portal/order-requests', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setRequests(data.data || [])
    } catch { setErrorMsg('অর্ডার লিস্ট আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const data = await portalFetch('/portal/products', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setProducts(data.data || [])
    } catch { setErrorMsg('পণ্য তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRequests() }, [])
  useEffect(() => { if (phase === 'new' && products.length === 0) loadProducts() }, [phase])

  const cartCount = Object.values(cart).filter(q => q > 0).length

  const setQty = (productId, qty) => {
    setCart(prev => ({ ...prev, [productId]: Math.max(0, parseInt(qty) || 0) }))
  }

  const handleSubmit = async () => {
    const items = Object.entries(cart)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

    if (items.length === 0) { setErrorMsg('কমপক্ষে একটি পণ্য সিলেক্ট করুন।'); return }

    setErrorMsg('')

    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/order-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, note })
      })
      setCart({})
      setNote('')
      setSuccessMsg(
        res.has_pending_order
          ? '✅ অর্ডার পাঠানো হয়েছে। তবে আগের একটি অর্ডার এখনো pending আছে — SR শীঘ্রই আসবে। 🎉'
          : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে। 🎉'
      )
      setPhase('list')
      loadRequests()
    } catch (e) {
      setErrorMsg(e.message || 'অর্ডার পাঠাতে সমস্যা হয়েছে।')
    } finally { setSubmitting(false) }
  }

  // ── LIST VIEW ──────────────────────────────────────────────
  if (phase === 'list') return (
    <div className="space-y-4">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="flex-1 text-green-800 font-semibold text-sm">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="text-green-400 text-lg font-bold">✕</button>
        </div>
      )}

      <button
        onClick={() => { setPhase('new'); setErrorMsg('') }}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold
          py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg
          transition-all active:scale-95"
      >
        <span className="text-xl">🛒</span>
        নতুন অর্ডার রিকোয়েস্ট
      </button>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400 text-sm">এখনও কোনো অর্ডার রিকোয়েস্ট নেই।</p>
          <p className="text-gray-300 text-xs mt-1">উপরের বাটনে ক্লিক করে প্রথম অর্ডার দিন।</p>
        </div>
      ) : (
        requests.map(req => {
          const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
          return (
            <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{items.length}টি পণ্য</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
              <div className="space-y-1 mb-3">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-600">
                    <span>{item.product_name}</span>
                    <span className="font-medium">× {item.qty}</span>
                  </div>
                ))}
              </div>
              {req.assigned_sr_name && (
                <div className="bg-purple-50 rounded-xl px-3 py-2 text-xs text-purple-700">
                  🚶 SR: {req.assigned_sr_name}
                </div>
              )}
              {req.admin_note && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 mt-2">
                  📝 {req.admin_note}
                </div>
              )}
              {req.note && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-600 mt-2">
                  💬 আপনার নোট: {req.note}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  // ── NEW ORDER VIEW ─────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase('list'); setCart({}); setNote(''); setErrorMsg('') }}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 font-bold transition-colors"
        >
          ←
        </button>
        <div>
          <h3 className="font-bold text-gray-800">নতুন অর্ডার রিকোয়েস্ট</h3>
          <p className="text-xs text-gray-400">পণ্য বেছে পরিমাণ দিন</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 text-center">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(prod => {
            const qty = cart[prod.id] || 0
            return (
              <div key={prod.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                  ${qty > 0 ? 'border-indigo-300' : 'border-gray-100'}`}>

                {/* পণ্যের ছবি */}
                <div className={`relative w-full bg-gray-50 flex items-center justify-center
                  border-b ${qty > 0 ? 'border-indigo-100' : 'border-gray-100'}`}
                  style={{ height: '160px' }}>
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.name}
                      className="w-full h-full object-contain p-2"
                      style={{ maxHeight: '160px' }}
                      onError={e => {
                        e.target.style.display = 'none'
                        e.target.parentNode.querySelector('.img-fallback').style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`img-fallback w-full h-full items-center justify-center text-5xl
                    ${prod.image_url ? 'hidden' : 'flex'}`}>
                    📦
                  </div>
                  {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-md">
                      × {qty}
                    </div>
                  )}
                </div>

                <div className={`p-3 ${qty > 0 ? 'bg-indigo-50' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{prod.name}</p>
                      {/* চূড়ান্ত মূল্য (VAT + Tax সহ) */}
                      <p className="text-sm font-bold text-indigo-700 mt-0.5">
                        ৳{parseFloat(prod.final_price ?? prod.price).toLocaleString('bn-BD')}
                        <span className="text-xs font-normal text-gray-400 ml-1">/ {prod.unit || 'পিস'}</span>
                      </p>
                      {prod.has_extra && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prod.vat_amount > 0 && (
                            <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">
                              VAT ৳{parseFloat(prod.vat_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                          {prod.tax_amount > 0 && (
                            <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">
                              Tax ৳{parseFloat(prod.tax_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                        </div>
                      )}

                      {prod.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prod.description}</p>
                      )}
                    </div>
                  </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty(prod.id, qty - 1)}
                    disabled={qty === 0}
                    className="w-9 h-9 bg-gray-100 hover:bg-gray-200 disabled:opacity-30
                      rounded-xl font-bold text-gray-700 text-lg flex items-center justify-center transition-colors"
                  >−</button>
                  <input
                    type="number"
                    value={qty || ''}
                    onChange={e => setQty(prod.id, e.target.value)}
                    placeholder="০"
                    min="0"
                    className="flex-1 text-center border border-gray-200 rounded-xl py-2 text-sm font-semibold focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => setQty(prod.id, qty + 1)}
                    className="w-9 h-9 bg-indigo-100 hover:bg-indigo-200 rounded-xl
                      font-bold text-indigo-700 text-lg flex items-center justify-center transition-colors"
                  >+</button>
                </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cartCount > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">
            অতিরিক্ত নির্দেশনা (ঐচ্ছিক)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="যেমন: দ্রুত দরকার, বিকেলে আসুন..."
            rows={2}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={cartCount === 0 || submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
          text-white font-bold py-4 rounded-2xl flex items-center justify-center
          gap-2 shadow-lg transition-all active:scale-95"
      >
        {submitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            পাঠানো হচ্ছে...
          </>
        ) : (
          <>
            🛒 অর্ডার রিকোয়েস্ট পাঠান
            {cartCount > 0 && (
              <span className="bg-white text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {cartCount}টি পণ্য
              </span>
            )}
          </>
        )}
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function CustomerPortal({ defaultTab = 'summary' }) {
  const [searchParams] = useSearchParams()
  const portalToken    = searchParams.get('token')

  const [phase,       setPhase]       = useState('loading')
  const [tokenInfo,   setTokenInfo]   = useState(null)
  const [portalJWT,   setPortalJWT]   = useState(null)
  const [dashboard,   setDashboard]   = useState(null)
  const [activeTab,   setActiveTab]   = useState(defaultTab)
  const [error,       setError]       = useState('')
  const [loggingIn,   setLoggingIn]   = useState(false)
  const [notifications,  setNotifications]  = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showBell,       setShowBell]       = useState(false)
  const [unreadBanner,   setUnreadBanner]   = useState(null)

  // ── Invoice Pagination State ───────────────────────────────
  const [invoices,        setInvoices]        = useState([])
  const [invoicePage,     setInvoicePage]     = useState(1)
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1)
  const [invoiceTotal,    setInvoiceTotal]    = useState(0)
  const [invoiceLoading,  setInvoiceLoading]  = useState(false)

  const getStorageKey = (cid) => `portal_jwt_${cid}`

  const loadDashboard = async (jwt) => {
    try {
      const data = await portalFetch('/portal/dashboard', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setDashboard(data.data)
      setPhase('dashboard')
      loadNotifications(jwt)
      requestPushPermission(jwt)
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Session শেষ হয়েছে। আবার লগইন করুন।')
      setPhase('login')
    }
  }

  // ── Paginated invoice loader ───────────────────────────────
  const loadInvoices = async (jwt, page = 1) => {
    setInvoiceLoading(true)
    try {
      const data = await portalFetch(`/portal/invoices?page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      if (page === 1) {
        setInvoices(data.data || [])
      } else {
        setInvoices(prev => [...prev, ...(data.data || [])])
      }
      setInvoicePage(data.pagination?.page || page)
      setInvoiceTotalPages(data.pagination?.totalPages || 1)
      setInvoiceTotal(data.pagination?.total || 0)
    } catch (err) {
      console.error('Invoice load error:', err)
    } finally {
      setInvoiceLoading(false)
    }
  }

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
      if (localStorage.getItem(cacheKey) === fcmToken) return
      await portalFetch('/portal/save-fcm-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ fcm_token: fcmToken }),
      })
      localStorage.setItem(cacheKey, fcmToken)
    } catch (e) { console.warn('[Portal FCM] Permission/token error:', e.message) }
  }

  useEffect(() => {
    const init = async () => {
      if (portalToken) {
        try {
          const data = await portalFetch(`/portal/verify-token?token=${portalToken}`)
          const info = data.data
          setTokenInfo(info)
          const savedJWT = localStorage.getItem(getStorageKey(info.customer_id))
          if (savedJWT) {
            setPortalJWT(savedJWT)
            await loadDashboard(savedJWT)
          } else {
            setPhase('welcome')  // নতুন customer → আগে Welcome দেখাও
          }
        } catch (err) {
          setError(err.message || 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।')
          setPhase('invalid')
        }
        return
      }

      const allKeys = Object.keys(localStorage).filter(k => k.startsWith('portal_jwt_'))
      if (allKeys.length > 0) {
        const savedJWT = localStorage.getItem(allKeys[0])
        if (savedJWT) {
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

  const googleLogin = async () => {
    setLoggingIn(true)
    setError('')
    try {
      let access_token
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

      if (Capacitor.isNativePlatform()) {
        // APK — Capacitor Google Auth plugin ব্যবহার করো
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        await GoogleAuth.initialize({ clientId, scopes: ['profile', 'email'] })
        const googleUser = await GoogleAuth.signIn()
        access_token = googleUser.authentication.accessToken
      } else {
        // Web / PWA — popup দিয়ে OAuth token নাও
        if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID .env-এ সেট করা হয়নি।')
        access_token = await webGoogleLogin(clientId)
      }

      const data = await portalFetch('/portal/google-auth', {
        method: 'POST',
        body: JSON.stringify({
          google_token: access_token,
          portal_token: portalToken
        })
      })
      const jwt        = data.data.portal_jwt
      const customerId = data.data.customer?.id
      if (customerId) localStorage.setItem(getStorageKey(customerId), jwt)
      setPortalJWT(jwt)
      await loadDashboard(jwt)
    } catch (err) {
      if (!err?.message?.includes('cancel') && !err?.message?.includes('dismissed')) {
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
      }
    } finally { setLoggingIn(false) }
  }

  // ── RENDER: LOADING ───────────────────────────────────────
  if (phase === 'loading') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">লিংক যাচাই করা হচ্ছে...</p>
      </div>
    </div>
  )

  // ── RENDER: INVALID ───────────────────────────────────────
  if (phase === 'invalid') return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">লিংক অকার্যকর</h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400 mt-4">নতুন লিংকের জন্য আপনার SR-এর সাথে যোগাযোগ করুন।</p>
      </div>
    </div>
  )

  // ── RENDER: WELCOME ──────────────────────────────────────
  if (phase === 'welcome') return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)' }}>
      {/* Top wave decoration */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>

        {/* Logo */}
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <span style={{ color: 'white', fontSize: 36, fontWeight: 800, fontFamily: 'Georgia, serif' }}>N</span>
        </div>

        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: '0 0 6px', textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif" }}>
          NovaTech BD
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 32px', letterSpacing: 1 }}>
          কাস্টমার পোর্টাল
        </p>

        {/* Customer info card */}
        {tokenInfo && (
          <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '20px 24px', width: '100%', maxWidth: 360, marginBottom: 28, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, letterSpacing: 1 }}>আপনার দোকান</p>
            <p style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 4px', fontFamily: "'Hind Siliguri', sans-serif" }}>
              🏪 {tokenInfo.shop_name}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 8px' }}>{tokenInfo.owner_name}</p>
            <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '3px 12px', borderRadius: 20 }}>
              কোড: {tokenInfo.customer_code}
            </span>
          </div>
        )}

        {/* Features list */}
        <div style={{ width: '100%', maxWidth: 360, marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: '📊', title: 'হিসাবের সারসংক্ষেপ', desc: 'আপনার মোট কেনাকাটা ও বাকির তথ্য' },
            { icon: '📦', title: 'অর্ডার ট্র্যাকিং', desc: 'অর্ডার করুন ও স্ট্যাটাস দেখুন' },
            { icon: '🧾', title: 'ইনভয়েস ইতিহাস', desc: 'সকল ক্রয়ের বিবরণ একজায়গায়' },
          ].map(f => (
            <div key={f.icon} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <p style={{ color: 'white', fontSize: 13, fontWeight: 600, margin: 0, fontFamily: "'Hind Siliguri', sans-serif" }}>{f.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => setPhase('login')}
          style={{ width: '100%', maxWidth: 360, padding: '16px', borderRadius: 16, background: 'white', border: 'none', color: '#1e3a8a', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontFamily: "'Hind Siliguri', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'transform 0.15s' }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google দিয়ে প্রবেশ করুন
        </button>

        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          আপনার Gmail অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন
        </p>
      </div>

      {/* Bottom */}
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11, padding: '16px', letterSpacing: 0.5 }}>
        © {new Date().getFullYear()} NovaTech BD Ltd.
      </p>
    </div>
  )

  // ── RENDER: LOGIN ─────────────────────────────────────────
  if (phase === 'login') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">N</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">NovaTech BD</h1>
          <p className="text-xs text-gray-400 mt-1">কাস্টমার পোর্টাল</p>
        </div>

        {tokenInfo && (
          <div className="bg-indigo-50 rounded-2xl p-4 mb-6 text-center">
            <p className="text-xs text-indigo-400 mb-1">আপনার দোকান</p>
            <p className="font-bold text-indigo-800 text-lg">{tokenInfo.shop_name}</p>
            <p className="text-indigo-600 text-sm">{tokenInfo.owner_name}</p>
            <p className="text-xs text-indigo-400 mt-1">কোড: {tokenInfo.customer_code}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <button
          onClick={googleLogin}
          disabled={loggingIn}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200
            hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl py-4 px-6
            font-semibold text-gray-700 transition-all shadow-sm disabled:opacity-60"
        >
          {loggingIn ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loggingIn ? 'লগইন হচ্ছে...' : 'Google দিয়ে লগইন করুন'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          আপনার Gmail দিয়ে লগইন করলে আমরা আপনার ক্রয়তথ্য দেখাতে পারব।
        </p>
      </div>
    </div>
  )

  // ── RENDER: DASHBOARD ─────────────────────────────────────
  if (phase === 'dashboard' && dashboard) {
    const { customer, sales, credit_payments, monthly_summary, total_summary } = dashboard
    const tabs = [
      { id: 'summary',  label: 'সারসংক্ষেপ' },
      { id: 'orders',   label: '🛒 অর্ডার' },
      { id: 'invoices', label: `ইনভয়েস (${invoiceTotal || sales.length})` },
      { id: 'payments', label: `পরিশোধ (${credit_payments.length})` },
    ]

    // invoices ট্যাব প্রথমবার খুললে লোড করো
    const handleTabChange = (tabId) => {
      setActiveTab(tabId)
      if (tabId === 'invoices' && invoices.length === 0 && !invoiceLoading) {
        loadInvoices(portalJWT, 1)
      }
    }

    return (
      <div className="min-h-screen bg-gray-50">
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

              <button
                onClick={() => {
                  Object.keys(localStorage).filter(k => k.startsWith('portal_jwt_')).forEach(k => localStorage.removeItem(k))
                  setPhase('login'); setDashboard(null); setPortalJWT(null)
                }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', fontSize: 12, cursor: 'pointer' }}
              >
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
              <button
                onClick={() => { setUnreadBanner(null); markAllAsRead(portalJWT) }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
              >✕</button>
            </div>
          )}

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

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.id} onClick={() => handleTabChange(t.id)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors whitespace-nowrap px-2
                    ${activeTab === t.id
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* সারসংক্ষেপ */}
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">এই মাস</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'মোট কেনাকাটা', value: `৳${fmt(monthly_summary.total_purchase)}`, color: 'text-gray-900' },
                        { label: 'ইনভয়েস সংখ্যা', value: monthly_summary.total_invoices, color: 'text-indigo-600' },
                        { label: 'নগদ দিয়েছেন', value: `৳${fmt(monthly_summary.total_cash)}`, color: 'text-green-600' },
                        { label: 'বাকি রেখেছেন', value: `৳${fmt(monthly_summary.total_credit)}`, color: 'text-red-500' },
                      ].map((item, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">সর্বমোট</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'মোট কেনাকাটা', value: `৳${fmt(total_summary.total_purchase)}`, color: 'text-gray-900' },
                        { label: 'মোট ইনভয়েস', value: total_summary.total_invoices, color: 'text-indigo-600' },
                        { label: 'মোট নগদ', value: `৳${fmt(total_summary.total_cash)}`, color: 'text-green-600' },
                        { label: 'মোট বাকি', value: `৳${fmt(total_summary.total_credit)}`, color: 'text-red-500' },
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

              {/* অর্ডার ট্যাব (নতুন) */}
              {activeTab === 'orders' && (
                <OrderRequestTab portalJWT={portalJWT} />
              )}

              {/* ইনভয়েস — Paginated */}
              {activeTab === 'invoices' && (
                <div className="space-y-3">
                  {invoiceLoading && invoices.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />
                      ))}
                    </div>
                  ) : invoices.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">কোনো ইনভয়েস নেই।</p>
                  ) : (
                    <>
                      {invoices.map(sale => <InvoiceCard key={sale.invoice_number} sale={sale} />)}

                      {/* Load More */}
                      {invoicePage < invoiceTotalPages && (
                        <button
                          onClick={() => loadInvoices(portalJWT, invoicePage + 1)}
                          disabled={invoiceLoading}
                          className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50"
                        >
                          {invoiceLoading ? '⏳ লোড হচ্ছে...' : `আরো দেখুন (${invoices.length}/${invoiceTotal})`}
                        </button>
                      )}

                      {invoicePage >= invoiceTotalPages && invoices.length > 0 && (
                        <p className="text-center text-xs text-gray-400 py-2">
                          সব {invoiceTotal}টি ইনভয়েস দেখানো হয়েছে।
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* পরিশোধ */}
              {activeTab === 'payments' && (
                <div className="space-y-3">
                  {credit_payments.length === 0
                    ? <p className="text-center text-gray-400 text-sm py-8">কোনো পরিশোধ নেই।</p>
                    : credit_payments.map((p, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex justify-between items-start">
                        <div>
                          <p className="text-xs text-gray-400">{fmtDate(p.created_at)}</p>
                          <p className="text-sm font-semibold text-gray-700 mt-0.5">{p.collected_by} আদায় করেছেন</p>
                          {p.notes && <p className="text-xs text-gray-400 mt-1">{p.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600 text-lg">৳{fmt(p.amount)}</p>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">পরিশোধিত</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 pt-2">
            NovaTech BD • কাস্টমার পোর্টাল<br />
            তথ্য সংক্রান্ত সমস্যায় আপনার SR-এর সাথে যোগাযোগ করুন।
          </p>
        </div>
      </div>
    )
  }

  return null
}
