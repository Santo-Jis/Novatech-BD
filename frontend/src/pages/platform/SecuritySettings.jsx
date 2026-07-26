import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiShield, FiLoader, FiCheckCircle, FiCopy, FiAlertTriangle, FiRefreshCw, FiKey } from 'react-icons/fi'
import platformApi from './api/platformApi'
import { LoadingState, ErrorState } from './components/PanelStates'

export default function SecuritySettings() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // সেটআপ ফ্লো state
  const [setupData, setSetupData] = useState(null) // { qrDataUrl, secret }
  const [confirmCode, setConfirmCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)

  // Recovery codes (একবারই দেখানো হবে — setup confirm বা regenerate-এর পরে)
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [savedConfirmed, setSavedConfirmed] = useState(false)

  // Disable ফ্লো
  const [showDisableForm, setShowDisableForm] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await platformApi.get('/auth/2fa/status')
      setStatus(res.data.data)
    } catch (err) {
      if (!err._toastShown) setError('স্ট্যাটাস লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const startSetup = async () => {
    setStarting(true)
    try {
      const res = await platformApi.post('/auth/2fa/setup/start')
      setSetupData(res.data.data)
    } catch (err) {
      toast.error('সেটআপ শুরু করা যায়নি।')
    } finally {
      setStarting(false)
    }
  }

  const confirmSetup = async (e) => {
    e.preventDefault()
    if (!confirmCode.trim()) return
    setConfirming(true)
    try {
      const res = await platformApi.post('/auth/2fa/setup/confirm', { code: confirmCode.trim() })
      setRecoveryCodes(res.data.data.recoveryCodes)
      setSetupData(null)
      setConfirmCode('')
      toast.success('2FA চালু হয়েছে!')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'ভুল কোড।')
    } finally {
      setConfirming(false)
    }
  }

  const disable2FA = async (e) => {
    e.preventDefault()
    if (!disablePassword) return
    setDisabling(true)
    try {
      await platformApi.post('/auth/2fa/disable', { password: disablePassword })
      toast.success('2FA বন্ধ করা হয়েছে।')
      setShowDisableForm(false)
      setDisablePassword('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'বন্ধ করা যায়নি।')
    } finally {
      setDisabling(false)
    }
  }

  const regenerateCodes = async () => {
    if (!window.confirm('নতুন recovery codes বানালে পুরনোগুলো আর কাজ করবে না। এগিয়ে যাবেন?')) return
    setRegenerating(true)
    try {
      const res = await platformApi.post('/auth/2fa/recovery-codes/regenerate')
      setRecoveryCodes(res.data.data.recoveryCodes)
      load()
    } catch {
      toast.error('নতুন কোড বানানো যায়নি।')
    } finally {
      setRegenerating(false)
    }
  }

  const copyRecoveryCodes = () => {
    if (!recoveryCodes) return
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    toast.success('কপি হয়েছে।')
  }

  if (loading) return <LoadingState label="নিরাপত্তা সেটিংস লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />

  // ── Recovery codes-এর one-time প্রদর্শন — সবচেয়ে বেশি priority ──
  if (recoveryCodes && !savedConfirmed) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <FiKey className="text-3xl text-pf-accent-600 mx-auto mb-2" />
          <h1 className="font-pf-head text-xl font-semibold text-pf-primary-700">আপনার Recovery Codes</h1>
          <p className="text-sm text-pf-text-secondary mt-1">
            ফোন হারিয়ে গেলে এই কোডগুলো দিয়ে লগইন করতে পারবেন। এখনই সেভ করুন — <strong>এটা আর কখনো দেখানো হবে না।</strong>
          </p>
        </div>

        <div className="bg-pf-bg-alt border border-pf-border rounded-xl p-5">
          <div className="grid grid-cols-2 gap-2 font-pf-mono text-sm">
            {recoveryCodes.map((c) => (
              <div key={c} className="bg-pf-bg-surface rounded-lg px-3 py-2 text-center">{c}</div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copyRecoveryCodes}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-pf-border text-sm font-semibold hover:border-pf-primary-500"
          >
            <FiCopy /> কপি করুন
          </button>
        </div>

        <label className="flex items-start gap-2 text-sm text-pf-text-secondary bg-pf-warning-bg rounded-lg p-3">
          <FiAlertTriangle className="text-pf-warning flex-shrink-0 mt-0.5" />
          আমি এই কোডগুলো নিরাপদ জায়গায় সেভ করেছি
          <input
            type="checkbox"
            onChange={(e) => e.target.checked && setSavedConfirmed(true)}
            className="ml-auto flex-shrink-0"
          />
        </label>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">নিরাপত্তা সেটিংস</h1>
        <p className="text-pf-text-secondary text-sm mt-1">Two-Factor Authentication (2FA) — অতিরিক্ত নিরাপত্তা স্তর</p>
      </div>

      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${status.enabled ? 'bg-pf-success-bg text-pf-success' : 'bg-pf-bg-alt text-pf-text-muted'}`}>
            <FiShield />
          </div>
          <div>
            <p className="font-semibold text-pf-text-primary">
              {status.enabled ? '2FA চালু আছে' : '2FA বন্ধ আছে'}
            </p>
            {status.enabled && (
              <p className="text-xs text-pf-text-muted">{status.remaining_recovery_codes} টা recovery code বাকি আছে</p>
            )}
          </div>
        </div>
      </div>

      {!status.enabled && !setupData && (
        <button
          onClick={startSetup}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
        >
          {starting && <FiLoader className="animate-spin" />}
          2FA চালু করুন
        </button>
      )}

      {setupData && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-5 space-y-4">
          <p className="text-sm text-pf-text-secondary">
            Google Authenticator / Authy দিয়ে নিচের QR স্ক্যান করুন, অথবা সিক্রেট কোডটা ম্যানুয়ালি বসান:
          </p>
          <img src={setupData.qrDataUrl} alt="2FA QR Code" className="mx-auto w-48 h-48" />
          <div className="bg-pf-bg-alt rounded-lg px-3 py-2 text-center font-pf-mono text-xs break-all">
            {setupData.secret}
          </div>

          <form onSubmit={confirmSetup} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Authenticator app-এর ৬-সংখ্যার কোড দিন"
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-center text-lg font-pf-mono tracking-widest"
            />
            <button
              type="submit"
              disabled={confirming}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
            >
              {confirming ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}
              নিশ্চিত করুন
            </button>
          </form>
        </div>
      )}

      {status.enabled && (
        <div className="space-y-3">
          <button
            onClick={regenerateCodes}
            disabled={regenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-pf-border text-sm font-semibold hover:border-pf-primary-500 disabled:opacity-60"
          >
            {regenerating ? <FiLoader className="animate-spin" /> : <FiRefreshCw />}
            নতুন Recovery Codes বানান
          </button>

          {!showDisableForm ? (
            <button
              onClick={() => setShowDisableForm(true)}
              className="w-full px-4 py-2.5 rounded-lg border border-pf-error text-pf-error text-sm font-semibold hover:bg-pf-error-bg"
            >
              2FA বন্ধ করুন
            </button>
          ) : (
            <form onSubmit={disable2FA} className="bg-pf-error-bg rounded-xl p-4 space-y-3">
              <p className="text-xs text-pf-error">নিরাপত্তার জন্য আপনার বর্তমান পাসওয়ার্ড দিন:</p>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
                placeholder="পাসওয়ার্ড"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={disabling}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-pf-error text-white text-sm font-semibold disabled:opacity-60"
                >
                  {disabling && <FiLoader className="animate-spin" />}
                  নিশ্চিত করে বন্ধ করুন
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDisableForm(false); setDisablePassword('') }}
                  className="px-3 py-2 rounded-lg border border-pf-border text-sm"
                >
                  বাতিল
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
