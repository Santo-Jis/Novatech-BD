import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import {
  FiSave, FiPlus, FiTrash2, FiMessageSquare,
  FiCheckCircle, FiLoader, FiAlertCircle,
  FiRefreshCw, FiActivity, FiList
} from 'react-icons/fi'
import AdminCreditSettings from './AdminCreditSettings'

export default function AdminSettings() {
  const [settings,        setSettings]        = useState({})
  const [grouped,         setGrouped]         = useState({})
  const [holidays,        setHolidays]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [newHoliday,      setNewHoliday]      = useState('')
  const [smsApiKey,       setSmsApiKey]       = useState('')
  const [smsKeyDirty,     setSmsKeyDirty]     = useState(false)
  const [testPhone,       setTestPhone]       = useState('')
  const [testType,        setTestType]        = useState('test')          // ✅ নতুন
  const [testStatus,      setTestStatus]      = useState(null)
  // ── SMS Status ──────────────────────────────────────────────
  const [smsStatus,       setSmsStatus]       = useState(null)
  const [smsStatusLoading,setSmsStatusLoading]= useState(false)
  // ── SMS Logs ────────────────────────────────────────────────
  const [smsLogs,         setSmsLogs]         = useState([])
  const [smsLogsLoading,  setSmsLogsLoading]  = useState(false)
  const [smsLogsPage,     setSmsLogsPage]     = useState(1)
  const [smsLogsMeta,     setSmsLogsMeta]     = useState({ total: 0, totalPages: 1 })
  const [smsLogsFilter,   setSmsLogsFilter]   = useState({ status: '', type: '' })
  const [logsLoaded,      setLogsLoaded]      = useState(false)
  // ── Commission Slabs ────────────────────────────────────────
  const [commSlabs,       setCommSlabs]       = useState([])
  const [commLoading,     setCommLoading]     = useState(false)
  const [commSaving,      setCommSaving]      = useState(false)

  // ── Settings লোড ────────────────────────────────────────────
  useEffect(() => {
    api.get('/admin/settings').then(res => {
      const s = {}
      res.data.data.forEach(item => { s[item.key] = item.value })
      setSettings(s)
      if (res.data.grouped) setGrouped(res.data.grouped)
      setSmsApiKey(s.sms_api_key && s.sms_api_key.includes('****') ? '' : (s.sms_api_key || ''))
      try { setHolidays(JSON.parse(s.holidays || '[]')) } catch { setHolidays([]) }
    }).finally(() => setLoading(false))
  }, [])

  // ── SMS Status লোড ──────────────────────────────────────────
  const loadSmsStatus = useCallback(async () => {
    setSmsStatusLoading(true)
    try {
      const res = await api.get('/admin/sms-status')
      setSmsStatus(res.data.data)
    } catch { /* silent */ }
    finally { setSmsStatusLoading(false) }
  }, [])

  useEffect(() => { loadSmsStatus() }, [loadSmsStatus])

  // ── SMS Logs লোড ────────────────────────────────────────────
  const loadSmsLogs = useCallback(async (page = 1) => {
    setSmsLogsLoading(true)
    setLogsLoaded(true)
    try {
      const res = await api.get('/admin/sms-logs', {
        params: { page, limit: 20, ...smsLogsFilter }
      })
      setSmsLogs(res.data.data || [])
      setSmsLogsMeta(res.data.pagination || { total: 0, totalPages: 1 })
      setSmsLogsPage(page)
    } catch { toast.error('SMS লগ আনতে সমস্যা।') }
    finally { setSmsLogsLoading(false) }
  }, [smsLogsFilter])

  // ── Commission Settings লোড ─────────────────────────────────
  const loadCommSettings = useCallback(async () => {
    setCommLoading(true)
    try {
      const res = await api.get('/commission/settings')
      setCommSlabs(res.data.data || [])
    } catch { /* silent */ }
    finally { setCommLoading(false) }
  }, [])

  useEffect(() => { loadCommSettings() }, [loadCommSettings])

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }))

  // ── Main Settings সেভ ───────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const settingsArray = Object.entries(settings)
        .filter(([key]) => key !== 'sms_api_key')
        .map(([key, value]) => ({ key, value }))
      settingsArray.push({ key: 'holidays', value: JSON.stringify(holidays) })
      if (smsKeyDirty && smsApiKey.trim()) {
        settingsArray.push({ key: 'sms_api_key', value: smsApiKey.trim() })
      }
      await api.put('/admin/settings', { settings: settingsArray })
      setSmsKeyDirty(false)
      toast.success('সেটিংস সেভ হয়েছে।')
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const addHoliday = () => {
    if (!newHoliday) return
    setHolidays(prev => [...new Set([...prev, newHoliday])].sort())
    setNewHoliday('')
  }

  // ── SMS Test (type-specific) ─────────────────────────────────
  const sendTestSms = async () => {
    if (!testPhone.trim()) { toast.error('ফোন নম্বর দিন।'); return }
    setTestStatus('sending')
    try {
      await api.post('/admin/sms-test', { phone: testPhone.trim(), type: testType })
      setTestStatus('success')
      toast.success('টেস্ট SMS পাঠানো হয়েছে।')
      loadSmsStatus()
    } catch (err) {
      setTestStatus('error')
      toast.error(err?.response?.data?.message || 'SMS পাঠানো ব্যর্থ।')
    } finally {
      setTimeout(() => setTestStatus(null), 3000)
    }
  }

  // ── Commission Slab সেভ ─────────────────────────────────────
  const saveCommSlabs = async () => {
    if (commSlabs.length === 0) return
    setCommSaving(true)
    try {
      await api.put('/commission/settings', { slabs: commSlabs })
      toast.success('কমিশন স্ল্যাব সেভ হয়েছে। ✅')
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setCommSaving(false) }
  }

  if (loading) return <div className="h-96 bg-white rounded-2xl animate-pulse" />

  return (
    <div className="max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">সিস্টেম সেটিংস</h1>
        <Button onClick={save} loading={saving} icon={<FiSave />}>সেভ করুন</Button>
      </div>

      {/* Attendance */}
      <Card title="হাজিরা সেটিংস">
        <div className="grid grid-cols-2 gap-3">
          <Input label="চেক-ইন শুরু" type="time" value={settings.attendance_checkin_start || '09:00'}
            onChange={e => set('attendance_checkin_start', e.target.value)} />
          <Input label="লেট শুরু" type="time" value={settings.attendance_checkin_end || '10:00'}
            onChange={e => set('attendance_checkin_end', e.target.value)} />
          <Input label="পপআপ বন্ধ" type="time" value={settings.attendance_popup_cutoff || '14:30'}
            onChange={e => set('attendance_popup_cutoff', e.target.value)} />
          <Input label="চেক-আউট সময়" type="time" value={settings.attendance_checkout_time || '20:30'}
            onChange={e => set('attendance_checkout_time', e.target.value)} />
          <Input label="লেট কর্তন (মিনিট)" type="number" value={settings.late_deduction_interval || '10'}
            onChange={e => set('late_deduction_interval', e.target.value)}
            hint="প্রতি কত মিনিটে ১ ঘণ্টার বেতন কাটবে" />
        </div>
      </Card>

      {/* OTP & GPS */}
      <Card title="OTP ও GPS সেটিংস">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">OTP বাধ্যতামূলক</label>
            <div className="flex gap-3">
              {['true', 'false'].map(v => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="otp" value={v}
                    checked={settings.otp_required === v}
                    onChange={() => set('otp_required', v)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{v === 'true' ? 'চালু' : 'বন্ধ'}</span>
                </label>
              ))}
            </div>
          </div>
          <Input label="OTP মেয়াদ (মিনিট)" type="number" value={settings.otp_expiry_minutes || '10'}
            onChange={e => set('otp_expiry_minutes', e.target.value)} />
          <Input label="GPS রেডিয়াস (মিটার)" type="number" value={settings.location_check_radius || '5'}
            onChange={e => set('location_check_radius', e.target.value)} />
        </div>
      </Card>

      {/* Weekly Off */}
      <Card title="সাপ্তাহিক ছুটি (গ্লোবাল)">
        <div className="space-y-2">
          <p className="text-xs text-gray-400">এই সেটিং সব টিমের জন্য ডিফল্ট। টিম-ভিত্তিক আলাদা ছুটি সেট করতে টিম ম্যানেজমেন্ট পেজে যান।</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">সাপ্তাহিক ছুটির দিন</label>
            <select
              value={settings.weekly_off_day ?? '5'}
              onChange={e => set('weekly_off_day', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="0">রবিবার</option>
              <option value="1">সোমবার</option>
              <option value="2">মঙ্গলবার</option>
              <option value="3">বুধবার</option>
              <option value="4">বৃহস্পতিবার</option>
              <option value="5">শুক্রবার</option>
              <option value="6">শনিবার</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Holidays */}
      <Card title="সরকারি ছুটির তালিকা">
        <div className="flex gap-2 mb-3">
          <Input type="date" value={newHoliday} onChange={e => setNewHoliday(e.target.value)} className="flex-1" />
          <Button onClick={addHoliday} icon={<FiPlus />} size="sm">যোগ করুন</Button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {holidays.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">কোনো ছুটি নেই।</p>
          ) : holidays.map(h => (
            <div key={h} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm">{new Date(h).toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <button onClick={() => setHolidays(prev => prev.filter(d => d !== h))}
                className="text-red-400 hover:text-red-600">
                <FiTrash2 className="text-sm" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Company */}
      <Card title="কোম্পানি তথ্য">
        <div className="grid grid-cols-1 gap-3">
          <Input label="কোম্পানির নাম" value={settings.company_name || ''}
            onChange={e => set('company_name', e.target.value)} />
          <Input label="ঠিকানা" value={settings.company_address || ''}
            onChange={e => set('company_address', e.target.value)} />
          <Input label="ফোন" value={settings.company_phone || ''}
            onChange={e => set('company_phone', e.target.value)} />
          <Input label="ইমেইল" type="email" value={settings.company_email || ''}
            onChange={e => set('company_email', e.target.value)} />
        </div>
      </Card>

      {/* VAT */}
      <Card title="ভ্যাট / GST সেটিংস">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ভ্যাট সিস্টেম</label>
            <div className="flex gap-3">
              {['true','false'].map(v => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="vat_enabled" value={v}
                    checked={settings.vat_enabled === v}
                    onChange={() => set('vat_enabled', v)}
                    className="accent-primary"
                  />
                  <span className="text-sm dark:text-gray-300">{v === 'true' ? 'চালু' : 'বন্ধ'}</span>
                </label>
              ))}
            </div>
          </div>
          <Input label="ডিফল্ট ভ্যাট হার (%)" type="number" value={settings.default_vat_rate || '0'}
            onChange={e => set('default_vat_rate', e.target.value)} />
          <Input label="সর্বোচ্চ ডিসকাউন্ট (%)" type="number" value={settings.max_discount_percent || '20'}
            onChange={e => set('max_discount_percent', e.target.value)} />
        </div>
      </Card>

      {/* SMS Gateway */}
      <Card title="SMS গেটওয়ে কনফিগারেশন">
        <div className="space-y-4">

          {/* ✅ SMS Status Health Widget */}
          {smsStatus && (
            <div className={`rounded-xl p-3 flex items-center gap-3 border ${
              smsStatus.healthy
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${smsStatus.healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${smsStatus.healthy ? 'text-green-700' : 'text-red-700'}`}>
                  {smsStatus.healthy ? '✅ SMS সিস্টেম সচল' : '⚠️ SMS সিস্টেম সমস্যা আছে'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  আজ: {smsStatus.today?.sent_today || 0} পাঠানো
                  {smsStatus.today?.failed_today > 0 && ` · ${smsStatus.today.failed_today} ব্যর্থ`}
                  {' · '}{smsStatus.provider}
                </p>
                {smsStatus.missing_fields?.length > 0 && (
                  <p className="text-xs text-red-500">❌ Missing: {smsStatus.missing_fields.join(', ')}</p>
                )}
              </div>
              <button onClick={loadSmsStatus}
                className="p-1.5 rounded-lg bg-white/70 text-gray-400 hover:text-gray-600">
                <FiRefreshCw size={12} className={smsStatusLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {/* Provider Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS প্রোভাইডার</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'textbee',      label: '📲 TextBee',      hint: 'textbee.dev',          badge: 'নতুন' },
                { value: 'softbarta',    label: '📱 SoftBarta',    hint: 'ms.softbarta.com',     badge: null },
                { value: 'ssl_wireless', label: 'SSL Wireless',    hint: 'smsc.sslwireless.com', badge: null },
                { value: 'twilio',       label: 'Twilio',          hint: 'api.twilio.com',       badge: null },
                { value: 'custom',       label: 'Custom API',      hint: 'নিজস্ব URL',           badge: null },
              ].map(p => (
                <label
                  key={p.value}
                  className={`relative flex flex-col items-center justify-center border-2 rounded-xl p-3 cursor-pointer transition-all text-center
                    ${(settings.sms_provider || 'softbarta') === p.value
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'}`}
                >
                  {p.badge && (
                    <span className="absolute -top-2 right-2 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                      {p.badge}
                    </span>
                  )}
                  <input type="radio" name="sms_provider" value={p.value}
                    checked={(settings.sms_provider || 'softbarta') === p.value}
                    onChange={() => set('sms_provider', p.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{p.label}</span>
                  <span className="text-xs text-gray-400 mt-0.5 font-mono">{p.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {/* TextBee info */}
          {settings.sms_provider === 'textbee' && (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 p-3 text-xs text-indigo-700 space-y-1">
              <p className="font-semibold">📲 TextBee — Android SMS Gateway</p>
              <p>API Key ও Device ID: <span className="font-mono">app.textbee.dev → Dashboard</span></p>
            </div>
          )}
          {settings.sms_provider === 'textbee' && (
            <Input label="Device ID *" placeholder="textbee.dev Dashboard থেকে নিন"
              value={settings.sms_device_id || ''} onChange={e => set('sms_device_id', e.target.value)} />
          )}
          {(settings.sms_provider || 'softbarta') === 'softbarta' && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">📱 SoftBarta Android SMS Gateway</p>
              <p>API Key: <span className="font-mono">ms.softbarta.com → API মেনু</span></p>
            </div>
          )}
          {(settings.sms_provider || 'softbarta') === 'softbarta' && (
            <Input label="Device ID (ঐচ্ছিক)" placeholder="খালি রাখলে যেকোনো device"
              value={settings.sms_device_id || ''} onChange={e => set('sms_device_id', e.target.value)} />
          )}
          {settings.sms_provider === 'custom' && (
            <Input label="Custom API URL" placeholder="https://your-sms-api.com/send"
              value={settings.sms_custom_url || ''} onChange={e => set('sms_custom_url', e.target.value)}
              hint="POST request: {api_token, mobile, message}" />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                API Key / Token
                {!smsKeyDirty && settings.sms_api_key && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                    <FiCheckCircle className="text-xs" /> সেট করা আছে
                  </span>
                )}
              </label>
              <input
                type="password"
                placeholder={settings.sms_api_key ? '••••••••••••  (অপরিবর্তিত)' : 'আপনার SMS API Key দিন'}
                value={smsApiKey}
                onChange={e => { setSmsApiKey(e.target.value); setSmsKeyDirty(true) }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary font-mono"
              />
              <p className="mt-1 text-xs text-gray-400">এনক্রিপ্ট করে সংরক্ষণ হয়।</p>
            </div>
            <Input label="Sender ID / SID" placeholder="NovaTechBD"
              value={settings.sms_sender_id || ''} onChange={e => set('sms_sender_id', e.target.value)}
              hint="SSL Wireless-এ অনুমোদিত SID" />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS সিস্টেম</label>
              <div className="flex gap-3 mt-1">
                {['true', 'false'].map(v => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sms_enabled" value={v}
                      checked={(settings.sms_enabled ?? 'true') === v}
                      onChange={() => set('sms_enabled', v)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{v === 'true' ? '✅ চালু' : '⛔ বন্ধ'}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ✅ Test SMS — type-specific (Problem 4 fix) */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <FiMessageSquare /> টেস্ট SMS পাঠান
            </p>
            {/* Type Selector */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">টেস্টের ধরন বেছে নিন:</p>
              <div className="flex gap-3 flex-wrap">
                {[
                  { value: 'test',    label: '📩 সাধারণ' },
                  { value: 'otp',     label: '🔐 OTP' },
                  { value: 'invoice', label: '🧾 Invoice' },
                  { value: 'login',   label: '🔑 Login' },
                ].map(t => (
                  <label key={t.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer text-sm transition-all ${
                    testType === t.value
                      ? 'border-primary bg-primary/5 text-primary font-semibold'
                      : 'border-gray-200 text-gray-500'
                  }`}>
                    <input type="radio" name="test_type" value={t.value}
                      checked={testType === t.value}
                      onChange={() => setTestType(t.value)}
                      className="sr-only"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            {/* Phone Input + Send */}
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="01XXXXXXXXX"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
              />
              <button
                onClick={sendTestSms}
                disabled={testStatus === 'sending'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${testStatus === 'success' ? 'bg-green-500 text-white'
                  : testStatus === 'error'   ? 'bg-red-500 text-white'
                  : 'bg-primary text-white hover:bg-primary/90'} disabled:opacity-60`}
              >
                {testStatus === 'sending' && <FiLoader className="animate-spin" />}
                {testStatus === 'success' && <FiCheckCircle />}
                {testStatus === 'error'   && <FiAlertCircle />}
                {!testStatus && <FiMessageSquare />}
                {testStatus === 'sending' ? 'পাঠানো হচ্ছে...'
                  : testStatus === 'success' ? 'সফল!'
                  : testStatus === 'error'   ? 'ব্যর্থ!'
                  : 'পাঠান'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">সেভ করার পর টেস্ট করুন।</p>
          </div>
        </div>
      </Card>

      {/* ✅ SMS Logs (নতুন) */}
      <Card title="SMS লগ">
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={smsLogsFilter.status}
              onChange={e => setSmsLogsFilter(p => ({ ...p, status: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="">সব স্ট্যাটাস</option>
              <option value="sent">পাঠানো ✅</option>
              <option value="failed">ব্যর্থ ❌</option>
              <option value="disabled">বন্ধ ⛔</option>
              <option value="dev">Dev Mode</option>
            </select>
            <select
              value={smsLogsFilter.type}
              onChange={e => setSmsLogsFilter(p => ({ ...p, type: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="">সব ধরন</option>
              <option value="otp">OTP</option>
              <option value="invoice">Invoice</option>
              <option value="login">Login</option>
              <option value="test">Test</option>
            </select>
            <button
              onClick={() => loadSmsLogs(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium"
            >
              <FiList size={14} /> দেখুন
            </button>
          </div>

          {!logsLoaded ? (
            <p className="text-center text-sm text-gray-400 py-4">
              ফিল্টার বেছে "দেখুন" বাটনে ক্লিক করুন।
            </p>
          ) : smsLogsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : smsLogs.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">কোনো লগ পাওয়া যায়নি।</p>
          ) : (
            <div className="space-y-2">
              {smsLogs.map(log => (
                <div key={log.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    log.status === 'sent' ? 'bg-green-500' :
                    log.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{log.phone}</p>
                    <p className="text-xs text-gray-400">{log.type} · {log.provider}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${
                      log.status === 'sent' ? 'text-green-600' :
                      log.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {log.status === 'sent' ? '✅ সফল' : log.status === 'failed' ? '❌ ব্যর্থ' : log.status}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(log.sent_at).toLocaleString('bn-BD', {
                        hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {/* Pagination */}
              {smsLogsMeta.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    disabled={smsLogsPage <= 1}
                    onClick={() => loadSmsLogs(smsLogsPage - 1)}
                    className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium disabled:opacity-40"
                  >
                    ← আগে
                  </button>
                  <span className="text-xs text-gray-400">
                    পৃষ্ঠা {smsLogsPage} / {smsLogsMeta.totalPages}
                    {' '}({smsLogsMeta.total} টি মোট)
                  </span>
                  <button
                    disabled={smsLogsPage >= smsLogsMeta.totalPages}
                    onClick={() => loadSmsLogs(smsLogsPage + 1)}
                    className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium disabled:opacity-40"
                  >
                    পরে →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* SMS Template */}
      <Card title="SMS টেমপ্লেট">
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700">
            ব্যবহারযোগ্য ভ্যারিয়েবল: <code className="font-mono bg-blue-100 px-1 rounded">{"{shop}"}</code> <code className="font-mono bg-blue-100 px-1 rounded">{"{product}"}</code> <code className="font-mono bg-blue-100 px-1 rounded">{"{qty}"}</code> <code className="font-mono bg-blue-100 px-1 rounded">{"{total}"}</code> <code className="font-mono bg-blue-100 px-1 rounded">{"{otp_line}"}</code>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">বিল SMS টেমপ্লেট</label>
            <textarea rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary font-mono resize-none"
              value={settings.sms_bill_template || 'NovaTEch BD\nদোকান: {shop}\nপণ্য: {product} x {qty} পিস\nডিসকাউন্ট: {disc}%\nমোট: {total}\n{otp_line}'}
              onChange={e => set('sms_bill_template', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">লেট অ্যালার্ট বার্তা</label>
            <textarea rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary resize-none"
              value={settings.sms_late_template || 'NovaTEch BD: আপনি এই মাসে ৩ বার দেরিতে উপস্থিত হয়েছেন।'}
              onChange={e => set('sms_late_template', e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* ✅ Commission Slab Settings (নতুন) */}
      <Card title="কমিশন স্ল্যাব সেটিংস">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            SR-এর মাসিক বিক্রয় (৳) অনুযায়ী কমিশন শতাংশ নির্ধারণ করুন। সর্বোচ্চ খালি রাখলে সেটি "এর উপরে সব" বোঝাবে।
          </p>
          {commLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_,i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Header */}
              {commSlabs.length > 0 && (
                <div className="grid grid-cols-10 gap-2 px-1">
                  <p className="col-span-4 text-xs text-gray-500 font-medium">সর্বনিম্ন বিক্রয় (৳)</p>
                  <p className="col-span-3 text-xs text-gray-500 font-medium">সর্বোচ্চ (৳)</p>
                  <p className="col-span-2 text-xs text-gray-500 font-medium">হার (%)</p>
                  <p className="col-span-1"></p>
                </div>
              )}
              <div className="space-y-2">
                {commSlabs.map((slab, i) => (
                  <div key={i} className="grid grid-cols-10 gap-2 items-center">
                    <input
                      type="number" placeholder="০"
                      value={slab.slab_min ?? ''}
                      onChange={e => setCommSlabs(prev => prev.map((s, j) => j === i ? { ...s, slab_min: e.target.value } : s))}
                      className="col-span-4 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number" placeholder="সীমাহীন"
                      value={slab.slab_max ?? ''}
                      onChange={e => setCommSlabs(prev => prev.map((s, j) => j === i ? { ...s, slab_max: e.target.value } : s))}
                      className="col-span-3 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number" placeholder="%"
                      value={slab.rate ?? ''}
                      onChange={e => setCommSlabs(prev => prev.map((s, j) => j === i ? { ...s, rate: e.target.value } : s))}
                      className="col-span-2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => setCommSlabs(prev => prev.filter((_, j) => j !== i))}
                      className="col-span-1 p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setCommSlabs(prev => [...prev, { slab_min: '', slab_max: '', rate: '' }])}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm hover:bg-gray-200"
                >
                  <FiPlus size={13} /> স্ল্যাব যোগ করুন
                </button>
                <button
                  onClick={saveCommSlabs}
                  disabled={commSaving || commSlabs.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
                >
                  {commSaving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <FiSave size={13} />}
                  স্ল্যাব সেভ করুন
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Credit Alert Settings */}
      <AdminCreditSettings />

      {/* Default Credit Limit */}
      <Card title="নতুন কাস্টমারের ডিফল্ট ক্রেডিট লিমিট">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">নতুন কাস্টমার তৈরির সময় এই পরিমাণ credit limit স্বয়ংক্রিয়ভাবে সেট হবে।</p>
          <Input
            label="ডিফল্ট ক্রেডিট লিমিট (৳)"
            type="number"
            value={settings.default_credit_limit || '0'}
            onChange={e => set('default_credit_limit', e.target.value)}
            hint="০ = কোনো বাকি নেই, Manager সেট করবে"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} icon={<FiSave />} size="lg">সব সেটিংস সেভ করুন</Button>
      </div>
    </div>
  )
}
