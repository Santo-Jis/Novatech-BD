// components/ReminderSnoozePanel.jsx
// ============================================================
// "পরে পরিশোধ করব" — কাস্টমার বাকি পরিশোধের তারিখ জানালে ততদিন রিমাইন্ডার বন্ধ থাকে।
// CreditTab-এর প্রতিটা কোম্পানি-কার্ডে বসে। শুধু বাকি > ০ হলে দেখানো হয় (বাইরে থেকে নিয়ন্ত্রিত)।
//
// Props:
//   connectionId  — customer_company_connections.id
//   snoozedUntil  — 'YYYY-MM-DD' বা null (চলমান snooze)
//   onChanged()   — সফল হলে/বাতিল হলে প্যারেন্ট রিলোড করবে
// ============================================================

import { useState } from 'react'
import { FiClock, FiCheckCircle } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import { fmtDate } from '../utils/helpers'

const QUICK_DAYS = [3, 7, 14]
const MAX_DAYS = 30

// লোকাল (ডিভাইসের) তারিখ → 'YYYY-MM-DD'
const isoLocal = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const plusDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoLocal(d)
}

export default function ReminderSnoozePanel({ connectionId, snoozedUntil, onChanged }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const post = (path, body) =>
    portalFetch(path, { method: 'POST', body: JSON.stringify(body) })

  const handleSave = async () => {
    if (!date) { setError('কবে পরিশোধ করবেন তা বেছে নিন।'); return }
    setSaving(true); setError('')
    try {
      await post('/portal/connections/reminder-snooze', {
        connection_id: connectionId,
        snooze_until: date,
      })
      setOpen(false); setDate('')
      onChanged?.()
    } catch (err) {
      setError(err?.message || 'সংরক্ষণ করা যায়নি, আবার চেষ্টা করুন।')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    setSaving(true); setError('')
    try {
      await post('/portal/connections/reminder-snooze/cancel', { connection_id: connectionId })
      onChanged?.()
    } catch (err) {
      setError(err?.message || 'বাতিল করা যায়নি, আবার চেষ্টা করুন।')
    } finally {
      setSaving(false)
    }
  }

  // ── চলমান snooze ──
  if (snoozedUntil) {
    return (
      <div className="mt-1 flex items-start justify-between gap-2 rounded-xl bg-cp-success/10 px-3 py-2">
        <p className="text-[11px] text-cp-success flex items-start gap-1.5">
          <FiCheckCircle size={13} className="mt-[1px] shrink-0" />
          <span>আপনি <b>{fmtDate(snoozedUntil)}</b> তারিখে পরিশোধের কথা জানিয়েছেন। তার আগে রিমাইন্ডার যাবে না।</span>
        </p>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="text-[11px] font-semibold text-cp-text-secondary underline shrink-0 disabled:opacity-50"
        >
          বাতিল
        </button>
        {error && <p className="text-[11px] text-cp-error">{error}</p>}
      </div>
    )
  }

  // ── বন্ধ অবস্থা ──
  if (!open) {
    return (
      <div className="mt-1">
        <CpButton variant="secondary" size="sm" icon={FiClock} onClick={() => setOpen(true)}>
          পরে পরিশোধ করব
        </CpButton>
      </div>
    )
  }

  // ── তারিখ বাছাই ──
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl bg-cp-bg-alt p-3">
      <p className="text-[12px] font-semibold text-cp-text-primary">কবে পরিশোধ করবেন?</p>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_DAYS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDate(plusDays(n))}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
              date === plusDays(n)
                ? 'bg-cp-trust-500 text-white border-cp-trust-500'
                : 'bg-cp-bg-surface text-cp-text-secondary border-cp-border'
            }`}
          >
            {n} দিন পরে
          </button>
        ))}
      </div>

      <input
        type="date"
        value={date}
        min={plusDays(0)}
        max={plusDays(MAX_DAYS)}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-cp-border bg-cp-bg-surface px-3 py-2 text-[13px] text-cp-text-primary"
      />
      <p className="text-[10px] text-cp-text-muted">সর্বোচ্চ {MAX_DAYS} দিন পর পর্যন্ত বেছে নিতে পারবেন।</p>

      {error && <p className="text-[11px] text-cp-error">{error}</p>}

      <div className="flex gap-2">
        <CpButton size="sm" loading={saving} onClick={handleSave}>নিশ্চিত করুন</CpButton>
        <CpButton variant="secondary" size="sm" disabled={saving}
          onClick={() => { setOpen(false); setDate(''); setError('') }}>
          থাক
        </CpButton>
      </div>
    </div>
  )
}
