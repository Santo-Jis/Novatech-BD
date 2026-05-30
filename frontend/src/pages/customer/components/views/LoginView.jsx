// components/views/LoginView.jsx
// Customer Portal Login — Claude-style dark theme with animated NT logo

export default function LoginView({ tokenInfo, error, loggingIn, onLogin }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Noto+Sans+Bengali:wght@400;500;600&display=swap');

        @keyframes spin         { from { transform: rotate(0deg);  } to { transform: rotate(360deg);  } }
        @keyframes spinReverse  { from { transform: rotate(0deg);  } to { transform: rotate(-360deg); } }
        @keyframes glowPulse    { 0%,100% { opacity:.5; transform:translate(-50%,-50%) scale(1);   }  50% { opacity:1; transform:translate(-50%,-50%) scale(1.55); } }
        @keyframes fadeUp       { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scanline     { 0% { transform:translateY(-100%); } 100% { transform:translateY(500%); } }
        @keyframes borderFlow   { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes float        { from{transform:translateY(0) scale(1);opacity:.15} to{transform:translateY(-22px) scale(1.3);opacity:.4} }

        .nt-card-border { position:relative; }
        .nt-card-border::before {
          content:''; position:absolute; inset:-1px; border-radius:24px;
          background:linear-gradient(135deg,#4ade80,#1f2937,#4ade80,#064e3b);
          background-size:300% 300%;
          animation:borderFlow 6s ease infinite;
          z-index:0;
        }
        .nt-card-inner { position:relative; z-index:1; }

        .nt-btn-google {
          width:100%; display:flex; align-items:center; justify-content:center; gap:12px;
          background:#fff; border:none; border-radius:16px;
          padding:15px 24px;
          font-family:'Noto Sans Bengali',sans-serif;
          font-size:14px; font-weight:700; color:#1f1f1f;
          cursor:pointer; transition:all .2s;
          box-shadow:0 2px 14px rgba(0,0,0,.35);
        }
        .nt-btn-google:hover  { transform:translateY(-1px); box-shadow:0 6px 22px rgba(0,0,0,.45); }
        .nt-btn-google:active { transform:translateY(0); }
        .nt-btn-google:disabled { opacity:.55; cursor:not-allowed; transform:none; }

        .nt-shop-card {
          background:rgba(74,222,128,.06);
          border:1px solid rgba(74,222,128,.22);
          border-radius:16px; padding:14px; text-align:center; margin-bottom:22px;
          animation:fadeUp .5s .35s ease both;
        }
        .nt-err {
          background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3);
          border-radius:12px; padding:10px 14px;
          color:#f87171; font-size:12px; text-align:center; margin-bottom:18px;
          animation:fadeUp .3s ease both;
        }
      `}</style>

      {/* Full-screen bg */}
      <div style={{
        minHeight:'100vh',
        background:'linear-gradient(135deg,#030712 0%,#0a0f1a 40%,#051a0e 100%)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'20px',
        fontFamily:"'Noto Sans Bengali',sans-serif",
        position:'relative', overflow:'hidden',
      }}>

        {/* Grid texture */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(74,222,128,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(74,222,128,.03) 1px,transparent 1px)',
          backgroundSize:'40px 40px',
        }} />

        {/* Radial glow corners */}
        <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'350px', height:'350px', background:'radial-gradient(circle,rgba(74,222,128,.07) 0%,transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-80px', left:'-80px', width:'300px', height:'300px', background:'radial-gradient(circle,rgba(34,197,94,.05) 0%,transparent 70%)', pointerEvents:'none' }} />

        {/* Floating particles */}
        {[...Array(14)].map((_,i) => (
          <div key={i} style={{
            position:'absolute',
            left:`${(i*7.3+5)%95}%`, top:`${(i*11.7+8)%90}%`,
            width: i%3===0 ? 3 : 2, height: i%3===0 ? 3 : 2,
            borderRadius:'50%', background:'#4ade80', opacity:.2,
            animation:`float ${6+i%4}s ${i*0.4}s ease-in-out infinite alternate`,
            pointerEvents:'none',
          }} />
        ))}

        {/* Card */}
        <div className="nt-card-border" style={{ width:'100%', maxWidth:'380px', animation:'fadeUp .5s ease both' }}>
          <div className="nt-card-inner" style={{
            background:'rgba(10,15,26,.96)', backdropFilter:'blur(20px)',
            borderRadius:'24px', overflow:'hidden',
          }}>

            {/* ── Header ── */}
            <div style={{
              padding:'32px 24px 26px', textAlign:'center',
              borderBottom:'1px solid rgba(74,222,128,.1)',
              background:'linear-gradient(180deg,rgba(74,222,128,.05) 0%,transparent 100%)',
              position:'relative', overflow:'hidden',
            }}>
              {/* Scanline */}
              <div style={{
                position:'absolute', left:0, right:0, height:'2px',
                background:'linear-gradient(90deg,transparent,rgba(74,222,128,.45),transparent)',
                animation:'scanline 4s linear infinite',
              }} />

              {/* ── NT Logo + Orbital rings ── */}
              <div style={{
                position:'relative', width:'155px', height:'155px',
                margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center',
              }}>

                {/* Glow pulse */}
                <div style={{
                  position:'absolute', top:'50%', left:'50%',
                  transform:'translate(-50%,-50%)',
                  width:'88px', height:'88px', borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(74,222,128,.2) 0%,transparent 70%)',
                  animation:'glowPulse 2.5s ease-in-out infinite',
                }} />

                {/* Outer ring — clockwise */}
                <svg style={{
                  position:'absolute', top:0, left:0, width:'100%', height:'100%',
                  animation:'spin 5s linear infinite',
                  transformOrigin:'center',
                }} viewBox="0 0 155 155" fill="none">
                  <ellipse cx="77.5" cy="77.5" rx="72" ry="27"
                    stroke="#4ade80" strokeWidth="1.8"
                    strokeDasharray="7 4" opacity="0.8" />
                  <circle cx="149.5" cy="77.5" r="4.5" fill="#4ade80" opacity="0.95" />
                  <circle cx="149.5" cy="77.5" r="8"   fill="#4ade80" opacity="0.12" />
                </svg>

                {/* Inner ring — counter-clockwise */}
                <svg style={{
                  position:'absolute', top:0, left:0, width:'100%', height:'100%',
                  animation:'spinReverse 8s linear infinite',
                  transformOrigin:'center', opacity:.45,
                }} viewBox="0 0 155 155" fill="none">
                  <ellipse cx="77.5" cy="77.5" rx="61" ry="19"
                    stroke="#22c55e" strokeWidth="1.2"
                    strokeDasharray="3 7"
                    transform="rotate(28 77.5 77.5)" />
                  <circle cx="5.5" cy="77.5" r="3" fill="#22c55e" opacity="0.9"
                    transform="rotate(28 77.5 77.5)" />
                </svg>

                {/* NT Logo */}
                <svg width="64" height="64" viewBox="0 0 100 100" fill="none"
                  style={{ position:'relative', zIndex:2, filter:'drop-shadow(0 0 10px rgba(74,222,128,.55))' }}>
                  <path d="M 18 82 A 46 46 0 1 1 82 18"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5" />
                  {/* N */}
                  <path d="M 18 70 L 18 30 L 44 70 L 44 30"
                    stroke="white" strokeWidth="9"
                    strokeLinecap="square" strokeLinejoin="miter" fill="none" />
                  {/* T */}
                  <path d="M 52 30 L 82 30 M 67 30 L 67 70"
                    stroke="white" strokeWidth="9"
                    strokeLinecap="square" fill="none" />
                </svg>

              </div>
              {/* ── Logo end ── */}

              <h1 style={{
                color:'#fff', fontSize:'21px', fontWeight:'700', margin:'0 0 3px',
                fontFamily:"'Rajdhani',sans-serif", letterSpacing:'3px',
                animation:'fadeUp .5s .1s ease both',
              }}>NOVATECH BD</h1>
              <p style={{
                color:'rgba(74,222,128,.6)', fontSize:'11px',
                letterSpacing:'4px', textTransform:'uppercase', margin:0,
                animation:'fadeUp .5s .2s ease both',
              }}>কাস্টমার লগিং </p>
            </div>

            {/* ── Body ── */}
            <div style={{ padding:'26px 24px 28px' }}>

              {/* দোকানের তথ্য */}
              {tokenInfo && (
                <div className="nt-shop-card">
                  <p style={{ color:'rgba(74,222,128,.6)', fontSize:'11px', letterSpacing:'1px', margin:'0 0 5px' }}>
                    আপনার প্রতিষ্ঠান 
                  </p>
                  <p style={{ color:'#fff', fontWeight:'700', fontSize:'17px', margin:'0 0 2px' }}>
                    {tokenInfo.shop_name}
                  </p>
                  <p style={{ color:'rgba(255,255,255,.5)', fontSize:'13px', margin:'0 0 4px' }}>
                    {tokenInfo.owner_name}
                  </p>
                  <p style={{ color:'rgba(74,222,128,.4)', fontSize:'11px', margin:0 }}>
                    কোড: {tokenInfo.customer_code}
                  </p>
                </div>
              )}

              {/* Error */}
              {error && <div className="nt-err">{error}</div>}

              {/* Google Button */}
              <div style={{ animation:'fadeUp .5s .3s ease both' }}>
                <button
                  onClick={onLogin}
                  disabled={loggingIn}
                  className="nt-btn-google"
                >
                  {loggingIn ? (
                    <span style={{
                      width:'20px', height:'20px', flexShrink:0,
                      border:'2px solid rgba(0,0,0,.15)',
                      borderTop:'2px solid #1f1f1f',
                      borderRadius:'50%',
                      animation:'spin .7s linear infinite',
                      display:'inline-block',
                    }} />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {loggingIn ? 'লগইন হচ্ছে...' : 'Google এর সাথে এগন'}
                </button>
              </div>

              <p style={{
                color:'rgba(255,255,255,.25)', fontSize:'11.5px',
                textAlign:'center', marginTop:'16px', lineHeight:'1.7',
                animation:'fadeUp .5s .4s ease both',
              }}>
                Google এর সাথে এগিয়ে যান<br/>আপনার তথ্য দেখতে এগন। 
              </p>
            </div>

            {/* ── Footer ── */}
            <div style={{
              borderTop:'1px solid rgba(255,255,255,.05)',
              padding:'13px 24px', textAlign:'center',
            }}>
              <p style={{ color:'rgba(255,255,255,.12)', fontSize:'10px', letterSpacing:'1px', margin:0 }}>
                NOVATECH BD (LTD.) © {new Date().getFullYear()}
              </p>
              <p style={{ color:'rgba(74,222,128,.2)', fontSize:'10px', margin:'2px 0 0' }}>
                 বরিশাল বিভাগ 
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  )
}
