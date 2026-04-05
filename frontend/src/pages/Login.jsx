import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { FiEye, FiEyeOff, FiUser, FiLock } from 'react-icons/fi'

// ============================================================
// Typing Animation Hook
// ============================================================

const useTypingEffect = (text, speed = 80, delay = 0) => {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let timeout
    const start = setTimeout(() => {
      let i = 0
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1))
          i++
        } else {
          setDone(true)
          clearInterval(interval)
        }
      }, speed)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(start)
  }, [text, speed, delay])

  return { displayed, done }
}

// ============================================================
// Login Page
// ============================================================

export default function Login() {
  const navigate              = useNavigate()
  const { login, user, loading } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)

  // অ্যানিমেটেড টাইপিং
  const bismillah  = useTypingEffect('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم', 60, 300)
  const salam      = useTypingEffect('আসসালামু আলাইকুম', 80, bismillah.done ? 0 : 3000)

  // আগে লগইন থাকলে redirect
  useEffect(() => {
    if (user) {
      redirectByRole(user.role)
    }
  }, [user])

  const redirectByRole = (role) => {
    switch (role) {
      case 'admin':
        navigate('/admin/dashboard', { replace: true }); break
      case 'manager':
      case 'supervisor':
      case 'asm':
      case 'rsm':
      case 'accountant':
        navigate('/manager/dashboard', { replace: true }); break
      case 'worker':
        navigate('/worker/dashboard', { replace: true }); break
      default:
        navigate('/', { replace: true })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) return

    const result = await login(identifier.trim(), password)
    if (result.success) {
      redirectByRole(result.user.role)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4 transition-colors">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in">

          {/* Header */}
          <div className="bg-gradient-to-b from-primary to-primary-light px-8 pt-10 pb-8 text-center">

            {/* বিসমিল্লাহ */}
            <div className="min-h-[32px] mb-2">
              <p className="text-white/90 text-xl font-light tracking-wider" dir="rtl">
                {bismillah.displayed}
                {!bismillah.done && <span className="opacity-70 animate-pulse">|</span>}
              </p>
            </div>

            {/* আসসালামু আলাইকুম */}
            <div className="min-h-[28px] mb-6">
              <p className="text-white/80 text-base">
                {salam.displayed}
                {bismillah.done && !salam.done && (
                  <span className="opacity-70 animate-pulse">|</span>
                )}
              </p>
            </div>

            {/* Logo / Brand */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                <span className="text-white font-bold text-2xl">N</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-xl tracking-wide">NovaTech BD</h1>
                <p className="text-white/60 text-xs mt-0.5">Management System</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <h2 className="text-gray-700 font-semibold text-lg mb-6 text-center">
              লগইন করুন
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Identifier */}
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-medium">
                  ইমেইল / ফোন / কর্মী কোড
                </label>
                <div className="relative">
                  <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="আপনার ID লিখুন"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-medium">
                  পাসওয়ার্ড
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড লিখুন"
                    className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm mt-2 hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    লগইন হচ্ছে...
                  </span>
                ) : 'লগইন করুন'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-xs text-gray-400">
              NovaTech BD (Ltd.) © {new Date().getFullYear()}
            </p>
            <p className="text-xs text-gray-300 mt-0.5">
              জানকি সিংহ রোড, বরিশাল সদর
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
