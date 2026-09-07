// components/dashboard/settings/AccountDeletePanel.jsx
// ═══════════════════════════════════════════════════════════════
// SettingsPage → "অ্যাকাউন্ট ডিলিট করুন"
//
// ✅ দুটো নিরাপত্তা লেয়ার:
//   ১. পাসওয়ার্ড সেট করা থাকলে (has_password) কনফার্ম করার আগে
//      current_password চাওয়া হয় — Google/OTP-only অ্যাকাউন্টে এই
//      ফিল্ড দেখানোই হয় না (has_password=false)।
//   ২. ৩০ দিনের গ্রেস পিরিয়ড — কনফার্ম করলে সাথে সাথে account
//      নিষ্ক্রিয় হয় না, শুধু flag হয়। এই ৩০ দিনের মধ্যে যেকোনো
//      সফল লগইনে (password/OTP/Google) automatically বাতিল হয়ে
//      যায়। কোনো admin/SR রিভিউ লাগে না — পুরোটাই কাস্টমারের
//      নিজের নিয়ন্ত্রণে (লগইন = বাতিল, বা কিছু না করলে মেয়াদ শেষে
//      finalize — jobs/accountDeletion.job.js)।
//
// endpoint:
//   GET  /portal/profile/deletion-preview → বকেয়া ক্রেডিট + has_password
//   POST /portal/profile/delete-account   { current_password?, reason? }
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { FiTrash2, FiX, FiAlertTriangle, FiClock, FiLock, FiEye, FiEyeOff } from 'react-icons/fi'
import { portalFetch } from '../../../utils/api'
import CpCard from '../../ui/CpCard'
import CpButton from '../../ui/CpButton'
import CpInput from '../../ui/CpInput'

export default function AccountDeletePanel({ portalJWT, onLogout }) {
  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  const [preview,     setPreview]     = useState(null) // { outstanding_balances, has_password }
  const [loadError,   setLoadError]   = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [reason,      setReason]      = useState('')
  const [busy,        setBusy]        = useState(false)
  const [err,         setErr]         = useState('')

  useEffect(() => {
    portalFetch('/portal/profile/deletion-preview', { headers: authHeader })
      .then(res => setPreview(res.data))
      .catch(() => setLoadError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    setErr('')
    if (preview.has_password && !password) {
      setErr('নিশ্চিত করতে আপনার পাসওয়ার্ড দিন।')
      return
    }
    setBusy(true)
    try {
      await portalFetch('/portal/profile/delete-account', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ current_password: password || undefined, reason: reason || undefined }),
      })
      // ✅ রিকোয়েস্ট জমা — এখনই সব শেষ না, ৩০ দিনের গ্রেস পিরিয়ড শুরু, লগআউট
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
      {/* গ্রেস পিরিয়ড ব্যাখ্যা */}
      <CpCard variant="sunken" padding="sm">
        <div className="flex gap-2.5 items-start">
          <FiClock className="text-cp-trust-500 flex-shrink-0 mt-0.5" size={14} />
          <p className="text-[11.5px] text-cp-text-secondary leading-relaxed">
            রিকোয়েস্ট করার পর <b>৩০ দিন</b> সময় থাকবে — এর মধ্যে যেকোনো সময় লগইন করলেই ডিলিট স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
          </p>
        </div>
      </CpCard>

      <CpCard padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FiTrash2 className="text-cp-error flex-shrink-0" size={16} />
          <p className="text-xs font-semibold text-cp-text-secondary">অ্যাকাউন্ট ডিলিট করুন</p>
        </div>
        <p className="text-[11.5px] text-cp-text-muted leading-relaxed mb-3">
          এটি আপনার নিজের স্বাধীন অ্যাকাউন্ট — কারো অনুমোদনের অপেক্ষা করতে হবে না।
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
              <p className="text-[10.5px] text-cp-text-muted mt-1">শুধু তথ্যের জন্য দেখানো হচ্ছে — এটা ডিলিট আটকাচ্ছে না।</p>
            </div>
          </div>
        )}

        <CpButton variant="danger" fullWidth onClick={() => setConfirmOpen(true)}>
          ডিলিট করুন
        </CpButton>
      </CpCard>

      {err && !confirmOpen && (
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
            className="bg-cp-bg-surface w-full max-w-[480px] rounded-t-3xl p-5 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-base font-bold text-cp-error">নিশ্চিত করুন</p>
              {!busy && (
                <button onClick={() => setConfirmOpen(false)}>
                  <FiX size={20} className="text-cp-text-muted" />
                </button>
              )}
            </div>

            <p className="text-[12.5px] text-cp-text-secondary leading-relaxed">
              কনফার্ম করলে আপনি লগআউট হয়ে যাবেন। <b>৩০ দিনের মধ্যে লগইন করলে</b> ডিলিট বাতিল হয়ে যাবে — নাহলে মেয়াদ শেষে চূড়ান্ত হবে।
            </p>

            {preview.has_password && (
              <CpInput
                label="পাসওয়ার্ড দিয়ে নিশ্চিত করুন"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                rightElement={
                  <button type="button" onClick={() => setShowPw(v => !v)} className="text-cp-text-muted">
                    {showPw ? <FiEyeOff size={17} /> : <FiEye size={17} />}
                  </button>
                }
              />
            )}

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

            {err && (
              <p className="text-xs text-cp-error bg-cp-error-bg rounded-xl px-3 py-2">{err}</p>
            )}

            <CpButton variant="danger" fullWidth loading={busy} onClick={confirmDelete} className="mt-1 mb-2">
              নিশ্চিত করুন
            </CpButton>
          </div>
        </div>
      )}
    </div>
  )
}
