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
    <div className="flex flex-col items-center gap-4 select-none">
      <div className="relative w-40 h-40 flex items-center justify-center">

        {/* SVG ring */}
        <svg width="160" height="160" className="absolute inset-0 -rotate-90">
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
          <div
            className="absolute inset-0 rounded-full opacity-30 pointer-events-none animate-ping"
            style={{ border:`3px solid ${accent.bg}` }}
          />
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
          className="w-[120px] h-[120px] rounded-full flex flex-col items-center justify-center gap-1 cursor-pointer"
          style={{
            background: done ? '#d1fae5' : active ? accent.bg : accent.light,
            border: `4px solid ${done ? '#10b981' : accent.border}`,
            transform: active ? 'scale(0.93)' : 'scale(1)',
            transition:'transform 0.15s, background 0.2s',
            touchAction:'none',
            WebkitTapHighlightColor:'transparent',
          }}
        >
          <span className="text-[2.4rem] leading-none">
            {done ? '✅' : active ? '👆' : '☝️'}
          </span>
          <span
            className="text-[0.72rem] font-bold"
            style={{ color: done ? '#059669' : active ? '#fff' : accent.text }}
          >
            {done ? 'সম্পন্ন!' : active ? `${Math.round(pct)}%` : label}
          </span>
        </div>
      </div>

      {!done && (
        <div className="text-center">
          <p className="font-bold text-gray-800 dark:text-gray-100 text-[0.95rem]">{label}</p>
          <p className="text-gray-400 dark:text-gray-500 text-[0.8rem] mt-0.5">৩ সেকেন্ড চেপে ধরুন</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    present: { label: 'উপস্থিত', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    late:    { label: 'দেরি',     cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    absent:  { label: 'অনুপস্থিত',cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    leave:   { label: 'ছুটি',     cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  }
  const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
  return (
    <span className={`text-[0.72rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ─────────────────────────────────────────────
// Main Attendance Page
// ─────────────────────────────────────────────
export default function WorkerAttendance() {
  const navigate = useNavigate()

  const [mode,        setMode]        = useState(null)   // 'checkin' | 'checkout'
  const [step,        setStep]        = useState('hold') // 'hold' | 'selfie' | 'loading' | 'done'
  const [todayAtt,    setTodayAtt]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [lateInfo,    setLateInfo]    = useState(null)
  const [settings,    setSettings]    = useState({ attendance_checkin_start:'09:00', attendance_popup_cutoff:'14:30', weekly_off_day:5, holidays:[] })
  const [historyData, setHistoryData] = useState({ attendance: [], summary: null, bonus_progress: null })
  const [histMonth,   setHistMonth]   = useState(new Date().getMonth() + 1)
  const [histYear,    setHistYear]    = useState(new Date().getFullYear())
  const [histLoading, setHistLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // ─── ছুটির আবেদন state ───
  const [showLeaveModal,  setShowLeaveModal]  = useState(false)
  const [leaveForm,       setLeaveForm]       = useState({ start_date: '', end_date: '', leave_type: 'casual', reason: '' })
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [myLeaves,        setMyLeaves]        = useState([])
  const [showLeaveHistory,setShowLeaveHistory]= useState(false)
  const [leaveHistLoading,setLeaveHistLoading]= useState(false)

  const fetchHistory = (month, year) => {
    setHistLoading(true)
    api.get(`/attendance/my?month=${month}&year=${year}`)
      .then(r => {
        const today = new Date().toISOString().split('T')[0]
        const data  = r.data.data
        setHistoryData(data)
        if (month === new Date().getMonth() + 1 && year === new Date().getFullYear()) {
          setTodayAtt(data.attendance.find(a => a.date?.startsWith(today)) || null)
        }
      })
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }

  const fetchMyLeaves = () => {
    setLeaveHistLoading(true)
    api.get('/attendance/leave/my')
      .then(r => setMyLeaves(r.data.data || []))
      .catch(() => {})
      .finally(() => setLeaveHistLoading(false))
  }

  const handleLeaveSubmit = async () => {
    if (!leaveForm.start_date || !leaveForm.end_date || !leaveForm.reason.trim()) {
      toast.error('সব তথ্য পূরণ করুন।')
      return
    }
    setLeaveSubmitting(true)
    try {
      await api.post('/attendance/leave/apply', leaveForm)
      toast.success('ছুটির আবেদন সফলভাবে জমা হয়েছে!')
      setShowLeaveModal(false)
      setLeaveForm({ start_date: '', end_date: '', leave_type: 'casual', reason: '' })
      fetchMyLeaves()
    } catch (err) {
      toast.error(err.response?.data?.message || 'আবেদন জমা দিতে সমস্যা হয়েছে।')
    } finally {
      setLeaveSubmitting(false)
    }
  }

  useEffect(() => {
    api.get('/attendance/settings').then(r => { if (r.data?.data) setSettings(r.data.data) }).catch(()=>{})
    setLoading(true)
    const m = new Date().getMonth() + 1
    const y = new Date().getFullYear()
    api.get(`/attendance/my?month=${m}&year=${y}`)
      .then(r => {
        const today = new Date().toISOString().split('T')[0]
        const data  = r.data.data
        setHistoryData(data)
        setTodayAtt(data.attendance.find(a => a.date?.startsWith(today)) || null)
      })
      .finally(() => setLoading(false))
    fetchMyLeaves()
  }, [])

  const handleMonthChange = (month, year) => {
    setHistMonth(month)
    setHistYear(year)
    fetchHistory(month, year)
  }

  // সময় হিসাব
  const now  = new Date()
  const time = now.getHours() * 60 + now.getMinutes()
  const [sH, sM] = (settings.attendance_checkin_start || '09:00').split(':').map(Number)
  const [cH, cM] = (settings.attendance_popup_cutoff  || '14:30').split(':').map(Number)
  const canCheckIn  = !todayAtt?.check_in_time  && time >= sH*60+sM && time <= cH*60+cM
  const canCheckOut = !!todayAtt?.check_in_time && !todayAtt?.check_out_time

  const MONTHS_BN = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

  // চেক-ইন থেকে চেক-আউট পর্যন্ত কাজের সময়
  const getWorkDuration = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return null
    const diff = Math.floor((new Date(checkOut) - new Date(checkIn)) / 60000)
    if (diff <= 0) return null
    const h = Math.floor(diff / 60)
    const m = diff % 60
    if (h === 0) return `${m} মিনিট`
    if (m === 0) return `${h} ঘণ্টা`
    return `${h} ঘণ্টা ${m} মিনিট`
  }

  // ছুটির দিন কিনা যাচাই
  const isOffDay = (dateStr) => {
    const d = new Date(dateStr)
    if (d.getDay() === (settings.weekly_off_day ?? 5)) return 'weekly'
    const holidays = Array.isArray(settings.holidays) ? settings.holidays : []
    if (holidays.some(h => h?.startsWith?.(dateStr) || h === dateStr)) return 'holiday'
    return false
  }

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

      const m = new Date().getMonth() + 1
      const y = new Date().getFullYear()
      fetchHistory(m, y)
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
    <div className="p-4">
      <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
    </div>
  )

  // ── হোম স্ক্রিন ──
  if (!mode) return (
    <div className="p-4 pb-8">

      {/* হেডার */}
      <h2 className="text-xl font-extrabold text-center text-gray-800 dark:text-gray-100 mb-4">হাজিরা</h2>

      {/* আজকের অবস্থা */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-bold text-gray-700 dark:text-gray-300 mb-3 text-[0.9rem]">আজকের অবস্থা</p>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label:'চেক-ইন',  val: todayAtt?.check_in_time  },
            { label:'চেক-আউট', val: todayAtt?.check_out_time },
          ].map(({ label, val }) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5 text-center">
              <p className="text-[0.75rem] text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`font-extrabold mt-1 text-[0.9rem] ${val ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
                {val ? new Date(val).toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' }) : '—'}
              </p>
            </div>
          ))}
        </div>
        {todayAtt?.late_minutes > 0 && (
          <div className="mt-2.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-2 text-center">
            <p className="text-[0.78rem] text-yellow-700 dark:text-yellow-400">
              ⚠️ দেরি: {todayAtt.late_minutes} মিনিট | কর্তন: ৳{parseFloat(todayAtt.salary_deduction || 0).toFixed(0)}
            </p>
          </div>
        )}
      </div>

      {/* বাটন */}
      <div className="flex flex-col gap-3 mb-6">
        {canCheckIn && (
          <button
            onClick={() => startMode('checkin')}
            className="w-full py-4 rounded-2xl text-base font-extrabold text-white flex items-center justify-center gap-2
              bg-emerald-800 shadow-lg shadow-emerald-800/30 active:scale-95 transition-transform"
          >
            ☝️ চেক-ইন করুন
          </button>
        )}
        {canCheckOut && (
          <button
            onClick={() => startMode('checkout')}
            className="w-full py-4 rounded-2xl text-base font-extrabold text-white flex items-center justify-center gap-2
              bg-blue-900 shadow-lg shadow-blue-900/30 active:scale-95 transition-transform"
          >
            👋 চেক-আউট করুন
          </button>
        )}
        {todayAtt?.check_out_time && (
          <div className="text-center py-4">
            <span className="text-5xl">✅</span>
            <p className="text-gray-700 dark:text-gray-300 font-bold mt-2">আজকের হাজিরা সম্পন্ন!</p>
          </div>
        )}
        {!canCheckIn && !canCheckOut && !todayAtt?.check_out_time && (
          <div className="text-center py-4 text-gray-400 dark:text-gray-500">
            <p className="text-[0.88rem]">
              চেক-ইনের সময়: {settings.attendance_checkin_start} — {settings.attendance_popup_cutoff}
            </p>
          </div>
        )}

        {/* ছুটির আবেদন বাটন */}
        <button
          onClick={() => setShowLeaveModal(true)}
          className="w-full py-3.5 rounded-2xl border-2 border-violet-600
            bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300
            text-[0.95rem] font-extrabold flex items-center justify-center gap-2
            active:scale-95 transition-transform"
        >
          🏖️ ছুটির আবেদন করুন
        </button>
      </div>

      {/* ছুটির আবেদন ইতিহাস */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden mb-4">
        <button
          onClick={() => { setShowLeaveHistory(v => !v); if (!showLeaveHistory) fetchMyLeaves() }}
          className="w-full px-4 py-3.5 flex items-center justify-between bg-transparent border-none cursor-pointer"
        >
          <span className="font-bold text-gray-800 dark:text-gray-100 text-[0.95rem]">🏖️ আমার ছুটির আবেদন</span>
          <span
            className="text-gray-400 dark:text-gray-500 text-lg transition-transform duration-200"
            style={{ transform: showLeaveHistory ? 'rotate(180deg)' : 'none' }}
          >▼</span>
        </button>

        {showLeaveHistory && (
          <div className="border-t border-gray-100 dark:border-gray-700 p-4">
            {leaveHistLoading && (
              <p className="text-center text-gray-400 dark:text-gray-500 text-[0.85rem]">লোড হচ্ছে...</p>
            )}
            {!leaveHistLoading && myLeaves.length === 0 && (
              <p className="text-center text-gray-400 dark:text-gray-500 text-[0.85rem] py-3">কোনো আবেদন নেই।</p>
            )}
            {!leaveHistLoading && myLeaves.map((lv, i) => {
              const statusMap = {
                pending:  { label:'অপেক্ষমাণ', cls:'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
                approved: { label:'অনুমোদিত',  cls:'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
                rejected: { label:'প্রত্যাখ্যাত',cls:'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
              }
              const s = statusMap[lv.status] || { label: lv.status, cls:'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
              const leaveTypeMap = { casual:'নৈমিত্তিক', sick:'অসুস্থতা', annual:'বার্ষিক', other:'অন্যান্য' }
              return (
                <div
                  key={i}
                  className={`py-2.5 -mx-2 px-2 ${i < myLeaves.length-1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-[0.82rem] font-bold text-gray-800 dark:text-gray-100">
                        {new Date(lv.start_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}
                        {lv.start_date !== lv.end_date && ` — ${new Date(lv.end_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}`}
                        <span className="font-normal text-gray-500 dark:text-gray-400 ml-1.5 text-[0.75rem]">
                          ({leaveTypeMap[lv.leave_type] || lv.leave_type})
                        </span>
                      </p>
                      <p className="text-[0.75rem] text-gray-500 dark:text-gray-400 mt-0.5">{lv.reason}</p>
                      {lv.reviewer_note && (
                        <p className="text-[0.72rem] text-violet-600 dark:text-violet-400 mt-1 italic">📝 {lv.reviewer_note}</p>
                      )}
                    </div>
                    <span className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ml-2 ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ছুটির আবেদন Modal */}
      {showLeaveModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setShowLeaveModal(false) }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-t-[20px] p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-extrabold text-gray-800 dark:text-gray-100 m-0">🏖️ ছুটির আবেদন</h3>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="bg-transparent border-none text-2xl text-gray-400 dark:text-gray-500 cursor-pointer leading-none"
              >×</button>
            </div>

            {/* ছুটির ধরন */}
            <div className="mb-3.5">
              <label className="text-[0.82rem] font-bold text-gray-700 dark:text-gray-300 block mb-1.5">ছুটির ধরন</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value:'casual', label:'নৈমিত্তিক' },
                  { value:'sick',   label:'অসুস্থতা' },
                  { value:'annual', label:'বার্ষিক' },
                  { value:'other',  label:'অন্যান্য' },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setLeaveForm(f => ({ ...f, leave_type: t.value }))}
                    className={`p-2.5 rounded-xl border-2 font-bold text-[0.82rem] cursor-pointer transition-colors
                      ${leaveForm.leave_type === t.value
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* তারিখ */}
            <div className="grid grid-cols-2 gap-2.5 mb-3.5">
              <div>
                <label className="text-[0.82rem] font-bold text-gray-700 dark:text-gray-300 block mb-1.5">শুরুর তারিখ</label>
                <input
                  type="date"
                  value={leaveForm.start_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                    text-[0.85rem] text-gray-800 dark:text-gray-100
                    bg-gray-50 dark:bg-gray-700 box-border"
                />
              </div>
              <div>
                <label className="text-[0.82rem] font-bold text-gray-700 dark:text-gray-300 block mb-1.5">শেষ তারিখ</label>
                <input
                  type="date"
                  value={leaveForm.end_date}
                  min={leaveForm.start_date || new Date().toISOString().split('T')[0]}
                  onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                    text-[0.85rem] text-gray-800 dark:text-gray-100
                    bg-gray-50 dark:bg-gray-700 box-border"
                />
              </div>
            </div>

            {/* কারণ */}
            <div className="mb-5">
              <label className="text-[0.82rem] font-bold text-gray-700 dark:text-gray-300 block mb-1.5">ছুটির কারণ</label>
              <textarea
                value={leaveForm.reason}
                onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="ছুটির কারণ লিখুন..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                  text-[0.85rem] text-gray-800 dark:text-gray-100
                  bg-gray-50 dark:bg-gray-700 resize-none box-border font-inherit
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            {/* সাবমিট */}
            <button
              onClick={handleLeaveSubmit}
              disabled={leaveSubmitting}
              className={`w-full py-3.5 rounded-xl border-none text-white font-extrabold text-base transition-opacity
                ${leaveSubmitting ? 'bg-violet-300 dark:bg-violet-800 cursor-not-allowed' : 'bg-violet-600 dark:bg-violet-700 cursor-pointer'}`}
            >
              {leaveSubmitting ? 'জমা হচ্ছে...' : '✅ আবেদন জমা দিন'}
            </button>
          </div>
        </div>
      )}

      {/* মাসিক ইতিহাস */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="w-full px-4 py-3.5 flex items-center justify-between bg-transparent border-none cursor-pointer"
        >
          <span className="font-bold text-gray-800 dark:text-gray-100 text-[0.95rem]">📅 মাসিক হাজিরা ইতিহাস</span>
          <span
            className="text-gray-400 dark:text-gray-500 text-lg transition-transform duration-200"
            style={{ transform: showHistory ? 'rotate(180deg)' : 'none' }}
          >▼</span>
        </button>

        {showHistory && (
          <div className="border-t border-gray-100 dark:border-gray-700 p-4">

            {/* মাস/বছর সিলেক্টর */}
            <div className="flex gap-2 mb-4">
              <select
                value={histMonth}
                onChange={e => handleMonthChange(parseInt(e.target.value), histYear)}
                className="flex-1 px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600
                  text-[0.85rem] font-semibold text-gray-800 dark:text-gray-100
                  bg-gray-50 dark:bg-gray-700"
              >
                {MONTHS_BN.map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
              <select
                value={histYear}
                onChange={e => handleMonthChange(histMonth, parseInt(e.target.value))}
                className="w-[90px] px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-600
                  text-[0.85rem] font-semibold text-gray-800 dark:text-gray-100
                  bg-gray-50 dark:bg-gray-700"
              >
                {[new Date().getFullYear()-1, new Date().getFullYear()].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* সারসংক্ষেপ কার্ড */}
            {historyData.summary && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label:'উপস্থিত', val: historyData.summary.present, cls:'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' },
                  { label:'দেরি',     val: historyData.summary.late,    cls:'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' },
                  { label:'অনুপস্থিত',val: historyData.summary.absent,  cls:'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
                  { label:'ছুটি',     val: historyData.summary.leave,   cls:'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-2 text-center ${s.cls}`}>
                    <p className="text-lg font-extrabold">{s.val}</p>
                    <p className="text-[0.68rem] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* মোট কর্তন */}
            {historyData.summary?.totalDeduction > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl px-3.5 py-2.5 mb-3.5 flex justify-between items-center">
                <span className="text-[0.82rem] text-yellow-800 dark:text-yellow-400 font-semibold">💸 এই মাসে মোট কর্তন</span>
                <span className="text-base font-extrabold text-yellow-700 dark:text-yellow-300">
                  ৳{parseFloat(historyData.summary.totalDeduction).toFixed(0)}
                </span>
              </div>
            )}

            {/* বোনাস প্রগ্রেস */}
            {historyData.bonus_progress && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3.5 py-2.5 mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[0.82rem] text-emerald-800 dark:text-emerald-400 font-semibold">🏆 পূর্ণ বোনাসের অগ্রগতি</span>
                  <span className="text-[0.82rem] font-extrabold text-emerald-800 dark:text-emerald-400">
                    {historyData.bonus_progress.present_days}/{historyData.bonus_progress.working_days} দিন
                  </span>
                </div>
                <div className="bg-emerald-200 dark:bg-emerald-800/40 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-400"
                    style={{ width:`${Math.min(100, historyData.bonus_progress.percentage)}%` }}
                  />
                </div>
                {historyData.bonus_progress.is_perfect && (
                  <p className="text-[0.75rem] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5 text-center">
                    🎉 পূর্ণ উপস্থিতি বোনাস অর্জিত!
                  </p>
                )}
              </div>
            )}

            {/* লোডিং */}
            {histLoading && (
              <div className="text-center py-5 text-gray-400 dark:text-gray-500 text-[0.85rem]">লোড হচ্ছে...</div>
            )}

            {/* খালি */}
            {!histLoading && historyData.attendance.length === 0 && (
              <p className="text-center text-gray-400 dark:text-gray-500 text-[0.85rem] py-4">
                এই মাসে কোনো হাজিরা রেকর্ড নেই।
              </p>
            )}

            {/* দিনভিত্তিক তালিকা */}
            {!histLoading && historyData.attendance.map((row, i) => {
              const rawDate  = row.date?.split('T')[0] || row.date
              const d        = new Date(rawDate)
              const dateStr  = d.toLocaleDateString('bn-BD', { day:'numeric', month:'short', weekday:'short' })
              const offDay   = isOffDay(rawDate)
              const duration = getWorkDuration(row.check_in_time, row.check_out_time)

              const rowCls = offDay === 'holiday' ? 'bg-red-50 dark:bg-red-900/10'
                           : offDay === 'weekly'  ? 'bg-red-50 dark:bg-red-900/10'
                           : 'bg-transparent'

              return (
                <div
                  key={i}
                  className={`flex items-start justify-between py-2.5 -mx-2 px-2 rounded-xl
                    ${rowCls}
                    ${i < historyData.attendance.length-1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[0.82rem] font-bold ${offDay ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
                        {dateStr}
                      </p>
                      {offDay === 'holiday' && (
                        <span className="text-[0.65rem] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold px-1.5 py-0.5 rounded-full">
                          🏖️ ছুটি
                        </span>
                      )}
                      {offDay === 'weekly' && (
                        <span className="text-[0.65rem] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold px-1.5 py-0.5 rounded-full">
                          সাপ্তাহিক
                        </span>
                      )}
                    </div>
                    <p className="text-[0.72rem] text-gray-500 dark:text-gray-400 mt-0.5">
                      {row.check_in_time  ? new Date(row.check_in_time ).toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'}) : '—'}
                      {' → '}
                      {row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'}) : '—'}
                    </p>
                    {duration && (
                      <p className="text-[0.72rem] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">⏱ {duration}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={row.status} />
                    {row.late_minutes > 0 && (
                      <span className="text-[0.68rem] text-yellow-700 dark:text-yellow-400">
                        দেরি {row.late_minutes}মি · কর্তন ৳{parseFloat(row.salary_deduction||0).toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  // ── Hold Step ──
  if (step === 'hold') return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[70vh]">
      <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 mb-1.5">
        {mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
      </p>
      <p className="text-gray-500 dark:text-gray-400 text-[0.85rem] mb-8">নিচের বাটন ৩ সেকেন্ড চেপে ধরুন</p>

      <HoldButton
        label={mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
        color={mode === 'checkin' ? 'green' : 'blue'}
        onDone={() => setStep('selfie')}
      />

      <button
        onClick={cancel}
        className="mt-8 bg-transparent border-none text-gray-400 dark:text-gray-500 text-[0.88rem] cursor-pointer"
      >
        বাতিল করুন
      </button>
    </div>
  )

  // ── Selfie Step ──
  if (step === 'selfie') return (
    <div className="p-4">
      <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 text-center mb-1">সেলফি দিন</p>
      <p className="text-gray-500 dark:text-gray-400 text-[0.85rem] text-center mb-4">আপনার মুখ ফ্রেমের মধ্যে রাখুন</p>
      <Camera onCapture={onSelfie} onClose={() => setStep('hold')} />
    </div>
  )

  // ── Loading ──
  if (step === 'loading') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-14 h-14 rounded-full border-[5px] border-gray-200 dark:border-gray-700 border-t-blue-900 animate-spin" />
      <p className="text-gray-700 dark:text-gray-300 font-semibold">সাবমিট হচ্ছে...</p>
    </div>
  )

  // ── Done ──
  if (step === 'done') {
    const checkInTime  = todayAtt?.check_in_time
    const checkOutTime = todayAtt?.check_out_time
    const workDuration = getWorkDuration(checkInTime, checkOutTime)
    const isCheckout   = mode === 'checkout'

    return (
      <div className="p-4 pb-8">
        {/* Success area */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3
            ${isCheckout ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
            <span className="text-5xl">{isCheckout ? '👋' : '🎉'}</span>
          </div>
          <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100 m-0">
            {isCheckout ? 'চেক-আউট সফল!' : 'চেক-ইন সফল!'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-[0.85rem] mt-1">
            {new Date().toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' })}
          </p>
        </div>

        {/* Summary Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 mb-4">
          <p className="font-bold text-gray-700 dark:text-gray-300 mb-3 text-[0.9rem]">আজকের সারসংক্ষেপ</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center">
              <p className="text-[0.72rem] text-slate-500 dark:text-slate-400 m-0">চেক-ইন</p>
              <p className="font-extrabold text-emerald-800 dark:text-emerald-400 mt-1 text-[0.95rem]">
                {checkInTime
                  ? new Date(checkInTime).toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' })
                  : '—'}
              </p>
            </div>
            <div className={`rounded-xl p-2.5 text-center
              ${isCheckout ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
              <p className="text-[0.72rem] text-slate-500 dark:text-slate-400 m-0">চেক-আউট</p>
              <p className={`font-extrabold mt-1 text-[0.95rem]
                ${isCheckout ? 'text-blue-900 dark:text-blue-300' : 'text-gray-300 dark:text-gray-600'}`}>
                {checkOutTime
                  ? new Date(checkOutTime).toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' })
                  : '—'}
              </p>
            </div>
          </div>

          {isCheckout && workDuration && (
            <div className="mt-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl px-3.5 py-2.5 flex justify-between items-center">
              <span className="text-[0.82rem] text-sky-700 dark:text-sky-400 font-semibold">⏱ মোট কাজের সময়</span>
              <span className="text-base font-extrabold text-sky-700 dark:text-sky-400">{workDuration}</span>
            </div>
          )}

          {lateInfo && (
            <div className="mt-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-2.5">
              <p className="text-yellow-700 dark:text-yellow-400 font-bold text-[0.85rem] m-0 mb-1">⚠️ দেরি হয়েছে</p>
              <p className="text-yellow-800 dark:text-yellow-300 text-[0.82rem] m-0">
                {lateInfo.lateMinutes} মিনিট দেরি — কর্তন: ৳{lateInfo.deduction}
              </p>
            </div>
          )}

          {isCheckout && (
            <div className="mt-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl p-2.5 flex items-center gap-2">
              <span className="text-base">🏆</span>
              <p className="text-[0.78rem] text-slate-500 dark:text-slate-400 m-0">
                আজকের হাজিরা বোনাস progress-এ গণনা হয়েছে।
                <span className="text-violet-600 dark:text-violet-400 font-semibold"> কমিশন পেজে</span> বিস্তারিত দেখুন।
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => navigate('/worker/dashboard')}
            className={`w-full py-3.5 rounded-xl border-none text-white font-extrabold text-base cursor-pointer
              ${isCheckout ? 'bg-blue-900 dark:bg-blue-800' : 'bg-emerald-800 dark:bg-emerald-700'}`}
          >
            ড্যাশবোর্ডে যান
          </button>
          {isCheckout && (
            <button
              onClick={() => navigate('/worker/commission')}
              className="w-full py-3 rounded-xl border-2 border-violet-600
                bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300
                font-bold text-[0.92rem] cursor-pointer"
            >
              🏆 কমিশন ও বোনাস দেখুন
            </button>
          )}
        </div>
      </div>
    )
  }
}
