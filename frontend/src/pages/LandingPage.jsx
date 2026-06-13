import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiLogIn, FiShoppingBag, FiUsers, FiBarChart2, FiShield, FiChevronDown, FiSettings } from 'react-icons/fi'

// ============================================================
// Landing Page — NovaTechBD
// লগইন না করা ব্যবহারকারীদের জন্য পাবলিক পেজ
// ============================================================

export default function LandingPage() {
  const navigate = useNavigate()
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const dropRef = useRef(null)

  // বাইরে ক্লিক করলে ড্রপডাউন বন্ধ
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setMgmtOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const features = [
    { icon: <FiShoppingBag />, title: 'বিক্রয় ব্যবস্থাপনা', desc: 'অর্ডার, ইনভয়েস ও পেমেন্ট সব এক জায়গায়' },
    { icon: <FiUsers />,       title: 'টিম ম্যানেজমেন্ট',  desc: 'কর্মীদের অ্যাটেন্ডেন্স ও পারফরম্যান্স ট্র্যাকিং' },
    { icon: <FiBarChart2 />,   title: 'রিয়েল-টাইম রিপোর্ট', desc: 'ব্যবসার সামগ্রিক চিত্র একনজরে দেখুন' },
    { icon: <FiShield />,      title: 'নিরাপদ প্ল্যাটফর্ম', desc: 'এনক্রিপ্টেড ডেটা ও সুরক্ষিত অ্যাক্সেস' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #030712 0%, #0a0f1a 50%, #051a0e 100%)',
      fontFamily: "'Hind Siliguri', Arial, sans-serif",
      color: '#f1f5f9',
      overflowX: 'hidden',
    }}>
      {/* Navbar */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(30,58,138,0.2)',
        background: 'rgba(3,7,18,0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #1e3a8a, #065f46)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>🏢</div>
          <span style={{ fontWeight: 700, fontSize: '17px', color: '#f1f5f9' }}>NovaTech BD</span>
        </div>

        {/* Navbar right — রিটেইলার + ম্যানেজমেন্ট */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

          {/* রিটেইলার শপ লগইন */}
          <button
            onClick={() => navigate('/customer-login')}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #065f46, #047857)',
              border: '1px solid rgba(6,95,70,0.5)',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Hind Siliguri', Arial, sans-serif",
              whiteSpace: 'nowrap',
            }}
          >
            <FiShoppingBag style={{ fontSize: '14px' }} /> রিটেইলার লগইন
          </button>

          {/* ম্যানেজমেন্ট লগইন ড্রপডাউন */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMgmtOpen(p => !p)}
              style={{
                padding: '8px 16px',
                background: mgmtOpen
                  ? 'linear-gradient(135deg, #1e3a8a, #162d6e)'
                  : 'rgba(30,58,138,0.15)',
                border: '1px solid rgba(30,58,138,0.5)',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: "'Hind Siliguri', Arial, sans-serif",
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <FiSettings style={{ fontSize: '14px' }} />
              ম্যানেজমেন্ট লগইন
              <FiChevronDown style={{
                fontSize: '13px',
                transition: 'transform 0.2s',
                transform: mgmtOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            {/* Dropdown Menu */}
            {mgmtOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                minWidth: '200px',
                background: 'rgba(10,15,26,0.97)',
                border: '1px solid rgba(30,58,138,0.4)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(20px)',
                zIndex: 200,
                animation: 'fadeSlideDown 0.15s ease-out',
              }}>
                <style>{`@keyframes fadeSlideDown { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>

                {/* Header */}
                <div style={{
                  padding: '10px 16px 8px',
                  borderBottom: '1px solid rgba(30,58,138,0.2)',
                  color: 'rgba(148,163,184,0.6)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  ম্যানেজমেন্ট পোর্টাল
                </div>

                {[
                  { label: 'SR লগইন',      role: 'sr',      icon: '👤', desc: 'Sales Representative' },
                  { label: 'Manager লগইন', role: 'manager', icon: '📊', desc: 'ম্যানেজার / সুপারভাইজার' },
                  { label: 'Admin লগইন',   role: 'admin',   icon: '⚙️', desc: 'অ্যাডমিন প্যানেল' },
                ].map((item) => (
                  <button
                    key={item.role}
                    onClick={() => {
                      setMgmtOpen(false)
                      navigate('/login', { state: { roleHint: item.role } })
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(30,58,138,0.1)',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontFamily: "'Hind Siliguri', Arial, sans-serif",
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(30,58,138,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      width: '34px', height: '34px',
                      background: 'rgba(30,58,138,0.25)',
                      borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', flexShrink: 0,
                    }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(148,163,184,0.6)', marginTop: '1px' }}>{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        textAlign: 'center',
        padding: '72px 24px 48px',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'rgba(30,58,138,0.15)',
          border: '1px solid rgba(30,58,138,0.3)',
          borderRadius: '20px',
          fontSize: '12px',
          color: 'rgba(148,163,184,0.8)',
          marginBottom: '24px',
        }}>
          ✨ আধুনিক ব্যবসা ব্যবস্থাপনা সফটওয়্যার
        </div>

        <h1 style={{
          fontSize: 'clamp(28px, 6vw, 48px)',
          fontWeight: 800,
          lineHeight: 1.2,
          margin: '0 auto 16px',
          maxWidth: '600px',
          background: 'linear-gradient(135deg, #f1f5f9, rgba(148,163,184,0.7))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          আপনার ব্যবসাকে <br />
          <span style={{
            background: 'linear-gradient(135deg, #3b82f6, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>স্মার্ট করে তুলুন</span>
        </h1>

        <p style={{
          color: 'rgba(148,163,184,0.7)',
          fontSize: '15px',
          maxWidth: '480px',
          margin: '0 auto 36px',
          lineHeight: 1.7,
        }}>
          বিক্রয়, কর্মী ও কাস্টমার — সব কিছু একটি প্ল্যাটফর্মে পরিচালনা করুন।
          রিয়েল-টাইম ডেটা দিয়ে সঠিক সিদ্ধান্ত নিন।
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* রিটেইলার শপ লগইন — প্রধান CTA */}
          <button
            onClick={() => navigate('/customer-login')}
            style={{
              padding: '13px 28px',
              background: 'linear-gradient(135deg, #065f46, #047857)',
              border: 'none',
              borderRadius: '10px',
              color: '#f1f5f9',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: "'Hind Siliguri', Arial, sans-serif",
              boxShadow: '0 8px 24px rgba(6,95,70,0.35)',
            }}
          >
            <FiShoppingBag /> রিটেইলার শপ লগইন
          </button>
          {/* ম্যানেজমেন্ট লগইন */}
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '13px 28px',
              background: 'linear-gradient(135deg, #1e3a8a, #162d6e)',
              border: '1px solid rgba(30,58,138,0.5)',
              borderRadius: '10px',
              color: '#f1f5f9',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: "'Hind Siliguri', Arial, sans-serif",
              boxShadow: '0 8px 24px rgba(30,58,138,0.3)',
            }}
          >
            <FiLogIn /> ম্যানেজমেন্ট লগইন
          </button>
          <button
            onClick={() => navigate('/apply/sr')}
            style={{
              padding: '13px 28px',
              background: 'transparent',
              border: '1px solid rgba(30,58,138,0.4)',
              borderRadius: '10px',
              color: 'rgba(148,163,184,0.9)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Hind Siliguri', Arial, sans-serif",
            }}
          >
            SR আবেদন করুন
          </button>
        </div>
      </section>

      {/* Features */}
      <section style={{
        padding: '48px 24px 72px',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '20px',
          fontWeight: 700,
          color: 'rgba(148,163,184,0.8)',
          marginBottom: '32px',
        }}>
          কেন NovaTech BD?
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: 'rgba(15,23,42,0.6)',
              border: '1px solid rgba(30,58,138,0.2)',
              borderRadius: '14px',
              padding: '22px 18px',
              textAlign: 'center',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(30,58,138,0.5)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(30,58,138,0.2)'}
            >
              <div style={{
                width: '44px', height: '44px',
                background: 'rgba(30,58,138,0.2)',
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', color: '#60a5fa',
                margin: '0 auto 12px',
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: '12px', color: 'rgba(148,163,184,0.6)', lineHeight: 1.5, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '20px',
        borderTop: '1px solid rgba(30,58,138,0.15)',
        color: 'rgba(100,116,139,0.5)',
        fontSize: '12px',
      }}>
        © {new Date().getFullYear()} NovaTech BD. সর্বস্বত্ব সংরক্ষিত।
      </footer>
    </div>
  )
}
