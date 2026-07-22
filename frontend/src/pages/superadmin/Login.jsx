import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FiKey, FiLoader, FiShield } from 'react-icons/fi'
import { useSuperAdminAuthStore } from './store/superAdminAuth.store'

export default function SuperAdminLogin() {
  const [secretKey, setSecretKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useSuperAdminAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/superadmin/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!secretKey.trim()) {
      setError('Secret key দিন।')
      return
    }

    setLoading(true)
    try {
      await login(secretKey.trim())
      navigate(from, { replace: true })
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Key ভুল। SUPER_ADMIN_SECRET_KEY আবার চেক করুন।'
          : (err.response?.data?.message || 'সংযোগ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-pf-bg-base font-pf-body flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-pf-primary-900 text-red-400 flex items-center justify-center mb-4">
            <FiShield className="text-xl" />
          </div>
          <h1 className="font-pf-head font-semibold text-2xl text-pf-primary-700">ZovoriX Super Admin</h1>
          <p className="text-pf-text-secondary text-sm mt-1">শুধু platform owner-এর জন্য</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 space-y-4 shadow-sm"
        >
          {error && (
            <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">
              Super Admin Secret Key
            </label>
            <div className="relative">
              <FiKey className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                autoComplete="off"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm font-pf-mono
                  focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
                placeholder="••••••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-pf-primary-900 text-white font-semibold
              text-sm py-2.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition-all"
          >
            {loading ? <FiLoader className="animate-spin" /> : null}
            {loading ? 'যাচাই হচ্ছে...' : 'প্রবেশ করুন'}
          </button>

          <p className="text-[11px] text-pf-text-muted text-center pt-1">
            এই key শুধু এই ডিভাইসের ব্রাউজার ট্যাবে (sessionStorage) রাখা হবে, ট্যাব বন্ধ করলে মুছে যাবে।
          </p>
        </form>
      </div>
    </div>
  )
}
