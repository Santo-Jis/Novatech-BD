import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import {
  FiSearch, FiUser, FiPhone, FiDollarSign, FiDownload,
  FiTarget, FiTrendingUp, FiUsers, FiCheck, FiEdit2,
  FiMapPin, FiEye, FiX, FiCalendar, FiCheckCircle, FiXCircle
} from 'react-icons/fi'

const fmt  = n => Number(n || 0).toLocaleString('bn-BD')
const WEEKDAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি']

export default function ManagerTeam() {
  const navigate = useNavigate()
  const [team,    setTeam]    = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  // Target modal
  const [targetModal, setTargetModal] = useState(null)
  const [targetVal,   setTargetVal]   = useState('')
  const [saving,      setSaving]      = useState(false)

  // Visit log modal
  const [visitModal,   setVisitModal]   = useState(null)  // sr object
  const [visitDate,    setVisitDate]    = useState(() => new Date().toISOString().split('T')[0])
  const [visits,       setVisits]       = useState([])
  const [visitLoading, setVisitLoading] = useState(false)
  const [photoModal,   setPhotoModal]   = useState(null)  // image url

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/teams/manager/my')
      setTeam(res.data.data.team)
      setMembers(res.data.data.members)
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openTarget = (sr) => {
    setTargetVal(sr.monthly_target || '')
    setTargetModal(sr)
  }

  const handleSetTarget = async () => {
    if (!targetVal || isNaN(targetVal) || parseFloat(targetVal) < 0) {
      toast.error('বৈধ টার্গেট পরিমাণ দিন।')
      return
    }
    setSaving(true)
    try {
      await api.patch(`/teams/sr/${targetModal.id}/target`, {
        monthly_target: parseFloat(targetVal)
      })
      toast.success(`${targetModal.name_bn}-এর টার্গেট সেট হয়েছে!`)
      setTargetModal(null)
      // local state আপডেট
      setMembers(prev => prev.map(m =>
        m.id === targetModal.id ? { ...m, monthly_target: parseFloat(targetVal) } : m
      ))
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  const fetchVisits = async (workerId, date) => {
    setVisitLoading(true)
    setVisits([])
    try {
      const res = await api.get(`/sales/team-visits?worker_id=${workerId}&date=${date}`)
      setVisits(res.data.data || [])
    } catch {
      toast.error('ভিজিট তথ্য আনতে সমস্যা।')
    } finally {
      setVisitLoading(false)
    }
  }

  const openVisitLog = (sr) => {
    setVisitModal(sr)
    setVisitDate(new Date().toISOString().split('T')[0])
    fetchVisits(sr.id, new Date().toISOString().split('T')[0])
  }

  const handleDateChange = (date) => {
    setVisitDate(date)
    fetchVisits(visitModal.id, date)
  }
    try {
      const res = await api.get(`/reports/employee/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `employee_${code}.pdf`
      a.click()
    } catch {
      toast.error('PDF ডাউনলোডে সমস্যা।')
    }
  }

  const filtered = members.filter(w =>
    w.name_bn.includes(search) ||
    w.employee_code?.includes(search) ||
    w.phone?.includes(search)
  )

  // ─── Loading skeleton ─────────────────────────────────
  if (loading) return (
    <div className="space-y-5">
      <div className="h-28 bg-white rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-44 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  )

  // ─── টিম নেই ──────────────────────────────────────────
  if (!team) return (
    <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
      <FiUsers className="text-5xl text-gray-300 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-gray-600 mb-2">আপনার কোনো টিম নেই</h2>
      <p className="text-sm text-gray-400">Admin-এর সাথে যোগাযোগ করুন টিম নিয়োগের জন্য।</p>
    </div>
  )

  // ─── টিম সারাংশ ───────────────────────────────────────
  const totalTarget = members.reduce((s, m) => s + parseFloat(m.monthly_target || 0), 0)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── টিম ব্যানার ────────────────────────────────── */}
      <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-white/70 text-sm">আমার টিম</p>
            <h1 className="text-2xl font-bold mt-0.5">{team.name}</h1>
            {team.description && (
              <p className="text-white/60 text-xs mt-1">{team.description}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-white/70 text-xs">টিম মাসিক টার্গেট</p>
            <p className="text-xl font-bold">৳{fmt(team.monthly_target)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{members.length}</p>
            <p className="text-white/70 text-xs mt-0.5">মোট SR</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{members.filter(m => m.status === 'active').length}</p>
            <p className="text-white/70 text-xs mt-0.5">সক্রিয়</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-sm font-bold leading-tight">৳{fmt(totalTarget)}</p>
            <p className="text-white/70 text-xs mt-0.5">SR টার্গেট মোট</p>
          </div>
        </div>
      </div>

      {/* ─── Header & Search ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-800">SR তালিকা ({members.length} জন)</h2>
        <Input
          placeholder="নাম, কোড বা ফোন"
          icon={<FiSearch />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* ─── SR Cards ─────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
          <p className="text-gray-400">কোনো SR পাওয়া যায়নি।</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(worker => (
            <SRCard
              key={worker.id}
              worker={worker}
              onTarget={openTarget}
              onDownload={downloadPDF}
              onDetails={() => navigate(`/admin/employees/${worker.id}`)}
              onVisitLog={openVisitLog}
            />
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          MODAL: SR টার্গেট সেট
      ════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!targetModal}
        onClose={() => setTargetModal(null)}
        title={`টার্গেট সেট — ${targetModal?.name_bn}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTargetModal(null)}>বাতিল</Button>
            <Button onClick={handleSetTarget} loading={saving} icon={<FiCheck />}>সেট করুন</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-500">{targetModal?.employee_code}</p>
            <p className="text-sm text-blue-600 mt-1">বর্তমান টার্গেট</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              ৳{fmt(targetModal?.monthly_target)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              নতুন মাসিক টার্গেট (টাকা)
            </label>
            <Input
              type="number"
              placeholder="যেমন: 150000"
              value={targetVal}
              onChange={e => setTargetVal(e.target.value)}
              icon={<span className="text-gray-400 text-xs font-bold">৳</span>}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              টিমের মোট টার্গেট: ৳{fmt(team.monthly_target)}
            </p>
          </div>
        </div>
      </Modal>

      {/* ════ MODAL: Visit Log ════ */}
      <Modal
        isOpen={!!visitModal}
        onClose={() => { setVisitModal(null); setVisits([]) }}
        title={`ভিজিট লগ — ${visitModal?.name_bn}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <FiCalendar className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={visitDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => handleDateChange(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-gray-400">
              {visitLoading ? 'লোড হচ্ছে...' : `${visits.length}টি ভিজিট`}
            </span>
          </div>

          {visitLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : visits.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <FiMapPin className="text-3xl mx-auto mb-2 opacity-30" />
              <p className="text-sm">এই তারিখে কোনো ভিজিট নেই</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {visits.map((v, i) => {
                const time = new Date(v.created_at)
                return (
                  <div key={i} className={`rounded-xl border p-3 ${v.will_sell ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {v.will_sell
                            ? <FiCheckCircle className="text-green-500 flex-shrink-0" size={14} />
                            : <FiXCircle className="text-red-400 flex-shrink-0" size={14} />
                          }
                          <p className="font-semibold text-sm text-gray-800 truncate">{v.shop_name}</p>
                          {v.area && <span className="text-xs text-gray-400">{v.area}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 ml-5">
                          {time.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
                          {v.location_matched === false && (
                            <span className="ml-2 text-orange-500 font-medium">
                              ⚠️ লোকেশন মেলেনি ({v.location_distance}মি)
                            </span>
                          )}
                        </p>
                        {!v.will_sell && v.no_sell_reason && (
                          <div className="mt-1.5 ml-5 bg-white rounded-lg px-2 py-1 border border-red-100">
                            <p className="text-xs text-red-600">
                              <span className="font-semibold">কারণ:</span> {v.no_sell_reason}
                            </p>
                          </div>
                        )}
                      </div>
                      {v.closed_shop_photo && (
                        <button
                          onClick={() => setPhotoModal(v.closed_shop_photo)}
                          className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-red-200 hover:opacity-80 transition-opacity"
                        >
                          <img src={v.closed_shop_photo} alt="দোকান" className="w-full h-full object-cover" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {visits.length > 0 && (
            <div className="flex gap-4 pt-2 border-t border-gray-100 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <FiCheckCircle className="text-green-500" />
                বিক্রয়: {visits.filter(v => v.will_sell).length}
              </span>
              <span className="flex items-center gap-1">
                <FiXCircle className="text-red-400" />
                বিক্রয়বিহীন: {visits.filter(v => !v.will_sell).length}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ════ MODAL: Full Photo ════ */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20"
            onClick={() => setPhotoModal(null)}
          >
            <FiX />
          </button>
          <img
            src={photoModal}
            alt="বন্ধ দোকান"
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ─── SR Card Component ─────────────────────────────────────
function SRCard({ worker, onTarget, onDownload, onDetails, onVisitLog }) {
  const hasTarget = parseFloat(worker.monthly_target || 0) > 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-secondary to-secondary-light p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {worker.profile_photo
            ? <img src={worker.profile_photo} alt="" className="w-full h-full object-cover" />
            : <FiUser className="text-white text-xl" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold truncate">{worker.name_bn}</p>
          <p className="text-white/70 text-xs font-mono">{worker.employee_code}</p>
        </div>
        <Badge variant={worker.status === 'active' ? 'active' : 'inactive'} />
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FiPhone className="text-gray-400 flex-shrink-0" />
          <span>{worker.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FiDollarSign className="text-gray-400 flex-shrink-0" />
          <span>বেতন: ৳{fmt(worker.basic_salary)}</span>
        </div>
        {parseFloat(worker.outstanding_dues || 0) > 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
            <span>বকেয়া: ৳{fmt(worker.outstanding_dues)}</span>
          </div>
        )}

        {/* Target Badge */}
        <div className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 mt-1 ${hasTarget ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-600'}`}>
          <FiTarget className="flex-shrink-0" />
          <span className="font-medium">
            {hasTarget ? `টার্গেট: ৳${fmt(worker.monthly_target)}` : 'টার্গেট সেট হয়নি'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2 flex-wrap">
        <button
          onClick={onDetails}
          className="flex-1 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
        >
          বিস্তারিত
        </button>
        <button
          onClick={() => onVisitLog(worker)}
          className="flex-1 py-2 text-sm border border-blue-200 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
        >
          <FiMapPin className="text-xs" /> ভিজিট
        </button>
        <button
          onClick={() => onTarget(worker)}
          className="flex-1 py-2 text-sm border border-green-200 rounded-xl text-green-600 hover:bg-green-50 transition-colors flex items-center justify-center gap-1"
        >
          <FiEdit2 className="text-xs" /> টার্গেট
        </button>
        <button
          onClick={() => onDownload(worker.id, worker.employee_code)}
          className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
          title="PDF"
        >
          <FiDownload />
        </button>
      </div>
    </div>
  )
}
