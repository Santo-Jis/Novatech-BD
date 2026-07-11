import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import toast from 'react-hot-toast'
import { FiUser, FiLock, FiEye, FiEyeOff, FiLogIn } from 'react-icons/fi'

// ============================================================
// Login Page — ZovoriX
// ============================================================

export default function Login() {
  const navigate            = useNavigate()
  const { login, user, loading } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)

  // ইতিমধ্যে লগইন থাকলে সঠিক ডেশবোর্ডে যাও
  useEffect(() => {
    if (!user) return
    switch (user.role) {
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
        break
    }
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier.trim() || !password.trim()) {
      toast.error('সকল তথ্য পূরণ করুন।')
      return
    }
    const result = await login(identifier.trim(), password)
    if (result.success) {
      // useEffect-এ redirect হবে
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #030712 0%, #0a0f1a 40%, #051a0e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: "'Hind Siliguri', Arial, sans-serif",
    }}>
      {/* Animated background dots */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${80 + i * 40}px`,
            height: `${80 + i * 40}px`,
            borderRadius: '50%',
            background: i % 2 === 0
              ? 'rgba(30,58,138,0.08)'
              : 'rgba(6,95,70,0.08)',
            top:  `${10 + i * 15}%`,
            left: `${5 + i * 16}%`,
            animation: `float${i % 3} ${6 + i}s ease-in-out infinite`,
          }} />
        ))}
        <style>{`
          @keyframes float0 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
          @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(15px)} }
          @keyframes float2 { 0%,100%{transform:translateY(0) translateX(0)} 50%{transform:translateY(-10px) translateX(10px)} }
        `}</style>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(30,58,138,0.3)',
        borderRadius: '20px',
        padding: '36px 28px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #1e3a8a, #065f46)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: '28px',
            boxShadow: '0 8px 24px rgba(30,58,138,0.4)',
          }}>
            🏢
          </div>
          <h1 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>
            ZovoriX
          </h1>
          <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '13px', marginTop: '4px' }}>
            আপনার অ্যাকাউন্টে লগইন করুন
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Identifier */}
          <div>
            <label style={{ color: 'rgba(148,163,184,0.9)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
              ইউজারনেম / ইমেইল / ফোন
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(100,116,139,0.8)', fontSize: '16px',
              }}>
                <FiUser />
              </span>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="এন্টার করুন..."
                autoComplete="username"
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 38px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(30,58,138,0.4)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(30,58,138,0.8)'}
                onBlur={e => e.target.style.borderColor = 'rgba(30,58,138,0.4)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ color: 'rgba(148,163,184,0.9)', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
              পাসওয়ার্ড
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(100,116,139,0.8)', fontSize: '16px',
              }}>
                <FiLock />
              </span>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 38px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(30,58,138,0.4)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(30,58,138,0.8)'}
                onBlur={e => e.target.style.borderColor = 'rgba(30,58,138,0.4)'}
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(100,116,139,0.8)', fontSize: '16px', padding: '2px',
                }}
              >
                {showPass ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '6px',
              padding: '13px',
              background: loading
                ? 'rgba(30,58,138,0.4)'
                : 'linear-gradient(135deg, #1e3a8a, #162d6e)',
              border: '1px solid rgba(30,58,138,0.5)',
              borderRadius: '10px',
              color: '#f1f5f9',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: "'Hind Siliguri', Arial, sans-serif",
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: '18px', height: '18px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }} />
                লগইন হচ্ছে...
              </>
            ) : (
              <><FiLogIn /> লগইন করুন</>
            )}
          </button>

          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          color: 'rgba(100,116,139,0.6)',
          fontSize: '12px',
        }}>
          SR হিসেবে যোগ দিতে চান?{' '}
          <Link to="/apply/sr" style={{ color: 'rgba(74,222,128,0.8)', textDecoration: 'none' }}>
            এখানে আবেদন করুন
          </Link>
        </p>
      </div>
    </div>
  )
}
