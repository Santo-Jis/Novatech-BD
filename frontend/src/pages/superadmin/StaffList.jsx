import { useEffect, useState, useCallback } from 'react'
import { FiUserPlus, FiKey, FiCopy, FiCheck, FiLoader } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700'

const SCOPE_LABELS = { full: 'Full Access', support: 'Support' }

// ⚠️ এইটা tenant-এর নিজস্ব user/customer ম্যানেজমেন্ট থেকে সম্পূর্ণ
// আলাদা — এরা প্ল্যাটফর্মের নিজস্ব Support Panel স্টাফ। tenant-এর
// ভেতরের কোনো ডেটা এখানে touch করা হয় না।
export default function StaffList() {
  const [staff, setStaff] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/staff')
      setStaff(res.data.data)
    } catch (err) {
      if (!err._toastShown) setError('স্টাফ তালিকা লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">Platform Staff</h1>
          <p className="text-pf-text-secondary text-sm mt-1">Support Panel-এ লগইন করার মতো স্টাফ অ্যাকাউন্ট</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-900 text-white text-sm font-semibold hover:brightness-110 whitespace-nowrap"
        >
          <FiUserPlus /> {showCreate ? 'ফর্ম বন্ধ করুন' : 'নতুন স্টাফ'}
        </button>
      </div>

      {showCreate && (
        <CreateStaffForm
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}

      {loading && <LoadingState label="স্টাফ তালিকা লোড হচ্ছে..." />}
      {!loading && error && <ErrorState description={error} onRetry={load} />}

      {!loading && !error && staff && staff.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো স্টাফ নেই" description="'নতুন স্টাফ' বাটনে ক্লিক করে প্রথম Support Panel স্টাফ অ্যাকাউন্ট তৈরি করুন।" />
        </div>
      )}

      {!loading && !error && staff && staff.length > 0 && (
        <div className="space-y-3">
          {staff.map((s) => (
            <StaffCard key={s.id} staffMember={s} onUpdated={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function CreateStaffForm({ onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [scope, setScope] = useState('support')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name || !email || !password) {
      setError('name, email, password — সবগুলো আবশ্যক।')
      return
    }
    if (password.length < 8) {
      setError('পাসওয়ার্ড কমপক্ষে ৮ ক্যারেক্টার হতে হবে।')
      return
    }
    setLoading(true)
    try {
      await superAdminApi.post('/staff', { name, email, password, scope })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.message || 'স্টাফ তৈরি করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-pf-bg-surface border border-pf-border rounded-xl p-5 space-y-3">
      {error && <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নাম</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">ইমেইল</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">পাসওয়ার্ড (কমপক্ষে ৮ ক্যারেক্টার)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Scope</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputCls}>
            <option value="support">Support (সীমিত)</option>
            <option value="full">Full Access</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
      >
        {loading ? <FiLoader className="animate-spin" /> : null}
        {loading ? 'তৈরি হচ্ছে...' : 'স্টাফ তৈরি করুন'}
      </button>
    </form>
  )
}

function StaffCard({ staffMember, onUpdated }) {
  const [scope, setScope] = useState(staffMember.scope)
  const [status, setStatus] = useState(staffMember.status)
  const [savingField, setSavingField] = useState('')
  const [msg, setMsg] = useState('')
  const [resetResult, setResetResult] = useState(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const saveField = async (field, value) => {
    setSavingField(field)
    setMsg('')
    try {
      await superAdminApi.patch(`/staff/${staffMember.id}`, { [field]: value })
      setMsg('✅ আপডেট হয়েছে')
      onUpdated()
    } catch (err) {
      setMsg(err.response?.data?.message || 'আপডেট করা যায়নি')
    } finally {
      setSavingField('')
    }
  }

  const resetPassword = async () => {
    setResetLoading(true)
    setResetResult(null)
    try {
      const res = await superAdminApi.post(`/staff/${staffMember.id}/reset-password`)
      setResetResult(res.data.data)
    } catch (err) {
      setMsg(err.response?.data?.message || 'পাসওয়ার্ড রিসেট করা যায়নি')
    } finally {
      setResetLoading(false)
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(resetResult.temp_password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-pf-text-primary">{staffMember.name}</p>
          <p className="text-xs text-pf-text-muted">{staffMember.email}</p>
          {staffMember.last_login_at && (
            <p className="text-[11px] text-pf-text-muted mt-0.5">
              শেষ লগইন: {new Date(staffMember.last_login_at).toLocaleString('bn-BD')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value)
              saveField('scope', e.target.value)
            }}
            disabled={savingField === 'scope'}
            className="px-2.5 py-1.5 rounded-lg border border-pf-border bg-pf-bg-surface text-xs"
          >
            <option value="support">Support</option>
            <option value="full">Full Access</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              saveField('status', e.target.value)
            }}
            disabled={savingField === 'status'}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
              status === 'active'
                ? 'border-pf-success/30 bg-pf-success-bg text-pf-success'
                : 'border-pf-warning/30 bg-pf-warning-bg text-pf-warning'
            }`}
          >
            <option value="active">সক্রিয়</option>
            <option value="suspended">স্থগিত</option>
          </select>
          <button
            onClick={resetPassword}
            disabled={resetLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-pf-border text-xs font-medium hover:bg-pf-bg-alt disabled:opacity-60"
          >
            {resetLoading ? <FiLoader className="animate-spin" /> : <FiKey />}
            পাসওয়ার্ড রিসেট
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-pf-text-secondary">{msg}</p>}

      {resetResult && (
        <div className="bg-pf-warning-bg border border-pf-warning/30 rounded-lg p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-pf-text-primary">নতুন সাময়িক পাসওয়ার্ড:</span>
          <code className="font-pf-mono text-sm font-semibold bg-white px-2.5 py-1 rounded border border-pf-border">
            {resetResult.temp_password}
          </code>
          <button
            type="button"
            onClick={copyPassword}
            className="p-1.5 rounded-lg border border-pf-border bg-white hover:bg-pf-bg-alt"
          >
            {copied ? <FiCheck className="text-pf-success" /> : <FiCopy />}
          </button>
          <span className="text-[11px] text-pf-text-muted w-full">⚠️ শুধু একবারই দেখানো হবে — স্টাফকে সরাসরি জানিয়ে দিন।</span>
        </div>
      )}
    </div>
  )
}
