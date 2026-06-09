import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import {
  FiCheck, FiX, FiCalendar, FiClock,
  FiUser, FiEdit3, FiRefreshCw, FiAlertCircle
} from 'react-icons/fi'

const LEAVE_TYPES = {
  sick:      { label: 'অসুস্থতা',   color: 'bg-red-100 text-red-700' },
  casual:    { label: 'ক্যাজুয়াল',  color: 'bg-blue-100 text-blue-700' },
  annual:    { label: 'বার্ষিক',    color: 'bg-green-100 text-green-700' },
  emergency: { label: 'জরুরি',      color: 'bg-orange-100 text-orange-700' },
  other:     { label: 'অন্যান্য',   color: 'bg-gray-100 text-gray-700' },
}

export default function AdminLeaveManagement() {
  const [tab,          setTab]          = useState('leave')

  // ── Leave ────────────────────────────────────────────────────
  const [leaves,       setLeaves]       = useState([])
  const [leavesLoading,setLeavesLoading]= useState(true)
  const [leaveFilter,  setLeaveFilter]  = useState('pending')
  const [processing,   setProcessing]   = useState({})
  const [noteModal,    setNoteModal]    = useState(null)   // { id, action }
  const [reviewNote,   setReviewNote]   = useState('')

  // ── Attendance Correction ────────────────────────────────────
  const [employees,    setEmployees]    = useState([])
  const [corrForm,     setCorrForm]     = useState({
    user_id: '', date: '', check_in_time: '', check_out_time: '', note: ''
  })
  const [corrSaving,   setCorrSaving]   = useState(false)

  // ── Leave লোড ────────────────────────────────────────────────
  const loadLeaves = useCallback(async () => {
    setLeavesLoading(true)
    try {
      const res = await api.get('/attendance/leave/all', {
        params: leaveFilter ? { status: leaveFilter } : {}
      })
      setLeaves(res.data.data || [])
    } catch { toast.error('ছুটির তালিকা আনতে সমস্যা।') }
    finally { setLeavesLoading(false) }
  }, [leaveFilter])

  useEffect(() => { loadLeaves() }, [loadLeaves])

  // ── Employees লোড (Correction-এর জন্য) ─────────────────────
  useEffect(() => {
    api.get('/employees', { params: { status: 'active', limit: 200 } })
      .then(res => setEmployees(res.data.data || []))
      .catch(() => {})
  }, [])

  // ── Leave Review ─────────────────────────────────────────────
  const openReview = (id, action) => {
    setNoteModal({ id, action })
    setReviewNote('')
  }

  const submitReview = async () => {
    if (!noteModal) return
    const { id, action } = noteModal
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put(`/attendance/leave/${id}/review`, {
        status: action,
        reviewer_note: reviewNote.trim() || null
      })
      toast.success(action === 'approved' ? 'ছুটি অনুমোদন হয়েছে। ✅' : 'ছুটি বাতিল করা হয়েছে। ❌')
      setNoteModal(null)
      loadLeaves()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  // ── Attendance Correction ────────────────────────────────────
  const setCF = (key, val) => setCorrForm(p => ({ ...p, [key]: val }))

  const submitCorrection = async () => {
    if (!corrForm.user_id || !corrForm.date) {
      toast.error('কর্মচারী ও তারিখ বাধ্যতামূলক।')
      return
    }
    setCorrSaving(true)
    try {
      await api.put('/attendance/correct', {
        user_id:        corrForm.user_id,
        date:           corrForm.date,
        check_in_time:  corrForm.check_in_time || null,
        check_out_time: corrForm.check_out_time || null,
        note:           corrForm.note || null,
      })
      toast.success('হাজিরা সংশোধন সম্পন্ন। ✅')
      setCorrForm({ user_id: '', date: '', check_in_time: '', check_out_time: '', note: '' })
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setCorrSaving(false)
    }
  }

  const dayCount = (from, to) => {
    if (!from || !to) return 1
    const diff = (new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)
    return Math.max(1, Math.round(diff) + 1)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800">ছুটি ও হাজিরা ব্যবস্থাপনা</h1>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'leave',      label: '📅 ছুটির আবেদন' },
          { key: 'correction', label: '✏️ হাজিরা সংশোধন' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ছুটির আবেদন ─────────────────────────────────────── */}
      {tab === 'leave' && (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'pending',  label: 'অপেক্ষমান' },
              { value: 'approved', label: 'অনুমোদিত' },
              { value: 'rejected', label: 'বাতিল' },
              { value: '',         label: 'সব' },
            ].map(f => (
              <button key={f.value}
                onClick={() => setLeaveFilter(f.value)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  leaveFilter === f.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
            <button onClick={loadLeaves}
              className="p-1.5 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600">
              <FiRefreshCw size={14} className={leavesLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {leavesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
            </div>
          ) : leaves.length === 0 ? (
            <Card>
              <p className="text-center text-gray-400 py-10">
                {leaveFilter === 'pending' ? 'কোনো অপেক্ষমান ছুটির আবেদন নেই। ✅' : 'কোনো তথ্য নেই।'}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {leaves.map(leave => {
                const typeInfo = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.other
                const days = dayCount(leave.start_date, leave.end_date)
                return (
                  <Card key={leave.id}>
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FiUser className="text-primary" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-800">{leave.employee_name || leave.name_bn || '—'}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            leave.status === 'approved' ? 'bg-green-100 text-green-700' :
                            leave.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {leave.status === 'approved' ? '✅ অনুমোদিত' :
                             leave.status === 'rejected' ? '❌ বাতিল' : '⏳ অপেক্ষমান'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{leave.employee_code || ''}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <FiCalendar size={11} />
                            {new Date(leave.start_date).toLocaleDateString('bn-BD')}
                            {leave.end_date && leave.end_date !== leave.start_date &&
                              ` — ${new Date(leave.end_date).toLocaleDateString('bn-BD')}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <FiClock size={11} /> {days} দিন
                          </span>
                        </div>
                        {leave.reason && (
                          <p className="text-xs text-gray-400 mt-1 italic">"{leave.reason}"</p>
                        )}
                        {leave.reviewer_note && leave.status !== 'pending' && (
                          <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded-lg px-2 py-1">
                            মন্তব্য: {leave.reviewer_note}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {leave.status === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => openReview(leave.id, 'rejected')}
                            disabled={processing[leave.id]}
                            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50"
                          >
                            <FiX />
                          </button>
                          <button
                            onClick={() => openReview(leave.id, 'approved')}
                            disabled={processing[leave.id]}
                            className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                          >
                            {processing[leave.id]
                              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <FiCheck />}
                            অনুমোদন
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── হাজিরা সংশোধন ─────────────────────────────────────── */}
      {tab === 'correction' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <FiAlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-xs text-amber-700">
              শুধুমাত্র ভুল বা ছুটির কারণে মিস হওয়া হাজিরা সংশোধন করুন।
              সংশোধনের তথ্য Audit Log-এ সংরক্ষিত হয়।
            </p>
          </div>

          <Card title="হাজিরা সংশোধন ফর্ম">
            <div className="space-y-3">
              {/* Employee Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">কর্মচারী বেছে নিন *</label>
                <select
                  value={corrForm.user_id}
                  onChange={e => setCF('user_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
                >
                  <option value="">— কর্মচারী নির্বাচন করুন —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name_bn || emp.name_en} ({emp.employee_code || emp.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">তারিখ *</label>
                <input
                  type="date"
                  value={corrForm.date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setCF('date', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
                />
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    চেক-ইন সময়
                  </label>
                  <input
                    type="time"
                    value={corrForm.check_in_time}
                    onChange={e => setCF('check_in_time', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    চেক-আউট সময়
                  </label>
                  <input
                    type="time"
                    value={corrForm.check_out_time}
                    onChange={e => setCF('check_out_time', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-1">
                যে ফিল্ড খালি রাখবেন সেটি সংশোধন হবে না।
              </p>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">কারণ / নোট</label>
                <textarea
                  rows={2}
                  placeholder="যেমন: যন্ত্রপাতি সমস্যায় চেক-ইন রেকর্ড হয়নি"
                  value={corrForm.note}
                  onChange={e => setCF('note', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Submit */}
              <button
                onClick={submitCorrection}
                disabled={corrSaving || !corrForm.user_id || !corrForm.date}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {corrSaving
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <FiEdit3 size={15} />}
                হাজিরা সংশোধন করুন
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Review Modal (note সহ approve/reject) ────────────────── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">
              {noteModal.action === 'approved' ? '✅ ছুটি অনুমোদন' : '❌ ছুটি বাতিল'}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                মন্তব্য (ঐচ্ছিক)
              </label>
              <textarea
                rows={3}
                placeholder="কর্মচারীকে জানাতে চাইলে লিখুন..."
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
                বাতিল
              </button>
              <button
                onClick={submitReview}
                disabled={processing[noteModal.id]}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${
                  noteModal.action === 'approved' ? 'bg-secondary' : 'bg-red-500'
                }`}
              >
                {processing[noteModal.id]
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : noteModal.action === 'approved' ? <FiCheck /> : <FiX />}
                নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
