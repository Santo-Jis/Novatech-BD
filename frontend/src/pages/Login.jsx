import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import toast from 'react-hot-toast'
import { FiUser, FiLock, FiEye, FiEyeOff, FiLogIn } from 'react-icons/fi'
import logo from '../assets/zovorix-logo.png'

// ============================================================
// Login Page — ZovoriX
// ডিজাইন সিস্টেম: Deep Navy / Bronze-Gold Accent / Warm Cream
// ============================================================

const COLORS = {
  bgBase:      '#FAF8F3',
  bgSurface:   '#FFFFFF',
  bgAlt:       '#F3F1EA',
  primary900:  '#0F1B2E',
  primary700:  '#16253D',
  primary500:  '#2C4870',
  primary300:  '#6B85A8',
  primary100:  '#DCE3EC',
  accent600:   '#9C6B2E',
  accent300:   '#C99B5A',
  accent100:   '#F3E6D0',
  textPrimary:   '#1F2937',
  textSecondary: '#5B6472',
  textMuted:     '#8B8F98',
  borderDefault: '#E4E1D8',
  borderStrong:  '#D0CCC0',
  error:    '#B3452C',
  errorBg:  '#F5E4DF',
}

const FONT_HEAD = "'Source Serif 4','Noto Sans Bengali',Georgia,serif"
const FONT_BODY = "'IBM Plex Sans','Noto Sans Bengali','Hind Siliguri',Arial,sans-serif"

export default function Login() {
  const navigate            = useNavigate()
  const { login, user, loading } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [focusField, setFocusField] = useState(null)

  // ইতিমধ্যে লগইন থাকলে সঠিক ড্যাশবোর্ডে যাও
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

  const inputStyle = (field) => ({
    width: '100%',
    padding: '13px 14px 13px 40px',
    background: COLORS.bgBase,
    border: `1px solid ${focusField === field ? COLORS.primary700 : COLORS.borderDefault}`,
    borderRadius: '8px',
    color: COLORS.textPrimary,
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: FONT_BODY,
    transition: 'border-color 0.15s',
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgBase,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: FONT_BODY,
    }}>
      {/* সূক্ষ্ম ব্যাকগ্রাউন্ড টেক্সচার */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-10%', right: '-8%',
          width: '380px', height: '380px', borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primary100} 0%, transparent 70%)`,
          opacity: 0.6,
        }} />
        <div style={{
          position: 'absolute', bottom: '-12%', left: '-10%',
          width: '340px', height: '340px', borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.accent100} 0%, transparent 70%)`,
          opacity: 0.5,
        }} />
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: COLORS.bgSurface,
        border: `1px solid ${COLORS.borderDefault}`,
        borderRadius: '14px',
        padding: '40px 30px 32px',
        boxShadow: '0 4px 6px rgba(15,27,46,0.04), 0 12px 32px rgba(15,27,46,0.08)',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            overflow: 'hidden',
            background: COLORS.bgAlt,
            border: `1px solid ${COLORS.borderDefault}`,
          }}>
            <img
              src={logo}
              alt="ZovoriX"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{
            color: COLORS.primary700,
            fontFamily: FONT_HEAD,
            fontSize: '26px',
            fontWeight: 600,
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            ZovoriX
          </h1>
          <p style={{ color: COLORS.textSecondary, fontSize: '14px', marginTop: '6px' }}>
            আপনার অ্যাকাউন্টে লগইন করুন
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Identifier */}
          <div>
            <label style={{
              color: COLORS.textSecondary, fontSize: '13px', fontWeight: 500,
              display: 'block', marginBottom: '7px',
            }}>
              ইউজারনেম / ইমেইল / ফোন
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)',
                color: COLORS.textMuted, fontSize: '16px', display: 'flex',
              }}>
                <FiUser />
              </span>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                onFocus={() => setFocusField('id')}
                onBlur={() => setFocusField(null)}
                placeholder="এন্টার করুন..."
                autoComplete="username"
                style={inputStyle('id')}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{
              color: COLORS.textSecondary, fontSize: '13px', fontWeight: 500,
              display: 'block', marginBottom: '7px',
            }}>
              পাসওয়ার্ড
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)',
                color: COLORS.textMuted, fontSize: '16px', display: 'flex',
              }}>
                <FiLock />
              </span>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusField('pw')}
                onBlur={() => setFocusField(null)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ ...inputStyle('pw'), padding: '13px 42px 13px 40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                aria-label={showPass ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: COLORS.textMuted, fontSize: '16px', padding: '2px', display: 'flex',
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
              marginTop: '8px',
              padding: '13px',
              background: loading ? COLORS.primary300 : COLORS.primary700,
              border: `1px solid ${loading ? COLORS.primary300 : COLORS.primary700}`,
              borderRadius: '8px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: FONT_BODY,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = COLORS.primary900 }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = COLORS.primary700 }}
          >
            {loading ? (
              <>
                <span style={{
                  width: '17px', height: '17px',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'zx-spin 0.8s linear infinite',
                }} />
                লগইন হচ্ছে...
              </>
            ) : (
              <><FiLogIn /> লগইন করুন</>
            )}
          </button>

          <style>{`@keyframes zx-spin { to { transform: rotate(360deg) } }`}</style>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: `1px solid ${COLORS.borderDefault}`,
          color: COLORS.textMuted,
          fontSize: '13px',
        }}>
          SR হিসেবে যোগ দিতে চান?{' '}
          <Link to="/apply/sr" style={{ color: COLORS.accent600, textDecoration: 'none', fontWeight: 600 }}>
            এখানে আবেদন করুন
          </Link>
        </p>
      </div>
    </div>
  )
}
