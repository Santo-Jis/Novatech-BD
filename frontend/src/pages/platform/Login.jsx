import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FiMail, FiLock, FiLoader, FiShield, FiKey, FiArrowLeft } from 'react-icons/fi'
import { usePlatformAuthStore } from './store/platformAuth.store'

export default function PlatformLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── 2FA ধাপ ২ state ──
  const [pendingToken, setPendingToken] = useState(null)
  const [code, setCode] = useState('')

  const login = usePlatformAuthStore((s) => s.login)
  const completeTwoFactor = usePlatformAuthStore((s) => s.completeTwoFactor)
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/platform/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('email ও password দুটোই দিন।')
      return
    }

    setLoading(true)
    try {
      const result = await login(email.trim(), password)
      if (result.requires2FA) {
        setPendingToken(result.pendingToken)
      } else {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err.response?.data?.message || 'লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('কোড দিন।')
      return
    }
    setLoading(true)
    try {
      await completeTwoFactor(pendingToken, code.trim())
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'ভুল কোড। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-pf-bg-base font-pf-body flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-pf-primary-900 text-pf-accent-300 flex items-center justify-center mb-4">
            <FiShield className="text-xl" />
          </div>
          <h1 className="font-pf-head font-semibold text-2xl text-pf-primary-700">ZovoriX Platform</h1>
          <p className="text-pf-text-secondary text-sm mt-1">Support &amp; Admin Panel</p>
        </div>

        {!pendingToken ? (
          <form
            onSubmit={handleSubmit}
            className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 space-y-4 shadow-sm"
          >
            {error && (
              <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
                    focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
                  placeholder="you@novatechbd.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
                    focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-pf-primary-700 text-white font-semibold
                text-sm py-2.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition-all"
            >
              {loading ? <FiLoader className="animate-spin" /> : null}
              {loading ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
            </button>

            <p className="text-[11px] text-pf-text-muted text-center pt-1">
              সেশন নিরাপত্তার জন্য ১৫ মিনিট পর আবার লগইন করতে হবে।
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyCode}
            className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 space-y-4 shadow-sm"
          >
            {error && (
              <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>
            )}

            <div className="text-center">
              <FiKey className="text-2xl text-pf-primary-700 mx-auto mb-2" />
              <p className="text-sm text-pf-text-secondary">
                আপনার Authenticator app থেকে ৬-সংখ্যার কোড দিন
              </p>
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                className="w-full px-3 py-3 rounded-lg border border-pf-border bg-pf-bg-surface text-center text-2xl font-pf-mono tracking-[0.3em]
                  focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
                placeholder="000000"
              />
              <p className="text-[11px] text-pf-text-muted text-center mt-2">
                ফোন হারিয়ে গেলে recovery code-ও এখানে দিতে পারবেন
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-pf-primary-700 text-white font-semibold
                text-sm py-2.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition-all"
            >
              {loading ? <FiLoader className="animate-spin" /> : null}
              {loading ? 'যাচাই হচ্ছে...' : 'যাচাই করুন'}
            </button>

            <button
              type="button"
              onClick={() => { setPendingToken(null); setCode(''); setError('') }}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-pf-text-muted hover:text-pf-text-primary"
            >
              <FiArrowLeft /> লগইন পেজে ফিরুন
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
