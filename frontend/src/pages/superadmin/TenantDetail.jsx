import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiLoader, FiKey, FiTrash2, FiCopy, FiCheck, FiDollarSign, FiPlus } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState } from './components/PanelStates'

const STATUS_OPTIONS = ['trial', 'active', 'suspended', 'cancelled']
// ✅ নতুন ৪-টায়ার — planPricing.js-এর PLAN_ORDER-এর সাথে মিলিয়ে (আগে
// basic/pro/enterprise ছিল, পাবলিক Pricing পেইজের সাথে আর মেলে না)
const PLAN_OPTIONS = ['standard', 'pro', 'max', 'erp']
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const inputCls = 'px-3 py-2 rounded-lg border border-pf-border bg-pf-bg-surface text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700'

export default function TenantDetail() {
  const { tenantId } = useParams()
  const navigate = useNavigate()

  const [tenant, setTenant] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get(`/tenants/${tenantId}`)
      setTenant(res.data.data.tenant)
      setStats(res.data.data.stats)
    } catch (err) {
      if (err.response?.status === 404) setError('এই টেন্যান্ট পাওয়া যায়নি।')
      else if (!err._toastShown) setError('টেন্যান্ট বিস্তারিত লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [tenantId])

  if (loading) return <LoadingState label="টেন্যান্ট বিস্তারিত লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />
  if (!tenant) return null

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/superadmin/tenants')}
        className="flex items-center gap-1.5 text-sm font-medium text-pf-text-secondary hover:text-pf-primary-700"
      >
        <FiArrowLeft /> টেন্যান্ট তালিকায় ফিরুন
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">{tenant.company_name}</h1>
          <p className="text-pf-text-secondary text-sm mt-1">{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={tenant.status} />
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-pf-accent-100 text-pf-accent-600">
            {tenant.plan}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="কর্মী" value={stats.employees} />
        <StatCard label="কাস্টমার" value={stats.customers} />
        <StatCard label="মোট বিক্রয়" value={stats.total_sales} />
        <StatCard label="মোট রাজস্ব" value={`৳${Number(stats.total_revenue).toLocaleString('bn-BD')}`} />
      </div>

      <WalletCard tenantId={tenant.id} balancePaisa={stats.wallet_balance_paisa} onChanged={load} />

      <div className="bg-pf-bg-surface border border-pf-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-pf-border">
          <h2 className="font-pf-head font-semibold text-pf-primary-700 text-sm">টেন্যান্ট তথ্য</h2>
        </div>
        <dl className="divide-y divide-pf-border">
          <Field label="কোম্পানি নাম (বাংলা)" value={tenant.company_name_bn} />
          <Field label="সর্বোচ্চ কর্মী" value={tenant.max_employees} />
          <Field label="সর্বোচ্চ কাস্টমার" value={tenant.max_customers} />
          <Field label="মাসিক AI টোকেন" value={tenant.ai_tokens_monthly} />
          <Field
            label="ট্রায়াল শেষ"
            value={tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('bn-BD') : '—'}
          />
          <Field
            label="সাবস্ক্রিপশন শেষ"
            value={tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at).toLocaleDateString('bn-BD') : '—'}
          />
          <Field label="Billing Email" value={tenant.billing_email} />
        </dl>
      </div>

      <StatusChangeCard tenant={tenant} onUpdated={load} />
      <PlanChangeCard tenant={tenant} onUpdated={load} />
      <ResetPasswordCard tenantId={tenant.id} />
      <SettingsCard tenantId={tenant.id} />
      <AiSettingsCard tenantId={tenant.id} />
      {tenant.id !== DEFAULT_TENANT_ID && <DeleteTenantCard tenant={tenant} />}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
      <p className="text-xs text-pf-text-muted font-medium mb-1">{label}</p>
      <p className="font-pf-mono text-lg font-semibold text-pf-primary-700">{value ?? '—'}</p>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="flex px-4 py-3 gap-4">
      <dt className="w-40 flex-shrink-0 text-xs font-medium text-pf-text-muted">{label}</dt>
      <dd className="text-sm text-pf-text-primary break-words">{value || '—'}</dd>
    </div>
  )
}

// ─── Status পরিবর্তন ────────────────────────────────────────────
function StatusChangeCard({ tenant, onUpdated }) {
  const [status, setStatus] = useState(tenant.status)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setMsg('')
    if (status === tenant.status) {
      setMsg('একই status — কোনো পরিবর্তন নেই।')
      return
    }
    setLoading(true)
    try {
      await superAdminApi.patch(`/tenants/${tenant.id}/status`, { status, reason: reason || undefined })
      setMsg('✅ Status আপডেট হয়েছে।')
      setReason('')
      onUpdated()
    } catch (err) {
      setMsg(err.response?.data?.message || 'Status আপডেট করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Status পরিবর্তন">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নতুন Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">কারণ (ঐচ্ছিক, audit log-এ থাকবে)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <SubmitButton loading={loading}>আপডেট করুন</SubmitButton>
      </form>
      {msg && <p className="text-sm mt-2 text-pf-text-secondary">{msg}</p>}
    </Card>
  )
}

// ─── Plan পরিবর্তন ──────────────────────────────────────────────
function PlanChangeCard({ tenant, onUpdated }) {
  const [plan, setPlan] = useState(tenant.plan)
  const [paymentRef, setPaymentRef] = useState('')
  const [forceNoPayment, setForceNoPayment] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!paymentRef && !forceNoPayment) {
      setMsg('payment_reference দিন, অথবা "বিনামূল্যে extend" টিক দিন।')
      return
    }
    setLoading(true)
    try {
      const res = await superAdminApi.patch(`/tenants/${tenant.id}/plan`, {
        plan,
        payment_reference: paymentRef || undefined,
        force_no_payment: forceNoPayment || undefined,
      })
      setMsg(`✅ ${res.data.message} (payment verified: ${res.data.payment_verification?.verified ? 'হ্যাঁ' : 'না'})`)
      setPaymentRef('')
      setForceNoPayment(false)
      onUpdated()
    } catch (err) {
      setMsg(err.response?.data?.message || 'Plan আপডেট করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Plan পরিবর্তন (৩০ দিন extend)">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নতুন Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
              {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Payment Reference</label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              disabled={forceNoPayment}
              placeholder="bKash/Nagad TrxID ইত্যাদি"
              className={`${inputCls} w-full disabled:opacity-50`}
            />
          </div>
          <SubmitButton loading={loading}>আপডেট করুন</SubmitButton>
        </div>
        <label className="flex items-center gap-2 text-sm text-pf-text-secondary">
          <input
            type="checkbox"
            checked={forceNoPayment}
            onChange={(e) => setForceNoPayment(e.target.checked)}
          />
          পেমেন্ট ছাড়াই সচেতনভাবে বিনামূল্যে extend করুন (discount/upgrade)
        </label>
      </form>
      {msg && <p className="text-sm mt-2 text-pf-text-secondary">{msg}</p>}
    </Card>
  )
}

// ─── Admin পাসওয়ার্ড রিসেট ──────────────────────────────────────
function ResetPasswordCard({ tenantId }) {
  const [adminEmail, setAdminEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const res = await superAdminApi.post(`/tenants/${tenantId}/reset-admin-password`, {
        admin_email: adminEmail || undefined,
      })
      setResult(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'পাসওয়ার্ড রিসেট করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(result.temp_password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card title="Admin পাসওয়ার্ড রিসেট">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">
            নির্দিষ্ট Admin ইমেইল (ঐচ্ছিক — না দিলে প্রথম active admin)
          </label>
          <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <SubmitButton loading={loading} variant="warning">
          <FiKey /> পাসওয়ার্ড রিসেট করুন
        </SubmitButton>
      </form>

      {error && <p className="text-sm mt-2 text-pf-error">{error}</p>}

      {result && (
        <div className="mt-4 bg-pf-warning-bg border border-pf-warning/30 rounded-lg p-4 space-y-1.5">
          <p className="text-sm text-pf-text-primary">
            <span className="font-semibold">{result.admin_name}</span> ({result.admin_email || result.admin_phone}) এর জন্য নতুন সাময়িক পাসওয়ার্ড:
          </p>
          <div className="flex items-center gap-2">
            <code className="font-pf-mono text-base font-semibold bg-white px-3 py-1.5 rounded border border-pf-border">
              {result.temp_password}
            </code>
            <button
              type="button"
              onClick={copyPassword}
              className="p-2 rounded-lg border border-pf-border bg-white hover:bg-pf-bg-alt"
              title="কপি করুন"
            >
              {copied ? <FiCheck className="text-pf-success" /> : <FiCopy />}
            </button>
          </div>
          <p className="text-xs text-pf-text-muted pt-1">
            ⚠️ এটা শুধু এই একবারই দেখানো হবে — client-কে ফোন/হোয়াটসঅ্যাপে জানিয়ে দিন, প্রথম লগইনের পরই বদলে ফেলার পরামর্শ দিন।
          </p>
        </div>
      )}
    </Card>
  )
}

// ─── Wallet (Phase 4, 26 July 2026) ────────────────────────────
const TXN_LABELS = {
  recharge:     { label: 'রিচার্জ',       color: 'text-pf-success' },
  refund:       { label: 'রিফান্ড',       color: 'text-pf-success' },
  adjustment:   { label: 'সংশোধন',       color: 'text-pf-text-secondary' },
  sms_charge:   { label: 'SMS চার্জ',     color: 'text-pf-error' },
  email_charge: { label: 'Email চার্জ',   color: 'text-pf-error' },
}

function WalletCard({ tenantId, balancePaisa, onChanged }) {
  const [amountTaka, setAmountTaka] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await superAdminApi.get(`/tenants/${tenantId}/wallet`)
      setHistory(res.data.data.transactions)
    } catch (err) {
      if (!err._toastShown) setMsg('হিস্টরি লোড করা যায়নি।')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && history === null) loadHistory()
  }, [expanded])

  const submit = async (e) => {
    e.preventDefault()
    setMsg('')
    const taka = parseFloat(amountTaka)
    if (!taka || taka <= 0) {
      setMsg('সঠিক পরিমাণ (টাকা) দিন।')
      return
    }
    setLoading(true)
    try {
      await superAdminApi.post(`/tenants/${tenantId}/wallet/recharge`, {
        amount_paisa: Math.round(taka * 100),
        description: description || undefined,
      })
      setMsg('✅ রিচার্জ সফল হয়েছে।')
      setAmountTaka('')
      setDescription('')
      onChanged()
      if (expanded) loadHistory()
    } catch (err) {
      setMsg(err.response?.data?.message || 'রিচার্জ করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  const balanceTaka = ((balancePaisa || 0) / 100).toLocaleString('bn-BD', { minimumFractionDigits: 2 })

  return (
    <Card title="ওয়ালেট / ক্রেডিট">
      <div className="flex items-center gap-2 mb-4">
        <FiDollarSign className="text-pf-primary-700" />
        <span className="text-2xl font-pf-mono font-semibold text-pf-primary-700">৳{balanceTaka}</span>
        <span className="text-xs text-pf-text-muted">বর্তমান ব্যালেন্স</span>
      </div>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">রিচার্জ (টাকা)</label>
          <input
            type="number" step="0.01" min="0"
            value={amountTaka} onChange={(e) => setAmountTaka(e.target.value)}
            placeholder="৫০০" className={inputCls}
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নোট (ঐচ্ছিক)</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="যেমন: bKash TrxID 8N7X..." className={`${inputCls} w-full`}
          />
        </div>
        <SubmitButton loading={loading}><FiPlus /> রিচার্জ করুন</SubmitButton>
      </form>
      {msg && <p className="text-sm mt-2 text-pf-text-secondary">{msg}</p>}

      <div className="mt-4 pt-3 border-t border-pf-border">
        {!expanded ? (
          <button onClick={() => setExpanded(true)} className="text-sm font-medium text-pf-primary-700 hover:underline">
            লেনদেনের হিস্টরি দেখতে ক্লিক করুন →
          </button>
        ) : (
          <>
            {historyLoading && <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>}
            {history && history.length === 0 && (
              <p className="text-sm text-pf-text-muted">এখনো কোনো লেনদেন হয়নি।</p>
            )}
            {history && history.length > 0 && (
              <div className="space-y-2">
                {history.map((t) => {
                  const meta = TXN_LABELS[t.type] || { label: t.type, color: 'text-pf-text-primary' }
                  const taka = (Math.abs(t.amount_paisa) / 100).toLocaleString('bn-BD', { minimumFractionDigits: 2 })
                  return (
                    <div key={t.id} className="flex items-center justify-between text-sm border-b border-pf-border/60 pb-2 last:border-0">
                      <div>
                        <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                        {t.description && <span className="text-pf-text-muted ml-2 text-xs">{t.description}</span>}
                        <div className="text-[11px] text-pf-text-muted">
                          {new Date(t.created_at).toLocaleString('bn-BD')}
                        </div>
                      </div>
                      <span className={`font-pf-mono font-semibold ${t.amount_paisa >= 0 ? 'text-pf-success' : 'text-pf-error'}`}>
                        {t.amount_paisa >= 0 ? '+' : '−'}৳{taka}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ─── System Settings (company info বাদে) ───────────────────────
// ⚠️ company_name/address/phone/email এই ৪টা key backend থেকেই
// filter হয়ে বাদ যায় (GET-এ আসে না, PATCH-এ 403 দেয়) — সেটা tenant-এর
// নিজস্ব ব্যবসায়িক পরিচয়/যোগাযোগ তথ্য, শুধু tenant-এর নিজের local
// admin panel থেকেই বদলানো উচিত।
function SettingsCard({ tenantId }) {
  const [settings, setSettings] = useState(null)
  const [edited, setEdited] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get(`/tenants/${tenantId}/settings`)
      setSettings(res.data.data)
      setEdited({})
    } catch (err) {
      setError(err.response?.data?.message || 'সেটিংস লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && settings === null) load()
  }, [expanded])

  const save = async () => {
    const changedKeys = Object.keys(edited)
    if (changedKeys.length === 0) {
      setMsg('কোনো পরিবর্তন নেই।')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      await superAdminApi.patch(`/tenants/${tenantId}/settings`, {
        settings: changedKeys.map((key) => ({ key, value: edited[key] })),
      })
      setMsg('✅ সেটিংস আপডেট হয়েছে।')
      load()
    } catch (err) {
      setMsg(err.response?.data?.message || 'আপডেট করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="System Settings (company info ছাড়া)">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm font-medium text-pf-primary-700 hover:underline"
        >
          দেখতে ক্লিক করুন →
        </button>
      ) : (
        <div className="space-y-3">
          {loading && <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>}
          {error && <p className="text-sm text-pf-error">{error}</p>}

          {settings && settings.length === 0 && (
            <p className="text-sm text-pf-text-muted">এই টেন্যান্টের জন্য কোনো (edit-যোগ্য) সেটিংস পাওয়া যায়নি।</p>
          )}

          {settings && settings.length > 0 && (
            <div className="space-y-2.5">
              {settings.map((s) => (
                <div key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                  <label className="w-full sm:w-48 flex-shrink-0 text-xs font-medium text-pf-text-secondary">
                    {s.key}
                    {s.description && <span className="block text-[10px] text-pf-text-muted font-normal">{s.description}</span>}
                  </label>
                  <input
                    defaultValue={s.value}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    className={`${inputCls} flex-1`}
                  />
                </div>
              ))}
              <button
                onClick={save}
                disabled={saving}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <FiLoader className="animate-spin" /> : null}
                সেভ করুন
              </button>
            </div>
          )}

          {msg && <p className="text-sm text-pf-text-secondary">{msg}</p>}
        </div>
      )}
    </Card>
  )
}

// ─── AI Settings (BYOK key_source + pricing override) ──────────
// ৩০ জুলাই ২০২৬। Tenant নিজে key_source বদলাতে পারে না (নিরাপত্তার
// জন্য) — শুধু এখান থেকে Super Admin ঠিক করেন কোন tenant নিজের AI key
// ব্যবহার করবে ('own'), কে platform-এর shared key ব্যবহার করে wallet
// থেকে charge দেবে ('platform'), আর কার AI ফিচার বন্ধ থাকবে ('blocked')।
const KEY_SOURCE_OPTIONS = [
  { value: 'platform', label: 'Platform Key', hint: 'shared key, wallet থেকে charge' },
  { value: 'own',      label: 'নিজের Key',     hint: 'tenant-এর নিজের API key' },
  { value: 'blocked',  label: 'বন্ধ',           hint: 'AI ফিচার সম্পূর্ণ বন্ধ' },
]

function AiSettingsCard({ tenantId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState(false)

  const [keySource, setKeySource]   = useState('platform')
  const [pricingMode, setPricingMode] = useState('default') // 'default' | 'flat' | 'percent'
  const [flatRate, setFlatRate]     = useState('')
  const [markup, setMarkup]         = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get(`/tenants/${tenantId}/ai-settings`)
      const d = res.data.data
      setData(d)
      setKeySource(d.key_source || 'platform')
      setPricingMode(d.pricing_mode || 'default')
      setFlatRate(d.flat_rate_paisa_per_1k ?? '')
      setMarkup(d.markup_percent ?? '')
    } catch (err) {
      setError(err.response?.data?.message || 'AI সেটিংস লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && data === null) load()
  }, [expanded])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const payload = { key_source: keySource }
      if (pricingMode === 'default') {
        payload.pricing_mode = null
        payload.flat_rate_paisa_per_1k = null
        payload.markup_percent = null
      } else {
        payload.pricing_mode = pricingMode
        if (pricingMode === 'flat') payload.flat_rate_paisa_per_1k = flatRate === '' ? null : parseInt(flatRate, 10)
        if (pricingMode === 'percent') payload.markup_percent = markup === '' ? null : parseFloat(markup)
      }
      await superAdminApi.patch(`/tenants/${tenantId}/ai-settings`, payload)
      setMsg('✅ AI সেটিংস আপডেট হয়েছে।')
      load()
    } catch (err) {
      setMsg(err.response?.data?.message || 'আপডেট করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="AI Settings (BYOK)">
      {!expanded ? (
        <button onClick={() => setExpanded(true)} className="text-sm font-medium text-pf-primary-700 hover:underline">
          দেখতে ও পরিবর্তন করতে ক্লিক করুন →
        </button>
      ) : (
        <div className="space-y-4">
          {loading && <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>}
          {error && <p className="text-sm text-pf-error">{error}</p>}

          {data && (
            <>
              {/* বর্তমান অবস্থা */}
              <div className="flex flex-wrap items-center gap-3 text-sm bg-pf-bg-body rounded-lg p-3">
                <span className="text-pf-text-secondary">
                  Key জমা দেওয়া: {data.has_own_key
                    ? <span className="font-medium text-pf-success">হ্যাঁ ({data.provider}, {data.masked_key})</span>
                    : <span className="font-medium text-pf-text-muted">না</span>}
                </span>
                <span className="text-pf-text-secondary ml-auto">
                  গত ৩০ দিন: <span className="font-pf-mono font-semibold text-pf-text-primary">{data.last_30d.calls}</span> কল,{' '}
                  <span className="font-pf-mono font-semibold text-pf-text-primary">{data.last_30d.tokens.toLocaleString('bn-BD')}</span> token,{' '}
                  ৳<span className="font-pf-mono font-semibold text-pf-text-primary">{(data.last_30d.charge_paisa / 100).toLocaleString('bn-BD', { minimumFractionDigits: 2 })}</span> charge
                </span>
              </div>

              {/* key_source নির্বাচন */}
              <div>
                <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">এই Tenant কোন Key ব্যবহার করবে</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {KEY_SOURCE_OPTIONS.map((opt) => (
                    <label key={opt.value}
                      className={`flex flex-col border-2 rounded-lg p-2.5 cursor-pointer transition-all
                        ${keySource === opt.value ? 'border-pf-primary-700 bg-pf-primary-700/5' : 'border-pf-border hover:border-pf-primary-700/40'}`}>
                      <input type="radio" name="key_source" value={opt.value} checked={keySource === opt.value}
                        onChange={() => setKeySource(opt.value)} className="sr-only" />
                      <span className="text-sm font-semibold text-pf-text-primary">{opt.label}</span>
                      <span className="text-[11px] text-pf-text-muted">{opt.hint}</span>
                    </label>
                  ))}
                </div>
                {keySource === 'own' && !data.has_own_key && (
                  <p className="text-xs text-pf-error mt-1.5">⚠️ এই tenant এখনো নিজের কোনো key জমা দেয়নি — 'নিজের Key' সিলেক্ট করলে key না দেওয়া পর্যন্ত AI ব্লক থাকবে।</p>
                )}
              </div>

              {/* pricing override — শুধু platform key হলে প্রাসঙ্গিক */}
              {keySource === 'platform' && (
                <div>
                  <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">
                    Pricing override (না দিলে গ্লোবাল ডিফল্ট প্রযোজ্য হবে)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[
                      { v: 'default', label: 'গ্লোবাল ডিফল্ট' },
                      { v: 'flat',    label: 'Flat rate/1k' },
                      { v: 'percent', label: 'Cost + markup%' },
                    ].map((m) => (
                      <label key={m.v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="radio" name="pricing_mode" value={m.v} checked={pricingMode === m.v} onChange={() => setPricingMode(m.v)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                  {pricingMode === 'flat' && (
                    <input type="number" className={`${inputCls} w-full sm:w-56`} placeholder="পয়সা / ১০০০ token"
                      value={flatRate} onChange={(e) => setFlatRate(e.target.value)} />
                  )}
                  {pricingMode === 'percent' && (
                    <input type="number" className={`${inputCls} w-full sm:w-56`} placeholder="Markup %"
                      value={markup} onChange={(e) => setMarkup(e.target.value)} />
                  )}
                </div>
              )}

              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60">
                {saving ? <FiLoader className="animate-spin" /> : null} সেভ করুন
              </button>
              {msg && <p className="text-sm text-pf-text-secondary">{msg}</p>}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function DeleteTenantCard({ tenant }) {
  const navigate = useNavigate()
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (confirmText !== 'DELETE') {
      setError('নিশ্চিত করতে ঠিক "DELETE" টাইপ করুন।')
      return
    }
    setLoading(true)
    try {
      await superAdminApi.delete(`/tenants/${tenant.id}`, { data: { confirm: 'DELETE' } })
      navigate('/superadmin/tenants', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'ডিলিট করা যায়নি।')
      setLoading(false)
    }
  }

  return (
    <Card title="⚠️ Tenant ডিলিট করুন" danger>
      <p className="text-sm text-pf-text-secondary mb-3">
        এটা <span className="font-semibold text-pf-error">অপরিবর্তনীয়</span> — {tenant.company_name}-এর সব ডেটা
        (কর্মী, কাস্টমার, বিক্রয়, সেটিংস) স্থায়ীভাবে মুছে যাবে।
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">
            নিশ্চিত করতে ঠিক "DELETE" টাইপ করুন
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className={`${inputCls} w-full font-pf-mono`}
            placeholder="DELETE"
          />
        </div>
        <SubmitButton loading={loading} variant="danger">
          <FiTrash2 /> স্থায়ীভাবে ডিলিট করুন
        </SubmitButton>
      </form>
      {error && <p className="text-sm mt-2 text-pf-error">{error}</p>}
    </Card>
  )
}

// ─── ছোট shared UI helpers ──────────────────────────────────────
function Card({ title, danger, children }) {
  return (
    <div className={`bg-pf-bg-surface border rounded-xl p-5 ${danger ? 'border-pf-error/40' : 'border-pf-border'}`}>
      <h2 className={`font-pf-head font-semibold text-sm mb-3 ${danger ? 'text-pf-error' : 'text-pf-primary-700'}`}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function SubmitButton({ loading, variant, children }) {
  const base = 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap disabled:opacity-60 hover:brightness-110 transition-all'
  const variants = {
    default: 'bg-pf-primary-700 text-white',
    warning: 'bg-pf-warning text-white',
    danger: 'bg-pf-error text-white',
  }
  return (
    <button type="submit" disabled={loading} className={`${base} ${variants[variant] || variants.default}`}>
      {loading ? <FiLoader className="animate-spin" /> : null}
      {children}
    </button>
  )
}
