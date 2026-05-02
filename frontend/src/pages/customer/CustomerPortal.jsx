// frontend/src/pages/customer/CustomerPortal.jsx
// কাস্টমার পোর্টাল — WhatsApp লিংক → Google Login → Dashboard

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'

// ── Backend URL ───────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// ── axio ব্যবহার না করে সরাসরি fetch — interceptor bypass ────
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
const fmt = (n) => parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })
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

// ── Main Component ────────────────────────────────────────────
export default function CustomerPortal() {
  const [searchParams] = useSearchParams()
  const portalToken    = searchParams.get('token')

  const [phase, setPhase]       = useState('loading')
  const [tokenInfo, setTokenInfo] = useState(null)
  const [portalJWT, setPortalJWT] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [error, setError]         = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const getStorageKey = (cid) => `portal_jwt_${cid}`

  // ── Dashboard লোড — সরাসরি fetch, axios interceptor bypass ──
  const loadDashboard = async (jwt) => {
    try {
      const data = await portalFetch('/portal/dashboard', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setDashboard(data.data)
      setPhase('dashboard')
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Session শেষ হয়েছে। আবার লগইন করুন।')
      setPhase('login')
    }
  }

  // ── Mount ─────────────────────────────────────────────────
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
            setPhase('login')
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

  // ── Google Login ──────────────────────────────────────────
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoggingIn(true)
      try {
        const data = await portalFetch('/portal/google-auth', {
          method: 'POST',
          body: JSON.stringify({
            google_token: tokenResponse.access_token,
            portal_token: portalToken
          })
        })

        const jwt        = data.data.portal_jwt
        const customerId = data.data.customer?.id

        if (customerId) {
          localStorage.setItem(getStorageKey(customerId), jwt)
        }

        setPortalJWT(jwt)
        await loadDashboard(jwt)
      } catch (err) {
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
      } finally {
        setLoggingIn(false)
      }
    },
    onError: () => {
      setError('Google লগইন ব্যর্থ হয়েছে।')
      setLoggingIn(false)
    }
  })

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
          onClick={() => { setError(''); googleLogin() }}
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
      { id: 'invoices', label: `ইনভয়েস (${sales.length})` },
      { id: 'payments', label: `পরিশোধ (${credit_payments.length})` },
    ]

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-5 pt-10 pb-16">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-indigo-200 text-xs mb-1">কাস্টমার পোর্টাল</p>
              <h1 className="text-xl font-bold">{customer.shop_name}</h1>
              <p className="text-indigo-200 text-sm">{customer.owner_name} • {customer.customer_code}</p>
            </div>
            <button
              onClick={() => {
                Object.keys(localStorage)
                  .filter(k => k.startsWith('portal_jwt_'))
                  .forEach(k => localStorage.removeItem(k))
                setPhase('login')
                setDashboard(null)
                setPortalJWT(null)
              }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', fontSize: 12, cursor: 'pointer' }}
            >
              লগআউট
            </button>
          </div>
        </div>

        <div className="px-4 -mt-10 space-y-4 pb-10">
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
            <div className="flex border-b border-gray-100">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors
                    ${activeTab === t.id
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
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

              {activeTab === 'invoices' && (
                <div className="space-y-3">
                  {sales.length === 0
                    ? <p className="text-center text-gray-400 text-sm py-8">কোনো ইনভয়েস নেই।</p>
                    : sales.map(sale => <InvoiceCard key={sale.invoice_number} sale={sale} />)
                  }
                </div>
              )}

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
