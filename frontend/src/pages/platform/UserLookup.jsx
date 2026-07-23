import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiSearch, FiUnlock, FiKey, FiLoader, FiCheckCircle,
  FiMail as FiMailIcon, FiSmartphone, FiUser, FiShoppingBag, FiFileText, FiChevronDown, FiChevronUp, FiLifeBuoy,
} from 'react-icons/fi'
import platformApi from './api/platformApi'
import StatusBadge from './components/StatusBadge'
import { EmptyState, ErrorState } from './components/PanelStates'

export default function UserLookup() {
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [staffResults, setStaffResults] = useState(null)
  const [customerResults, setCustomerResults] = useState(null)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [actionState, setActionState] = useState({}) // { [id]: { ...flags } }

  const runSearch = useCallback(async (query) => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    setStaffResults(null)
    setCustomerResults(null)

    const [staffRes, custRes] = await Promise.allSettled([
      platformApi.get('/support/users/search', { params: { q: query.trim() } }),
      platformApi.get('/support/customers/search', { params: { q: query.trim() } }),
    ])

    if (staffRes.status === 'fulfilled') setStaffResults(staffRes.value.data.data)
    else if (staffRes.reason?.response?.status === 404) setStaffResults([])
    else if (!staffRes.reason?._toastShown) setError((e) => e || 'স্টাফ সার্চ করা যায়নি।')

    if (custRes.status === 'fulfilled') setCustomerResults(custRes.value.data.data)
    else if (custRes.reason?.response?.status === 404) setCustomerResults([])
    else if (!custRes.reason?._toastShown) setError((e) => e || 'কাস্টমার সার্চ করা যায়নি।')

    setSearching(false)
  }, [])

  // ?q=... দিয়ে ডিপ-লিংক করা হলে (যেমন Global Search থেকে) অটো-সার্চ
  useEffect(() => {
    const initialQ = searchParams.get('q')
    if (initialQ) runSearch(initialQ)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e) => {
    e.preventDefault()
    runSearch(q)
  }

  const setAction = (id, patch) =>
    setActionState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  // ── Staff actions ──────────────────────────────────────────
  const handleUnblock = async (user) => {
    setAction(user.id, { unblocking: true })
    try {
      const res = await platformApi.post(`/support/users/${user.id}/unblock`)
      toast.success(res.data.message || 'ব্লক সরানো হয়েছে।')
      setAction(user.id, { unblocking: false, unblockedAt: Date.now() })
      setStaffResults((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_blocked: false } : u)))
    } catch (err) {
      setAction(user.id, { unblocking: false })
      if (!err._toastShown) toast.error('ব্লক সরানো যায়নি।')
    }
  }

  const handleResetLink = async (user, channel) => {
    setAction(user.id, { resetting: channel })
    try {
      const res = await platformApi.post(`/support/users/${user.id}/reset-password-link`, { channel })
      toast.success(res.data.message || 'OTP পাঠানো হয়েছে।')
      setAction(user.id, { resetting: false, resetAt: Date.now() })
    } catch (err) {
      setAction(user.id, { resetting: false })
      if (!err._toastShown) toast.error(err.response?.data?.message || 'পাঠানো যায়নি।')
    }
  }

  // ── Customer (রিটেইলার) actions ────────────────────────────
  const handleReactivate = async (cust) => {
    setAction(cust.id, { reactivating: true })
    try {
      const res = await platformApi.post(`/support/customers/${cust.id}/reactivate`)
      toast.success(res.data.message || 'Reactivate করা হয়েছে।')
      setAction(cust.id, { reactivating: false, reactivatedAt: Date.now() })
      setCustomerResults((prev) => prev.map((c) => (c.id === cust.id ? { ...c, is_active: true } : c)))
    } catch (err) {
      setAction(cust.id, { reactivating: false })
      if (!err._toastShown) toast.error('Reactivate করা যায়নি।')
    }
  }

  const handleClearGmailLock = async (cust) => {
    setAction(cust.id, { clearingLock: true })
    try {
      const res = await platformApi.post(`/support/customers/${cust.id}/clear-gmail-lock`)
      toast.success(res.data.message || 'Gmail lock ক্লিয়ার হয়েছে।')
      setAction(cust.id, { clearingLock: false, lockClearedAt: Date.now() })
      setCustomerResults((prev) => prev.map((c) => (c.id === cust.id ? { ...c, bound_email: null, google_email: null } : c)))
    } catch (err) {
      setAction(cust.id, { clearingLock: false })
      if (!err._toastShown) toast.error('Gmail lock ক্লিয়ার করা যায়নি।')
    }
  }

  const handleRevokeDevices = async (cust) => {
    setAction(cust.id, { revoking: true })
    try {
      const res = await platformApi.post(`/support/customers/${cust.id}/revoke-devices`)
      toast.success(res.data.message || 'ডিভাইস revoke করা হয়েছে।')
      setAction(cust.id, { revoking: false, revokedAt: Date.now() })
    } catch (err) {
      setAction(cust.id, { revoking: false })
      if (!err._toastShown) toast.error('Revoke করা যায়নি।')
    }
  }

  const toggleInvoices = async (cust) => {
    const current = actionState[cust.id] || {}
    if (current.invoicesOpen) {
      setAction(cust.id, { invoicesOpen: false })
      return
    }
    if (current.invoices) {
      setAction(cust.id, { invoicesOpen: true })
      return
    }
    setAction(cust.id, { loadingInvoices: true, invoicesOpen: true })
    try {
      const res = await platformApi.get(`/support/customers/${cust.id}/invoices`, { params: { limit: 8 } })
      setAction(cust.id, { loadingInvoices: false, invoices: res.data.data })
    } catch (err) {
      setAction(cust.id, { loadingInvoices: false, invoicesOpen: false })
      if (!err._toastShown) toast.error('কেনাকাটার ইতিহাস লোড করা যায়নি।')
    }
  }

  const noResults =
    staffResults && customerResults && staffResults.length === 0 && customerResults.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">ইউজার লুকআপ</h1>
        <p className="text-pf-text-secondary text-sm mt-1">ফোন বা ইমেইল দিয়ে স্টাফ ও রিটেইলার — দুই ধরনের অ্যাকাউন্টই একসাথে খুঁজুন</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="phone বা email লিখুন"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
              focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
        >
          {searching && <FiLoader className="animate-spin" />}
          খুঁজুন
        </button>
      </form>

      {error && <ErrorState description={error} onRetry={handleSearch} />}

      {noResults && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো অ্যাকাউন্ট পাওয়া যায়নি" description="phone/email বানান চেক করে আবার চেষ্টা করুন।" />
        </div>
      )}

      {/* ── স্টাফ/কর্মী ── */}
      {staffResults && staffResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-pf-text-muted uppercase tracking-wide">
            <FiUser /> স্টাফ / কর্মী
          </div>
          <div className="space-y-3">
            {staffResults.map((u) => {
              const act = actionState[u.id] || {}
              return (
                <div key={u.id} className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-pf-text-primary">{u.name_bn || u.name_en}</p>
                      <p className="text-xs text-pf-text-muted">
                        {u.company_name || 'কোনো টেন্যান্ট নেই'} · {u.role}
                      </p>
                      <p className="text-xs text-pf-text-muted font-pf-mono mt-0.5">{u.email || u.phone}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={u.status} />
                      {u.is_blocked && (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pf-error-bg text-pf-error">
                          Blocked
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-pf-border">
                    <button
                      onClick={() => handleUnblock(u)}
                      disabled={!u.is_blocked || act.unblocking}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {act.unblocking ? <FiLoader className="animate-spin" /> : <FiUnlock />}
                      {u.is_blocked ? 'Unblock করুন' : 'ব্লক নেই'}
                    </button>

                    <button
                      onClick={() => handleResetLink(u, 'email')}
                      disabled={!u.email || !!act.resetting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!u.email ? 'এই ইউজারের ইমেইল নেই' : undefined}
                    >
                      {act.resetting === 'email' ? <FiLoader className="animate-spin" /> : <FiKey />}
                      Email এ OTP
                    </button>

                    <button
                      onClick={() => handleResetLink(u, 'sms')}
                      disabled={!u.phone || !!act.resetting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!u.phone ? 'এই ইউজারের ফোন নম্বর নেই' : undefined}
                    >
                      {act.resetting === 'sms' ? <FiLoader className="animate-spin" /> : <FiKey />}
                      SMS এ OTP
                    </button>

                    {(act.unblockedAt || act.resetAt) && (
                      <span className="flex items-center gap-1 text-xs text-pf-success">
                        <FiCheckCircle /> লগ করা হয়েছে ✓
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── রিটেইলার/কাস্টমার ── */}
      {customerResults && customerResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-pf-text-muted uppercase tracking-wide">
            <FiShoppingBag /> রিটেইলার / কাস্টমার
          </div>
          <div className="space-y-3">
            {customerResults.map((c) => {
              const act = actionState[c.id] || {}
              const hasGmailLock = !!(c.bound_email || c.google_email)
              return (
                <div key={c.id} className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-pf-text-primary">{c.shop_name}</p>
                      <p className="text-xs text-pf-text-muted">
                        {c.company_name || 'কোনো টেন্যান্ট নেই'} · {c.owner_name}
                      </p>
                      <p className="text-xs text-pf-text-muted font-pf-mono mt-0.5">
                        {c.whatsapp || c.sms_phone || c.email || '—'}
                      </p>
                      {hasGmailLock && (
                        <p className="text-xs text-pf-text-muted mt-1 flex items-center gap-1">
                          <FiMailIcon className="text-pf-accent-600" /> লক করা: {c.bound_email || c.google_email}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={c.is_active ? 'active' : 'suspended'} label={c.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-pf-border">
                    <button
                      onClick={() => handleReactivate(c)}
                      disabled={c.is_active || act.reactivating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {act.reactivating ? <FiLoader className="animate-spin" /> : <FiUnlock />}
                      {c.is_active ? 'ইতিমধ্যে সক্রিয়' : 'Reactivate করুন'}
                    </button>

                    <button
                      onClick={() => handleClearGmailLock(c)}
                      disabled={!hasGmailLock || act.clearingLock}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!hasGmailLock ? 'কোনো Gmail lock নেই' : undefined}
                    >
                      {act.clearingLock ? <FiLoader className="animate-spin" /> : <FiMailIcon />}
                      Gmail Lock ক্লিয়ার
                    </button>

                    <button
                      onClick={() => handleRevokeDevices(c)}
                      disabled={act.revoking}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {act.revoking ? <FiLoader className="animate-spin" /> : <FiSmartphone />}
                      সব ডিভাইস Revoke
                    </button>

                    <button
                      onClick={() => toggleInvoices(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500"
                    >
                      {act.loadingInvoices ? <FiLoader className="animate-spin" /> : <FiFileText />}
                      কেনাকাটার ইতিহাস
                      {act.invoicesOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </button>

                    <Link
                      to={`/platform/tickets?new=1&customer_id=${c.id}&tenant_id=${c.tenant_id || ''}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                        text-pf-text-primary hover:border-pf-primary-500"
                    >
                      <FiLifeBuoy /> টিকেট তৈরি করুন
                    </Link>

                    {(act.reactivatedAt || act.lockClearedAt || act.revokedAt) && (
                      <span className="flex items-center gap-1 text-xs text-pf-success">
                        <FiCheckCircle /> লগ করা হয়েছে ✓
                      </span>
                    )}
                  </div>

                  {act.invoicesOpen && !act.loadingInvoices && (
                    <div className="mt-3 pt-3 border-t border-pf-border">
                      {(!act.invoices || act.invoices.length === 0) ? (
                        <p className="text-xs text-pf-text-muted">কোনো ইনভয়েস পাওয়া যায়নি।</p>
                      ) : (
                        <div className="space-y-2">
                          {act.invoices.map((inv) => (
                            <div key={inv.invoice_number} className="flex items-center justify-between text-xs bg-pf-bg-alt rounded-lg px-3 py-2">
                              <div className="min-w-0">
                                <p className="font-medium text-pf-text-primary font-pf-mono">{inv.invoice_number}</p>
                                <p className="text-pf-text-muted">{new Date(inv.created_at).toLocaleDateString('bn-BD')} · {inv.sr_name}</p>
                              </div>
                              <p className="font-pf-mono font-semibold text-pf-primary-700 flex-shrink-0">
                                ৳{Number(inv.net_amount).toLocaleString('bn-BD')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
