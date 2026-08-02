import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal, { ConfirmModal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiPlus, FiTrash2, FiBell, FiClock, FiUsers, FiSend,
  FiAlertTriangle, FiCheckCircle, FiEye,
} from 'react-icons/fi'

// ============================================================
// স্ট্যাটিক অপশন — backend-এর VALID_CATEGORIES/ROLES-এর সাথে মিলিয়ে
// ============================================================
const CATEGORY_OPTIONS = [
  { value: 'general',        label: '📋 সাধারণ ঘোষণা' },
  { value: 'policy',         label: '📜 নীতি/নিয়ম' },
  { value: 'hr',             label: '🧑\u200d💼 HR (ছুটি/বেতন)' },
  { value: 'attendance',     label: '🕒 হাজিরা সংক্রান্ত' },
  { value: 'order_sales',    label: '💰 অর্ডার/বিক্রয়' },
  { value: 'route_delivery', label: '🚚 রুট/ডেলিভারি' },
]

const ROLE_OPTIONS = [
  { value: 'worker',     label: '👷 Worker / SR' },
  { value: 'manager',    label: '🧑‍💼 Manager' },
  { value: 'supervisor', label: '🧑‍💼 Supervisor' },
  { value: 'asm',        label: '🧑‍💼 ASM' },
  { value: 'rsm',        label: '🧑‍💼 RSM' },
  { value: 'accountant', label: '🧮 Accountant' },
  { value: 'admin',      label: '👑 Admin' },
]

const EXPIRE_OPTIONS = [
  { value: 'forever', label: '♾️ মেয়াদহীন' },
  { value: '1',       label: '১ ঘণ্টা' },
  { value: '6',       label: '৬ ঘণ্টা' },
  { value: '24',      label: '১ দিন' },
  { value: '48',      label: '২ দিন' },
  { value: '72',      label: '৩ দিন' },
  { value: '168',     label: '১ সপ্তাহ' },
  { value: '720',     label: '১ মাস' },
]

const STAFF_TARGET_OPTIONS = [
  { value: 'all_staff',  label: '🌐 সব স্টাফ' },
  { value: 'role',       label: '🎭 নির্দিষ্ট Role' },
  { value: 'team',       label: '👥 নির্দিষ্ট টিম' },
  { value: 'individual', label: '👤 নির্দিষ্ট ব্যক্তি' },
]

const CUSTOMER_TARGET_OPTIONS = [
  { value: 'all_customers', label: '🛍️ সব কাস্টমার' },
  { value: 'customer_area', label: '📍 নির্দিষ্ট এলাকা/রুট' },
]

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.value, o.label]))
const ROLE_LABEL      = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]))

const DEFAULT_FORM = {
  title: '', body: '', category: 'general', is_urgent: false,
  audience: 'staff', target_type: 'all_staff', target_value: {},
  expires_in_hours: 'forever',
}

export default function NotificationsManage() {
  const { user } = useAuthStore()
  const isAdmin  = user?.role === 'admin'

  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal,   setModal]     = useState(false)
  const [saving,  setSaving]    = useState(false)
  const [form,    setForm]      = useState(DEFAULT_FORM)

  // পিকার ডেটা (lazy — যখন দরকার তখনই আনা হয়)
  const [teams,     setTeams]     = useState(null)
  const [employees, setEmployees] = useState(null)
  const [routes,    setRoutes]    = useState(null)
  const [pickerLoading, setPickerLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)

  // ── Sent history আনা ──────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/notifications/sent')
      setHistory(res.data.data)
    } catch {
      toast.error('পাঠানো নোটিফিকেশন আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // ── Picker ডেটা lazy-load ─────────────────────────────────
  const ensureTeams = async () => {
    if (teams || !isAdmin) return
    setPickerLoading(true)
    try {
      const res = await api.get('/teams')
      setTeams(res.data.data || [])
    } catch { toast.error('টিম তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setPickerLoading(false) }
  }

  const ensureEmployees = async () => {
    if (employees) return
    setPickerLoading(true)
    try {
      const res = await api.get('/employees', { params: { status: 'active', limit: 200 } })
      setEmployees(res.data.data || [])
    } catch { toast.error('স্টাফ তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setPickerLoading(false) }
  }

  const ensureRoutes = async () => {
    if (routes) return
    setPickerLoading(true)
    try {
      const res = await api.get('/routes')
      setRoutes(res.data.data || [])
    } catch { toast.error('রুট তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setPickerLoading(false) }
  }

  // ── Audience/Target বদলালে ফর্ম রিসেট ─────────────────────
  const changeAudience = (audience) => {
    const target_type = audience === 'staff' ? 'all_staff' : 'all_customers'
    setForm(p => ({ ...p, audience, target_type, target_value: {} }))
  }

  const changeTargetType = (target_type) => {
    setForm(p => ({ ...p, target_type, target_value: {} }))
    if (target_type === 'team')       ensureTeams()
    if (target_type === 'individual') ensureEmployees()
    if (target_type === 'customer_area') ensureRoutes()
  }

  const toggleMultiSelect = (key, id) => {
    setForm(p => {
      const current = p.target_value?.[key] || []
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
      return { ...p, target_value: { ...p.target_value, [key]: next } }
    })
  }

  // ── জমা দেওয়ার আগে validation ─────────────────────────────
  const validate = () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('শিরোনাম ও বার্তা দিন।')
      return false
    }
    if (form.target_type === 'role' && !form.target_value?.role) {
      toast.error('কোন Role-কে পাঠাবেন সেটা বেছে নিন।')
      return false
    }
    if (form.target_type === 'individual' && !(form.target_value?.user_ids?.length)) {
      toast.error('অন্তত একজনকে বেছে নিন।')
      return false
    }
    if (form.target_type === 'customer_area' && !(form.target_value?.route_ids?.length)) {
      toast.error('অন্তত একটা এলাকা/রুট বেছে নিন।')
      return false
    }
    return true
  }

  const send = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const res = await api.post('/notifications', form)
      toast.success(res.data.message || 'নোটিফিকেশন পাঠানো হয়েছে।')
      setModal(false)
      setForm(DEFAULT_FORM)
      fetchHistory()
    } catch (err) {
      toast.error(err.response?.data?.message || 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/notifications/${deleteTarget.id}`)
      toast.success('নোটিফিকেশন তুলে নেওয়া হয়েছে।')
      setHistory(prev => prev.map(n => n.id === deleteTarget.id ? { ...n, is_active: false } : n))
    } catch {
      toast.error('মুছতে সমস্যা হয়েছে।')
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── একটা sent-history আইটেমের টার্গেট বর্ণনা ───────────────
  const describeTarget = (n) => {
    const tv = n.target_value || {}
    switch (n.target_type) {
      case 'all_staff':     return '🌐 সব স্টাফ'
      case 'all_customers': return '🛍️ সব কাস্টমার'
      case 'role':          return ROLE_LABEL[tv.role] || `Role: ${tv.role}`
      case 'team':          return '👥 একটা টিম'
      case 'individual':    return `👤 ${tv.user_ids?.length || 0} জন নির্দিষ্ট ব্যক্তি`
      case 'customer_area': return `📍 ${tv.route_ids?.length || 0} টি রুট/এলাকা`
      default:              return n.target_type
    }
  }

  const isExpired = (n) => n.expires_at && new Date(n.expires_at) < new Date()
  const isLive    = (n) => n.is_active && !isExpired(n)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">নোটিফিকেশন ম্যানেজমেন্ট</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            স্টাফ ও কাস্টমারদের জন্য in-app + push নোটিফিকেশন পাঠান
          </p>
        </div>
        <Button icon={<FiPlus />} onClick={() => setModal(true)}>নতুন নোটিফিকেশন</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : history.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-10">এখনো কোনো নোটিফিকেশন পাঠানো হয়নি।</p></Card>
      ) : (
        <div className="space-y-3">
          {history.map(n => (
            <div key={n.id}
              className={`bg-white dark:bg-slate-800 rounded-2xl border p-4 shadow-sm transition-all ${
                !isLive(n) ? 'opacity-50 border-gray-100 dark:border-slate-700'
                : n.is_urgent ? 'border-red-200 dark:border-red-900/50'
                : 'border-blue-100 dark:border-blue-900/40'
              }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    n.is_urgent ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
                  }`}>
                    {n.is_urgent
                      ? <FiAlertTriangle className="text-red-600" />
                      : <FiBell className="text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{n.title}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                        {CATEGORY_LABEL[n.category] || n.category}
                      </span>
                      {n.is_urgent && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                          🔴 জরুরি
                        </span>
                      )}
                      {!isLive(n) && (
                        <span className="text-xs bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400 px-2 py-0.5 rounded-full">
                          {isExpired(n) ? 'মেয়াদ শেষ' : 'তুলে নেওয়া হয়েছে'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1"><FiUsers />{describeTarget(n)}</span>
                      <span className="flex items-center gap-1"><FiSend />{n.recipient_count} জনকে পাঠানো</span>
                      {n.audience === 'staff' && (
                        <span className="flex items-center gap-1">
                          <FiCheckCircle />{n.read_count}/{n.recipient_count} জন পড়েছেন
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FiClock />
                        {new Date(n.created_at).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {n.sender_name && <span>— {n.sender_name}</span>}
                    </div>
                  </div>
                </div>
                {isLive(n) && (
                  <button onClick={() => setDeleteTarget(n)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                    <FiTrash2 />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Compose Modal ── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} size="lg"
        title="✏️ নতুন নোটিফিকেশন পাঠান"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>বাতিল</Button>
            <Button onClick={send} loading={saving} icon={<FiSend />}>পাঠান</Button>
          </>
        }>
        <div className="space-y-4">
          <Input label="📌 শিরোনাম *" placeholder="নোটিফিকেশনের শিরোনাম"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />

          <Textarea label="📝 বার্তা *" rows={4} placeholder="বিস্তারিত বার্তা লিখুন..."
            value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />

          <div className="grid grid-cols-2 gap-3">
            <Select label="🏷️ ক্যাটাগরি" options={CATEGORY_OPTIONS} value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
            <Select label="⏰ মেয়াদ" options={EXPIRE_OPTIONS} value={form.expires_in_hours}
              onChange={e => setForm(p => ({ ...p, expires_in_hours: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_urgent}
              onChange={e => setForm(p => ({ ...p, is_urgent: e.target.checked }))}
              className="w-4 h-4 accent-red-500" />
            🔴 এটা জরুরি বার্তা (urgent)
          </label>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">👥 কাকে পাঠাবেন</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => changeAudience('staff')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  form.audience === 'staff'
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300'
                }`}>
                🧑‍💼 স্টাফ
              </button>
              <button type="button" onClick={() => changeAudience('customer')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  form.audience === 'customer'
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300'
                }`}>
                🛍️ কাস্টমার
              </button>
            </div>
          </div>

          <Select label="🎯 টার্গেট" value={form.target_type}
            options={form.audience === 'staff' ? STAFF_TARGET_OPTIONS : CUSTOMER_TARGET_OPTIONS}
            onChange={e => changeTargetType(e.target.value)} />

          {/* role picker */}
          {form.target_type === 'role' && (
            <Select label="কোন role" options={ROLE_OPTIONS} value={form.target_value?.role || ''}
              onChange={e => setForm(p => ({ ...p, target_value: { role: e.target.value } }))} />
          )}

          {/* team picker */}
          {form.target_type === 'team' && (
            isAdmin ? (
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">কোন টিম</label>
                {pickerLoading ? (
                  <p className="text-xs text-gray-400">টিম তালিকা লোড হচ্ছে...</p>
                ) : (
                  <select
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-gray-100 dark:border-slate-600 border-gray-200"
                    value={form.target_value?.manager_id || ''}
                    onChange={e => setForm(p => ({ ...p, target_value: { manager_id: e.target.value } }))}>
                    <option value="">— বেছে নিন —</option>
                    {(teams || []).map(t => (
                      <option key={t.manager_id} value={t.manager_id}>
                        {t.name} — {t.manager_name_bn} ({t.sr_count} জন)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 bg-gray-50 dark:bg-slate-700/50 p-3 rounded-xl">
                👥 এটা আপনার নিজের টিমে পাঠানো হবে।
              </p>
            )
          )}

          {/* individual picker */}
          {form.target_type === 'individual' && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                কাদের পাঠাবেন ({form.target_value?.user_ids?.length || 0} জন নির্বাচিত)
              </label>
              {pickerLoading ? (
                <p className="text-xs text-gray-400">স্টাফ তালিকা লোড হচ্ছে...</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-xl p-2 space-y-1">
                  {(employees || []).map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
                      <input type="checkbox"
                        checked={(form.target_value?.user_ids || []).includes(emp.id)}
                        onChange={() => toggleMultiSelect('user_ids', emp.id)}
                        className="w-4 h-4 accent-primary" />
                      <span className="text-gray-700 dark:text-gray-200">{emp.name_bn}</span>
                      <span className="text-xs text-gray-400">({ROLE_LABEL[emp.role]?.replace(/^\S+\s/, '') || emp.role})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* customer area picker */}
          {form.target_type === 'customer_area' && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                কোন এলাকা/রুট ({form.target_value?.route_ids?.length || 0} টি নির্বাচিত)
              </label>
              {pickerLoading ? (
                <p className="text-xs text-gray-400">রুট তালিকা লোড হচ্ছে...</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-xl p-2 space-y-1">
                  {(routes || []).map(route => (
                    <label key={route.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
                      <input type="checkbox"
                        checked={(form.target_value?.route_ids || []).includes(route.id)}
                        onChange={() => toggleMultiSelect('route_ids', route.id)}
                        className="w-4 h-4 accent-primary" />
                      <span className="text-gray-700 dark:text-gray-200">{route.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Delete Confirm ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="নোটিফিকেশন তুলে নেবেন?"
        message={`"${deleteTarget?.title}" — এটা তুলে নিলে যাদের কাছে এখনো দেখানো হচ্ছে তাদের bell থেকে সরে যাবে।`}
        confirmLabel="তুলে নিন"
        danger
      />
    </div>
  )
}
