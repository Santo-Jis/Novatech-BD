// frontend/src/pages/worker/VisitPage.jsx
// ─── পরিবর্তন লগ ───────────────────────────────────────────
//  ✅ নতুন: বাকি আদায় (Collection) — bottom sheet modal
//     - current_credit > 0 হলে "💰 বাকি আদায়" বাটন দেখায়
//     - নগদ / চেক / bKash / Nagad payment mode
//     - রসিদের ছবি (ঐচ্ছিক)
//     - Hold-to-confirm (ভুল submit ঠেকাতে)
//     - Offline mode support — enqueue দিয়ে
// ────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import {
  FiUser, FiPhone, FiMapPin, FiShoppingCart,
  FiNavigation, FiAlertTriangle, FiCheckCircle, FiCamera, FiX,
  FiWifiOff, FiDollarSign, FiChevronDown,
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import Camera from '../../components/Camera'
import { enqueue, saveCache, getCache } from '../../api/offlineQueue'
import { useAppStore } from '../../store/app.store'

// ─── GPS helper ───────────────────────────────────────────────
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const err = new Error('এই ডিভাইসে GPS সাপোর্ট নেই।')
      err.gpsCode = 0
      reject(err)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (geoErr) => {
        const err = new Error(geoErr.message)
        err.gpsCode = geoErr.code
        reject(err)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

function gpsErrorMessage(gpsCode) {
  switch (gpsCode) {
    case 1: return 'Location permission বন্ধ আছে। Settings → Apps → এই app → Permissions → Location চালু করুন।'
    case 2: return 'GPS signal পাওয়া যাচ্ছে না। ডিভাইসের Location / GPS চালু আছে কিনা দেখুন।'
    case 3: return 'GPS সময়মতো সাড়া দেয়নি। একটু অপেক্ষা করে আবার চেষ্টা করুন।'
    default: return 'GPS পাওয়া যায়নি। Location চালু আছে কিনা নিশ্চিত করুন।'
  }
}

// ─── দূরত্ব badge ─────────────────────────────────────────────
function DistanceBadge({ distance }) {
  if (distance === null) return null
  const isClose  = distance <= 50
  const isMedium = distance <= 200
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
      isClose  ? 'bg-green-100 text-green-700'  :
      isMedium ? 'bg-amber-100 text-amber-700'  :
                 'bg-red-100 text-red-700'
    }`}>
      {isClose ? <FiCheckCircle size={13} /> : <FiAlertTriangle size={13} />}
      {isClose
        ? `✅ দোকানের কাছে (${distance}m)`
        : `⚠️ দোকান থেকে ${distance}m দূরে`}
    </div>
  )
}

// ─── Hold-to-Confirm Button (বাকি আদায় নিশ্চিত করতে) ─────────
// Attendance-এর HoldButton-এর মতো — ভুল submit ঠেকায়
function CollectionHoldButton({ onDone, disabled }) {
  const [pct,    setPct]    = useState(0)
  const [active, setActive] = useState(false)
  const [done,   setDone]   = useState(false)
  const intervalRef         = useRef(null)
  const accumulated         = useRef(0)
  const pressStart          = useRef(null)
  const DURATION            = 2200

  function startTicking() {
    pressStart.current = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = accumulated.current + (Date.now() - pressStart.current)
      const p = Math.min(100, (elapsed / DURATION) * 100)
      setPct(p)
      if (p >= 100) {
        clearInterval(intervalRef.current)
        setDone(true)
        setActive(false)
        accumulated.current = 0
        onDone?.()
      }
    }, 30)
  }

  function begin() {
    if (done || disabled) return
    setActive(true)
    startTicking()
  }

  function stop() {
    if (done) return
    clearInterval(intervalRef.current)
    setActive(false)
    accumulated.current = 0
    setPct(0)
  }

  function pause() {
    if (done) return
    clearInterval(intervalRef.current)
    if (pressStart.current) {
      accumulated.current += Date.now() - pressStart.current
      pressStart.current = null
    }
    setActive(false)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const radius = 26
  const circ   = 2 * Math.PI * radius
  const dash   = circ - (pct / 100) * circ

  return (
    <button
      onMouseDown={begin}  onMouseUp={stop}  onMouseLeave={stop}
      onTouchStart={begin} onTouchEnd={stop} onTouchCancel={pause}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-4 py-4 rounded-2xl font-bold text-base transition-all select-none
        ${done
          ? 'bg-green-500 text-white'
          : disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : active
              ? 'bg-emerald-700 text-white scale-[0.98]'
              : 'bg-emerald-600 text-white active:scale-[0.98]'
        }`}
    >
      {/* SVG ring progress */}
      <svg width={64} height={64} className="-rotate-90 flex-shrink-0">
        <circle cx={32} cy={32} r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={5} />
        <circle
          cx={32} cy={32} r={radius}
          fill="none"
          stroke={done ? '#fff' : 'rgba(255,255,255,0.9)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 0.03s linear' }}
        />
      </svg>
      <span className="text-lg">
        {done ? '✅ জমা হয়েছে!' : active ? 'ধরে থাকুন...' : '💰 চেপে ধরুন — নিশ্চিত করুন'}
      </span>
    </button>
  )
}

// ─── Collection Bottom Sheet Modal ────────────────────────────
function CollectionModal({ customer, location, onClose, onSuccess }) {
  const due = parseFloat(customer?.current_credit || 0)

  // form state
  const [amount,      setAmount]      = useState('')
  const [payMode,     setPayMode]     = useState('cash')  // cash | cheque | bkash | nagad
  const [chequeName,  setChequeName]  = useState('')
  const [chequeNo,    setChequeNo]    = useState('')
  const [chequeDate,  setChequeDate]  = useState('')
  const [note,        setNote]        = useState('')
  const [photo,       setPhoto]       = useState(null)    // { blob, url }
  const [showCamera,  setShowCamera]  = useState(false)
  const [submitting,  setSubmitting]  = useState(false)

  const parsedAmount = parseFloat(amount) || 0
  const isValid = parsedAmount > 0 && parsedAmount <= due + 1  // ১ টাকা tolerance
  const isChequeModeValid = payMode !== 'cheque' || (chequeName.trim() && chequeNo.trim() && chequeDate)

  // Quick amount buttons
  const quickAmounts = [
    { label: `সব (৳${parseInt(due).toLocaleString()})`, value: due.toFixed(0) },
    ...[500, 1000, 2000, 5000].filter(v => v < due).map(v => ({
      label: `৳${v.toLocaleString()}`,
      value: String(v),
    })),
  ].slice(0, 4)  // max 4 button

  const payModes = [
    { id: 'cash',   label: 'নগদ',   emoji: '💵' },
    { id: 'cheque', label: 'চেক',   emoji: '🏦' },
    { id: 'bkash',  label: 'bKash', emoji: '📱' },
    { id: 'nagad',  label: 'Nagad', emoji: '📲' },
  ]

  // ── ছবি compress (same helper as SalesForm) ──────────────────
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const MAX_PX = 1280
      const img    = new Image()
      const url    = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let w = img.width, h = img.height
        if (w > MAX_PX || h > MAX_PX) {
          if (w >= h) { h = Math.round(h * MAX_PX / w); w = MAX_PX }
          else        { w = Math.round(w * MAX_PX / h); h = MAX_PX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('compress ব্যর্থ'))
          resolve(blob)
        }, 'image/jpeg', 0.82)
      }
      img.onerror = () => reject(new Error('ছবি লোড ব্যর্থ'))
      img.src = url
    })
  }

  // ── Submit ──────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (submitting) return
    if (!isValid) { toast.error('সঠিক পরিমাণ দিন'); return }
    if (!isChequeModeValid) { toast.error('চেকের বিস্তারিত পূরণ করুন'); return }

    setSubmitting(true)

    // ── OFFLINE MODE ──────────────────────────────────────────
    if (!navigator.onLine) {
      try {
        let photoBase64 = null
        if (photo?.blob) {
          photoBase64 = await new Promise(res => {
            const reader = new FileReader()
            reader.onload = () => res(reader.result)
            reader.onerror = () => res(null)
            reader.readAsDataURL(photo.blob)
          })
        }

        await enqueue({
          type: 'COLLECTION',
          payload: {
            customer_id:    customer.id,
            amount:         parsedAmount,
            payment_mode:   payMode,
            cheque_bank:    chequeName || undefined,
            cheque_no:      chequeNo   || undefined,
            cheque_date:    chequeDate || undefined,
            note:           note       || undefined,
            latitude:       location?.latitude,
            longitude:      location?.longitude,
            _receipt_photo: photoBase64 || undefined,
            _customer_name: customer?.shop_name,
          },
        })

        toast.success('✅ বাকি আদায় offline-এ সংরক্ষিত! নেটওয়ার্ক ফিরলে sync হবে।', {
          duration: 5000, icon: '📶',
        })
        onSuccess?.({ offline: true, amount: parsedAmount })
      } catch {
        toast.error('Offline save ব্যর্থ হয়েছে।')
        setSubmitting(false)
      }
      return
    }

    // ── ONLINE MODE ───────────────────────────────────────────
    try {
      const formData = new FormData()
      formData.append('customer_id',  customer.id)
      formData.append('amount',       parsedAmount)
      formData.append('payment_mode', payMode)
      if (payMode === 'cheque') {
        formData.append('cheque_bank', chequeName)
        formData.append('cheque_no',   chequeNo)
        formData.append('cheque_date', chequeDate)
      }
      if (note.trim())         formData.append('note', note.trim())
      if (location?.latitude)  formData.append('latitude',  location.latitude)
      if (location?.longitude) formData.append('longitude', location.longitude)

      if (photo?.blob) {
        try {
          const compressed = await compressImage(photo.blob)
          formData.append('receipt_photo', compressed, 'receipt.jpg')
        } catch {
          formData.append('receipt_photo', photo.blob, 'receipt.jpg')
        }
      }

      const res = await api.post('/collections', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      toast.success(`✅ ৳${parsedAmount.toLocaleString()} বাকি আদায় রেকর্ড হয়েছে!`)
      onSuccess?.({ offline: false, amount: parsedAmount, data: res.data.data })
    } catch (err) {
      const msg = err?.response?.data?.message || 'বাকি আদায় সেভ হয়নি। আবার চেষ্টা করুন।'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  // Camera capture callback
  const handlePhotoCapture = (blob, url) => {
    setPhoto({ blob, url })
    setShowCamera(false)
  }

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────── */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* ── Bottom Sheet ─────────────────────────────────────── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
              <FiDollarSign className="text-emerald-600" />
              বাকি আদায়
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{customer?.shop_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6 space-y-5">

          {/* মোট বকেয়া */}
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-red-500 font-medium">মোট বকেয়া</p>
              <p className="text-2xl font-bold text-red-600 mt-0.5">
                ৳{parseInt(due).toLocaleString()}
              </p>
            </div>
            <div className="text-3xl">🏪</div>
          </div>

          {/* পরিমাণ input */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              কত টাকা নিলেন? <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">৳</span>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-9 pr-4 py-3.5 border-2 border-gray-200 rounded-2xl text-xl font-bold text-gray-800 focus:outline-none focus:border-emerald-400 transition-colors"
              />
            </div>

            {/* Quick amount buttons */}
            <div className="flex gap-2 flex-wrap">
              {quickAmounts.map(q => (
                <button
                  key={q.label}
                  onClick={() => setAmount(q.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    amount === q.value
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* validation hint */}
            {parsedAmount > 0 && parsedAmount > due + 1 && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <FiAlertTriangle size={12} />
                বকেয়ার চেয়ে বেশি হতে পারে না (৳{parseInt(due).toLocaleString()})
              </p>
            )}
          </div>

          {/* Payment Mode */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">পেমেন্ট পদ্ধতি</label>
            <div className="grid grid-cols-4 gap-2">
              {payModes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPayMode(m.id)}
                  className={`py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all text-xs font-semibold ${
                    payMode === m.id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* চেক হলে extra fields */}
          {payMode === 'cheque' && (
            <div className="space-y-3 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                🏦 চেকের তথ্য <span className="text-red-500">*</span>
              </p>
              <input
                type="text"
                value={chequeName}
                onChange={e => setChequeName(e.target.value)}
                placeholder="ব্যাংকের নাম"
                className="w-full px-4 py-2.5 border border-blue-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={chequeNo}
                  onChange={e => setChequeNo(e.target.value)}
                  placeholder="চেক নম্বর"
                  className="px-4 py-2.5 border border-blue-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white"
                />
                <input
                  type="date"
                  value={chequeDate}
                  onChange={e => setChequeDate(e.target.value)}
                  className="px-4 py-2.5 border border-blue-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white"
                />
              </div>
            </div>
          )}

          {/* রসিদের ছবি */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              রসিদের ছবি <span className="text-gray-400 font-normal">(ঐচ্ছিক)</span>
            </label>

            {photo ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200">
                <img
                  src={photo.url}
                  alt="রসিদ"
                  className="w-full h-40 object-cover"
                />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white"
                >
                  <FiX size={14} />
                </button>
                <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <FiCheckCircle size={11} /> ছবি যুক্ত হয়েছে
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCamera(true)}
                className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 flex flex-col items-center gap-2 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <FiCamera className="text-2xl" />
                <span className="text-sm font-medium">ছবি তুলুন</span>
              </button>
            )}
          </div>

          {/* নোট */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              নোট <span className="text-gray-400 font-normal">(ঐচ্ছিক)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="কোনো মন্তব্য থাকলে লিখুন..."
              rows={2}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 resize-none transition-colors"
            />
          </div>

          {/* Offline notice */}
          {!navigator.onLine && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <FiWifiOff size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                অফলাইন মোড — নেটওয়ার্ক ফিরলে স্বয়ংক্রিয়ভাবে sync হবে
              </p>
            </div>
          )}

          {/* Hold to Confirm Button */}
          <CollectionHoldButton
            onDone={handleConfirm}
            disabled={submitting || !isValid || !isChequeModeValid}
          />
        </div>
      </div>

      {/* ── Camera Modal ─────────────────────────────────────── */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-white font-semibold">রসিদের ছবি তুলুন</p>
            <button onClick={() => setShowCamera(false)} className="p-2 text-white/80">
              <FiX size={22} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
              <Camera
                onCapture={handlePhotoCapture}
                onClose={() => setShowCamera(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function VisitPage() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { selectedRoute } = useAppStore()

  const [customer,           setCustomer]           = useState(null)
  const [loading,            setLoading]            = useState(true)

  // GPS state
  const [gpsState,           setGpsState]           = useState('idle')
  const [location,           setLocation]           = useState(null)
  const [distance,           setDistance]           = useState(null)
  const [gpsError,           setGpsError]           = useState(null)

  // Visit state
  const [visiting,           setVisiting]           = useState(false)
  const [visited,            setVisited]            = useState(false)
  const [visitedToday,       setVisitedToday]       = useState(false)
  const [visitStatusLoading, setVisitStatusLoading] = useState(true)

  // No-sell state
  const [showNoSell,     setShowNoSell]     = useState(false)
  const [noSellReason,   setNoSellReason]   = useState('')
  const [showCamera,     setShowCamera]     = useState(false)
  const [closedShopPhoto,setClosedShopPhoto]= useState(null)

  // ✅ নতুন: Collection state
  const [showCollection, setShowCollection] = useState(false)
  // optimistic due — collection submit হলে locally কমাবো, reload ছাড়া
  const [localDue,       setLocalDue]       = useState(null)

  useEffect(() => {
    const loadCustomer = async () => {
      const cached = await getCache(`customer_${id}`)
      if (cached?.isToday) { setCustomer(cached.data); setLoading(false) }

      if (navigator.onLine) {
        try {
          const res = await api.get(`/customers/${id}`)
          setCustomer(res.data.data)
          saveCache(`customer_${id}`, res.data.data)
        } catch { /* cache দিয়েই চলবে */ }
      }
      setLoading(false)
    }

    const checkVisitStatus = async () => {
      if (!navigator.onLine) { setVisitStatusLoading(false); return }
      try {
        const res = await api.get(`/sales/visit-status/${id}`)
        if (res.data.data?.visited) setVisitedToday(true)
      } catch {
        // চেক করা না গেলেও UI block হবে না
      } finally {
        setVisitStatusLoading(false)
      }
    }

    loadCustomer()
    checkVisitStatus()
  }, [id])

  // localDue init — customer load হলে set
  useEffect(() => {
    if (customer && localDue === null) {
      setLocalDue(parseFloat(customer.current_credit || 0))
    }
  }, [customer])

  useEffect(() => { handleGetGPS() }, [])

  const handleGetGPS = async () => {
    setGpsState('loading')
    setGpsError(null)
    try {
      const loc = await getGPS()
      setLocation(loc)
      setGpsState('done')
    } catch (err) {
      setGpsError(gpsErrorMessage(err.gpsCode))
      setGpsState('error')
    }
  }

  const handleNoSellVisit = async () => {
    if (!noSellReason.trim()) { toast.error('কারণ লিখুন'); return }
    await submitVisit({ will_sell: false, no_sell_reason: noSellReason, photo: closedShopPhoto?.blob })
    setShowNoSell(false)
  }

  const submitVisit = async ({ will_sell = true, no_sell_reason = null, photo = null } = {}) => {
    setVisiting(true)

    if (!navigator.onLine) {
      try {
        let photoBase64 = null
        if (photo) {
          photoBase64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload  = () => resolve(reader.result)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(photo)
          })
        }
        await enqueue({
          type: 'VISIT',
          payload: {
            customer_id:          id,
            will_sell,
            no_sell_reason:       no_sell_reason || undefined,
            latitude:             location?.latitude,
            longitude:            location?.longitude,
            _closed_photo_base64: photoBase64 || undefined,
            _customer_name:       customer?.shop_name,
          },
        })
        toast.success('✅ ভিজিট offline এ সংরক্ষিত! নেটওয়ার্ক ফিরলে sync হবে।', {
          duration: 5000, icon: '📶',
        })
        setVisited(true)
        setVisitedToday(true)
      } catch {
        toast.error('Offline save ব্যর্থ হয়েছে।')
      } finally {
        setVisiting(false)
      }
      return
    }

    try {
      const formData = new FormData()
      formData.append('customer_id', id)
      formData.append('will_sell', will_sell)
      if (no_sell_reason) formData.append('no_sell_reason', no_sell_reason)
      if (location) {
        formData.append('latitude',  location.latitude)
        formData.append('longitude', location.longitude)
      }
      if (photo) formData.append('closed_shop_photo', photo, 'closed_shop.jpg')

      const res  = await api.post('/sales/visit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const data = res.data.data

      if (data?.distance !== undefined) setDistance(data.distance)
      if (data?.warning) toast(data.warning, { icon: '⚠️', duration: 4000 })
      else               toast.success('ভিজিট রেকর্ড হয়েছে ✅')

      setVisited(true)
      setVisitedToday(true)
    } finally {
      setVisiting(false)
    }
  }

  // ✅ Collection সফল হলে locally due কমাও (refresh ছাড়া)
  const handleCollectionSuccess = async ({ amount }) => {
    const prevDue  = localDue ?? parseFloat(customer?.current_credit || 0)
    const newCredit = Math.max(0, prevDue - amount)

    setLocalDue(newCredit)
    setShowCollection(false)

    // Individual customer cache update
    saveCache(`customer_${id}`, { ...customer, current_credit: newCredit })

    // ✅ localStorage-এ pending reduction রাখো — online API fetch-এও টিকে থাকবে
    try {
      const pending = JSON.parse(localStorage.getItem('pending_credit_reductions') || '{}')
      pending[String(id)] = newCredit
      localStorage.setItem('pending_credit_reductions', JSON.stringify(pending))
    } catch (_) {}

    // ✅ Customer LIST cache-ও update করো — CustomerList-এ সঠিক বাকি দেখাবে
    const routeId      = selectedRoute?.id || 'all'
    const listCacheKey = `customers_route_${routeId}`
    const cached       = await getCache(listCacheKey)
    if (cached?.data) {
      const updatedList = cached.data.map(c =>
        String(c.id) === String(id) ? { ...c, current_credit: newCredit } : c
      )
      saveCache(listCacheKey, updatedList)
    }
  }

  // ── display due (local override থাকলে সেটা দেখাও) ──────────
  const displayDue = localDue !== null
    ? localDue
    : parseFloat(customer?.current_credit || 0)

  if (loading) return (
    <div className="p-4">
      <div className="h-64 bg-white rounded-2xl animate-pulse" />
    </div>
  )

  if (!customer) return (
    <div className="p-4 text-center text-gray-500">কাস্টমার পাওয়া যায়নি</div>
  )

  return (
    <div className="p-4 space-y-4">

      {/* ── Customer Info Card ──────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{customer.shop_name}</h2>
            <p className="text-sm text-gray-500">{customer.owner_name}</p>
          </div>
          <DistanceBadge distance={distance} />
        </div>

        <div className="mt-3 space-y-2">
          {customer.phone && (
            <p className="text-sm flex items-center gap-2">
              <FiPhone className="text-gray-400" />
              {customer.phone}
            </p>
          )}
          {customer.address && (
            <p className="text-sm flex items-center gap-2">
              <FiMapPin className="text-gray-400" />
              {customer.address}
            </p>
          )}
        </div>

        {/* ✅ বকেয়া section — updated: localDue ব্যবহার করে, আদায় বাটন এখানেও */}
        {displayDue > 0 && (
          <div className="mt-3 bg-red-50 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-red-500 font-medium">মোট বকেয়া</p>
              <p className="text-base font-bold text-red-600">
                ৳{parseInt(displayDue).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setShowCollection(true)}
              className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform flex-shrink-0"
            >
              <FiDollarSign size={15} />
              আদায় করুন
            </button>
          </div>
        )}

        {/* বকেয়া নেই — ছোট badge */}
        {displayDue === 0 && parseFloat(customer.current_credit || 0) > 0 && (
          <div className="mt-3 bg-green-50 rounded-xl p-2.5 flex items-center gap-2">
            <FiCheckCircle size={14} className="text-green-500" />
            <p className="text-xs text-green-700 font-medium">বকেয়া পরিশোধ হয়েছে ✅</p>
          </div>
        )}
      </div>

      {/* ── GPS Status Bar ──────────────────────────────────── */}
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-sm ${
        gpsState === 'done'    ? 'bg-green-50 border border-green-200' :
        gpsState === 'loading' ? 'bg-blue-50 border border-blue-200'  :
        gpsState === 'error'   ? 'bg-red-50 border border-red-200'    :
                                 'bg-gray-50 border border-gray-200'
      }`}>
        {gpsState === 'loading' && (
          <>
            <FiNavigation className="text-blue-500 animate-spin flex-shrink-0" />
            <span className="text-blue-600">GPS লোকেশন নেওয়া হচ্ছে...</span>
          </>
        )}
        {gpsState === 'done' && (
          <>
            <FiCheckCircle className="text-green-500 flex-shrink-0" />
            <span className="text-green-700">
              লোকেশন নেওয়া হয়েছে ({location?.latitude?.toFixed(4)}, {location?.longitude?.toFixed(4)})
            </span>
          </>
        )}
        {gpsState === 'error' && (
          <>
            <FiAlertTriangle className="text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-600 text-xs">{gpsError}</p>
            </div>
            <button
              onClick={handleGetGPS}
              className="text-xs text-red-600 underline flex-shrink-0"
            >
              আবার চেষ্টা
            </button>
          </>
        )}
      </div>

      {/* ── Action Buttons ──────────────────────────────────── */}
      {!visited ? (
        <div className="space-y-3">
          {/* বিক্রয় করুন */}
          <button
            onClick={() => navigate(`/worker/sales/${id}`)}
            className="w-full bg-primary text-white rounded-2xl p-4 flex items-center justify-center gap-3 font-semibold text-base active:scale-95 transition-transform"
          >
            <FiShoppingCart className="text-xl" />
            বিক্রয় করুন
          </button>

          {/* ✅ বাকি আদায় — বড় বাটন, displayDue > 0 হলে দেখায় */}
          {displayDue > 0 && (
            <button
              onClick={() => setShowCollection(true)}
              className="w-full bg-emerald-500 text-white rounded-2xl p-4 flex items-center justify-center gap-3 font-semibold text-base active:scale-95 transition-transform"
            >
              <FiDollarSign className="text-xl" />
              💰 বাকি আদায় করুন
              <span className="ml-auto bg-white/20 text-white text-xs px-2.5 py-1 rounded-xl font-bold">
                ৳{parseInt(displayDue).toLocaleString()}
              </span>
            </button>
          )}

          {/* আজকে ভিজিট হয়ে গেছে notice */}
          {visitedToday && !visitStatusLoading && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <FiCheckCircle size={16} className="text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">
                আজকে এই দোকানে ভিজিট হয়ে গেছে।
              </p>
            </div>
          )}

          {/* Offline notice */}
          {!navigator.onLine && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <FiWifiOff size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                অফলাইন মোড — ভিজিট save হবে, নেটওয়ার্ক ফিরলে sync হবে
              </p>
            </div>
          )}

          {/* GPS warning */}
          {(gpsState === 'error' || gpsState === 'idle' || (!location && gpsState !== 'loading')) && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <FiMapPin className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 font-medium">
                📍 লোকেশন পাওয়া যাচ্ছে না — ভিজিট বা রাখেনি করা যাবে না।
              </p>
            </div>
          )}

          {/* ভিজিট + রাখেনি grid */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => submitVisit({ will_sell: true })}
              disabled={visiting || gpsState !== 'done' || !location || visitedToday || visitStatusLoading}
              className="bg-white border-2 border-gray-200 text-gray-700 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {visiting
                ? <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <FiUser className="text-2xl" />
              }
              <span className="text-sm font-semibold">ভিজিট (আসবে)</span>
              {visitedToday && <span className="text-[10px] text-green-600 font-medium">✅ হয়ে গেছে</span>}
              {!navigator.onLine && !visitedToday && <span className="text-[10px] text-amber-600">offline</span>}
            </button>

            <button
              onClick={() => setShowNoSell(true)}
              disabled={visiting || gpsState !== 'done' || !location || visitedToday || visitStatusLoading}
              className="bg-amber-50 border-2 border-amber-200 text-amber-700 rounded-2xl p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiAlertTriangle className="text-2xl" />
              <span className="text-sm font-semibold">রাখেনি</span>
              {visitedToday && <span className="text-[10px] text-green-600 font-medium">✅ হয়ে গেছে</span>}
              {!navigator.onLine && !visitedToday && <span className="text-[10px] text-amber-600">offline</span>}
            </button>
          </div>
        </div>
      ) : (
        /* ── Visit Confirmed ──────────────────────────────────── */
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-3">
          <FiCheckCircle className="text-green-500 text-4xl mx-auto" />
          <p className="font-bold text-green-700">ভিজিট রেকর্ড হয়েছে!</p>

          {/* ✅ visit এর পরেও বাকি আদায়ের option দেখাও */}
          {displayDue > 0 && (
            <button
              onClick={() => setShowCollection(true)}
              className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <FiDollarSign size={16} />
              💰 বাকি আদায় করুন (৳{parseInt(displayDue).toLocaleString()})
            </button>
          )}

          <button
            onClick={() => navigate('/worker/customers')}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold"
          >
            পরের কাস্টমার →
          </button>
        </div>
      )}

      {/* ── No Sell Modal ──────────────────────────────────────── */}
      {showNoSell && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg text-gray-800">রাখেনি — কারণ লিখুন</h3>
            <p className="text-xs text-gray-500">কেন বিক্রি হলো না সেটা জানান</p>

            <div className="flex flex-wrap gap-2">
              {['দোকান বন্ধ', 'মালিক নেই', 'বাকি বেশি', 'পণ্য নেওয়া নেই', 'অন্য কারণ'].map(r => (
                <button
                  key={r}
                  onClick={() => setNoSellReason(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    noSellReason === r
                      ? 'bg-amber-100 border-amber-400 text-amber-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <textarea
              value={noSellReason}
              onChange={e => setNoSellReason(e.target.value)}
              placeholder="বিস্তারিত লিখুন..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 resize-none"
            />

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">
                বন্ধ দোকানের ছবি <span className="text-gray-400">(ঐচ্ছিক)</span>
              </p>
              {closedShopPhoto ? (
                <div className="relative w-full rounded-xl overflow-hidden border border-amber-200">
                  <img src={closedShopPhoto.url} alt="বন্ধ দোকান" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => setClosedShopPhoto(null)}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white"
                  >
                    <FiX size={14} />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                    <FiCheckCircle size={11} /> ছবি যুক্ত হয়েছে
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCamera(true)}
                  className="w-full border-2 border-dashed border-amber-300 rounded-xl py-4 flex flex-col items-center gap-2 text-amber-600 bg-amber-50 active:scale-95 transition-transform"
                >
                  <FiCamera className="text-2xl" />
                  <span className="text-sm font-medium">ছবি তুলুন</span>
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowNoSell(false); setNoSellReason(''); setClosedShopPhoto(null) }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold"
              >
                বাতিল
              </button>
              <button
                onClick={handleNoSellVisit}
                disabled={visiting || !noSellReason.trim()}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {visiting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                রেকর্ড করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No-Sell Camera Modal ─────────────────────────────── */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-white font-semibold">বন্ধ দোকানের ছবি তুলুন</p>
            <button onClick={() => setShowCamera(false)} className="p-2 text-white/80">
              <FiX size={22} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
              <Camera
                onCapture={(blob, url) => { setClosedShopPhoto({ blob, url }); setShowCamera(false) }}
                onClose={() => setShowCamera(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ✅ Collection Bottom Sheet Modal */}
      {showCollection && (
        <CollectionModal
          customer={{ ...customer, current_credit: displayDue }}
          location={location}
          onClose={() => setShowCollection(false)}
          onSuccess={handleCollectionSuccess}
        />
      )}
    </div>
  )
}
