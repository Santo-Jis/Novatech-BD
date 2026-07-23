import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiPlus, FiX, FiLoader, FiUserX, FiUserCheck, FiKey, FiShield } from 'react-icons/fi'
import platformApi from './api/platformApi'
import { usePlatformAuthStore } from './store/platformAuth.store'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState, EmptyState, ScopeDeniedNote } from './components/PanelStates'

export default function StaffManagement() {
  const currentStaff = usePlatformAuthStore((s) => s.staff)
  const isFull = currentStaff?.scope === 'full'

  const [staff, setStaff] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [actionState, setActionState] = useState({})

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await platformApi.get('/staff')
      setStaff(res.data.data)
    } catch (err) {
      if (err.response?.status === 403) setError('scope-denied')
      else if (!err._toastShown) setError('Staff তালিকা লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isFull) load()
    else setLoading(false)
  }, [isFull])

  const setAction = (id, patch) =>
    setActionState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const toggleStatus = async (s) => {
    const nextStatus = s.status === 'active' ? 'suspended' : 'active'
    setAction(s.id, { toggling: true })
    try {
      const res = await platformApi.patch(`/staff/${s.id}/status`, { status: nextStatus })
      toast.success(nextStatus === 'active' ? 'Reactivate করা হয়েছে।' : 'Suspend করা হয়েছে।')
      setStaff((prev) => prev.map((x) => (x.id === s.id ? res.data.data : x)))
    } catch (err) {
      if (!err._toastShown) toast.error('স্ট্যাটাস পরিবর্তন করা যায়নি।')
    } finally {
      setAction(s.id, { toggling: false })
    }
  }

  const resetPassword = async (s) => {
    const newPassword = window.prompt(`${s.name}-এর জন্য নতুন পাসওয়ার্ড লিখুন (কমপক্ষে ৮ অক্ষর):`)
    if (!newPassword) return
    if (newPassword.length < 8) {
      toast.error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।')
      return
    }
    setAction(s.id, { resetting: true })
    try {
      await platformApi.post(`/staff/${s.id}/reset-password`, { new_password: newPassword })
      toast.success(`${s.name}-এর পাসওয়ার্ড রিসেট হয়েছে।`)
    } catch (err) {
      if (!err._toastShown) toast.error('পাসওয়ার্ড রিসেট করা যায়নি।')
    } finally {
      setAction(s.id, { resetting: false })
    }
  }

  if (!isFull) {
    return (
      <div className="space-y-4">
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">Staff ম্যানেজমেন্ট</h1>
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 flex flex-col items-start gap-3">
          <FiShield className="text-2xl text-pf-text-muted" />
          <p className="text-sm text-pf-text-secondary">এই পেজ শুধু Full scope staff-এর জন্য।</p>
          <ScopeDeniedNote requiredScope="Full" />
        </div>
      </div>
    )
  }

  if (loading) return <LoadingState label="Staff তালিকা লোড হচ্ছে..." />
  if (error === 'scope-denied') {
    return (
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-6">
        <ScopeDeniedNote requiredScope="Full" />
      </div>
    )
  }
  if (error) return <ErrorState description={error} onRetry={load} />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">Staff ম্যানেজমেন্ট</h1>
          <p className="text-pf-text-secondary text-sm mt-1">Platform Support/Full scope অ্যাকাউন্ট পরিচালনা</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
        >
          <FiPlus /> নতুন Staff
        </button>
      </div>

      {staff && staff.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো staff নেই" />
        </div>
      )}

      {staff && staff.length > 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl divide-y divide-pf-border overflow-hidden">
          {staff.map((s) => {
            const act = actionState[s.id] || {}
            const isSelf = s.id === currentStaff?.id
            return (
              <div key={s.id} className="px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pf-text-primary">
                    {s.name} {isSelf && <span className="text-xs text-pf-text-muted">(আপনি)</span>}
                  </p>
                  <p className="text-xs text-pf-text-muted font-pf-mono mt-0.5">{s.email}</p>
                  <p className="text-xs text-pf-text-muted mt-0.5">
                    {s.scope === 'full' ? 'Full scope' : 'Support scope'}
                    {s.last_login_at ? ` · সর্বশেষ লগইন: ${new Date(s.last_login_at).toLocaleDateString('bn-BD')}` : ' · কখনো লগইন করেননি'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={s.status === 'active' ? 'active' : 'suspended'} label={s.status === 'active' ? 'সক্রিয়' : 'স্থগিত'} />

                  <button
                    onClick={() => resetPassword(s)}
                    disabled={act.resetting}
                    title="Password Reset"
                    className="p-2 rounded-lg border border-pf-border text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40"
                  >
                    {act.resetting ? <FiLoader className="animate-spin" /> : <FiKey />}
                  </button>

                  <button
                    onClick={() => toggleStatus(s)}
                    disabled={isSelf || act.toggling}
                    title={isSelf ? 'নিজেকে suspend করা যাবে না' : s.status === 'active' ? 'Suspend' : 'Reactivate'}
                    className="p-2 rounded-lg border border-pf-border text-pf-text-primary hover:border-pf-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {act.toggling ? <FiLoader className="animate-spin" /> : s.status === 'active' ? <FiUserX /> : <FiUserCheck />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateStaffModal
          onClose={() => setShowCreate(false)}
          onCreated={(s) => {
            setShowCreate(false)
            setStaff((prev) => [...(prev || []), s])
            toast.success('Staff তৈরি হয়েছে।')
          }}
        />
      )}
    </div>
  )
}

function CreateStaffModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [scope, setScope] = useState('support')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password) {
      setError('সব ফিল্ড পূরণ করুন।')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await platformApi.post('/staff', { name: name.trim(), email: email.trim(), password, scope })
      onCreated(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Staff তৈরি করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={submit}
        className="bg-pf-bg-surface w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-pf-border">
          <h2 className="font-pf-head font-semibold text-pf-primary-700">নতুন Platform Staff</h2>
          <button type="button" onClick={onClose} className="text-pf-text-muted hover:text-pf-text-primary p-1">
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নাম</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
              placeholder="staff@novatechbd.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">প্রাথমিক পাসওয়ার্ড</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm font-pf-mono"
              placeholder="কমপক্ষে ৮ অক্ষর"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
            >
              <option value="support">Support (সীমিত অ্যাক্সেস)</option>
              <option value="full">Full (সম্পূর্ণ অ্যাক্সেস — সতর্কভাবে দিন)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white
              text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {saving && <FiLoader className="animate-spin" />}
            তৈরি করুন
          </button>
        </div>
      </form>
    </div>
  )
}
