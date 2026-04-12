import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import Camera from '../../components/Camera'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────
// Hold Button — ৩ সেকেন্ড চেপে ধরো
// ─────────────────────────────────────────────
function HoldButton({ label, color = 'blue', onDone }) {
  const [pct, setPct]         = useState(0)
  const [active, setActive]   = useState(false)
  const [done, setDone]       = useState(false)
  const intervalRef           = useRef(null)
  const startRef              = useRef(null)
  const DURATION              = 3000

  const accent = color === 'green'
    ? { bg: '#065f46', light: '#d1fae5', text: '#065f46', border: '#6ee7b7' }
    : { bg: '#1e3a8a', light: '#dbeafe', text: '#1e3a8a', border: '#93c5fd' }

  function begin() {
    if (done) return
    setActive(true)
    startRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - startRef.current) / DURATION) * 100)
      setPct(p)
      if (p >= 100) {
        clearInterval(intervalRef.current)
        setDone(true)
        setActive(false)
        onDone?.()
      }
    }, 30)
  }

  function stop() {
    if (done) return
    clearInterval(intervalRef.current)
    setActive(false)
    setPct(0)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const radius = 54
  const circ   = 2 * Math.PI * radius
  const dash   = circ - (pct / 100) * circ

  return (
    <div
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, userSelect:'none', WebkitUserSelect:'none' }}
    >
      <div style={{ position:'relative', width:160, height:160, display:'flex', alignItems:'center', justifyContent:'center' }}>

        {/* SVG ring */}
        <svg width="160" height="160" style={{ position:'absolute', inset:0, transform:'rotate(-90deg)' }}>
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8"/>
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke={done ? '#10b981' : accent.bg}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dash}
            style={{ transition:'stroke-dashoffset 0.03s linear' }}
          />
        </svg>

        {/* Pulse ring */}
        {active && (
          <div style={{
            position:'absolute', inset:0, borderRadius:'50%',
            border:`3px solid ${accent.bg}`,
            animation:'ping 1s cubic-bezier(0,0,0.2,1) infinite',
            opacity:0.3, pointerEvents:'none'
          }}/>
        )}

        {/* Circle button */}
        <div
          onMouseDown={begin}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={(e) => { e.preventDefault(); begin() }}
          onTouchEnd={(e)   => { e.preventDefault(); stop()  }}
          onTouchCancel={(e)=> { e.preventDefault(); stop()  }}
          onContextMenu={(e)=> e.preventDefault()}
          style={{
            width:120, height:120,
            borderRadius:'50%',
            background: done ? '#d1fae5' : active ? accent.bg : accent.light,
            border: `4px solid ${done ? '#10b981' : accent.border}`,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
            cursor:'pointer',
            transform: active ? 'scale(0.93)' : 'scale(1)',
            transition:'transform 0.15s, background 0.2s',
            touchAction:'none',
            WebkitTapHighlightColor:'transparent',
          }}
        >
          <span style={{ fontSize:'2.4rem', lineHeight:1 }}>
            {done ? '✅' : active ? '👆' : '☝️'}
          </span>
          <span style={{
            fontSize:'0.72rem', fontWeight:700,
            color: done ? '#059669' : active ? '#fff' : accent.text,
          }}>
            {done ? 'সম্পন্ন!' : active ? `${Math.round(pct)}%` : label}
          </span>
        </div>
      </div>

      {!done && (
        <div style={{ textAlign:'center' }}>
          <p style={{ fontWeight:700, color:'#1f2937', fontSize:'0.95rem' }}>{label}</p>
          <p style={{ color:'#9ca3af', fontSize:'0.8rem', marginTop:2 }}>৩ সেকেন্ড চেপে ধরুন</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Attendance Page
// ─────────────────────────────────────────────
export default function WorkerAttendance() {
  const navigate = useNavigate()

  const [mode,      setMode]      = useState(null)   // 'checkin' | 'checkout'
  const [step,      setStep]      = useState('hold') // 'hold' | 'selfie' | 'loading' | 'done'
  const [todayAtt,  setTodayAtt]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [lateInfo,  setLateInfo]  = useState(null)
  const [settings,  setSettings]  = useState({ attendance_checkin_start:'09:00', attendance_popup_cutoff:'14:30' })

  useEffect(() => {
    api.get('/attendance/settings').then(r => { if (r.data?.data) setSettings(r.data.data) }).catch(()=>{})
    const m = new Date().getMonth() + 1
    const y = new Date().getFullYear()
    api.get(`/attendance/my?month=${m}&year=${y}`)
      .then(r => {
        const today = new Date().toISOString().split('T')[0]
        setTodayAtt(r.data.data.attendance.find(a => a.date === today) || null)
      })
      .finally(() => setLoading(false))
  }, [])

  // সময় হিসাব
  const now  = new Date()
  const time = now.getHours() * 60 + now.getMinutes()
  const [sH, sM] = (settings.attendance_checkin_start || '09:00').split(':').map(Number)
  const [cH, cM] = (settings.attendance_popup_cutoff  || '14:30').split(':').map(Number)
  const canCheckIn  = !todayAtt?.check_in_time  && time >= sH*60+sM && time <= cH*60+cM
  const canCheckOut = !!todayAtt?.check_in_time && !todayAtt?.check_out_time

  // Selfie → Submit
  async function onSelfie(blob) {
    setStep('loading')
    try {
      const loc = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(
          p => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          () => rej(new Error('GPS পাওয়া যায়নি'))
        )
      )
      const fd = new FormData()
      fd.append('selfie',    blob, 'selfie.jpg')
      fd.append('latitude',  loc.latitude)
      fd.append('longitude', loc.longitude)

      const url = mode === 'checkin' ? '/attendance/checkin' : '/attendance/checkout'
      const res = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      if (mode === 'checkin' && res.data.data?.isLate) setLateInfo(res.data.data)
      toast.success(res.data.message)
      setStep('done')
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'সমস্যা হয়েছে')
      setStep('hold')
    }
  }

  function startMode(m) {
    setMode(m)
    setStep('hold')
    setLateInfo(null)
  }

  function cancel() {
    setMode(null)
    setStep('hold')
  }

  // ── Loading ──
  if (loading) return (
    <div style={{ padding:16 }}>
      <div style={{ height:200, background:'#f3f4f6', borderRadius:16, animation:'pulse 2s infinite' }}/>
    </div>
  )

  // ── হোম স্ক্রিন ──
  if (!mode) return (
    <div style={{ padding:16 }}>
      {/* হেডার */}
      <h2 style={{ fontSize:'1.25rem', fontWeight:800, textAlign:'center', color:'#1f2937', marginBottom:16 }}>হাজিরা</h2>

      {/* আজকের অবস্থা */}
      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', marginBottom:16 }}>
        <p style={{ fontWeight:700, color:'#374151', marginBottom:12, fontSize:'0.9rem' }}>আজকের অবস্থা</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { label:'চেক-ইন',  val: todayAtt?.check_in_time  },
            { label:'চেক-আউট', val: todayAtt?.check_out_time },
          ].map(({ label, val }) => (
            <div key={label} style={{ background:'#f9fafb', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
              <p style={{ fontSize:'0.75rem', color:'#6b7280' }}>{label}</p>
              <p style={{ fontWeight:800, color: val ? '#1f2937' : '#d1d5db', marginTop:4, fontSize:'0.9rem' }}>
                {val ? new Date(val).toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' }) : '—'}
              </p>
            </div>
          ))}
        </div>
        {todayAtt?.late_minutes > 0 && (
          <div style={{ marginTop:10, background:'#fffbeb', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
            <p style={{ fontSize:'0.78rem', color:'#b45309' }}>
              ⚠️ দেরি: {todayAtt.late_minutes} মিনিট | কর্তন: ৳{parseFloat(todayAtt.salary_deduction || 0).toFixed(0)}
            </p>
          </div>
        )}
      </div>

      {/* বাটন */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {canCheckIn && (
          <button
            onClick={() => startMode('checkin')}
            style={{
              width:'100%', padding:'16px', borderRadius:16, border:'none',
              background:'#065f46', color:'#fff', fontSize:'1rem', fontWeight:800,
              cursor:'pointer', boxShadow:'0 4px 14px rgba(6,95,70,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}
          >
            ☝️ চেক-ইন করুন
          </button>
        )}
        {canCheckOut && (
          <button
            onClick={() => startMode('checkout')}
            style={{
              width:'100%', padding:'16px', borderRadius:16, border:'none',
              background:'#1e3a8a', color:'#fff', fontSize:'1rem', fontWeight:800,
              cursor:'pointer', boxShadow:'0 4px 14px rgba(30,58,138,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}
          >
            👋 চেক-আউট করুন
          </button>
        )}
        {todayAtt?.check_out_time && (
          <div style={{ textAlign:'center', padding:'24px 0' }}>
            <span style={{ fontSize:'3rem' }}>✅</span>
            <p style={{ color:'#374151', fontWeight:700, marginTop:8 }}>আজকের হাজিরা সম্পন্ন!</p>
          </div>
        )}
        {!canCheckIn && !canCheckOut && !todayAtt?.check_out_time && (
          <div style={{ textAlign:'center', padding:'24px 0', color:'#9ca3af' }}>
            <p style={{ fontSize:'0.88rem' }}>
              চেক-ইনের সময়: {settings.attendance_checkin_start} — {settings.attendance_popup_cutoff}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  // ── Hold Step ──
  if (step === 'hold') return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh' }}>
      <p style={{ fontSize:'1.1rem', fontWeight:800, color:'#1f2937', marginBottom:6 }}>
        {mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
      </p>
      <p style={{ color:'#6b7280', fontSize:'0.85rem', marginBottom:32 }}>নিচের বাটন ৩ সেকেন্ড চেপে ধরুন</p>

      <HoldButton
        label={mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
        color={mode === 'checkin' ? 'green' : 'blue'}
        onDone={() => setStep('selfie')}
      />

      <button
        onClick={cancel}
        style={{ marginTop:32, background:'none', border:'none', color:'#9ca3af', fontSize:'0.88rem', cursor:'pointer' }}
      >
        বাতিল করুন
      </button>
    </div>
  )

  // ── Selfie Step ──
  if (step === 'selfie') return (
    <div style={{ padding:16 }}>
      <p style={{ fontSize:'1.1rem', fontWeight:800, color:'#1f2937', textAlign:'center', marginBottom:4 }}>সেলফি দিন</p>
      <p style={{ color:'#6b7280', fontSize:'0.85rem', textAlign:'center', marginBottom:16 }}>আপনার মুখ ফ্রেমের মধ্যে রাখুন</p>
      <Camera onCapture={onSelfie} onClose={() => setStep('hold')} />
    </div>
  )

  // ── Loading ──
  if (step === 'loading') return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:16 }}>
      <div style={{
        width:56, height:56, borderRadius:'50%',
        border:'5px solid #e5e7eb', borderTopColor:'#1e3a8a',
        animation:'spin 0.8s linear infinite'
      }}/>
      <p style={{ color:'#374151', fontWeight:600 }}>সাবমিট হচ্ছে...</p>
    </div>
  )

  // ── Done ──
  if (step === 'done') return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <span style={{ fontSize:'4rem' }}>🎉</span>
      <h2 style={{ fontSize:'1.3rem', fontWeight:800, color:'#1f2937', marginTop:12 }}>
        {mode === 'checkin' ? 'চেক-ইন সফল!' : 'চেক-আউট সফল!'}
      </h2>
      {lateInfo && (
        <div style={{ marginTop:16, background:'#fffbeb', borderRadius:14, padding:16, textAlign:'center', width:'100%' }}>
          <p style={{ color:'#b45309', fontWeight:700 }}>⚠️ দেরি হয়েছে</p>
          <p style={{ color:'#92400e', fontSize:'0.88rem', marginTop:4 }}>
            {lateInfo.lateMinutes} মিনিট দেরি — কর্তন: ৳{lateInfo.deduction}
          </p>
        </div>
      )}
      <button
        onClick={() => navigate('/worker/dashboard')}
        style={{
          marginTop:24, width:'100%', padding:'14px',
          borderRadius:14, border:'none',
          background:'#1e3a8a', color:'#fff',
          fontWeight:800, fontSize:'1rem', cursor:'pointer'
        }}
      >
        ড্যাশবোর্ডে যান
      </button>
    </div>
  )
}
