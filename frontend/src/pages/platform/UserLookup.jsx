import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiSearch, FiUnlock, FiKey, FiLoader, FiCheckCircle } from 'react-icons/fi'
import platformApi from './api/platformApi'
import StatusBadge from './components/StatusBadge'
import { EmptyState, ErrorState } from './components/PanelStates'

export default function UserLookup() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [actionState, setActionState] = useState({}) // { [userId]: { unblocking, resetting, unblockedAt, resetAt } }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setError('')
    setResults(null)
    try {
      const res = await platformApi.get('/support/users/search', { params: { q: q.trim() } })
      setResults(res.data.data)
    } catch (err) {
      if (err.response?.status === 404) setResults([])
      else if (!err._toastShown) setError('সার্চ করা যায়নি।')
    } finally {
      setSearching(false)
    }
  }

  const setUserAction = (id, patch) =>
    setActionState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handleUnblock = async (user) => {
    setUserAction(user.id, { unblocking: true })
    try {
      const res = await platformApi.post(`/support/users/${user.id}/unblock`)
      toast.success(res.data.message || 'ব্লক সরানো হয়েছে।')
      setUserAction(user.id, { unblocking: false, unblockedAt: Date.now() })
      setResults((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_blocked: false } : u)))
    } catch (err) {
      setUserAction(user.id, { unblocking: false })
      if (!err._toastShown) toast.error('ব্লক সরানো যায়নি।')
    }
  }

  const handleResetLink = async (user) => {
    setUserAction(user.id, { resetting: true })
    try {
      const res = await platformApi.post(`/support/users/${user.id}/reset-password-link`)
      toast.success(res.data.message || 'Reset link পাঠানো হয়েছে।')
      setUserAction(user.id, { resetting: false, resetAt: Date.now() })
    } catch (err) {
      setUserAction(user.id, { resetting: false })
      if (!err._toastShown) toast.error('Reset link পাঠানো যায়নি।')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">ইউজার লুকআপ</h1>
        <p className="text-pf-text-secondary text-sm mt-1">ফোন বা ইমেইল দিয়ে খুঁজে ব্লক সরান বা পাসওয়ার্ড রিসেট পাঠান</p>
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

      {results && results.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো ইউজার পাওয়া যায়নি" description="phone/email বানান চেক করে আবার চেষ্টা করুন।" />
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((u) => {
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
                        Redis Blocked
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
                    onClick={() => handleResetLink(u)}
                    disabled={!u.email || act.resetting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-pf-border
                      text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!u.email ? 'এই ইউজারের ইমেইল নেই' : undefined}
                  >
                    {act.resetting ? <FiLoader className="animate-spin" /> : <FiKey />}
                    Password Reset Link পাঠান
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
      )}
    </div>
  )
}
