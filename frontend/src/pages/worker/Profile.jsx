import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/auth.store'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiUser, FiMail, FiPhone, FiMapPin, FiCalendar,
  FiLock, FiCamera, FiEdit2, FiSave, FiX,
  FiDollarSign, FiTrendingUp, FiCheckCircle, FiClock
} from 'react-icons/fi'

// ============================================================
// Worker Profile Page
// ============================================================

export default function Profile() {
  const { user, updateUser, fetchMe } = useAuthStore()

  const [profile,   setProfile]   = useState(null)
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [passModal, setPassModal] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)

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
    try {
      const [meRes, statsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/sales/today-summary').catch(() => ({ data: { data: null } }))
      ])
      setProfile(meRes.data.data)
      setStats(statsRes.data.data)
      setForm({
        name_bn:           meRes.data.data.name_bn           || '',
        name_en:           meRes.data.data.name_en           || '',
        phone:             meRes.data.data.phone             || '',
        current_address:   meRes.data.data.current_address   || '',
        emergency_contact: meRes.data.data.emergency_contact || ''
      })
    } catch (err) {
      toast.error('তথ্য লোড হয়নি')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

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
      toast.error('নতুন পাসওয়ার্ড মিলছে না')
      return
    }
    if (passForm.newPassword.length < 6) {
      toast.error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে')
      return
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

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  const p = profile || user

  return (
    <div className="p-4 space-y-4 pb-24">

      {/* ── Photo & Name ── */}
      <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-primary/10 flex items-center justify-center">
            {p?.profile_photo ? (
              <img src={p.profile_photo} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <FiUser className="text-3xl text-primary" />
            )}
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
            p?.role === 'worker' ? 'bg-blue-100 text-blue-600' :
            p?.role === 'manager' ? 'bg-green-100 text-green-600' :
            'bg-purple-100 text-purple-600'
          }`}>
            {p?.role === 'worker' ? 'কর্মী' :
             p?.role === 'manager' ? 'ম্যানেজার' :
             p?.role === 'admin' ? 'অ্যাডমিন' : p?.role}
          </span>
        </div>

        <button
          onClick={() => editing ? setEditing(false) : setEditing(true)}
          className="p-2 rounded-xl bg-gray-100 text-gray-600"
        >
          {editing ? <FiX /> : <FiEdit2 />}
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'আজকের বিক্রয়', value: `৳${parseInt(stats?.total_sales || 0).toLocaleString('bn-BD')}`, icon: FiDollarSign, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'মোট Invoice', value: (stats?.total_invoices || 0).toLocaleString('bn-BD'), icon: FiTrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'উপস্থিতি', value: p?.attendance_rate ? `${p.attendance_rate}%` : '—', icon: FiCheckCircle, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'যোগদান', value: p?.join_date ? new Date(p.join_date).toLocaleDateString('bn-BD') : '—', icon: FiCalendar, color: 'text-orange-600', bg: 'bg-orange-50' },
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

      {/* ── Personal Info ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiUser className="text-primary" /> ব্যক্তিগত তথ্য
        </h3>

        <div className="space-y-3">
          {/* নাম বাংলা */}
          <InfoRow
            icon={FiUser}
            label="নাম (বাংলা)"
            value={form.name_bn}
            editing={editing}
            onChange={v => setForm(f => ({ ...f, name_bn: v }))}
          />
          {/* নাম ইংরেজি */}
          <InfoRow
            icon={FiUser}
            label="নাম (ইংরেজি)"
            value={form.name_en}
            editing={editing}
            onChange={v => setForm(f => ({ ...f, name_en: v }))}
          />
          {/* ইমেইল */}
          <InfoRow
            icon={FiMail}
            label="ইমেইল"
            value={p?.email || '—'}
            editing={false}
          />
          {/* ফোন */}
          <InfoRow
            icon={FiPhone}
            label="ফোন"
            value={form.phone}
            editing={editing}
            type="tel"
            onChange={v => setForm(f => ({ ...f, phone: v }))}
          />
          {/* ঠিকানা */}
          <InfoRow
            icon={FiMapPin}
            label="বর্তমান ঠিকানা"
            value={form.current_address}
            editing={editing}
            onChange={v => setForm(f => ({ ...f, current_address: v }))}
          />
          {/* জরুরি যোগাযোগ */}
          <InfoRow
            icon={FiPhone}
            label="জরুরি যোগাযোগ"
            value={form.emergency_contact}
            editing={editing}
            type="tel"
            onChange={v => setForm(f => ({ ...f, emergency_contact: v }))}
          />
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

      {/* ── Work Info ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <FiClock className="text-primary" /> কর্মসংক্রান্ত তথ্য
        </h3>
        <div className="space-y-3">
          <StatRow label="পদবী" value={
            p?.role === 'worker' ? 'কর্মী (SR)' :
            p?.role === 'manager' ? 'ম্যানেজার' : p?.role
          } />
          <StatRow label="মূল বেতন" value={p?.basic_salary ? `৳${parseInt(p.basic_salary).toLocaleString('bn-BD')}` : '—'} />
          <StatRow label="বকেয়া" value={p?.outstanding_dues ? `৳${parseInt(p.outstanding_dues).toLocaleString('bn-BD')}` : '৳০'} />
          <StatRow label="স্ট্যাটাস" value={p?.status === 'active' ? '✅ সক্রিয়' : '❌ নিষ্ক্রিয়'} />
        </div>
      </div>

      {/* ── Password Change ── */}
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

      {/* ── Password Modal ── */}
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

            <button
              onClick={handlePasswordChange}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold"
            >
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
