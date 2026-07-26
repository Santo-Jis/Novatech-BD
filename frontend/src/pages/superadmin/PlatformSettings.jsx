import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  FiSave, FiRefreshCw, FiCheckCircle, FiLoader,
  FiAlertCircle, FiMessageSquare, FiMail,
} from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState } from './components/PanelStates'

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700'

const labelCls = 'block text-sm font-medium text-pf-text-primary mb-1.5'

const cardCls = 'bg-pf-bg-surface border border-pf-border rounded-xl p-5 space-y-4'

const SMS_PROVIDERS = [
  { value: 'textbee',      label: 'TextBee',      hint: 'textbee.dev' },
  { value: 'softbarta',    label: 'SoftBarta',    hint: 'ms.softbarta.com' },
  { value: 'ssl_wireless', label: 'SSL Wireless',  hint: 'smsc.sslwireless.com' },
  { value: 'twilio',       label: 'Twilio',        hint: 'api.twilio.com' },
  { value: 'custom',       label: 'Custom API',    hint: 'নিজস্ব URL' },
]

export default function PlatformSettings() {
  const [settings, setSettings] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const [smsApiKey,   setSmsApiKey]   = useState('')
  const [smsKeyDirty, setSmsKeyDirty] = useState(false)

  const [smsStatus,        setSmsStatus]        = useState(null)
  const [smsStatusLoading, setSmsStatusLoading]  = useState(false)

  const [testPhone,  setTestPhone]  = useState('')
  const [testType,   setTestType]   = useState('test')
  const [testStatus, setTestStatus] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/platform-settings')
      const s = {}
      res.data.data.forEach((item) => { s[item.key] = item.value })
      setSettings(s)
      setSmsApiKey(s.sms_api_key && s.sms_api_key.includes('****') ? '' : (s.sms_api_key || ''))
    } catch (err) {
      if (!err._toastShown) setError('সেটিংস লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadSmsStatus = useCallback(async () => {
    setSmsStatusLoading(true)
    try {
      const res = await superAdminApi.get('/platform-settings/sms-status')
      setSmsStatus(res.data.data)
    } catch { /* silent */ }
    finally { setSmsStatusLoading(false) }
  }, [])

  useEffect(() => { loadSmsStatus() }, [loadSmsStatus])

  const set = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }))

  const save = async () => {
    setSaving(true)
    try {
      const payload = Object.entries(settings)
        .filter(([key]) => key !== 'sms_api_key')
        .map(([key, value]) => ({ key, value }))

      if (smsKeyDirty && smsApiKey.trim()) {
        payload.push({ key: 'sms_api_key', value: smsApiKey.trim() })
      }

      await superAdminApi.put('/platform-settings', { settings: payload })
      setSmsKeyDirty(false)
      toast.success('প্ল্যাটফর্ম সেটিংস সেভ হয়েছে।')
      loadSmsStatus()
    } catch (err) {
      if (!err._toastShown) toast.error('সেভ করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  const sendTestSms = async () => {
    if (!testPhone.trim()) { toast.error('ফোন নম্বর দিন।'); return }
    setTestStatus('sending')
    try {
      await superAdminApi.post('/platform-settings/sms-test', { phone: testPhone.trim(), type: testType })
      setTestStatus('success')
      toast.success('টেস্ট SMS পাঠানো হয়েছে।')
      loadSmsStatus()
    } catch (err) {
      setTestStatus('error')
      if (!err._toastShown) toast.error(err?.response?.data?.message || 'SMS পাঠানো ব্যর্থ।')
    } finally {
      setTimeout(() => setTestStatus(null), 3000)
    }
  }

  if (loading) return <LoadingState label="প্ল্যাটফর্ম সেটিংস লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">প্ল্যাটফর্ম সেটিংস</h1>
          <p className="text-pf-text-secondary text-sm mt-1">
            SMS/Email গেটওয়ে — সব কোম্পানির জন্য একটাই শেয়ার্ড কনফিগ, এখান থেকেই নিয়ন্ত্রণ হয়।
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
        >
          {saving ? <FiLoader className="animate-spin" /> : <FiSave />} সেভ করুন
        </button>
      </div>

      {/* SMS Health */}
      {smsStatus && (
        <div className={`rounded-xl p-3.5 flex items-center gap-3 border ${
          smsStatus.healthy ? 'bg-pf-success-bg border-pf-success/30' : 'bg-pf-error-bg border-pf-error/30'
        }`}>
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${smsStatus.healthy ? 'bg-pf-success' : 'bg-pf-error animate-pulse'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${smsStatus.healthy ? 'text-pf-success' : 'text-pf-error'}`}>
              {smsStatus.healthy ? '✅ SMS সিস্টেম সচল' : '⚠️ SMS সিস্টেম সমস্যা আছে'}
            </p>
            <p className="text-xs text-pf-text-secondary mt-0.5">
              আজ: {smsStatus.today?.sent_today || 0} পাঠানো
              {smsStatus.today?.failed_today > 0 && ` · ${smsStatus.today.failed_today} ব্যর্থ`}
              {' · '}{smsStatus.provider}
            </p>
            {smsStatus.missing_fields?.length > 0 && (
              <p className="text-xs text-pf-error mt-0.5">❌ Missing: {smsStatus.missing_fields.join(', ')}</p>
            )}
          </div>
          <button onClick={loadSmsStatus} className="p-1.5 rounded-lg bg-white/70 text-pf-text-muted hover:text-pf-text-primary">
            <FiRefreshCw size={12} className={smsStatusLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {/* SMS Gateway */}
      <div className={cardCls}>
        <h2 className="font-pf-head font-semibold text-pf-text-primary flex items-center gap-2">
          <FiMessageSquare /> SMS গেটওয়ে
        </h2>

        <div>
          <label className={labelCls}>প্রোভাইডার</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SMS_PROVIDERS.map((p) => (
              <label
                key={p.value}
                className={`flex flex-col items-center justify-center border-2 rounded-lg p-2.5 cursor-pointer text-center transition-all
                  ${(settings.sms_provider || 'softbarta') === p.value
                    ? 'border-pf-primary-700 bg-pf-primary-700/5'
                    : 'border-pf-border hover:border-pf-primary-700/40'}`}
              >
                <input
                  type="radio" name="sms_provider" value={p.value}
                  checked={(settings.sms_provider || 'softbarta') === p.value}
                  onChange={() => set('sms_provider', p.value)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-pf-text-primary">{p.label}</span>
                <span className="text-[11px] text-pf-text-muted font-mono">{p.hint}</span>
              </label>
            ))}
          </div>
        </div>

        {(settings.sms_provider === 'textbee' || (settings.sms_provider || 'softbarta') === 'softbarta') && (
          <div>
            <label className={labelCls}>Device ID {settings.sms_provider === 'textbee' ? '*' : '(ঐচ্ছিক)'}</label>
            <input className={inputCls} value={settings.sms_device_id || ''} onChange={(e) => set('sms_device_id', e.target.value)} />
          </div>
        )}

        {settings.sms_provider === 'custom' && (
          <div>
            <label className={labelCls}>Custom API URL</label>
            <input className={inputCls} placeholder="https://your-sms-api.com/send"
              value={settings.sms_custom_url || ''} onChange={(e) => set('sms_custom_url', e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              API Key / Token
              {!smsKeyDirty && settings.sms_api_key && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-pf-success font-normal">
                  <FiCheckCircle className="text-xs" /> সেট করা আছে
                </span>
              )}
            </label>
            <input
              type="password"
              placeholder={settings.sms_api_key ? '••••••••••••  (অপরিবর্তিত)' : 'API Key দিন'}
              value={smsApiKey}
              onChange={(e) => { setSmsApiKey(e.target.value); setSmsKeyDirty(true) }}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Sender ID / SID</label>
            <input className={inputCls} placeholder="ZovoriX" value={settings.sms_sender_id || ''} onChange={(e) => set('sms_sender_id', e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls}>SMS সিস্টেম</label>
          <div className="flex gap-3">
            {['true', 'false'].map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="sms_enabled" value={v}
                  checked={(settings.sms_enabled ?? 'true') === v}
                  onChange={() => set('sms_enabled', v)} />
                {v === 'true' ? '✅ চালু' : '⛔ বন্ধ'}
              </label>
            ))}
          </div>
        </div>

        {/* Test SMS */}
        <div className="border-t border-pf-border pt-4">
          <p className="text-sm font-medium text-pf-text-primary mb-2">টেস্ট SMS পাঠান</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {[
              { value: 'test',    label: '📩 সাধারণ' },
              { value: 'otp',     label: '🔐 OTP' },
              { value: 'invoice', label: '🧾 Invoice' },
              { value: 'login',   label: '🔑 Login' },
            ].map((t) => (
              <label key={t.value} className={`px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${
                testType === t.value ? 'border-pf-primary-700 bg-pf-primary-700/5 font-semibold' : 'border-pf-border text-pf-text-secondary'
              }`}>
                <input type="radio" name="test_type" value={t.value} checked={testType === t.value}
                  onChange={() => setTestType(t.value)} className="sr-only" />
                {t.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="tel" placeholder="01XXXXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className={inputCls} />
            <button
              onClick={sendTestSms}
              disabled={testStatus === 'sending'}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap
                ${testStatus === 'success' ? 'bg-pf-success text-white'
                  : testStatus === 'error'   ? 'bg-pf-error text-white'
                  : 'bg-pf-primary-700 text-white hover:brightness-110'} disabled:opacity-60`}
            >
              {testStatus === 'sending' && <FiLoader className="animate-spin" />}
              {testStatus === 'success' && <FiCheckCircle />}
              {testStatus === 'error'   && <FiAlertCircle />}
              {!testStatus && <FiMessageSquare />}
              পাঠান
            </button>
          </div>
        </div>
      </div>

      {/* Email Gateway */}
      <div className={cardCls}>
        <h2 className="font-pf-head font-semibold text-pf-text-primary flex items-center gap-2">
          <FiMail /> Email গেটওয়ে <span className="text-xs font-normal text-pf-text-muted">(ঐচ্ছিক — খালি থাকলে .env ডিফল্ট ব্যবহার হবে)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>SMTP Host</label>
            <input className={inputCls} placeholder="smtp-relay.brevo.com" value={settings.email_host || ''} onChange={(e) => set('email_host', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input className={inputCls} placeholder="587" value={settings.email_port || ''} onChange={(e) => set('email_port', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>User</label>
            <input className={inputCls} value={settings.email_user || ''} onChange={(e) => set('email_user', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Password / API Key</label>
            <input type="password" className={`${inputCls} font-mono`} value={settings.email_pass || ''} onChange={(e) => set('email_pass', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>From</label>
            <input className={inputCls} placeholder="ZovoriX <noreply@novatechbd.com>" value={settings.email_from || ''} onChange={(e) => set('email_from', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Pricing (usage-based billing) */}
      <div className={cardCls}>
        <h2 className="font-pf-head font-semibold text-pf-text-primary">প্রাইসিং (Usage-based billing)</h2>
        <p className="text-xs text-pf-text-secondary -mt-2">প্রতিটা কোম্পানির credit থেকে এই হারে কাটা হবে (Phase 2 চালু হলে)।</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>প্রতি SMS (পয়সা)</label>
            <input type="number" className={inputCls} value={settings.sms_price_paisa || ''} onChange={(e) => set('sms_price_paisa', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>প্রতি Email (পয়সা)</label>
            <input type="number" className={inputCls} value={settings.email_price_paisa || ''} onChange={(e) => set('email_price_paisa', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}
