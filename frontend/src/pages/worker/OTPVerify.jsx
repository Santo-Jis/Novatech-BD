import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import InvoiceCard from '../../components/InvoiceCard'
import Camera from '../../components/Camera'
import toast from 'react-hot-toast'
import { FiCheck, FiAlertCircle, FiCamera, FiTrash2 } from 'react-icons/fi'

export default function OTPVerify() {
  const { id: saleId }  = useParams()
  const navigate         = useNavigate()
  const { currentSale } = useAppStore()
  const { user }         = useAuthStore()

  const [otp,       setOtp]       = useState(['', '', '', '', '', ''])
  const [loading,   setLoading]   = useState(false)
  const [verified,  setVerified]  = useState(false)

  // Skip flow state
  // step: null → 'confirm' → 'camera' → 'uploading'
  const [skipStep,   setSkipStep]   = useState(null)
  const [memoPhoto,  setMemoPhoto]  = useState(null)  // { blob, url }
  const [uploading,  setUploading]  = useState(false)

  const inputs = useRef([])

  // OTP required না হলে সরাসরি success
  useEffect(() => {
    if (currentSale && currentSale.otp_required === false) {
      setVerified(true)
    }
  }, [currentSale])

  // ── OTP input handlers ──────────────────────────────────────
  const handleChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return
    const newOtp  = [...otp]
    newOtp[idx]   = val.slice(-1)
    setOtp(newOtp)
    if (val && idx < 5) inputs.current[idx + 1]?.focus()
  }

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus()
    }
  }

  const verify = async () => {
    const code = otp.join('')
    if (code.length < 6) { toast.error('৬ সংখ্যার OTP দিন।'); return }
    setLoading(true)
    try {
      await api.post('/sales/verify-otp', { sale_id: saleId, otp: code })
      setVerified(true)
      toast.success('OTP যাচাই সফল!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP ভুল।')
      setOtp(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  // ── Skip flow ───────────────────────────────────────────────

  // Step 1: confirm modal খুলো
  const handleSkipClick = () => setSkipStep('confirm')

  // Step 2: confirm → camera
  const handleConfirmSkip = () => setSkipStep('camera')

  // Step 3: camera থেকে ছবি পেলে preview দেখাও
  const handlePhotoCaptured = (blob, url) => {
    setMemoPhoto({ blob, url })
    setSkipStep('preview')
  }

  // Step 4: preview confirm → upload → done
  const handleSubmitWithPhoto = async () => {
    if (!memoPhoto?.blob) { toast.error('মেমোর ছবি তুলুন'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('memo_photo', memoPhoto.blob, 'memo.jpg')
      formData.append('sale_id', saleId)

      await api.post('/sales/skip-otp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      toast('মেমো ছবিসহ বিক্রয় সম্পন্ন।', { icon: '⚠️' })
      setSkipStep(null)
      setVerified(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'আপলোড হয়নি, আবার চেষ্টা করুন।')
    } finally {
      setUploading(false)
    }
  }

  const shareWhatsApp = () => {
    if (!currentSale?.whatsapp_link) return
    window.open(currentSale.whatsapp_link, '_blank')
  }

  // ── Success Screen ──────────────────────────────────────────
  if (verified) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FiCheck className="text-green-600 text-3xl" />
          </div>
          <p className="font-bold text-xl text-gray-800">বিক্রয় সম্পন্ন!</p>
          <p className="text-sm text-gray-500 mt-1">
            Invoice:{' '}
            <span className="font-mono font-semibold text-primary">
              {currentSale?.invoice_number || '—'}
            </span>
          </p>
          <p className="text-lg font-bold text-secondary mt-1">
            ৳{parseInt(currentSale?.net_amount || currentSale?.total_amount || 0).toLocaleString('bn-BD')}
          </p>
        </div>

        {currentSale && (
          <InvoiceCard
            sale={currentSale}
            customer={currentSale.customer}
            worker={user}
            onShare={shareWhatsApp}
          />
        )}

        <button
          onClick={() => navigate('/worker/customers')}
          className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-base"
        >
          পরের কাস্টমারে যান →
        </button>
        <button
          onClick={() => navigate('/worker/dashboard')}
          className="w-full py-3 border border-gray-200 rounded-2xl text-gray-600 font-medium text-sm"
        >
          ড্যাশবোর্ডে যান
        </button>
      </div>
    )
  }

  // ── OTP Screen ──────────────────────────────────────────────
  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-800">OTP যাচাই</p>
        <p className="text-sm text-gray-500 mt-1">কাস্টমারের ফোনে OTP পাঠানো হয়েছে</p>
      </div>

      {/* OTP Inputs */}
      <div className="flex justify-center gap-3">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={el => inputs.current[i] = el}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(e.target.value, i)}
            onKeyDown={e => handleKeyDown(e, i)}
            className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none transition-colors ${
              digit ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white'
            }`}
          />
        ))}
      </div>

      <button
        onClick={verify}
        disabled={loading || otp.join('').length < 6}
        className="w-full py-4 bg-secondary text-white rounded-2xl font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading
          ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <FiCheck />
        }
        {loading ? 'যাচাই হচ্ছে...' : 'OTP যাচাই করুন'}
      </button>

      {/* Skip button */}
      <button
        onClick={handleSkipClick}
        className="w-full text-center text-sm text-gray-400 py-2"
      >
        OTP ছাড়া এগিয়ে যান
      </button>

      {/* ══════════════════════════════════════════
          STEP 1 — Confirm Modal
      ══════════════════════════════════════════ */}
      {skipStep === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSkipStep(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <FiAlertCircle className="text-amber-600 text-xl" />
              </div>
              <div>
                <p className="font-bold text-gray-800">OTP ছাড়া এগোতে চান?</p>
                <p className="text-sm text-gray-500 mt-1">
                  OTP skip করলে <span className="font-semibold text-amber-600">মেমোর ছবি তোলা বাধ্যতামূলক।</span>{' '}
                  ছবি manager-এর কাছে রেকর্ড হবে।
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-3 flex items-center gap-2">
              <FiCamera className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">পরের ধাপে ক্যামেরা দিয়ে মেমোর ছবি তুলতে হবে</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSkipStep(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleConfirmSkip}
                className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
              >
                <FiCamera size={16} />
                ছবি তুলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STEP 2 — Camera
      ══════════════════════════════════════════ */}
      {skipStep === 'camera' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Header */}
          <div className="bg-amber-500 text-white px-4 py-4 flex items-center gap-3">
            <FiCamera className="text-xl flex-shrink-0" />
            <div>
              <p className="font-bold">মেমোর ছবি তুলুন</p>
              <p className="text-xs text-white/80">মেমো বা রশিদ ফ্রেমে রেখে ছবি তুলুন</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <Camera
              facingMode="environment"
              onCapture={handlePhotoCaptured}
              onClose={() => setSkipStep('confirm')}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STEP 3 — Preview & Submit
      ══════════════════════════════════════════ */}
      {skipStep === 'preview' && memoPhoto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 space-y-4">
            <p className="font-bold text-gray-800 text-center">মেমোর ছবি নিশ্চিত করুন</p>

            {/* Photo preview */}
            <div className="relative rounded-2xl overflow-hidden border border-gray-200">
              <img
                src={memoPhoto.url}
                alt="memo"
                className="w-full max-h-60 object-contain bg-gray-50"
              />
              {/* Retake button */}
              <button
                onClick={() => { setMemoPhoto(null); setSkipStep('camera') }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2"
              >
                <FiTrash2 size={14} />
              </button>
            </div>

            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-xs text-amber-700 text-center">
                ⚠️ এই ছবি OTP-এর বিকল্প হিসেবে রেকর্ড থাকবে
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setMemoPhoto(null); setSkipStep('camera') }}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold"
              >
                আবার তুলুন
              </button>
              <button
                onClick={handleSubmitWithPhoto}
                disabled={uploading}
                className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {uploading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <FiCheck />
                }
                {uploading ? 'আপলোড হচ্ছে...' : 'নিশ্চিত করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
