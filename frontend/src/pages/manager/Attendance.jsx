// ============================================================
// Manager Attendance Page
// ============================================================
import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Input, { Select } from '../../components/ui/Input'
import { FiDownload, FiEdit2, FiX, FiCheck, FiAlertTriangle } from 'react-icons/fi'
import toast from 'react-hot-toast'

// ── CSV Export Helper ───────────────────────────────────────
function exportCSV(data, filename) {
  if (!data || data.length === 0) return toast.error('এক্সপোর্ট করার মতো তথ্য নেই।')
  const headers = Object.keys(data[0])
  const rows    = data.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))
  const csv     = [headers.join(','), ...rows].join('\n')
  const blob    = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url     = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href        = url
  a.download    = filename
  a.click()
  URL.revokeObjectURL(url)
  toast.success('CSV ডাউনলোড শুরু হয়েছে ✅')
}

// ── Manual Correction Modal ──────────────────────────────────
function CorrectionModal({ worker, date, onClose, onSuccess }) {
  const [checkIn,  setCheckIn]  = useState(worker.check_in_time
    ? new Date(worker.check_in_time).toTimeString().slice(0,5) : '')
  const [checkOut, setCheckOut] = useState(worker.check_out_time
    ? new Date(worker.check_out_time).toTimeString().slice(0,5) : '')
  const [note,     setNote]     = useState('')
  const [loading,  setLoading]  = useState(false)

  const toISO = (timeStr) => {
    if (!timeStr) return null
    return `${date}T${timeStr}:00`
  }

  const handleSubmit = async () => {
    if (!checkIn) return toast.error('চেক-ইন সময় দিন।')
    setLoading(true)
    try {
      await api.put('/attendance/correct', {
        user_id:        worker.id,
        date,
        check_in_time:  toISO(checkIn),
        check_out_time: checkOut ? toISO(checkOut) : null,
        note:           note.trim() || null
      })
      toast.success(`✅ ${worker.name_bn} এর হাজিরা সংশোধন সফল।`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সংশোধনে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">হাজিরা সংশোধন</h2>
            <p className="text-sm text-gray-500">{worker.name_bn} • {date}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500"><FiX /></button>
        </div>

        <div className="bg-amber-50 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
          <FiAlertTriangle className="flex-shrink-0 mt-0.5" />
          <span>সংশোধন করলে আগের তথ্য Audit Log-এ সেভ থাকবে।</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">চেক-ইন সময়</label>
            <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">চেক-আউট সময়</label>
            <input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">সংশোধনের কারণ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="যেমন: SR এর ফোনে সমস্যা ছিল..."
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
            বাতিল
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiCheck />}
            সংশোধন করুন
          </button>
        </div>
      </div>
    </div>
  )
}

export function ManagerAttendance() {
  const [attendance,    setAttendance]    = useState([])
  const [today,         setToday]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState('today')
  const [month,         setMonth]         = useState(String(new Date().getMonth() + 1))
  const [year,          setYear]          = useState(String(new Date().getFullYear()))
  const [corrModal,     setCorrModal]     = useState(null) // { worker, date }

  // ─── ছুটির আবেদন state ───
  const [leaveRequests, setLeaveRequests] = useState([])
  const [leaveLoading,  setLeaveLoading]  = useState(false)
  const [processing,    setProcessing]    = useState({})
  const [reviewModal,   setReviewModal]   = useState(null)
  const [reviewNote,    setReviewNote]    = useState('')
  const [reviewAction,  setReviewAction]  = useState(null)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const res = await api.get('/attendance/today')
        setToday(res.data.data.workers || [])
      } catch { toast.error('তথ্য আনতে সমস্যা।') }
      finally { setLoading(false) }
    }
    fetchToday()
    fetchLeaveRequests()
  }, [])

  const fetchLeaveRequests = async () => {
    setLeaveLoading(true)
    try {
      const res = await api.get('/attendance/leave/all')
      setLeaveRequests(res.data.data || [])
    } catch { /* silent */ }
    finally { setLeaveLoading(false) }
  }

  const fetchMonthly = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/reports/attendance?month=${month}&year=${year}`)
      setAttendance(res.data.data.workers || [])
    } catch { toast.error('তথ্য আনতে সমস্যা।') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (tab === 'monthly') fetchMonthly() }, [tab, month, year])

  // ─── Export CSV ───────────────────────────────────────────
  const handleExportToday = () => {
    const rows = today.map(w => ({
      'নাম':          w.name_bn,
      'কোড':          w.employee_code,
      'চেক-ইন':       w.check_in_time ? new Date(w.check_in_time).toLocaleTimeString('bn-BD') : '—',
      'চেক-আউট':      w.check_out_time ? new Date(w.check_out_time).toLocaleTimeString('bn-BD') : '—',
      'স্ট্যাটাস':    w.status || (w.check_in_time ? 'present' : 'absent'),
      'দেরি (মিনিট)': w.late_minutes || 0,
    }))
    exportCSV(rows, `attendance-today-${todayStr}.csv`)
  }

  const handleExportMonthly = () => {
    const rows = attendance.map(w => ({
      'নাম':            w.name_bn,
      'উপস্থিত':        w.present,
      'দেরি':           w.late,
      'অনুপস্থিত':      w.absent,
      'ছুটি':           w.leave || 0,
      'মোট কর্তন (৳)': parseInt(w.total_deduction || 0),
    }))
    const mName = new Date(2024, parseInt(month) - 1).toLocaleString('bn-BD', { month: 'long' })
    exportCSV(rows, `attendance-${mName}-${year}.csv`)
  }

  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending')

  const openReview = (leave, action) => { setReviewModal(leave); setReviewAction(action); setReviewNote('') }

  const submitReview = async () => {
    if (!reviewModal) return
    setProcessing(p => ({ ...p, [reviewModal.id]: reviewAction }))
    try {
      await api.put(`/attendance/leave/${reviewModal.id}/review`, {
        status: reviewAction,
        reviewer_note: reviewNote.trim() || null
      })
      toast.success(reviewAction === 'approved' ? '✅ ছুটি অনুমোদিত হয়েছে।' : '❌ আবেদন প্রত্যাখ্যান করা হয়েছে।')
      setReviewModal(null)
      fetchLeaveRequests()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [reviewModal?.id]: undefined }))
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2024, i).toLocaleString('bn-BD', { month: 'long' })
  }))

  const leaveTypeMap = { casual:'নৈমিত্তিক', sick:'অসুস্থতা', annual:'বার্ষিক', other:'অন্যান্য' }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800">হাজিরা</h1>

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {[
          { key: 'today',   label: 'আজকের লাইভ' },
          { key: 'monthly', label: 'মাসিক রিপোর্ট' },
          { key: 'leave',   label: `ছুটির আবেদন${pendingLeaves.length > 0 ? ` (${pendingLeaves.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {t.label}
            {t.key === 'leave' && pendingLeaves.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                {pendingLeaves.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Today Tab ── */}
      {tab === 'today' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={handleExportToday}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              <FiDownload size={14} /> CSV ডাউনলোড
            </button>
          </div>

          {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> :
            today.length === 0
              ? <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">আজ কোনো তথ্য নেই।</div>
              : today.map(w => (
              <Card key={w.id}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${w.check_in_time ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{w.name_bn}</p>
                    <p className="text-xs text-gray-400">{w.employee_code}</p>
                  </div>
                  {w.check_in_time && (
                    <div className="text-right text-xs text-gray-500 flex-shrink-0">
                      <p>ইন: {new Date(w.check_in_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</p>
                      {w.check_out_time && <p>আউট: {new Date(w.check_out_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                  )}
                  <Badge variant={w.status || (w.check_in_time ? 'present' : 'absent')} />
                  {w.late_minutes > 0 && <span className="text-xs text-amber-600 flex-shrink-0">দেরি: {w.late_minutes}মি</span>}
                  {/* Correction button */}
                  <button
                    onClick={() => setCorrModal({ worker: w, date: todayStr })}
                    title="সংশোধন করুন"
                    className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-primary/10 hover:text-primary flex-shrink-0"
                  >
                    <FiEdit2 size={13} />
                  </button>
                </div>
              </Card>
            ))
          }
        </div>
      )}

      {/* ── Monthly Tab ── */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <Select options={months} value={month} onChange={e => setMonth(e.target.value)} className="w-36" />
            <Select options={[{ value: '2025', label: '২০২৫' }, { value: '2026', label: '২০২৬' }]}
              value={year} onChange={e => setYear(e.target.value)} className="w-28" />
            <button onClick={handleExportMonthly}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 ml-auto">
              <FiDownload size={14} /> CSV ডাউনলোড
            </button>
          </div>

          {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> :
            attendance.length === 0
              ? <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">এই মাসে কোনো তথ্য নেই।</div>
              : <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {['নাম', 'উপস্থিত', 'দেরি', 'অনুপস্থিত', 'ছুটি', 'কর্তন', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((w, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium">{w.name_bn}</td>
                        <td className="px-4 py-3 text-emerald-600 font-semibold">{w.present}</td>
                        <td className="px-4 py-3 text-amber-600 font-semibold">{w.late}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{w.absent}</td>
                        <td className="px-4 py-3 text-blue-500 font-semibold">{w.leave || 0}</td>
                        <td className="px-4 py-3 text-red-500">৳{parseInt(w.total_deduction || 0)}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => setCorrModal({ worker: { id: w.id, name_bn: w.name_bn }, date: todayStr })}
                            title="আজকের হাজিরা সংশোধন"
                            className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-primary/10 hover:text-primary"
                          >
                            <FiEdit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {/* ── Leave Tab ── */}
      {tab === 'leave' && (
        <div className="space-y-4">
          {pendingLeaves.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mb-3">
                ⏳ {pendingLeaves.length}টি আবেদন অনুমোদনের অপেক্ষায়
              </p>
              <div className="space-y-3">
                {pendingLeaves.map(lv => (
                  <Card key={lv.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800 text-sm">{lv.employee_name}</p>
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{lv.employee_id}</span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                            {leaveTypeMap[lv.leave_type] || lv.leave_type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          📅 {new Date(lv.start_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}
                          {lv.start_date !== lv.end_date && ` — ${new Date(lv.end_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}`}
                        </p>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{lv.reason}</p>
                        <p className="text-xs text-gray-300 mt-1">{new Date(lv.created_at).toLocaleString('bn-BD')}</p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={() => openReview(lv, 'approved')} disabled={!!processing[lv.id]}
                          className="px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1">
                          {processing[lv.id] === 'approved'
                            ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : '✅'} অনুমোদন
                        </button>
                        <button onClick={() => openReview(lv, 'rejected')} disabled={!!processing[lv.id]}
                          className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1">
                          {processing[lv.id] === 'rejected'
                            ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                            : '✗'} বাতিল
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const reviewed = leaveRequests.filter(l => l.status !== 'pending')
            if (reviewed.length === 0 && pendingLeaves.length === 0) return (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm">কোনো ছুটির আবেদন নেই।</p>
              </div>
            )
            if (reviewed.length === 0) return null
            return (
              <div>
                <p className="text-xs font-semibold text-gray-400 px-1 mb-2">পর্যালোচিত আবেদন</p>
                <div className="space-y-2">
                  {reviewed.map(lv => {
                    const statusStyle = lv.status === 'approved'
                      ? { bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', label: 'অনুমোদিত' }
                      : { bg: 'bg-red-50',     badge: 'bg-red-100 text-red-600',         label: 'প্রত্যাখ্যাত' }
                    return (
                      <div key={lv.id} className={`${statusStyle.bg} rounded-xl px-4 py-3`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-800 text-sm">{lv.employee_name}</p>
                              <span className="text-xs text-gray-400">{lv.employee_id}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(lv.start_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}
                              {lv.start_date !== lv.end_date && ` — ${new Date(lv.end_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}`}
                              <span className="ml-2 text-gray-400">({leaveTypeMap[lv.leave_type] || lv.leave_type})</span>
                            </p>
                            {lv.reviewer_note && <p className="text-xs text-gray-500 italic mt-1">📝 {lv.reviewer_note}</p>}
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${statusStyle.badge}`}>
                            {statusStyle.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {leaveLoading && <div className="h-24 bg-white rounded-2xl animate-pulse" />}
        </div>
      )}

      {/* ── Correction Modal ── */}
      {corrModal && (
        <CorrectionModal
          worker={corrModal.worker}
          date={corrModal.date}
          onClose={() => setCorrModal(null)}
          onSuccess={() => {
            setCorrModal(null)
            if (tab === 'today') {
              api.get('/attendance/today').then(r => setToday(r.data.data.workers || []))
            } else {
              fetchMonthly()
            }
          }}
        />
      )}

      {/* ── Leave Review Modal ── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReviewModal(null)} />
          <div className="relative bg-white rounded-t-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-bold text-lg mb-1">
              {reviewAction === 'approved' ? '✅ ছুটি অনুমোদন করুন' : '❌ আবেদন প্রত্যাখ্যান করুন'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-semibold text-gray-700">{reviewModal.employee_name}</span> —{' '}
              {new Date(reviewModal.start_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}
              {reviewModal.start_date !== reviewModal.end_date && ` থেকে ${new Date(reviewModal.end_date).toLocaleDateString('bn-BD', { day:'numeric', month:'short' })}`}
            </p>
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                মন্তব্য <span className="text-gray-400 font-normal">(ঐচ্ছিক)</span>
              </label>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                placeholder={reviewAction === 'approved' ? 'অনুমোদনের কারণ বা নির্দেশনা...' : 'প্রত্যাখ্যানের কারণ লিখুন...'}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReviewModal(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">বাতিল</button>
              <button onClick={submitReview} disabled={!!processing[reviewModal.id]}
                className={`flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 ${reviewAction === 'approved' ? 'bg-green-500' : 'bg-red-500'}`}>
                {processing[reviewModal.id] ? 'প্রক্রিয়া হচ্ছে...'
                  : reviewAction === 'approved' ? '✅ অনুমোদন দিন' : '❌ প্রত্যাখ্যান করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Manager Customers Page
// ============================================================
export function ManagerCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    api.get('/customers')
      .then(res => setCustomers(res.data.data))
      .catch(() => toast.error('তথ্য আনতে সমস্যা।'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search) || c.customer_code?.includes(search)
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">কাস্টমার</h1>
        <span className="text-sm text-gray-500">মোট: {customers.length}</span>
      </div>

      <Input placeholder="দোকান বা মালিকের নাম" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {c.shop_photo ? <img src={c.shop_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">🏪</span>}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{c.shop_name}</p>
                  <p className="text-xs text-gray-500">{c.owner_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{c.customer_code}</p>
                  {parseFloat(c.current_credit) > 0 && (
                    <p className="text-xs text-red-600 mt-1">বকেয়া: ৳{parseFloat(c.current_credit).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Manager Routes Page
// ============================================================
export function ManagerRoutes() {
  const [routes,   setRoutes]   = useState([])
  const [pending,  setPending]  = useState([])   // SR-এর অনুমোদন-অপেক্ষায় রুট
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('active')  // 'active' | 'pending'
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState({ name: '', description: '' })
  const [saving,   setSaving]   = useState(false)
  const [processing, setProcessing] = useState({})  // { [id]: 'approving'|'rejecting' }

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/routes'),
      api.get('/routes/pending/list'),
    ]).then(([routeRes, pendingRes]) => {
      setRoutes(routeRes.data.data || [])
      setPending(pendingRes.data.data || [])
    }).catch(() => toast.error('তথ্য আনতে সমস্যা হয়েছে।'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name.trim()) return toast.error('রুটের নাম দিন।')
    setSaving(true)
    try {
      await api.post('/routes', form)
      toast.success('রুট তৈরি হয়েছে।')
      setModal(false)
      setForm({ name: '', description: '' })
      load()
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const approve = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: 'approving' }))
    try {
      await api.put(`/routes/${id}`, { status: 'approved', is_active: true })
      toast.success(`"${name}" অনুমোদন হয়েছে ✅`)
      setPending(prev => prev.filter(r => r.id !== id))
      load()  // active list রিফ্রেশ
    } catch { toast.error('অনুমোদনে সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: undefined })) }
  }

  const reject = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: 'rejecting' }))
    try {
      await api.put(`/routes/${id}`, { status: 'rejected', is_active: false })
      toast.success(`"${name}" বাতিল করা হয়েছে।`)
      setPending(prev => prev.filter(r => r.id !== id))
    } catch { toast.error('বাতিলে সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: undefined })) }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">রুট ব্যবস্থাপনা</h1>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold">
          + নতুন রুট
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors
            ${tab === 'active' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          সক্রিয় রুট ({routes.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-colors
            ${tab === 'pending' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          SR আবেদন
          {pending.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-500 text-white text-[10px] flex items-center justify-center font-bold">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> : (
        <>
          {/* ── Active routes tab ── */}
          {tab === 'active' && (
            routes.length === 0
              ? <p className="text-center text-gray-400 py-10">কোনো সক্রিয় রুট নেই।</p>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {routes.map(r => (
                    <Card key={r.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">🗺️</div>
                        <div>
                          <p className="font-bold text-gray-800">{r.name}</p>
                          {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-gray-400">
                            <span>SR: {r.worker_count || 0}</span>
                            <span>দোকান: {r.customer_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
          )}

          {/* ── Pending requests tab ── */}
          {tab === 'pending' && (
            pending.length === 0
              ? <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm">কোনো অনুমোদন-অপেক্ষায় আবেদন নেই।</p>
                </div>
              : <div className="space-y-3">
                  <p className="text-xs text-gray-400 px-1">
                    নিচের রুটগুলো SR দের পাঠানো request। অনুমোদন না দেওয়া পর্যন্ত SR-এর রুট তালিকায় দেখা যাবে না।
                  </p>
                  {pending.map(r => (
                    <Card key={r.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-xl flex-shrink-0">📍</div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 truncate">{r.name}</p>
                            {r.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>}
                            <p className="text-xs text-gray-400 mt-1">
                              আবেদনকারী: <span className="font-medium text-gray-600">{r.requested_by_name || '—'}</span>
                            </p>
                            <p className="text-xs text-gray-300">
                              {new Date(r.requested_at || r.created_at).toLocaleString('bn-BD')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(r.id, r.name)}
                            disabled={!!processing[r.id]}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1"
                          >
                            {processing[r.id] === 'approving'
                              ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : '✅'} অনুমোদন
                          </button>
                          <button
                            onClick={() => reject(r.id, r.name)}
                            disabled={!!processing[r.id]}
                            className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1"
                          >
                            {processing[r.id] === 'rejecting'
                              ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                              : '✗'} বাতিল
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
          )}
        </>
      )}

      {/* ── নতুন রুট Modal (Manager সরাসরি তৈরি করবে) ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg mb-4">নতুন রুট</h3>
            <div className="space-y-3">
              <Input label="রুটের নাম" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <Input label="বিবরণ" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">বাতিল</button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-sm bg-secondary text-white rounded-xl font-semibold disabled:opacity-60">
                {saving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerAttendance
