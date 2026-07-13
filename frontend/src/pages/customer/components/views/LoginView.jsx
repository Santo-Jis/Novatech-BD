// components/views/LoginView.jsx
// Session শেষ হলে বা Google auth দরকার হলে দেখানো হয়
// ডিজাইন সিস্টেম: bg-base/primary navy/accent bronze (design.html অনুযায়ী)

import { useNavigate } from 'react-router-dom'

const COLORS = {
  bgBase: '#FAF8F3',
  bgSurface: '#FFFFFF',
  bgAlt: '#F3F1EA',
  primary900: '#0F1B2E',
  primary700: '#16253D',
  primary500: '#2C4870',
  primary300: '#6B85A8',
  primary100: '#DCE3EC',
  accent600: '#9C6B2E',
  accent300: '#C99B5A',
  accent100: '#F3E6D0',
  textPrimary: '#1F2937',
  textSecondary: '#5B6472',
  textMuted: '#8B8F98',
  borderDefault: '#E4E1D8',
  error: '#B3452C',
  errorBg: '#F5E4DF',
}

const FONT_HEAD = "'Source Serif 4','Noto Sans Bengali',Georgia,serif"
const FONT_BODY = "'IBM Plex Sans','Noto Sans Bengali','Hind Siliguri',sans-serif"

export default function LoginView({ tokenInfo, error, loggingIn, onLogin }) {
  const navigate = useNavigate()
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: COLORS.bgBase }}
    >
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>

        {/* Logo */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: COLORS.primary900,
          border: `2px solid ${COLORS.accent300}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          boxShadow: '0 8px 24px rgba(15,27,46,0.15)',
        }}>
          <span style={{ color: COLORS.accent300, fontSize: 32, fontWeight: 700, fontFamily: FONT_HEAD }}>N</span>
        </div>

        <h1 style={{
          color: COLORS.primary700,
          fontSize: 24,
          fontWeight: 600,
          margin: '0 0 4px',
          textAlign: 'center',
          fontFamily: FONT_HEAD,
        }}>
          ZovoriX
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 12, margin: '0 0 28px', letterSpacing: 1, fontFamily: FONT_BODY }}>
          কাস্টমার পোর্টাল
        </p>

        {/* Error banner */}
        {error && (
          <div style={{
            width: '100%',
            maxWidth: 360,
            background: COLORS.errorBg,
            border: `1px solid ${COLORS.error}33`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{
              color: COLORS.error,
              fontSize: 13,
              margin: 0,
              lineHeight: 1.5,
              fontFamily: FONT_BODY,
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Customer info card */}
        {tokenInfo && (
          <div style={{
            background: COLORS.bgSurface,
            border: `1px solid ${COLORS.borderDefault}`,
            borderRadius: 14,
            padding: '18px 22px',
            width: '100%',
            maxWidth: 360,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <p style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 6, letterSpacing: 1, fontFamily: FONT_BODY, textTransform: 'uppercase' }}>
              আপনার দোকান
            </p>
            <p style={{
              color: COLORS.primary700,
              fontSize: 18,
              fontWeight: 600,
              margin: '0 0 4px',
              fontFamily: FONT_HEAD,
            }}>
              🏪 {tokenInfo.shop_name}
            </p>
            <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 8px', fontFamily: FONT_BODY }}>
              {tokenInfo.owner_name}
            </p>
            <span style={{
              background: COLORS.accent100,
              color: COLORS.accent600,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 12px',
              borderRadius: 20,
              fontFamily: FONT_BODY,
            }}>
              কোড: {tokenInfo.customer_code}
            </span>
          </div>
        )}

        {/* Info text */}
        <p style={{
          color: COLORS.textSecondary,
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 320,
          margin: '0 0 24px',
          lineHeight: 1.6,
          fontFamily: FONT_BODY,
        }}>
          আবার প্রবেশ করতে আপনার Google অ্যাকাউন্ট ব্যবহার করুন।
        </p>

        {/* Google Login button */}
        <button
          onClick={onLogin}
          disabled={loggingIn}
          style={{
            width: '100%',
            maxWidth: 360,
            padding: '14px',
            borderRadius: 10,
            background: loggingIn ? COLORS.bgAlt : COLORS.bgSurface,
            border: `1px solid ${COLORS.borderDefault}`,
            color: COLORS.primary700,
            fontSize: 15,
            fontWeight: 600,
            cursor: loggingIn ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(15,27,46,0.06)',
            fontFamily: FONT_BODY,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'transform 0.15s, opacity 0.2s',
            opacity: loggingIn ? 0.8 : 1,
          }}
          onMouseDown={e => { if (!loggingIn) e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onTouchStart={e => { if (!loggingIn) e.currentTarget.style.transform = 'scale(0.98)' }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {loggingIn ? (
            <>
              <span style={{
                width: 18,
                height: 18,
                border: `2px solid ${COLORS.primary100}`,
                borderTop: `2px solid ${COLORS.primary700}`,
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }} />
              লগইন হচ্ছে...
            </>
          ) : (
            <>
              {/* Google icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google দিয়ে প্রবেশ করুন
            </>
          )}
        </button>

        <p style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 14, textAlign: 'center', fontFamily: FONT_BODY }}>
          আপনার Gmail অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন
        </p>

        {/* Divider */}
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
          <div style={{ flex: 1, height: 1, background: COLORS.borderDefault }} />
          <span style={{ color: COLORS.textMuted, fontSize: 11, fontFamily: FONT_BODY }}>অথবা</span>
          <div style={{ flex: 1, height: 1, background: COLORS.borderDefault }} />
        </div>

        {/* ✅ নতুন কাস্টমার সেলফ-রেজিস্ট্রেশন লিংক */}
        <button
          type="button"
          onClick={() => navigate('/customer-register')}
          style={{
            width: '100%',
            maxWidth: 360,
            display: 'block',
            textAlign: 'center',
            padding: '14px',
            borderRadius: 10,
            background: COLORS.primary900,
            color: COLORS.accent300,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: FONT_BODY,
            border: 'none',
            cursor: 'pointer',
            boxSizing: 'border-box',
          }}
        >
          নতুন কাস্টমার? এখানে রেজিস্ট্রেশন করুন
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <p style={{
        textAlign: 'center',
        color: COLORS.textMuted,
        fontSize: 11,
        padding: '16px',
        letterSpacing: 0.5,
        fontFamily: FONT_BODY,
      }}>
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
