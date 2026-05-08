import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import Camera from '../../components/Camera'
import toast from 'react-hot-toast'
import {
  FiTruck, FiCoffee, FiMoreHorizontal, FiCamera,
  FiChevronDown, FiCheckCircle, FiClock, FiXCircle,
  FiTrash2, FiSend, FiArrowLeft, FiFileText
} from 'react-icons/fi'

// ─── যানবাহনের ধরন ────────────────────────────────────────
const TRANSPORT_OPTIONS = [
  { value: 'rickshaw',    label: 'রিকশা',         emoji: '🛺' },
  { value: 'bus',         label: 'বাস',            emoji: '🚌' },
  { value: 'cng',         label: 'সিএনজি',         emoji: '🚗' },
  { value: 'bike',        label: 'মোটরসাইকেল',    emoji: '🏍️' },
  { value: 'own_vehicle', label: 'নিজস্ব গাড়ি',  emoji: '🚙' },
  { value: 'other',       label: 'অন্যান্য',       emoji: '🚶' },
]

// ─── Status Badge ─────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  { label: 'অপেক্ষমাণ',  bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <FiClock size={12} /> },
    approved: { label: 'অনুমোদিত',   bg: 'bg-green-100',  text: 'text-green-700',  icon: <FiCheckCircle size={12} /> },
    rejected: { label: 'বাতিল',      bg: 'bg-red-100',    text: 'text-red-700',    icon: <FiXCircle size={12} /> },
  }
  const s = map[status] || map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      {s.icon} {s.label}
    </span>
  )
}

// ─── Number Input ─────────────────────────────────────────
function MoneyInput({ label, icon, value, onChange, max }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
        <span className="text-primary">{icon}</span> {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">৳</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max={max || 9999}
          value={value}
          onChange={e => onChange(Math.min(parseFloat(e.target.value) || 0, max || 9999))}
          className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all
                     dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          placeholder="০"
        />
        {max && value > max * 0.9 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-500 font-medium">
            সীমা: ৳{max}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ExpenseForm() {
  const navigate  = useNavigate()
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [existing, setExisting]     = useState(null)  // আজকের জমা দেওয়া রিপোর্ট

  // ফর্ম স্টেট
  const [transportType, setTransportType] = useState('')
  const [transportCost, setTransportCost] = useState(0)
  const [foodCost,      setFoodCost]      = useState(0)
  const [miscCost,      setMiscCost]      = useState(0)
  const [miscNote,      setMiscNote]      = useState('')
  const [receiptImg,    setReceiptImg]    = useState(null)   // blob URL
  const [receiptFile,   setReceiptFile]   = useState(null)   // File object
  const [showCamera,    setShowCamera]    = useState(false)
  const [limits,        setLimits]        = useState({
    daily: 500, transport: 300, food: 150
  })

  const total = transportCost + foodCost + miscCost

  // আজকের রিপোর্ট + সেটিং লোড
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [expRes, settRes] = await Promise.allSettled([
          api.get('/expense/today'),
          api.get('/settings/public'),
        ])

        if (expRes.status === 'fulfilled' && expRes.value.data?.data) {
          const d = expRes.value.data.data
          setExisting(d)
          setTransportType(d.transport_type || '')
          setTransportCost(parseFloat(d.transport_cost) || 0)
          setFoodCost(parseFloat(d.food_cost) || 0)
          setMiscCost(parseFloat(d.misc_cost) || 0)
          setMiscNote(d.misc_note || '')
          if (d.receipt_url) setReceiptImg(d.receipt_url)
        }

        if (settRes.status === 'fulfilled') {
          const s = settRes.value.data?.data || {}
          setLimits({
            daily:     parseInt(s.expense_daily_limit)     || 500,
            transport: parseInt(s.expense_transport_limit) || 300,
            food:      parseInt(s.expense_food_limit)      || 150,
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ক্যামেরা থেকে ছবি নেওয়া
  const handleCameraCapture = (dataURL) => {
    setReceiptImg(dataURL)
    // dataURL → File convert
    fetch(dataURL)
      .then(r => r.blob())
      .then(blob => setReceiptFile(new File([blob], 'receipt.jpg', { type: 'image/jpeg' })))
    setShowCamera(false)
  }

  // Submit
  const handleSubmit = async () => {
    if (!transportType) {
      toast.error('যানবাহনের ধরন সিলেক্ট করুন')
      return
    }
    if (total === 0) {
      toast.error('কমপক্ষে একটি খরচ লিখুন')
      return
    }
    if (total > limits.daily) {
      toast.error(`মোট খরচ সীমা ৳${limits.daily} এর বেশি হতে পারবে না`)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('transport_type', transportType)
      formData.append('transport_cost', transportCost)
      formData.append('food_cost',      foodCost)
      formData.append('misc_cost',      miscCost)
      formData.append('misc_note',      miscNote)
      if (receiptFile) formData.append('receipt', receiptFile)

      if (existing) {
        await api.put(`/expense/${existing.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        toast.success('খরচ আপডেট করা হয়েছে ✅')
      } else {
        await api.post('/expense/submit', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        toast.success('খরচ জমা দেওয়া হয়েছে ✅')
      }

      navigate(-1)
    } catch (err) {
      const msg = err.response?.data?.message || 'জমা দিতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  // ─── Camera Overlay ────────────────────────────────────
  if (showCamera) {
    return (
      <Camera
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    )
  }

  const isApproved = existing?.status === 'approved'
  const isEditable = !existing || existing.status === 'pending'

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-6">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white shadow-sm border border-gray-100 text-gray-600 hover:text-primary transition-colors"
        >
          <FiArrowLeft />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-800 dark:text-white text-lg">দৈনিক খরচ জমা</h1>
          <p className="text-xs text-gray-400">
            {new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {existing && <StatusBadge status={existing.status} />}
      </div>

      {/* ── Approved Banner ─────────────────────────────── */}
      {isApproved && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <FiCheckCircle className="text-green-500 text-xl flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-800">অনুমোদিত হয়েছে</p>
            <p className="text-xs text-green-600 mt-0.5">
              এই রিপোর্ট অনুমোদন হয়ে গেছে, আর পরিবর্তন করা যাবে না।
            </p>
            {existing?.review_note && (
              <p className="text-xs text-green-700 mt-1 italic">"{existing.review_note}"</p>
            )}
          </div>
        </div>
      )}

      {/* ── Rejected Banner ─────────────────────────────── */}
      {existing?.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <FiXCircle className="text-red-500 text-xl flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">বাতিল করা হয়েছে</p>
            {existing?.review_note && (
              <p className="text-xs text-red-600 mt-1">কারণ: {existing.review_note}</p>
            )}
            <p className="text-xs text-red-500 mt-1">নিচে সংশোধন করে আবার জমা দিন।</p>
          </div>
        </div>
      )}

      {/* ── যানবাহন সিলেক্ট ─────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
          <FiTruck className="text-primary" /> যানবাহনের ধরন
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {TRANSPORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              disabled={!isEditable}
              onClick={() => setTransportType(opt.value)}
              className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-xs font-medium
                ${transportType === opt.value
                  ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10'
                  : 'border-gray-100 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:border-primary/30'
                }
                ${!isEditable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <span className="text-xl">{opt.emoji}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── খরচের বিবরণ ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <FiFileText className="text-primary" /> খরচের বিবরণ
        </h2>

        <div className={!isEditable ? 'pointer-events-none opacity-70' : ''}>
          <MoneyInput
            label="যাতায়াত খরচ"
            icon={<FiTruck size={13} />}
            value={transportCost}
            onChange={setTransportCost}
            max={limits.transport}
          />
        </div>

        <div className={!isEditable ? 'pointer-events-none opacity-70' : ''}>
          <MoneyInput
            label="খাবার খরচ"
            icon={<FiCoffee size={13} />}
            value={foodCost}
            onChange={setFoodCost}
            max={limits.food}
          />
        </div>

        <div className={!isEditable ? 'pointer-events-none opacity-70' : ''}>
          <MoneyInput
            label="অন্যান্য খরচ"
            icon={<FiMoreHorizontal size={13} />}
            value={miscCost}
            onChange={setMiscCost}
            max={200}
          />
          {(miscCost > 0 || miscNote) && (
            <textarea
              disabled={!isEditable}
              value={miscNote}
              onChange={e => setMiscNote(e.target.value)}
              placeholder="অন্যান্য খরচের বিস্তারিত লিখুন..."
              rows={2}
              className="mt-2 w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600
                         rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10
                         dark:text-white transition-all resize-none disabled:opacity-60"
            />
          )}
        </div>

        {/* মোট */}
        <div className={`flex items-center justify-between pt-3 border-t border-dashed
          ${total > limits.daily ? 'border-red-200' : 'border-gray-200 dark:border-slate-600'}
        `}>
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">মোট খরচ</span>
          <div className="text-right">
            <span className={`text-xl font-bold ${total > limits.daily ? 'text-red-500' : 'text-primary'}`}>
              ৳{total.toLocaleString('bn-BD')}
            </span>
            <p className="text-xs text-gray-400">সীমা: ৳{limits.daily}</p>
          </div>
        </div>
      </div>

      {/* ── রিসিট ছবি ───────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
          <FiCamera className="text-primary" /> রিসিট / ছবি
          <span className="text-xs font-normal text-gray-400">(ঐচ্ছিক)</span>
        </h2>

        {receiptImg ? (
          <div className="relative">
            <img
              src={receiptImg}
              alt="রিসিট"
              className="w-full rounded-xl object-cover max-h-48 border border-gray-200"
            />
            {isEditable && (
              <button
                onClick={() => { setReceiptImg(null); setReceiptFile(null) }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors"
              >
                <FiTrash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          isEditable && (
            <button
              onClick={() => setShowCamera(true)}
              className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl
                         flex flex-col items-center gap-2 text-gray-400 hover:border-primary hover:text-primary transition-all"
            >
              <FiCamera className="text-2xl" />
              <span className="text-xs font-medium">ক্যামেরা দিয়ে তুলুন</span>
            </button>
          )
        )}
      </div>

      {/* ── Submit Button ────────────────────────────────── */}
      {isEditable && (
        <button
          onClick={handleSubmit}
          disabled={submitting || total === 0 || !transportType}
          className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-base
                     flex items-center justify-center gap-2 shadow-lg shadow-primary/20
                     disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-95 transition-all"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              জমা হচ্ছে...
            </>
          ) : (
            <>
              <FiSend />
              {existing ? 'আপডেট করুন' : 'খরচ জমা দিন'}
            </>
          )}
        </button>
      )}

      {/* ── Limit Info ───────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 flex gap-2">
        <span className="text-blue-400 text-lg flex-shrink-0">ℹ️</span>
        <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
          দৈনিক সীমা: যাতায়াত ৳{limits.transport}, খাবার ৳{limits.food}, মোট ৳{limits.daily}।
          সীমার বেশি খরচ হলে ম্যানেজারের অনুমোদন প্রয়োজন।
        </p>
      </div>

    </div>
  )
}
