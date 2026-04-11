import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/auth.store'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { FiUser, FiPhone, FiMapPin, FiCalendar, FiLock, FiCamera, FiEdit2, FiSave, FiX, FiDollarSign, FiTrendingUp, FiCheckCircle, FiClock, FiAward, FiUsers, FiBarChart2, FiRefreshCw, FiLogOut } from 'react-icons/fi'

export default function Profile() {
  const { user, updateUser, fetchMe, logout } = useAuthStore()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passModal, setPassModal] = useState(false)
  const fileRef = useRef()

  const [form, setForm] = useState({ name_bn: '', name_en: '', phone: '', current_address: '', emergency_contact: '' })
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      let meData = null
      try {
        const meRes = await api.get('/auth/me')
        meData = meRes.data.data
      } catch {
        meData = user
      }
      if (!meData) { setError('প্রোফাইল লোড করা যায়নি।'); setLoading(false); return }
      setProfile(meData)
      setForm({
        name_bn: meData.name_bn || '',
        name_en: meData.name_en || '',
        phone: meData.phone || '',
        current_address: meData.current_address || '',
        emergency_contact: meData.emergency_contact || ''
      })
    } catch {
      setError('তথ্য লোড হয়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/employees/profile', form)
      await fetchMe()
      setEditing(false)
      toast.success('প্রোফাইল আপডেট হয়েছে ✅')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally { setSaving(false) }
  }

  const handlePasswordChange = async () => {
    if (passForm.newPassword !== passForm.confirmPassword) return toast.error('পাসওয়ার্ড মিলছে না')
    if (passForm.newPassword.length < 6) return toast.error('কমপক্ষে ৬ অক্ষর')
    try {
      await api.put('/auth/change-password', { currentPassword: passForm.currentPassword, newPassword: passForm.newPassword })
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে ✅')
      setPassModal(false)
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { toast.error(err.response?.data?.message || 'পাসওয়ার্ড পরিবর্তন হয়নি') }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const formData = new FormData()
      formData.append('photo', file)
      await api.post('/employees/profile-photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      await fetchMe()
      toast.success('ছবি আপলোড হয়েছে ✅')
    } catch { toast.error('ছবি আপলোড হয়নি') }
  }

  if (loading) return (
    <div className="p-4 flex items-center justify-center py-20 gap-3">
      <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-gray-500 text-sm">প্রোফাইল লোড হচ্ছে...</span>
    </div>
  )

  if (error) return (
    <div className="p-4 flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-gray-600 text-center">{String(error)}</p>
      <button onClick={fetchData} className="bg-blue-600 text-white px-6 py-2 rounded-xl">আবার চেষ্টা করুন</button>
    </div>
  )

  const p = profile || user || {}

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-50 flex items-center justify-center">
            {p.profile_photo
              ? <img src={p.profile_photo} alt="profile" className="w-full h-full object-cover" />
              : <FiUser className="text-3xl text-blue-500" />
            }
          </div>
          <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
            <FiCamera className="text-white text-xs" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-gray-800">{String(p.name_bn || p.name_en || 'নাম নেই')}</h2>
          <p className="text-sm text-gray-500">{String(p.employee_code || '—')}</p>
          <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block bg-blue-100 text-blue-600">
            {p.role === 'worker' ? 'কর্মী (SR)' : p.role === 'manager' ? 'ম্যানেজার' : String(p.role || '—')}
          </span>
        </div>
        <button onClick={() => setEditing(e => !e)} className="p-2 rounded-xl bg-gray-100 text-gray-600">
          {editing ? <FiX /> : <FiEdit2 />}
        </button>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><FiUser className="text-blue-500" /> ব্যক্তিগত তথ্য</h3>
        <div className="space-y-3">
          {[
            { label: 'নাম (বাংলা)', key: 'name_bn' },
            { label: 'নাম (ইংরেজি)', key: 'name_en' },
            { label: 'ফোন', key: 'phone' },
            { label: 'বর্তমান ঠিকানা', key: 'current_address' },
            { label: 'জরুরি যোগাযোগ', key: 'emergency_contact' },
          ].map(f => (
            <div key={f.key} className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-400">{f.label}</p>
                {editing ? (
                  <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border-b border-blue-400 py-1 text-sm text-gray-700 focus:outline-none bg-transparent" />
                ) : (
                  <p className="text-sm text-gray-700 font-medium">{String(form[f.key] || '—')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {editing && (
          <button onClick={handleSave} disabled={saving} className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave />}
            সেভ করুন
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><FiClock className="text-blue-500" /> কর্মসংক্রান্ত তথ্য</h3>
        <div className="space-y-2">
          {[
            ['পদবী', p.role === 'worker' ? 'কর্মী (SR)' : String(p.role || '—')],
            ['মূল বেতন', p.basic_salary ? '৳' + parseInt(p.basic_salary).toLocaleString() : '—'],
            ['বকেয়া', '৳' + parseInt(p.outstanding_dues || 0).toLocaleString()],
            ['স্ট্যাটাস', p.status === 'active' ? '✅ সক্রিয়' : '❌ নিষ্ক্রিয়'],
            ['যোগদান', p.join_date ? new Date(p.join_date).toLocaleDateString() : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-semibold text-gray-700">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => setPassModal(true)} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><FiLock className="text-red-500" /></div>
        <div>
          <p className="font-semibold text-gray-700">পাসওয়ার্ড পরিবর্তন</p>
          <p className="text-xs text-gray-400">নিরাপত্তার জন্য পরিবর্তন করুন</p>
        </div>
      </button>

      <button onClick={() => { if (window.confirm('লগআউট করতে চান?')) logout() }} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left border border-red-100">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><FiLogOut className="text-red-500" /></div>
        <div>
          <p className="font-semibold text-red-600">লগআউট</p>
          <p className="text-xs text-gray-400">অ্যাকাউন্ট থেকে বের হয়ে যান</p>
        </div>
      </button>

      {passModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">পাসওয়ার্ড পরিবর্তন</h3>
              <button onClick={() => setPassModal(false)}><FiX /></button>
            </div>
            {[['বর্তমান পাসওয়ার্ড', 'currentPassword'], ['নতুন পাসওয়ার্ড', 'newPassword'], ['নিশ্চিত করুন', 'confirmPassword']].map(([label, key]) => (
              <div key={key}>
                <label className="text-sm text-gray-600 mb-1 block">{label}</label>
                <input type="password" value={passForm[key]} onChange={e => setPassForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" placeholder="••••••••" />
              </div>
            ))}
            <button onClick={handlePasswordChange} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold">পরিবর্তন করুন</button>
          </div>
        </div>
      )}
    </div>
  )
}
