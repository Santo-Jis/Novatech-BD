import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { CommissionLineChart, ProgressBar } from '../../components/charts/Charts'
import InvoiceCard from '../../components/InvoiceCard'
import toast from 'react-hot-toast'
import { FiCheck, FiUser, FiPhone, FiMail } from 'react-icons/fi'

// ============================================================
// OTP Verify Page
// ============================================================
export function OTPVerify() {
  const { id: saleId } = useParams()
  const navigate        = useNavigate()
  const { currentSale } = useAppStore()
  const [otp,      setOtp]      = useState(['', '', '', '', '', ''])
  const [loading,  setLoading]  = useState(false)
  const [verified, setVerified] = useState(false)
  const inputs                  = useRef([])

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

  const shareWhatsApp = () => {
    if (!currentSale) return
    const waLink = currentSale.whatsapp_link
    if (waLink) window.open(waLink, '_blank')
  }

  if (verified) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="text-center py-4">
          <span className="text-5xl">✅</span>
          <p className="font-bold text-lg text-gray-800 mt-2">বিক্রয় নিশ্চিত!</p>
        </div>
        {currentSale && (
          <InvoiceCard
            sale={currentSale}
            customer={currentSale.customer}
            worker={useAuthStore.getState().user}
            onShare={shareWhatsApp}
          />
        )}
        <button onClick={() => navigate('/worker/customers')}
          className="w-full py-3 bg-primary text-white rounded-2xl font-bold">
          পরের কাস্টমারে যান →
        </button>
      </div>
    )
  }

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
        {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiCheck />}
        {loading ? 'যাচাই হচ্ছে...' : 'OTP যাচাই করুন'}
      </button>

      <button onClick={() => navigate(-1)} className="w-full text-center text-sm text-gray-400">
        OTP ছাড়া এগিয়ে যান
      </button>
    </div>
  )
}

// ============================================================
// Worker Settlement Page
// ============================================================
export function WorkerSettlement() {
  const navigate          = useNavigate()
  const [todaySummary, setTodaySummary] = useState(null)
  const [todayOrder,   setTodayOrder]   = useState(null)
  const [returnedItems, setReturnedItems] = useState({})
  const [loading,  setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]  = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/sales/today-summary'),
      api.get('/orders/today')
    ]).then(([sumRes, orderRes]) => {
      setTodaySummary(sumRes.data.data)
      setTodayOrder(orderRes.data.data)
    }).finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    setSubmitting(true)
    try {
      const returned = Object.entries(returnedItems)
        .filter(([, qty]) => parseInt(qty) > 0)
        .map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

      await api.post('/settlements', {
        returned_items: returned,
        shortage_note: ''
      })
      toast.success('হিসাব জমা দেওয়া হয়েছে। Manager এর অনুমোদনের অপেক্ষায়।')
      setSubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  if (submitted) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <span className="text-5xl mb-4">✅</span>
        <p className="font-bold text-lg text-gray-800">হিসাব জমা হয়েছে!</p>
        <p className="text-sm text-gray-500 mt-1">Manager অনুমোদনের পরে চেক-আউট করুন।</p>
        <button onClick={() => navigate('/worker/attendance')}
          className="mt-6 w-full py-3 bg-primary text-white rounded-2xl font-semibold max-w-xs">
          চেক-আউট করুন
        </button>
      </div>
    )
  }

  const sales = todaySummary?.sales || {}
  const orderItems = todayOrder?.items || []

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800">হিসাব বুঝিয়ে দিন</h2>

      {/* Sales Summary */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <p className="font-semibold text-sm text-gray-700 mb-3">আজকের হিসাব</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['মোট বিক্রয়', `৳${parseInt(sales.total_amount || 0).toLocaleString('bn-BD')}`, 'text-secondary'],
            ['নগদ সংগ্রহ', `৳${parseInt(sales.cash_received || 0).toLocaleString('bn-BD')}`, 'text-primary'],
            ['বাকি দেওয়া', `৳${parseInt(sales.credit_given || 0).toLocaleString('bn-BD')}`, 'text-amber-600'],
            ['রিপ্লেসমেন্ট', `৳${parseInt(sales.replacement_value || 0).toLocaleString('bn-BD')}`, 'text-purple-600'],
          ].map(([label, val, cls]) => (
            <div key={label} className="bg-gray-50 rounded-xl p-2">
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`font-bold text-sm ${cls}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Return items */}
      {orderItems.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="font-semibold text-sm text-gray-700 mb-3">ফেরত পণ্যের পরিমাণ</p>
          <div className="space-y-3">
            {orderItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                  <p className="text-xs text-gray-400">নেওয়া: {item.approved_qty || item.requested_qty} পিস</p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={item.approved_qty || item.requested_qty}
                  value={returnedItems[item.product_id] || ''}
                  onChange={e => setReturnedItems(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                  placeholder="০"
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full py-4 bg-secondary text-white rounded-2xl font-bold disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {submitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '📊'}
        {submitting ? 'জমা হচ্ছে...' : 'হিসাব জমা দিন'}
      </button>
    </div>
  )
}

// ============================================================
// Commission Dashboard
// ============================================================
export function Commission() {
  const [data,    setData]    = useState(null)
  const [bonus,   setBonus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const { user }              = useAuthStore()

  useEffect(() => {
    Promise.all([
      api.get('/commission/my'),
      api.get('/commission/bonus-status')
    ]).then(([commRes, bonusRes]) => {
      setData(commRes.data.data)
      setBonus(bonusRes.data.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  const summary = data?.summary || {}
  const salary  = data?.salary_preview || {}

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800">কমিশন</h2>

      {/* Monthly Summary */}
      <div className="bg-gradient-to-r from-accent to-amber-500 rounded-2xl p-4 text-white">
        <p className="text-white/70 text-xs">এই মাসে</p>
        <p className="text-3xl font-bold mt-1">৳{parseInt(summary.daily_commission || 0).toLocaleString('bn-BD')}</p>
        <p className="text-white/80 text-sm mt-0.5">কমিশন</p>
        <div className="flex gap-4 mt-3 text-xs text-white/70">
          <span>বিক্রয়: ৳{parseInt(summary.total_sales || 0).toLocaleString('bn-BD')}</span>
          <span>বোনাস: ৳{parseInt(summary.bonus || 0)}</span>
        </div>
      </div>

      {/* Salary Preview */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <p className="font-semibold text-sm text-gray-700 mb-3">বেতন প্রিভিউ</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">মূল বেতন</span><span className="font-semibold">৳{parseInt(salary.basic_salary || 0).toLocaleString('bn-BD')}</span></div>
          <div className="flex justify-between text-amber-600"><span>কমিশন</span><span className="font-semibold">+ ৳{parseInt(salary.total_commission || 0)}</span></div>
          {salary.outstanding_dues > 0 && (
            <div className="flex justify-between text-red-500"><span>বকেয়া কর্তন</span><span className="font-semibold">- ৳{parseInt(salary.outstanding_dues)}</span></div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-100 text-secondary">
            <span>নেট বেতন</span>
            <span>৳{parseInt(salary.net_payable || 0).toLocaleString('bn-BD')}</span>
          </div>
        </div>
      </div>

      {/* Bonus Progress */}
      {bonus && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="font-semibold text-sm text-gray-700 mb-3">উপস্থিতি বোনাস</p>
          <ProgressBar
            value={bonus.perfect_months}
            max={8}
            label={`${bonus.perfect_months}/৮ মাস সম্পন্ন`}
            color="secondary"
          />
          {bonus.pending_bonus > 0 && (
            <p className="text-xs text-emerald-600 mt-2 font-semibold">
              প্রাপ্য বোনাস: ৳{parseInt(bonus.pending_bonus).toLocaleString('bn-BD')}
            </p>
          )}
          {bonus.next_bonus_in > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              আরও {bonus.next_bonus_in} মাস পরে বোনাস পাবেন
            </p>
          )}
        </div>
      )}

      {/* Daily Commission Chart */}
      {data?.daily?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="font-semibold text-sm text-gray-700 mb-3">দৈনিক কমিশন</p>
          <CommissionLineChart data={data.daily.slice(0, 14).reverse()} height={180} />
        </div>
      )}
    </div>
  )
}

// ============================================================
// Worker Profile
// ============================================================
export function Profile() {
  const { user, logout } = useAuthStore()
  const navigate          = useNavigate()

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      {/* Profile Card */}
      <div className="bg-gradient-to-b from-primary to-primary-light rounded-2xl p-6 text-white text-center">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto overflow-hidden mb-3">
          {user?.profile_photo
            ? <img src={user.profile_photo} alt="" className="w-full h-full object-cover" />
            : <FiUser className="text-white text-3xl" />
          }
        </div>
        <p className="font-bold text-xl">{user?.name_bn}</p>
        <p className="text-white/70 text-sm mt-0.5">{user?.name_en}</p>
        <p className="text-white/60 text-xs font-mono mt-1">{user?.employee_code}</p>
        <div className="mt-3 bg-white/20 rounded-full px-3 py-1 inline-block text-xs">
          {user?.role?.toUpperCase()}
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        {[
          [<FiPhone />, 'ফোন', user?.phone],
          [<FiMail />, 'ইমেইল', user?.email],
          [<FiUser />, 'যোগদান', user?.join_date && new Date(user.join_date).toLocaleDateString('bn-BD')],
        ].filter(([,, val]) => val).map(([icon, label, val]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-gray-400">{icon}</span>
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-800">{val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => navigate('/admin/employees/' + user?.id)}
          className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          প্রোফাইল এডিট করুন
        </button>
        <button
          onClick={logout}
          className="w-full py-3 bg-red-50 border border-red-200 rounded-2xl text-sm font-semibold text-red-600"
        >
          লগআউট
        </button>
      </div>
    </div>
  )
}

export default OTPVerify
