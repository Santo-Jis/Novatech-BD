// frontend/src/pages/customer/CustomerDashboard.jsx
// CustomerPortal.jsx-এর dashboard অংশটা এখানে আলাদা component হিসেবে

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const portalFetch = async (path, jwt) => {
  const res  = await fetch(`${BACKEND}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Error')
  return data
}

const fmt = (n) => parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })

// JWT থেকে portal token পড়ো
function getPortalJWT() {
  const key = Object.keys(localStorage).find(k => k.startsWith('portal_jwt_'))
  return key ? localStorage.getItem(key) : null
}

export default function CustomerDashboard() {
  const navigate             = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    const jwt = getPortalJWT()
    if (!jwt) { navigate('/login', { replace: true }); return }

    portalFetch('/portal/dashboard', jwt)
      .then(data => { setDashboard(data.data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={() => navigate('/login', { replace: true })}
        className="mt-4 text-indigo-600 text-sm font-semibold">আবার লগইন করুন</button>
    </div>
  )

  if (!dashboard) return null

  const { customer, monthly_summary, total_summary } = dashboard

  return (
    <div className="p-4 space-y-4">

      {/* ── Customer Info Card ────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl p-5 text-white shadow-lg">
        <p className="text-indigo-200 text-xs mb-1">স্বাগতম</p>
        <h2 className="text-xl font-bold">{customer.shop_name}</h2>
        <p className="text-indigo-200 text-sm">{customer.owner_name}</p>
        <p className="text-indigo-300 text-xs mt-1">কোড: {customer.customer_code}</p>
      </div>

      {/* ── Balance Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">বর্তমান বাকি</p>
          <p className="text-base font-bold text-red-600">৳{fmt(customer.current_credit)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">ক্রেডিট লিমিট</p>
          <p className="text-base font-bold text-gray-700">৳{fmt(customer.credit_limit)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">জমা ব্যালেন্স</p>
          <p className="text-base font-bold text-green-600">৳{fmt(customer.credit_balance)}</p>
        </div>
      </div>

      {/* ── এই মাস ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">এই মাস</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'মোট কেনাকাটা',  value: `৳${fmt(monthly_summary.total_purchase)}`, color: 'text-gray-900' },
            { label: 'ইনভয়েস সংখ্যা', value: monthly_summary.total_invoices,           color: 'text-indigo-600' },
            { label: 'নগদ দিয়েছেন',   value: `৳${fmt(monthly_summary.total_cash)}`,    color: 'text-green-600' },
            { label: 'বাকি রেখেছেন',  value: `৳${fmt(monthly_summary.total_credit)}`,  color: 'text-red-500' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── সর্বমোট ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">সর্বমোট</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'মোট কেনাকাটা', value: `৳${fmt(total_summary.total_purchase)}`, color: 'text-gray-900' },
            { label: 'মোট ইনভয়েস',  value: total_summary.total_invoices,            color: 'text-indigo-600' },
            { label: 'মোট নগদ',      value: `৳${fmt(total_summary.total_cash)}`,     color: 'text-green-600' },
            { label: 'মোট বাকি',     value: `৳${fmt(total_summary.total_credit)}`,   color: 'text-red-500' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/customer/orders')}
          className="bg-indigo-600 text-white rounded-2xl p-4 flex items-center gap-3 shadow-md active:scale-95 transition-transform">
          <span className="text-2xl">🛒</span>
          <div className="text-left">
            <p className="font-bold text-sm">নতুন অর্ডার</p>
            <p className="text-indigo-200 text-xs">পণ্য অর্ডার করুন</p>
          </div>
        </button>
        <button onClick={() => navigate('/customer/invoices')}
          className="bg-white border border-gray-200 text-gray-700 rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-95 transition-transform">
          <span className="text-2xl">📄</span>
          <div className="text-left">
            <p className="font-bold text-sm">ইনভয়েস</p>
            <p className="text-gray-400 text-xs">ক্রয় ইতিহাস</p>
          </div>
        </button>
      </div>
    </div>
  )
}
