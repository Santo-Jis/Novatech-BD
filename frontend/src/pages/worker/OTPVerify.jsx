import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import InvoiceCard from '../../components/InvoiceCard'
import toast from 'react-hot-toast'
import { FiCheck, FiAlertCircle } from 'react-icons/fi'

export default function OTPVerify() {
  const { id: saleId }  = useParams()
  const navigate         = useNavigate()
  const { currentSale } = useAppStore()
  const { user }         = useAuthStore()

  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [loading,  setLoading]  = useState(false)
  const [verified, setVerified] = useState(false)
  const [skipModal, setSkipModal] = useState(false)  // skip confirmation
  const inputs = useRef([])

  // SMS configure না থাকলে (otp_required=false) সরাসরি success দেখাও
  useEffect(() => {
    if (currentSale && currentSale.otp_required === false) {
      setVerified(true)
    }
  }, [currentSale])

  const handleChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return
    const newOtp = [...otp]
    newOtp[idx]  = val.slice(-1)
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

  const confirmSkip = () => {
    // OTP ছাড়াই বিক্রয় সম্পন্ন — success পেইজ দেখাও
    setSkipModal(false)
    setVerified(true)
    toast('OTP ছাড়া বিক্রয় সম্পন্ন হয়েছে।', { icon: '⚠️' })
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
            Invoice: <span className="font-mono font-semibold text-primary">
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
        onClick={() => setSkipModal(true)}
        className="w-full text-center text-sm text-gray-400 py-2"
      >
        OTP ছাড়া এগিয়ে যান
      </button>

      {/* Skip Confirmation Modal */}
      {skipModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSkipModal(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <FiAlertCircle className="text-amber-600 text-xl" />
              </div>
              <div>
                <p className="font-bold text-gray-800">OTP ছাড়া নিশ্চিত করবেন?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  কাস্টমারের যাচাই ছাড়াই বিক্রয় সম্পন্ন হবে।
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSkipModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={confirmSkip}
                className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-semibold"
              >
                হ্যাঁ, এগিয়ে যান
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
