import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import { Pagination } from '../../components/ui/Table'
import {
  FiUsers, FiClock, FiCheckCircle, FiXCircle, FiEye,
  FiSearch, FiDownload, FiUser, FiPhone, FiMapPin,
  FiBook, FiBriefcase, FiStar, FiCalendar, FiMail,
  FiChevronDown, FiChevronUp, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi'


// ── Status Badge ──────────────────────────────────────────────
const STATUS_MAP = {
  pending:   { label: 'অপেক্ষামাণ',  color: 'yellow' },
  reviewed:  { label: 'পর্যালোচিত',  color: 'blue'   },
  selected:  { label: 'নির্বাচিত',   color: 'green'  },
  waiting:   { label: 'অপেক্ষায়',   color: 'purple' },
  rejected:  { label: 'প্রত্যাখ্যাত', color: 'red'   },
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    gray:   'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-400',
  }
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color] || colors.gray}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────
function DetailModal({ app, onClose, onStatusChange }) {
  const [status,  setStatus]  = useState(app.status)
  const [comment, setComment] = useState(app.admin_comment || '')
  const [saving,  setSaving]  = useState(false)
  const [section, setSection] = useState('personal')

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/recruitment/${app._id}/status`, { status, admin_comment: comment })
      toast.success('স্ট্যাটাস আপডেট হয়েছে।')
      onStatusChange({ ...app, status, admin_comment: comment })
      onClose()
    } catch { toast.error('আপডেট করতে সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const sections = [
    { id: 'personal', label: 'ব্যক্তিগত' },
    { id: 'address',  label: 'ঠিকানা' },
    { id: 'edu',      label: 'শিক্ষা' },
    { id: 'exp',      label: 'অভিজ্ঞতা' },
    { id: 'skills',   label: 'দক্ষতা' },
    { id: 'ref',      label: 'রেফারেন্স' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-start gap-4">
          {app.photo_url
            ? <img src={app.photo_url} alt="ছবি" className="w-16 h-16 rounded-xl object-cover border-2 border-gray-100 dark:border-slate-600 flex-shrink-0" />
            : <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <FiUser className="text-gray-400" size={24}/>
              </div>
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{app.name_bn}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{app.name_en}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{app.application_id}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 flex-shrink-0">✕</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <FiPhone size={11}/> {app.phone}
              </span>
              {app.email && <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <FiMail size={11}/> {app.email}
              </span>}
              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <FiMapPin size={11}/> {app.district}, {app.thana}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <FiCalendar size={11}/> {new Date(app.created_at).toLocaleDateString('bn-BD')}
              </span>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-100 dark:border-slate-700 px-2">
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2
                ${section === s.id
                  ? 'border-red-500 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {section === 'personal' && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ['পিতার নাম', app.father_name],
                ['মাতার নাম', app.mother_name],
                ['জন্ম তারিখ', app.dob],
                ['লিঙ্গ', app.gender === 'male' ? 'পুরুষ' : app.gender === 'female' ? 'মহিলা' : 'অন্যান্য'],
                ['বৈবাহিক অবস্থা', app.marital_status === 'single' ? 'অবিবাহিত' : 'বিবাহিত'],
                ['NID নম্বর', app.nid],
              ].map(([k, v]) => (
                <div key={k} className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{v || '—'}</p>
                </div>
              ))}
            </div>
          )}
          {section === 'address' && (
            <div className="space-y-3">
              {[
                ['স্থায়ী ঠিকানা', app.permanent_address],
                ['বর্তমান ঠিকানা', app.current_address],
                ['জেলা', app.district],
                ['থানা/উপজেলা', app.thana],
              ].map(([k, v]) => (
                <div key={k} className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{v || '—'}</p>
                </div>
              ))}
            </div>
          )}
          {section === 'edu' && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50">
                  <tr>{['পরীক্ষা','বোর্ড','বছর','জিপিএ'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {[
                    ['SSC', app.edu_ssc_board, app.edu_ssc_year, app.edu_ssc_gpa],
                    ['HSC', app.edu_hsc_board, app.edu_hsc_year, app.edu_hsc_gpa],
                    ['Degree', app.edu_degree_board, app.edu_degree_year, app.edu_degree_gpa],
                    ['অন্যান্য', app.edu_other_edu_board, app.edu_other_edu_year, app.edu_other_edu_gpa],
                  ].filter(r => r[1] || r[2] || r[3]).map(([name, board, year, gpa]) => (
                    <tr key={name} className="bg-white dark:bg-slate-800">
                      <td className="px-3 py-2 text-xs font-medium">{name}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{board || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{year || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{gpa || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {section === 'exp' && (
            <div className="space-y-3">
              {[0,1,2].map(i => app[`exp_${i}_company`] ? (
                <div key={i} className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{app[`exp_${i}_company`]}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{app[`exp_${i}_position`]} • {app[`exp_${i}_duration`]}</p>
                  {app[`exp_${i}_duties`] && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{app[`exp_${i}_duties`]}</p>}
                </div>
              ) : null)}
              {app.total_exp_years && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  মোট অভিজ্ঞতা: <strong>{app.total_exp_years} বছর {app.total_exp_months || 0} মাস</strong>
                </p>
              )}
              {![0,1,2].some(i => app[`exp_${i}_company`]) && (
                <p className="text-sm text-gray-400 text-center py-4">কোনো অভিজ্ঞতা নেই</p>
              )}
            </div>
          )}
          {section === 'skills' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['বাংলা যোগাযোগ', app.skill_bangla],
                  ['ইংরেজি যোগাযোগ', app.skill_english],
                  ['স্মার্টফোন', app.skill_smartphone],
                  ['কম্পিউটার', app.skill_computer],
                ].map(([k,v]) => (
                  <div key={k} className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{v || '—'}</p>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-xs text-gray-400">মোটরসাইকেল</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{app.has_bike === 'yes' ? '✅ আছে' : '❌ নেই'}</p>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-900/30">
                <p className="text-xs font-bold text-orange-700 dark:text-orange-400 mb-2">জরুরি যোগাযোগ</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{app.emergency_name} ({app.emergency_relation})</p>
                <p className="text-xs text-gray-500">{app.emergency_phone} • {app.emergency_address}</p>
              </div>
            </div>
          )}
          {section === 'ref' && (
            <div className="space-y-3">
              {[1,2].map(n => app[`ref${n}_name`] ? (
                <div key={n} className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-gray-400 font-bold uppercase">রেফারেন্স {n}</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 mt-1">{app[`ref${n}_name`]}</p>
                  <p className="text-xs text-gray-500">{app[`ref${n}_profession`]} • {app[`ref${n}_phone`]}</p>
                  <p className="text-xs text-gray-500">{app[`ref${n}_address`]}</p>
                </div>
              ) : <p key={n} className="text-sm text-gray-400 text-center py-2">রেফারেন্স {n} নেই</p>)}
            </div>
          )}
        </div>

        {/* Status Update Footer */}
        <div className="p-5 border-t border-gray-100 dark:border-slate-700 space-y-3 bg-gray-50 dark:bg-slate-800/80">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">স্ট্যাটাস পরিবর্তন</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-800 dark:text-gray-200">
                {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">মন্তব্য / মূল্যায়ন</label>
              <input value={comment} onChange={e => setComment(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-800 dark:text-gray-200"
                placeholder="মন্তব্য লিখুন..." />
            </div>
          </div>
          <Button onClick={save} loading={saving} size="sm" className="w-full">
            স্ট্যাটাস সেভ করুন
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── APPLICATION ROW ───────────────────────────────────────────
function AppRow({ app, onView }) {
  const st = STATUS_MAP[app.status] || STATUS_MAP.pending
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => onView(app)}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {app.photo_url
            ? <img src={app.photo_url} alt="ছবি" className="w-9 h-9 rounded-lg object-cover border border-gray-200 dark:border-slate-600 flex-shrink-0"/>
            : <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <FiUser size={14} className="text-gray-400"/>
              </div>
          }
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{app.name_bn}</p>
            <p className="text-xs text-gray-400">{app.name_en}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">{app.phone}</p>
        {app.email && <p className="text-xs text-gray-400">{app.email}</p>}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <p className="text-sm text-gray-700 dark:text-gray-300">{app.district}</p>
        <p className="text-xs text-gray-400">{app.thana}</p>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {app.total_exp_years ? `${app.total_exp_years} বছর` : 'নেই'}
        </p>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
          ${app.status === 'selected' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : app.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : app.status === 'reviewed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
          {st.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
        {new Date(app.created_at).toLocaleDateString('bn-BD')}
      </td>
      <td className="px-4 py-3">
        <button className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
          <FiEye size={15}/>
        </button>
      </td>
    </tr>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function SRRecruitmentDashboard() {
  const [apps,        setApps]        = useState([])
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const [page,        setPage]        = useState(1)
  const [total,       setTotal]       = useState(0)
  const [selected,    setSelected]    = useState(null)
  const LIMIT = 20

  const fetchApps = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, limit: LIMIT,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      })
      const res = await api.get(`/recruitment?${params}`)
      setApps(res.data.data.applications)
      setTotal(res.data.data.total)
      setStats(res.data.data.stats)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchApps() }, [page, statusFilter])
  useEffect(() => {
    const t = setTimeout(fetchApps, 500)
    return () => clearTimeout(t)
  }, [search])

  const handleStatusChange = (updated) => {
    setApps(prev => prev.map(a => a._id === updated._id ? updated : a))
    fetchApps()
  }

  const exportCSV = async () => {
    try {
      const res = await api.get('/recruitment/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url
      a.download = `SR_Applications_${new Date().toISOString().split('T')[0]}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Export করতে সমস্যা হয়েছে।') }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <FiUsers className="text-white" size={16}/>
            </span>
            SR নিয়োগ আবেদন
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">সেলস রিপ্রেজেন্টেটিভ নিয়োগের সকল আবেদন</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<FiRefreshCw size={14}/>} onClick={fetchApps}>রিফ্রেশ</Button>
          <Button variant="outline" size="sm" icon={<FiDownload size={14}/>} onClick={exportCSV}>CSV Export</Button>
          <a href="/apply/sr" target="_blank"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all">
            আবেদন লিংক
          </a>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="মোট আবেদন"      value={stats.total}    icon={FiUsers}       color="gray" />
          <StatCard label="অপেক্ষামাণ"     value={stats.pending}  icon={FiClock}       color="yellow" />
          <StatCard label="নির্বাচিত"      value={stats.selected} icon={FiCheckCircle} color="green" />
          <StatCard label="প্রত্যাখ্যাত"   value={stats.rejected} icon={FiXCircle}     color="red" />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14}/>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              placeholder="নাম, ফোন, NID দিয়ে খুঁজুন..." />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20">
            <option value="">সকল স্ট্যাটাস</option>
            {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-red-600/20 border-t-red-600 rounded-full animate-spin"/>
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-16">
            <FiUsers className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={40}/>
            <p className="text-gray-500 dark:text-gray-400 font-medium">কোনো আবেদন পাওয়া যায়নি</p>
            <p className="text-xs text-gray-400 mt-1">আবেদন লিংক শেয়ার করুন</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  {['আবেদনকারী','যোগাযোগ','এলাকা','অভিজ্ঞতা','স্ট্যাটাস','তারিখ',''].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400
                      ${h === 'এলাকা' ? 'hidden sm:table-cell' : h === 'অভিজ্ঞতা' ? 'hidden md:table-cell' : h === 'তারিখ' ? 'hidden lg:table-cell' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {apps.map(app => <AppRow key={app._id} app={app} onView={setSelected} />)}
              </tbody>
            </table>
          </div>
        )}
        {total > LIMIT && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <DetailModal
          app={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
