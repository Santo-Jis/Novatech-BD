// components/dashboard/settings/SecurityPanel.jsx
// ═══════════════════════════════════════════════════════════════
// ✅ এই কোড ProfileTab.jsx-এর "অ্যাকাউন্ট ও নিরাপত্তা" সেকশন থেকে
// সরিয়ে আনা হয়েছে — নতুন করে লেখা হয়নি।
//
// ProfileTab-এ থাকা জিনিসগুলো:
//   • security state (login_events + devices)
//   • changePassword() ফাংশন → POST /portal/profile/password
//   • revokeDevice()   ফাংশন → POST /portal/profile/devices/:id/revoke
//   • সংযুক্ত ডিভাইস লিস্ট JSX
//   • সাম্প্রতিক লগইন লিস্ট JSX
//   • পাসওয়ার্ড মোডাল JSX (bottom-sheet, ProfileTab-এর QR মোডালের মতো)
//
// ProfileTab থেকে এগুলো সরানো হয়েছে কারণ এগুলো ব্যবসার তথ্য (শপ নাম/ঠিকানা/
// বিজনেস ফিল্ড) না — সেকিউরিটি/অ্যাকাউন্ট তথ্য। জায়গাটা AccountMenu →
// Settings → এই প্যানেল।
//
// endpoint গুলো অপরিবর্তিত (ProfileTab-এর মতোই):
//   GET  /portal/profile/security       → devices + login_events
//   POST /portal/profile/password       → পাসওয়ার্ড বদলানো
//   POST /portal/profile/devices/:id/revoke → ডিভাইস সরানো
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { FiShield, FiSmartphone, FiClock, FiTrash2, FiLock, FiX } from 'react-icons/fi'
import { portalFetch } from '../../../utils/api'
import CpCard from '../../ui/CpCard'
import CpButton from '../../ui/CpButton'
import CpBadge from '../../ui/CpBadge'
import CpInput from '../../ui/CpInput'

export default function SecurityPanel({ portalJWT }) {
  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  // ── ProfileTab থেকে হুবহু নেওয়া state ──────────────────────
  const [security,    setSecurity]    = useState(null)
  const [loadError,   setLoadError]   = useState(false)
  const [pwOpen,      setPwOpen]      = useState(false)
  const [pwForm,      setPwForm]      = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwSaving,    setPwSaving]    = useState(false)
  const [pwError,     setPwError]     = useState('')
  const [pwSuccess,   setPwSuccess]   = useState('')
  const [revokingId,  setRevokingId]  = useState(null)
  const [revokeMsg,   setRevokeMsg]   = useState('')

  useEffect(() => {
    portalFetch('/portal/profile/security', { headers: authHeader })
      .then(res => setSecurity(res.data || { login_events: [], devices: [] }))
      .catch(() => setLoadError(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ProfileTab থেকে হুবহু নেওয়া changePassword ──────────────
  const changePassword = async () => {
    setPwError(''); setPwSuccess('')
    if (!pwForm.current_password || !pwForm.new_password) {
      setPwError('বর্তমান ও নতুন পাসওয়ার্ড দিন।'); return
    }
    if (pwForm.new_password.length < 6) {
      setPwError('ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।'); return
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('নতুন পাসওয়ার্ড দুটো মিলছে না।'); return
    }
    setPwSaving(true)
    try {
      await portalFetch('/portal/profile/password', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          current_password: pwForm.current_password,
          new_password:     pwForm.new_password,
        }),
      })
      setPwOpen(false)
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
      setPwSuccess('✅ পাসওয়ার্ড পরিবর্তন হয়েছে।')
    } catch (e) {
      setPwError(e?.message || 'পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।')
    } finally {
      setPwSaving(false)
    }
  }

  // ── ProfileTab থেকে হুবহু নেওয়া revokeDevice ────────────────
  const revokeDevice = async (deviceId) => {
    setRevokingId(deviceId); setRevokeMsg('')
    try {
      await portalFetch(`/portal/profile/devices/${deviceId}/revoke`, {
        method: 'POST',
        headers: authHeader,
      })
      setSecurity(s => s && { ...s, devices: s.devices.filter(d => d.id !== deviceId) })
      setRevokeMsg('✅ ডিভাইস মুছে ফেলা হয়েছে।')
    } catch {
      setRevokeMsg('❌ ডিভাইস মুছতে সমস্যা হয়েছে।')
    } finally {
      setRevokingId(null)
    }
  }

  // ── লোড অবস্থা ───────────────────────────────────────────────
  if (loadError) {
    return (
      <CpCard variant="sunken" padding="sm">
        <p className="text-xs text-cp-error">নিরাপত্তা তথ্য আনতে সমস্যা হয়েছে।</p>
      </CpCard>
    )
  }

  if (!security) {
    return (
      <CpCard padding="md">
        <p className="text-xs text-cp-text-muted text-center">লোড হচ্ছে...</p>
      </CpCard>
    )
  }

  // ── JSX — ProfileTab-এর security সেকশনের হুবহু, শুধু wrapper বদলেছে ──
  return (
    <div className="flex flex-col gap-3">
      {pwSuccess && (
        <CpCard variant="sunken" padding="sm">
          <span className="text-xs text-cp-confidence-600 font-medium">{pwSuccess}</span>
        </CpCard>
      )}
      {revokeMsg && (
        <CpCard variant="sunken" padding="sm">
          <span className={`text-xs font-medium ${revokeMsg.startsWith('✅') ? 'text-cp-confidence-600' : 'text-cp-error'}`}>{revokeMsg}</span>
        </CpCard>
      )}

      {/* পাসওয়ার্ড বদলানো */}
      <CpCard padding="md">
        <div className="flex items-center gap-2 mb-3">
          <FiShield className="text-cp-trust-500 flex-shrink-0" size={16} />
          <p className="text-xs font-semibold text-cp-text-secondary">অ্যাকাউন্ট সুরক্ষা</p>
        </div>
        <CpButton variant="secondary" size="sm" fullWidth onClick={() => setPwOpen(true)}>
          পাসওয়ার্ড পরিবর্তন করুন
        </CpButton>
      </CpCard>

      {/* সংযুক্ত ডিভাইস — ProfileTab-এর হুবহু JSX */}
      {security.devices.length > 0 && (
        <CpCard padding="md" className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-cp-text-muted mb-1">সংযুক্ত ডিভাইস</p>
          {security.devices.map(d => (
            <div key={d.id} className="flex items-center gap-2.5 py-1.5">
              <FiSmartphone className="text-cp-text-muted flex-shrink-0" size={15} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-cp-text-primary truncate">
                  {d.device_label || d.google_email || 'অজানা ডিভাইস'}
                </p>
                {d.last_used_at && (
                  <p className="text-[10px] text-cp-text-muted">
                    সর্বশেষ ব্যবহার:{' '}
                    {new Date(d.last_used_at).toLocaleDateString('bn-BD', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <button
                onClick={() => revokeDevice(d.id)}
                disabled={revokingId === d.id}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-cp-error disabled:opacity-50"
                aria-label="ডিভাইস সরান"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </CpCard>
      )}

      {/* সাম্প্রতিক লগইন — ProfileTab-এর হুবহু JSX */}
      {security.login_events.length > 0 && (
        <CpCard padding="md" className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-cp-text-muted mb-1">সাম্প্রতিক লগইন</p>
          {security.login_events.slice(0, 5).map(ev => (
            <div key={ev.id} className="flex items-center gap-2.5 py-1">
              <FiClock className="text-cp-text-muted flex-shrink-0" size={13} />
              <p className="text-[11px] text-cp-text-secondary flex-1">
                {new Date(ev.created_at).toLocaleDateString('bn-BD', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {(ev.city || ev.country) && ` — ${[ev.city, ev.country].filter(Boolean).join(', ')}`}
              </p>
              {ev.is_new_device && <CpBadge variant="warning">নতুন ডিভাইস</CpBadge>}
            </div>
          ))}
        </CpCard>
      )}

      {/* পাসওয়ার্ড মোডাল — ProfileTab-এর bottom-sheet প্যাটার্নের হুবহু */}
      {pwOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => { setPwOpen(false); setPwError('') }}
        >
          <div
            className="bg-white w-full max-w-[480px] rounded-t-3xl p-5 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-base font-bold text-cp-text-primary">পাসওয়ার্ড পরিবর্তন</p>
              <button onClick={() => { setPwOpen(false); setPwError('') }}>
                <FiX size={20} className="text-cp-text-muted" />
              </button>
            </div>

            {pwError && (
              <p className="text-xs text-cp-error bg-cp-error-bg rounded-xl px-3 py-2">{pwError}</p>
            )}

            <CpInput
              label="বর্তমান পাসওয়ার্ড"
              type="password"
              icon={FiLock}
              value={pwForm.current_password}
              onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))}
            />
            <CpInput
              label="নতুন পাসওয়ার্ড"
              type="password"
              icon={FiLock}
              placeholder="ন্যূনতম ৬ ডিজিট/অক্ষর"
              value={pwForm.new_password}
              onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
            />
            <CpInput
              label="নতুন পাসওয়ার্ড আবার লিখুন"
              type="password"
              icon={FiLock}
              value={pwForm.confirm_password}
              onChange={e => setPwForm(f => ({ ...f, confirm_password: e.target.value }))}
            />

            <CpButton
              variant="primary"
              fullWidth
              loading={pwSaving}
              onClick={changePassword}
              className="mt-1 mb-2"
            >
              পরিবর্তন করুন
            </CpButton>
          </div>
        </div>
      )}
    </div>
  )
}
