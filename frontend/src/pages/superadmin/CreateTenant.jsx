import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FiArrowLeft, FiLoader } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700'

const PLANS = [
  { value: 'basic', label: 'Basic (১০ কর্মী, ২০০ কাস্টমার)' },
  { value: 'pro', label: 'Pro (৫০ কর্মী, ২০০০ কাস্টমার)' },
  { value: 'enterprise', label: 'Enterprise (১০০০ কর্মী, ৫০,০০০ কাস্টমার)' },
]

const emptyForm = {
  slug: '',
  company_name: '',
  company_name_bn: '',
  plan: 'basic',
  admin_name: '',
  admin_phone: '',
  admin_email: '',
  admin_password: '',
}

export default function CreateTenant() {
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.slug || !form.company_name || !form.admin_phone || !form.admin_password) {
      setError('slug, কোম্পানির নাম, admin ফোন ও পাসওয়ার্ড — এই ৪টা আবশ্যক।')
      return
    }
    if (form.admin_password.length < 8) {
      setError('পাসওয়ার্ড কমপক্ষে ৮ ক্যারেক্টার হতে হবে।')
      return
    }

    setLoading(true)
    try {
      const res = await superAdminApi.post('/tenants', form)
      const tenantId = res.data.data.tenant.id
      navigate(`/superadmin/tenants/${tenantId}`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'টেন্যান্ট তৈরি করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        to="/superadmin/tenants"
        className="flex items-center gap-1.5 text-sm font-medium text-pf-text-secondary hover:text-pf-primary-700 w-fit"
      >
        <FiArrowLeft /> টেন্যান্ট তালিকায় ফিরুন
      </Link>

      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">নতুন টেন্যান্ট তৈরি করুন</h1>
        <p className="text-pf-text-secondary text-sm mt-1">
          তৈরির সাথে সাথেই status = active, এবং প্রথম admin ইউজার তৈরি হয়ে যাবে।
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 space-y-5"
      >
        {error && (
          <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>
        )}

        <fieldset className="space-y-4">
          <legend className="font-pf-head font-semibold text-sm text-pf-primary-700 mb-2">কোম্পানি তথ্য</legend>

          <Field label="Slug (URL-friendly, unique)" required>
            <input
              value={form.slug}
              onChange={update('slug')}
              placeholder="e.g. dhaka-trading-co"
              className={inputCls}
            />
          </Field>

          <Field label="কোম্পানির নাম (English)" required>
            <input value={form.company_name} onChange={update('company_name')} className={inputCls} />
          </Field>

          <Field label="কোম্পানির নাম (বাংলা)">
            <input value={form.company_name_bn} onChange={update('company_name_bn')} className={inputCls} />
          </Field>

          <Field label="প্ল্যান">
            <select value={form.plan} onChange={update('plan')} className={inputCls}>
              {PLANS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
        </fieldset>

        <fieldset className="space-y-4 pt-2 border-t border-pf-border">
          <legend className="font-pf-head font-semibold text-sm text-pf-primary-700 mb-2 pt-4">প্রথম Admin ইউজার</legend>

          <Field label="Admin নাম">
            <input value={form.admin_name} onChange={update('admin_name')} className={inputCls} />
          </Field>

          <Field label="Admin ফোন" required>
            <input value={form.admin_phone} onChange={update('admin_phone')} placeholder="01XXXXXXXXX" className={inputCls} />
          </Field>

          <Field label="Admin ইমেইল">
            <input type="email" value={form.admin_email} onChange={update('admin_email')} className={inputCls} />
          </Field>

          <Field label="Admin পাসওয়ার্ড (কমপক্ষে ৮ ক্যারেক্টার)" required>
            <input type="password" value={form.admin_password} onChange={update('admin_password')} className={inputCls} />
          </Field>
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-pf-primary-900 text-white font-semibold
            text-sm py-2.5 rounded-lg hover:brightness-110 disabled:opacity-60 transition-all"
        >
          {loading ? <FiLoader className="animate-spin" /> : null}
          {loading ? 'তৈরি হচ্ছে...' : 'টেন্যান্ট তৈরি করুন'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">
        {label} {required && <span className="text-pf-error">*</span>}
      </label>
      {children}
    </div>
  )
}
