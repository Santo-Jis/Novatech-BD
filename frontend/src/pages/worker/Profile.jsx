import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/auth.store'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiUser, FiMail, FiPhone, FiMapPin, FiCalendar,
  FiLock, FiCamera, FiEdit2, FiSave, FiX,
  FiDollarSign, FiTrendingUp, FiCheckCircle, FiClock,
  FiAward, FiUsers, FiBarChart2, FiRefreshCw, FiLogOut
} from 'react-icons/fi'


// ============================================================
// Worker Profile Page — Enhanced
// ============================================================

export default function Profile() {
  const { user, updateUser, fetchMe, logout } = useAuthStore()

  const [profile,        setProfile]        = useState(null)
  const [stats,          setStats]          = useState(null)
  const [attendance,     setAttendance]      = useState(null)
  const [commission,     setCommission]      = useState(null)
  const [bonusStatus,    setBonusStatus]     = useState(null)
  const [weeklySales,    setWeeklySales]     = useState([])
  const [customerCount,  setCustomerCount]   = useState(null)
  const [loading,        setLoading]         = useState(true)
  const [error,          setError]           = useState(null)
  const [editing,        setEditing]         = useState(false)
  const [saving,         setSaving]          = useState(false)
  const [passModal,      setPassModal]       = useState(false)
  const [photoUploading, setPhotoUploading]  = useState(false)

  const fileRef = useRef()

  const [form, setForm] = useState({
    name_bn: '', name_en: '', phone: '',
    current_address: '', emergency_contact: ''
  })

  const [passForm, setPassForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  })

  // ── Data Fetch ──
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // প্রোফাইল — fail হলে store থেকে নাও
      let meData = null
      try {
        const meRes = await api.get('/auth/me')
        meData = meRes.data.data
      } catch {
        meData = user
        if (!meData) {
          setError('প্রোফাইল লোড করা যায়নি। ইন্টারনেট চেক করুন।')
          setLoading(false)
          return
        }
      }
      setProfile(meData)
      setForm({
        name_bn:           meData.name_bn           || '',
        name_en:           meData.name_en           || '',
        phone:             meData.phone             || '',
        current_address:   meData.current_address   || '',
        emergency_contact: meData.emergency_contact || ''
      })

      // বাকি সব parallel — যেকোনো একটা fail হলেও বাকিগুলো চলবে
      const [statsRes, attRes, commRes, bonusRes, custRes] = await Promise.allSettled([
        api.get('/sales/today-summary'),
        api.get('/attendance/my'),
        api.get('/commission/my'),
        api.get('/commission/bonus-status'),
        api.get('/customers/my-count'),
      ])

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data)
      if (attRes.status   === 'fulfilled') setAttendance(attRes.value.data.data)
      if (commRes.status  === 'fulfilled') setCommission(commRes.value.data.data)
      if (bonusRes.status === 'fulfilled') setBonusStatus(bonusRes.value.data.data)
      if (custRes.status  === 'fulfilled') setCustomerCount(custRes.value.data.data)

      // গত ৭ দিনের বিক্রয়
      try {
        const to   = new Date().toISOString().split('T')[0]
        const from = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]
        const sRes = await api.get(`/sales/my?from=${from}&to=${to}`)
        const rows = sRes.data.data || []

        const grouped = {}
        for (let i = 0; i < 7; i++) {
          const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0]
          grouped[d] = 0
        }
        rows.forEach(r => {
          const d = (r.date || '').split('T')[0]
          if (grouped[d] !== undefined) grouped[d] += parseFloat(r.total_amount || 0)
        })

        const days = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি']
        setWeeklySales(
          Object.entries(grouped).map(([date, total]) => ({
            name:  days[new Date(date).getDay()],
            total: Math.round(total),
          }))
        )
      } catch { setWeeklySales([]) }

    } catch {
      setError('তথ্য লোড হয়নি। আবার চেষ্টা করুন।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          setError('সার্ভার সাড়া দিচ্ছে না। একটু পরে আবার চেষ্টা করুন।')
          return false
        }
        return prev
      })
    }, 8000)
    return () => clearTimeout(timeout)
  }, [])

  // ── Save Profile ──
  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/employees/profile', form)
      await fetchMe()
      await fetchData()
      setEditing(false)
      toast.success('প্রোফাইল আপডেট হয়েছে ✅')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSaving(false)
    }
  }

  // ── Change Password ──
  const handlePasswordChange = async () => {
    if (passForm.newPassword !== passForm.confirmPassword) {
      return toast.error('নতুন পাসওয়ার্ড মিলছে না')
    }
    if (passForm.newPassword.length < 6) {
      return toast.error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে')
    }
    try {
      await api.put('/auth/change-password', {
        currentPassword: passForm.currentPassword,
        newPassword:     passForm.newPassword
      })
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে ✅')
      setPassModal(false)
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.response?.data?.message || 'পাসওয়ার্ড পরিবর্তন হয়নি')
    }
  }

  // ── Photo Upload ──
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      await api.post('/employees/profile-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      await fetchMe()
      await fetchData()
      toast.success('ছবি আপলোড হয়েছে ✅')
    } catch {
      toast.error('ছবি আপলোড হয়নি')
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center py-10 gap-3">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500 text-sm">প্রোফাইল লোড হচ্ছে...</span>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <FiUser className="text-3xl text-red-400" />
        </div>
        <p className="text-gray-600 text-center">{error}</p>
        <button
          onClick={fetchData}
          className="bg-primary text-white px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2"
        >
          <FiRefreshCw /> আবার চেষ্টা করুন
        </button>
      </div>
    )
  }

  const p   = profile || user
  const att = attendance?.summary
  const comm = commission?.summary
  const thisMonthAtt = att ? (att.present + att.late) : 0
  const workingDays  = attendance?.bonus_progress?.working_days || 26
  const attPct       = workingDays > 0 ? Math.round((thisMonthAtt / workingDays) * 100) : 0
  const bonusThisMonth = bonusStatus?.months?.[0]
  const pendingBonus   = parseFloat(bonusStatus?.pending_bonus || 0)

  return (
    <div className="p-4 space-y-4 pb-24">

      {/* ══ ছবি ও নাম ══ */}
      <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-primary/10 flex items-center justify-center">
            {p?.profile_photo
              ? <img src={p.profile_photo} alt="profile" className="w-full h-full object-cover" />
              : <FiUser className="text-3xl text-primary" />
            }
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoUploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-md"
          >
            {photoUploading
              ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              : <FiCamera className="text-white text-xs" />
            }
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>

        <div className="flex-1">
          <h2 className="font-bold text-lg text-gray-800">{p?.name_bn || p?.name_en || 'নাম নেই'}</h2>
          <p className="text-sm text-gray-500">{p?.employee_code || '—'}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
            p?.role === 'worker'  ? 'bg-blue-100 text-blue-600' :
            p?.role === 'manager' ? 'bg-green-100 text-green-600' :
            'bg-purple-100 text-purple-600'
          }`}>
            {p?.role === 'worker' ? 'কর্মী (SR)' :
             p?.role === 'manager' ? 'ম্যানেজার' :
             p?.role === 'admin' ? 'অ্যাডমিন' : p?.role}
          </span>
        </div>

        <button onClick={() => setEditing(e => !e)} className="p-2 rounded-xl bg-gray-100 text-gray-600">
          {editing ? <FiX /> : <FiEdit2 />}
        </button>
      </div>

      {/* ══ আজকের Quick Stats ══ */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'আজকের বিক্রয়', value: `৳${parseInt(stats?.total_amount || 0).toLocaleString('bn-BD')}`, icon: FiDollarSign, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'মোট Invoice',   value: String(parseInt(stats?.invoice_count || 0)), icon: FiTrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'মোট কাস্টমার', value: customerCount != null ? String(customerCount) : '—', icon: FiUsers, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'যোগদান',        value: p?.join_date ? new Date(p.join_date).toLocaleDateString('bn-BD') : '—', icon: FiCalendar, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-2`}>
              <s.icon className={`${s.color} text-lg`} />
            </div>
            <p className="text-gray-500 text-xs">{s.label}</p>
            <p className="font-bold text-gray-800 text-sm mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ══ এই মাসের হাজিরা ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiCheckCircle className="text-primary" /> এই মাসের হাজিরা
        </h3>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>{thisMonthAtt} / {workingDays} কর্মদিবস</span>
            <span className={attPct >= 100 ? 'text-green-600 font-bold' : ''}>
              {attPct}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                attPct >= 100 ? 'bg-green-500' : attPct >= 80 ? 'bg-blue-500' : 'bg-orange-400'
              }`}
              style={{ width: `${Math.min(attPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'উপস্থিত',   value: att?.present || 0, color: 'text-green-600',  bg: 'bg-green-50' },
            { label: 'দেরি',       value: att?.late    || 0, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'অনুপস্থিত', value: att?.absent  || 0, color: 'text-red-500',    bg: 'bg-red-50' },
            { label: 'ছুটি',       value: att?.leave   || 0, color: 'text-blue-500',   bg: 'bg-blue-50' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-xl p-3 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {att?.totalDeduction > 0 && (
          <div className="mt-3 bg-red-50 rounded-xl px-4 py-2 flex justify-between items-center">
            <span className="text-xs text-red-500">মোট বেতন কর্তন</span>
            <span className="text-sm font-bold text-red-600">৳{parseInt(att.totalDeduction).toLocaleString('bn-BD')}</span>
          </div>
        )}
      </div>

      {/* ══ মাসিক কমিশন ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiDollarSign className="text-primary" /> এই মাসের কমিশন
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label: 'মোট বিক্রয়',   value: `৳${parseInt(comm?.total_sales || 0).toLocaleString('bn-BD')}` },
            { label: 'দৈনিক কমিশন',  value: `৳${parseInt(comm?.daily_commission || 0).toLocaleString('bn-BD')}` },
            { label: 'বোনাস',         value: `৳${parseInt(comm?.bonus || 0).toLocaleString('bn-BD')}` },
            { label: 'মোট কমিশন',     value: `৳${parseInt(comm?.total_commission || 0).toLocaleString('bn-BD')}` },
          ].map((s, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="font-bold text-gray-800 text-sm mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {commission?.salary_preview && (
          <div className="border border-primary/20 rounded-xl p-3 bg-primary/5">
            <p className="text-xs text-primary font-semibold mb-2">এই মাসের সম্ভাব্য বেতন</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">মূল বেতন</span>
                <span>৳{parseInt(commission.salary_preview.basic_salary).toLocaleString('bn-BD')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">+ কমিশন</span>
                <span className="text-green-600">৳{parseInt(commission.salary_preview.total_commission).toLocaleString('bn-BD')}</span>
              </div>
              {commission.salary_preview.outstanding_dues > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">- বকেয়া</span>
                  <span className="text-red-500">৳{parseInt(commission.salary_preview.outstanding_dues).toLocaleString('bn-BD')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-primary/20">
                <span className="text-primary">নেট পাবেন</span>
                <span className="text-primary">৳{parseInt(commission.salary_preview.net_payable).toLocaleString('bn-BD')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ পারফেক্ট বোনাস স্ট্যাটাস ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <FiAward className="text-primary" /> পারফেক্ট হাজিরা বোনাস
        </h3>
        <p className="text-xs text-gray-400 mb-4">১০০% উপস্থিতিতে মূল বেতনের ১০% বোনাস</p>

        {bonusThisMonth && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>এই মাস: {bonusThisMonth.present_days}/{bonusThisMonth.working_days} দিন</span>
              {bonusThisMonth.is_perfect
                ? <span className="text-green-600 font-bold">✅ বোনাস অর্জিত!</span>
                : <span className="text-orange-500">{bonusThisMonth.working_days - bonusThisMonth.present_days} দিন বাকি</span>
              }
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bonusThisMonth.is_perfect ? 'bg-green-500' : 'bg-orange-400'}`}
                style={{ width: `${Math.min(Math.round((bonusThisMonth.present_days / bonusThisMonth.working_days) * 100), 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-600">{bonusStatus?.perfect_months || 0}</p>
            <p className="text-xs text-gray-500">পারফেক্ট মাস</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{bonusStatus?.total_8_months || 8}</p>
            <p className="text-xs text-gray-500">মোট মাস</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-orange-500">৳{parseInt(pendingBonus).toLocaleString('bn-BD')}</p>
            <p className="text-xs text-gray-500">পেন্ডিং বোনাস</p>
          </div>
        </div>
      </div>

      {/* ══ গত ৭ দিনের বিক্রয় Chart ══ */}
      {weeklySales.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FiBarChart2 className="text-primary" /> গত ৭ দিনের বিক্রয়
          </h3>
          <div className="flex items-end gap-1.5 h-28">
            {weeklySales.map((d, i) => {
              const max = Math.max(...weeklySales.map(s => s.total), 1)
              const pct = Math.round((d.total / max) * 100)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '88px' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all ${d.total > 0 ? 'bg-indigo-500' : 'bg-gray-200'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{d.name}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-400">৭ দিনের মোট</span>
            <span className="text-xs font-semibold text-gray-700">
              ৳{weeklySales.reduce((s, r) => s + r.total, 0).toLocaleString('bn-BD')}
            </span>
          </div>
        </div>
      )}

      {/* ══ ব্যক্তিগত তথ্য ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiUser className="text-primary" /> ব্যক্তিগত তথ্য
        </h3>
        <div className="space-y-3">
          <InfoRow icon={FiUser}   label="নাম (বাংলা)"    value={form.name_bn}           editing={editing} onChange={v => setForm(f => ({ ...f, name_bn: v }))} />
          <InfoRow icon={FiUser}   label="নাম (ইংরেজি)"   value={form.name_en}           editing={editing} onChange={v => setForm(f => ({ ...f, name_en: v }))} />
          <InfoRow icon={FiMail}   label="ইমেইল"          value={p?.email || '—'}        editing={false} />
          <InfoRow icon={FiPhone}  label="ফোন"            value={form.phone}             editing={editing} type="tel" onChange={v => setForm(f => ({ ...f, phone: v }))} />
          <InfoRow icon={FiMapPin} label="বর্তমান ঠিকানা" value={form.current_address}   editing={editing} onChange={v => setForm(f => ({ ...f, current_address: v }))} />
          <InfoRow icon={FiPhone}  label="জরুরি যোগাযোগ" value={form.emergency_contact} editing={editing} type="tel" onChange={v => setForm(f => ({ ...f, emergency_contact: v }))} />
        </div>

        {editing && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-4 bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiSave />
            }
            সেভ করুন
          </button>
        )}
      </div>

      {/* ══ কর্মসংক্রান্ত তথ্য ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiClock className="text-primary" /> কর্মসংক্রান্ত তথ্য
        </h3>
        <div className="space-y-3">
          <StatRow label="পদবী"      value={p?.role === 'worker' ? 'কর্মী (SR)' : p?.role === 'manager' ? 'ম্যানেজার' : p?.role} />
          <StatRow label="মূল বেতন" value={p?.basic_salary ? `৳${parseInt(p.basic_salary).toLocaleString('bn-BD')}` : '—'} />
          <StatRow label="বকেয়া"    value={parseFloat(p?.outstanding_dues || 0) > 0 ? `৳${parseInt(p.outstanding_dues).toLocaleString('bn-BD')}` : '৳০'} />
          <StatRow label="স্ট্যাটাস" value={p?.status === 'active' ? '✅ সক্রিয়' : '❌ নিষ্ক্রিয়'} />
        </div>
      </div>

      {/* ══ পাসওয়ার্ড পরিবর্তন ══ */}
      <button
        onClick={() => setPassModal(true)}
        className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
          <FiLock className="text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-700">পাসওয়ার্ড পরিবর্তন</p>
          <p className="text-xs text-gray-400">নিরাপত্তার জন্য নিয়মিত পরিবর্তন করুন</p>
        </div>
      </button>

      {/* ══ Logout ══ */}
      <button
        onClick={() => {
          if (window.confirm('লগআউট করতে চান?')) logout()
        }}
        className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left border border-red-100"
      >
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
          <FiLogOut className="text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-red-600">লগআউট</p>
          <p className="text-xs text-gray-400">অ্যাকাউন্ট থেকে বের হয়ে যান</p>
        </div>
      </button>

      {/* ══ Password Modal ══ */}
      {passModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">পাসওয়ার্ড পরিবর্তন</h3>
              <button onClick={() => setPassModal(false)}><FiX /></button>
            </div>
            {[
              { label: 'বর্তমান পাসওয়ার্ড', key: 'currentPassword' },
              { label: 'নতুন পাসওয়ার্ড',   key: 'newPassword' },
              { label: 'নিশ্চিত করুন',      key: 'confirmPassword' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                <input
                  type="password"
                  value={passForm[f.key]}
                  onChange={e => setPassForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="••••••••"
                />
              </div>
            ))}
            <button onClick={handlePasswordChange} className="w-full bg-primary text-white py-3 rounded-xl font-semibold">
              পরিবর্তন করুন
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper Components ──

function InfoRow({ icon: Icon, label, value, editing, onChange, type = 'text' }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center mt-0.5 shrink-0">
        <Icon className="text-gray-400 text-sm" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        {editing && onChange ? (
          <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full border-b border-primary/40 py-1 text-sm text-gray-700 focus:outline-none bg-transparent"
          />
        ) : (
          <p className="text-sm text-gray-700 font-medium">{value || '—'}</p>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-700">{value || '—'}</span>
    </div>
  )
}
