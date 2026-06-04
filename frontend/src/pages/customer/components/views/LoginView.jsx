// components/views/LoginView.jsx
// Session শেষ হলে বা Google auth দরকার হলে দেখানো হয়

export default function LoginView({ tokenInfo, error, loggingIn, onLogin }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}
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
          borderRadius: 20,
          background: 'rgba(99,102,241,0.2)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(99,102,241,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          boxShadow: '0 8px 32px rgba(99,102,241,0.2)',
        }}>
          <span style={{ color: 'white', fontSize: 32, fontWeight: 800, fontFamily: 'Georgia, serif' }}>N</span>
        </div>

        <h1 style={{
          color: 'white',
          fontSize: 22,
          fontWeight: 800,
          margin: '0 0 4px',
          textAlign: 'center',
          fontFamily: "'Hind Siliguri', sans-serif",
        }}>
          NovaTech BD
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '0 0 28px', letterSpacing: 1 }}>
          কাস্টমার পোর্টাল
        </p>

        {/* Error banner */}
        {error && (
          <div style={{
            width: '100%',
            maxWidth: 360,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{
              color: 'rgba(252,165,165,0.9)',
              fontSize: 13,
              margin: 0,
              lineHeight: 1.5,
              fontFamily: "'Hind Siliguri', sans-serif",
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Customer info card */}
        {tokenInfo && (
          <div style={{
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            padding: '18px 22px',
            width: '100%',
            maxWidth: 360,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 6, letterSpacing: 1 }}>
              আপনার দোকান
            </p>
            <p style={{
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
              margin: '0 0 4px',
              fontFamily: "'Hind Siliguri', sans-serif",
            }}>
              🏪 {tokenInfo.shop_name}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 8px' }}>
              {tokenInfo.owner_name}
            </p>
            <span style={{
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 11,
              padding: '3px 12px',
              borderRadius: 20,
            }}>
              কোড: {tokenInfo.customer_code}
            </span>
          </div>
        )}

        {/* Info text */}
        <p style={{
          color: 'rgba(255,255,255,0.45)',
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 320,
          margin: '0 0 24px',
          lineHeight: 1.6,
          fontFamily: "'Hind Siliguri', sans-serif",
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
            padding: '15px',
            borderRadius: 14,
            background: loggingIn ? 'rgba(255,255,255,0.7)' : 'white',
            border: 'none',
            color: '#1e1b4b',
            fontSize: 15,
            fontWeight: 700,
            cursor: loggingIn ? 'not-allowed' : 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            fontFamily: "'Hind Siliguri', sans-serif",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'transform 0.15s, opacity 0.2s',
            opacity: loggingIn ? 0.8 : 1,
          }}
          onMouseDown={e => { if (!loggingIn) e.currentTarget.style.transform = 'scale(0.97)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onTouchStart={e => { if (!loggingIn) e.currentTarget.style.transform = 'scale(0.97)' }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {loggingIn ? (
            <>
              <span style={{
                width: 18,
                height: 18,
                border: '2px solid rgba(30,27,75,0.2)',
                borderTop: '2px solid #1e1b4b',
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

        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 14, textAlign: 'center' }}>
          আপনার Gmail অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <p style={{
        textAlign: 'center',
        color: 'rgba(255,255,255,0.15)',
        fontSize: 11,
        padding: '16px',
        letterSpacing: 0.5,
      }}>
        © {new Date().getFullYear()} NovaTech BD Ltd.
      </p>
    </div>
  )
}
