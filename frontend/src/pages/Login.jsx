import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { FiEye, FiEyeOff, FiLock, FiMail, FiPhone, FiHash, FiArrowLeft, FiCheck } from 'react-icons/fi'
import axios from '../api/axios'

const useTypingEffect = (text, speed = 80, delay = 0) => {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    let timeout
    const start = setTimeout(() => {
      let i = 0
      const interval = setInterval(() => {
        if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++ }
        else { setDone(true); clearInterval(interval) }
      }, speed)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(start)
  }, [text, speed, delay])
  return { displayed, done }
}

const LOGIN_TYPES = [
  { id: 'email',  label: 'ইমেইল',     icon: FiMail,  placeholder: 'আপনার ইমেইল লিখুন',      type: 'email' },
  { id: 'phone',  label: 'ফোন',       icon: FiPhone, placeholder: 'আপনার ফোন নম্বর লিখুন', type: 'tel'   },
  { id: 'code',   label: 'কর্মী কোড', icon: FiHash,  placeholder: 'আপনার কর্মী কোড লিখুন', type: 'text'  },
]

export default function Login() {
  const navigate = useNavigate()
  const { login, user, loading } = useAuthStore()

  const [activeTab,  setActiveTab]  = useState('email')
  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)

  const [step,        setStep]        = useState('login')
  const [fpEmail,     setFpEmail]     = useState('')
  const [otp,         setOtp]         = useState(['', '', '', '', '', ''])
  const [resetToken,  setResetToken]  = useState('')
  const [newPass,     setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [fpLoading,   setFpLoading]   = useState(false)
  const [fpError,     setFpError]     = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  const bismillah = useTypingEffect('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم', 60, 300)
  const salam     = useTypingEffect('আসসালামু আলাইকুম', 80, bismillah.done ? 0 : 3000)

  useEffect(() => { if (user) redirectByRole(user.role) }, [user])
  useEffect(() => { setIdentifier('') }, [activeTab])
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const redirectByRole = (role) => {
    switch (role) {
      case 'admin': navigate('/admin/dashboard', { replace: true }); break
      case 'manager': case 'supervisor': case 'asm': case 'rsm': case 'accountant':
        navigate('/manager/dashboard', { replace: true }); break
      case 'worker': navigate('/worker/dashboard', { replace: true }); break
      default: navigate('/', { replace: true })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier || !password) return
    const result = await login(identifier.trim(), password)
    if (result.success) redirectByRole(result.user.role)
  }

  const handleForgotSubmit = async () => {
    setFpError('')
    if (!fpEmail) return setFpError('ইমেইল দিন।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/forgot-password', { email: fpEmail })
      if (res.data.success) { setStep('otp'); setResendTimer(60) }
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে, আবার চেষ্টা করুন।') }
    setFpLoading(false)
  }

  const handleOtpSubmit = async () => {
    setFpError('')
    const otpStr = otp.join('')
    if (otpStr.length < 6) return setFpError('৬ সংখ্যার OTP দিন।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/verify-otp', { email: fpEmail, otp: otpStr })
      if (res.data.success) { setResetToken(res.data.data.reset_token); setStep('newpass') }
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে, আবার চেষ্টা করুন।') }
    setFpLoading(false)
  }

  const handleNewPassSubmit = async () => {
    setFpError('')
    if (!newPass || !confirmPass) return setFpError('সব ঘর পূরণ করুন।')
    if (newPass.length < 6) return setFpError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে।')
    if (newPass !== confirmPass) return setFpError('পাসওয়ার্ড মিলছে না।')
    setFpLoading(true)
    try {
      const res = await axios.post('/auth/reset-password', { email: fpEmail, reset_token: resetToken, new_password: newPass })
      if (res.data.success) setStep('done')
      else setFpError(res.data.message)
    } catch { setFpError('সমস্যা হয়েছে, আবার চেষ্টা করুন।') }
    setFpLoading(false)
  }

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus()
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) document.getElementById(`otp-${index - 1}`)?.focus()
  }

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) { setOtp(pasted.split('')); document.getElementById('otp-5')?.focus() }
  }

  const resetForgotFlow = () => {
    setStep('login'); setFpEmail(''); setOtp(['','','','','',''])
    setResetToken(''); setNewPass(''); setConfirmPass(''); setFpError(''); setResendTimer(0)
  }

  const activeType = LOGIN_TYPES.find(t => t.id === activeTab)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4 transition-colors">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in">

          {/* Header */}
          <div className="bg-gradient-to-b from-primary to-primary-light px-8 pt-10 pb-8 text-center">
            <div className="min-h-[32px] mb-2">
              <p className="text-white/90 text-xl font-light tracking-wider" dir="rtl">
                {bismillah.displayed}
                {!bismillah.done && <span className="opacity-70 animate-pulse">|</span>}
              </p>
            </div>
            <div className="min-h-[28px] mb-6">
              <p className="text-white/80 text-base">
                {salam.displayed}
                {bismillah.done && !salam.done && <span className="opacity-70 animate-pulse">|</span>}
              </p>
            </div>
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

          {/* ── LOGIN ── */}
          {step === 'login' && (
            <div className="px-8 py-8">
              <h2 className="text-gray-700 font-semibold text-lg mb-5 text-center">লগইন করুন</h2>
              <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1">
                {LOGIN_TYPES.map(tab => (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <tab.icon className="text-sm" />{tab.label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">{activeType.label}</label>
                  <div className="relative">
                    <activeType.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                    <input type={activeType.type} value={identifier} onChange={e => setIdentifier(e.target.value)}
                      placeholder={activeType.placeholder} required autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm text-gray-600 font-medium">পাসওয়ার্ড</label>
                    <button type="button" onClick={() => { setStep('forgot'); setFpError('') }}
                      className="text-xs text-primary hover:underline font-medium">পাসওয়ার্ড ভুলে গেছেন?</button>
                  </div>
                  <div className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                    <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড লিখুন" required autoComplete="current-password"
                      className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm mt-2 hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                  {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />লগইন হচ্ছে...</span> : 'লগইন করুন'}
                </button>
              </form>
            </div>
          )}

          {/* ── FORGOT: EMAIL ── */}
          {step === 'forgot' && (
            <div className="px-8 py-8">
              <button onClick={resetForgotFlow} className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-5 transition-colors">
                <FiArrowLeft /> ফিরে যান
              </button>
              <h2 className="text-gray-700 font-semibold text-lg mb-2 text-center">পাসওয়ার্ড ভুলে গেছেন?</h2>
              <p className="text-gray-500 text-xs text-center mb-6">আপনার রেজিস্টার্ড ইমেইলে OTP পাঠানো হবে।</p>
              {fpError && <p className="text-red-500 text-xs text-center bg-red-50 rounded-lg py-2 px-3 mb-4">{fpError}</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">ইমেইল</label>
                  <div className="relative">
                    <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                    <input type="email" value={fpEmail} onChange={e => setFpEmail(e.target.value)}
                      placeholder="আপনার ইমেইল লিখুন"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50" />
                  </div>
                </div>
                <button onClick={handleForgotSubmit} disabled={fpLoading}
                  className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg active:scale-95 transition-all disabled:opacity-60">
                  {fpLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />পাঠানো হচ্ছে...</span> : 'OTP পাঠান'}
                </button>
              </div>
            </div>
          )}

          {/* ── OTP ── */}
          {step === 'otp' && (
            <div className="px-8 py-8">
              <button onClick={() => { setStep('forgot'); setFpError('') }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-5 transition-colors">
                <FiArrowLeft /> ফিরে যান
              </button>
              <h2 className="text-gray-700 font-semibold text-lg mb-2 text-center">OTP যাচাই করুন</h2>
              <p className="text-gray-500 text-xs text-center mb-1"><strong>{fpEmail}</strong> এ OTP পাঠানো হয়েছে।</p>
              <p className="text-gray-400 text-xs text-center mb-6">১০ মিনিটের মধ্যে OTP দিন।</p>
              {fpError && <p className="text-red-500 text-xs text-center bg-red-50 rounded-lg py-2 px-3 mb-4">{fpError}</p>}
              <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)}
                    className={`w-11 h-12 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-all ${digit ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-gray-50 text-gray-700'} focus:border-primary focus:ring-2 focus:ring-primary/20`} />
                ))}
              </div>
              <button onClick={handleOtpSubmit} disabled={fpLoading || otp.join('').length < 6}
                className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg active:scale-95 transition-all disabled:opacity-60">
                {fpLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />যাচাই হচ্ছে...</span> : 'OTP যাচাই করুন'}
              </button>
              <div className="text-center mt-4">
                {resendTimer > 0
                  ? <p className="text-xs text-gray-400">{resendTimer} সেকেন্ড পর আবার পাঠাতে পারবেন</p>
                  : <button onClick={handleForgotSubmit} disabled={fpLoading} className="text-xs text-primary hover:underline font-medium">আবার OTP পাঠান</button>
                }
              </div>
            </div>
          )}

          {/* ── NEW PASSWORD ── */}
          {step === 'newpass' && (
            <div className="px-8 py-8">
              <h2 className="text-gray-700 font-semibold text-lg mb-2 text-center">নতুন পাসওয়ার্ড দিন</h2>
              <p className="text-gray-500 text-xs text-center mb-6">কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।</p>
              {fpError && <p className="text-red-500 text-xs text-center bg-red-50 rounded-lg py-2 px-3 mb-4">{fpError}</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">নতুন পাসওয়ার্ড</label>
                  <div className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                    <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)}
                      placeholder="নতুন পাসওয়ার্ড লিখুন"
                      className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all bg-gray-50" />
                    <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNewPass ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5 font-medium">পাসওয়ার্ড নিশ্চিত করুন</label>
                  <div className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                    <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                      placeholder="আবার পাসওয়ার্ড লিখুন"
                      className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all bg-gray-50 ${confirmPass && newPass !== confirmPass ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : 'border-gray-200 focus:ring-primary/30 focus:border-primary'}`} />
                  </div>
                  {confirmPass && newPass !== confirmPass && <p className="text-red-400 text-xs mt-1">পাসওয়ার্ড মিলছে না</p>}
                </div>
                <button onClick={handleNewPassSubmit} disabled={fpLoading}
                  className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg active:scale-95 transition-all disabled:opacity-60">
                  {fpLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />পরিবর্তন হচ্ছে...</span> : 'পাসওয়ার্ড পরিবর্তন করুন'}
                </button>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="px-8 py-10 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiCheck className="text-green-500 text-3xl" />
              </div>
              <h2 className="text-gray-700 font-semibold text-lg mb-2">পাসওয়ার্ড পরিবর্তন সফল! ✅</h2>
              <p className="text-gray-500 text-sm mb-6">এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।</p>
              <button onClick={resetForgotFlow}
                className="w-full bg-gradient-to-r from-primary to-primary-light text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg active:scale-95 transition-all">
                লগইনে ফিরে যান
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-xs text-gray-400">NovaTech BD (Ltd.) © {new Date().getFullYear()}</p>
            <p className="text-xs text-gray-300 mt-0.5">জানকি সিংহ রোড, বরিশাল সদর</p>
          </div>

        </div>
      </div>
    </div>
  )
}
