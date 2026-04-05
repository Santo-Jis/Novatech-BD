import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiSave, FiPlus, FiTrash2 } from 'react-icons/fi'

export default function AdminSettings() {
  const [settings,  setSettings]  = useState({})
  const [holidays,  setHolidays]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [newHoliday, setNewHoliday] = useState('')

  useEffect(() => {
    api.get('/admin/settings').then(res => {
      const s = {}
      res.data.data.forEach(item => { s[item.key] = item.value })
      setSettings(s)
      try { setHolidays(JSON.parse(s.holidays || '[]')) } catch { setHolidays([]) }
    }).finally(() => setLoading(false))
  }, [])

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }))

  const save = async () => {
    setSaving(true)
    try {
      const settingsArray = Object.entries(settings).map(([key, value]) => ({ key, value }))
      settingsArray.push({ key: 'holidays', value: JSON.stringify(holidays) })
      await api.put('/admin/settings', { settings: settingsArray })
      toast.success('সেটিংস সেভ হয়েছে।')
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const addHoliday = () => {
    if (!newHoliday) return
    setHolidays(prev => [...new Set([...prev, newHoliday])].sort())
    setNewHoliday('')
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

      {/* SMS Template */}
      <Card title="SMS টেমপ্লেট">
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
            ব্যবহারযোগ্য ভ্যারিয়েবল: <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{shop}'}</code> <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{product}'}</code> <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{qty}'}</code> <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{total}'}</code> <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{otp_line}'}</code> <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">{'{disc}'}</code>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">বিল SMS টেমপ্লেট</label>
            <textarea
              rows={5}
              className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-primary font-mono resize-none"
              value={settings.sms_bill_template || 'NovaTEch BD\nদোকান: {shop}\nপণ্য: {product} x {qty} পিস\nডিসকাউন্ট: {disc}%\nমোট: {total}\n{otp_line}'}
              onChange={e => set('sms_bill_template', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">লেট অ্যালার্ট বার্তা</label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-primary resize-none"
              value={settings.sms_late_template || 'NovaTEch BD: আপনি এই মাসে ৩ বার দেরিতে উপস্থিত হয়েছেন।'}
              onChange={e => set('sms_late_template', e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} icon={<FiSave />} size="lg">সব সেটিংস সেভ করুন</Button>
      </div>
    </div>
  )
}
