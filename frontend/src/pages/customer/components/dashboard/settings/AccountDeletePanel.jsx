// components/dashboard/settings/AccountDeletePanel.jsx
// ═══════════════════════════════════════════════════════════════
// SettingsPage → "অ্যাকাউন্ট ডিলিট করুন"
//
// সরাসরি, এখনই কার্যকর। কোনো admin/SR রিভিউ/অপেক্ষা নেই — এটা
// কাস্টমারের নিজের স্বাধীন অ্যাকাউন্ট, নিজের সিদ্ধান্ত।
//
// কনফার্ম করলেই:
//   ১. ব্যাকএন্ডে সব connected company deactivate হয় (is_active=false)
//      + person-only হলে deletion_requested_at সেট হয়
//   ২. সাথে সাথে onLogout() কল হয় — লগইন স্ক্রিনে ফিরে যায়
//
// endpoint:
//   GET  /portal/profile/deletion-preview → বকেয়া ক্রেডিট থাকলে দেখায়
//                                            (শুধু তথ্য, block করে না)
//   POST /portal/profile/delete-account   { reason? } → সরাসরি কার্যকর
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { FiTrash2, FiX, FiAlertTriangle } from 'react-icons/fi'
import { portalFetch } from '../../../utils/api'
import CpCard from '../../ui/CpCard'
import CpButton from '../../ui/CpButton'

export default function AccountDeletePanel({ portalJWT, onLogout }) {
  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  const [preview,     setPreview]     = useState(null) // { outstanding_balances }
  const [loadError,   setLoadError]   = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason,      setReason]      = useState('')
  const [busy,        setBusy]        = useState(false)
  const [err,         setErr]         = useState('')

  useEffect(() => {
    portalFetch('/portal/profile/deletion-preview', { headers: authHeader })
      .then(res => setPreview(res.data))
      .catch(() => setLoadError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    setBusy(true); setErr('')
    try {
      await portalFetch('/portal/profile/delete-account', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ reason: reason || undefined }),
      })
      // ✅ সরাসরি কার্যকর — অপেক্ষা করার কিছু নেই, তাৎক্ষণিক লগআউট
      onLogout()
    } catch (e) {
      setErr(e?.message || 'ডিলিট করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।')
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <CpCard variant="sunken" padding="sm">
        <p className="text-xs text-cp-error">তথ্য আনতে সমস্যা হয়েছে।</p>
      </CpCard>
    )
  }

  if (!preview) {
    return (
      <CpCard padding="md">
        <p className="text-xs text-cp-text-muted text-center">লোড হচ্ছে...</p>
      </CpCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <CpCard padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FiTrash2 className="text-cp-error flex-shrink-0" size={16} />
          <p className="text-xs font-semibold text-cp-text-secondary">অ্যাকাউন্ট ডিলিট করুন</p>
        </div>
        <p className="text-[11.5px] text-cp-text-muted leading-relaxed mb-3">
          এটি আপনার নিজের স্বাধীন অ্যাকাউন্ট — কনফার্ম করলে সাথে সাথেই কার্যকর হবে, কারো অনুমোদনের অপেক্ষা করতে হবে না।
        </p>

        {preview.outstanding_balances?.length > 0 && (
          <div className="rounded-xl bg-cp-warmth-100 px-3 py-2.5 mb-3 flex gap-2 items-start">
            <FiAlertTriangle className="text-cp-warmth-600 flex-shrink-0 mt-0.5" size={14} />
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] text-cp-text-primary font-medium mb-1">বকেয়া হিসাব আছে:</p>
              {preview.outstanding_balances.map((b, i) => (
                <p key={i} className="text-[11px] text-cp-text-secondary">
                  {b.company_name} — ৳{Number(b.credit_balance).toLocaleString('bn-BD')}
                </p>
              ))}
              <p className="text-[10.5px] text-cp-text-muted mt-1">শুধু তথ্যের জন্য দেখানো হচ্ছে — এটা ডিলিট আটকাচ্ছে না, সিদ্ধান্ত সম্পূর্ণ আপনার।</p>
            </div>
          </div>
        )}

        <CpButton variant="danger" fullWidth onClick={() => setConfirmOpen(true)}>
          ডিলিট করুন
        </CpButton>
      </CpCard>

      {err && (
        <CpCard variant="sunken" padding="sm">
          <span className="text-xs text-cp-error">{err}</span>
        </CpCard>
      )}

      {/* ── কনফার্মেশন — SecurityPanel-এর একই bottom-sheet প্যাটার্ন ── */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="bg-white w-full max-w-[480px] rounded-t-3xl p-5 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-base font-bold text-cp-error">নিশ্চিত করুন — এটি স্থায়ী</p>
              {!busy && (
                <button onClick={() => setConfirmOpen(false)}>
                  <FiX size={20} className="text-cp-text-muted" />
                </button>
              )}
            </div>

            <p className="text-[12.5px] text-cp-text-secondary leading-relaxed">
              কনফার্ম করলে সাথে সাথে আপনার অ্যাকাউন্ট নিষ্ক্রিয় হয়ে যাবে এবং আপনি লগআউট হয়ে যাবেন। এটা ফিরিয়ে আনতে সাপোর্টের সাথে যোগাযোগ করতে হবে।
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-cp-text-secondary">কারণ (ঐচ্ছিক)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="কেন অ্যাকাউন্ট ডিলিট করতে চান? (না লিখলেও চলবে)"
                className="w-full rounded-xl border border-cp-border px-3.5 py-2.5 text-[14px] text-cp-text-primary resize-none focus:outline-none focus:border-cp-trust-500"
              />
            </div>

            <CpButton variant="danger" fullWidth loading={busy} onClick={confirmDelete} className="mt-1 mb-2">
              হ্যাঁ, এখনই ডিলিট করুন
            </CpButton>
          </div>
        </div>
      )}
    </div>
  )
}
