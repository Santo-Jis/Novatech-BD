import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useCheckinStore } from '../../store/checkin.store'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import {
  FiSend, FiPackage, FiAlertTriangle, FiCheckCircle,
  FiInfo, FiLock, FiArrowRight, FiRotateCcw, FiTrendingUp,
  FiCalendar, FiDollarSign
} from 'react-icons/fi'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────
const CASH_BLOCK_LIMIT = 500
const CASH_WARN_LIMIT  = 1

// ─── Helpers ─────────────────────────────────────────────────
const getBDToday = () => {
  const d = new Date(Date.now() + 6 * 3600000)
  return d.toISOString().split('T')[0]
}

const getBDDateLabel = () => {
  const d   = new Date(Date.now() + 6 * 3600000)
  const days = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার']
  const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
                  'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const taka = n => '৳' + parseInt(n || 0).toLocaleString('en-IN')

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-gray-800', bg = 'bg-gray-50' }) {
  return (
    <div className={`${bg} rounded-2xl p-3 text-center`}>
      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">{label}</p>
      <p className={`font-extrabold text-base leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function SellBar({ sold, taken }) {
  if (!taken) return null
  const pct = Math.min(100, Math.round((sold / taken) * 100))
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  const label = pct >= 80 ? '🔥 দারুণ বিক্রয়!' : pct >= 50 ? '👍 ভালো চলছে' : '📉 বিক্রয় কম'
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">আজকের বিক্রয় হার</span>
        <span className="text-xs font-bold text-gray-700">{pct}% {label}</span>
      </div>
      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 text-right">
        {sold} / {taken} পিস বিক্রি হয়েছে
      </p>
    </div>
  )
}

// প্রতিটি পণ্যের return + carry forward row
function ItemRow({ item, returnedQty, carryQty, onReturn, onCarry }) {
  const avail     = Math.max(0, item.taken_qty - item.sold_qty - item.replacement_qty)
  const used      = returnedQty + carryQty
  const remaining = Math.max(0, avail - used)
  const maxRet    = Math.max(0, avail - carryQty)
  const maxCarry  = Math.max(0, avail - returnedQty)

  if (item.taken_qty === 0) return null

  return (
    <div className="py-3.5 border-b border-gray-50 last:border-0">

      {/* Product header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800 truncate">{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">হাতে {item.taken_qty}</span>
            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">বিক্রি {item.sold_qty}</span>
            {item.replacement_qty > 0 &&
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">রিপ্লেস {item.replacement_qty}</span>}
          </div>
        </div>

        {/* Live shortage per item */}
        {avail > 0 && (
          <div className="ml-3 text-right shrink-0">
            {remaining > 0
              ? <div className="bg-amber-50 border border-amber-200 rounded-xl px-2 py-1">
                  <p className="text-[10px] text-amber-600">অব্যবহৃত</p>
                  <p className="text-sm font-extrabold text-amber-700">{remaining} পিস</p>
                </div>
              : <div className="bg-emerald-50 rounded-xl px-2 py-1 text-center">
                  <p className="text-emerald-600 text-sm font-bold">✅ ঠিক আছে</p>
                </div>
            }
          </div>
        )}
      </div>

      {avail === 0 ? (
        <p className="text-xs text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2 text-center">
          ✅ সব বিক্রি / রিপ্লেস হয়েছে
        </p>
      ) : (
        <>
          {/* Quick action buttons */}
          <div className="flex gap-2 mb-2.5">
            <button
              onClick={() => { onReturn(item.product_id, avail); onCarry(item.product_id, 0) }}
              className="flex-1 text-[10px] font-semibold border border-blue-200 text-blue-600 rounded-xl py-1.5 bg-blue-50 active:scale-95 transition-transform"
            >
              🔵 সব ফেরত দিচ্ছি ({avail})
            </button>
            <button
              onClick={() => { onCarry(item.product_id, avail); onReturn(item.product_id, 0) }}
              className="flex-1 text-[10px] font-semibold border border-violet-200 text-violet-600 rounded-xl py-1.5 bg-violet-50 active:scale-95 transition-transform"
            >
              🟣 সব কাল রাখছি ({avail})
            </button>
          </div>

          {/* Manual inputs */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold text-blue-600 mb-1 block uppercase tracking-wide">আজকে ফেরত</label>
              <input
                type="number" inputMode="numeric" min="0" max={maxRet} value={returnedQty || ''}
                onChange={e => onReturn(item.product_id, Math.min(maxRet, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-200 bg-blue-50/30"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-violet-600 mb-1 flex items-center gap-1 uppercase tracking-wide">
                <FiArrowRight size={9} /> কাল রাখছি
              </label>
              <input
                type="number" inputMode="numeric" min="0" max={maxCarry} value={carryQty || ''}
                onChange={e => onCarry(item.product_id, Math.min(maxCarry, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full border border-violet-200 rounded-xl px-3 py-2.5 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-violet-200 bg-violet-50/40"
                placeholder="0"
              />
            </div>
          </div>

          {/* Remaining warning */}
          {remaining > 0 && used > 0 && (
            <p className="text-[10px] text-amber-600 bg-amber-50 rounded-xl px-3 py-1.5 mt-2 text-center">
              ⚠️ {remaining} পিস এখনো হিসাব হয়নি — ঘাটতি ধরা হবে
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function Settlement() {
  const navigate = useNavigate()

  // ✅ F1: সেটেলমেন্ট পেজ checkin ছাড়াও দেখা যায় (view সবসময় allowed) —
  // কিন্তু জমা দেওয়া (যা ব্যাকএন্ডে requireCheckin দিয়ে গার্ডেড, F2 দ্রষ্টব্য) checkin ছাড়া করা যাবে না।
  const checkedIn          = useCheckinStore(s => s.checkedIn)
  const fetchCheckinStatus = useCheckinStore(s => s.fetchStatus)
  useEffect(() => { fetchCheckinStatus() }, [])

  const [stockItems,    setStockItems]    = useState([])
  const [returnedQtys,  setReturnedQtys]  = useState({})
  const [carryQtys,     setCarryQtys]     = useState({})
  const [cashAmount,    setCashAmount]    = useState('')
  const [todayCash,     setTodayCash]     = useState(0)
  const [todaySales,    setTodaySales]    = useState(0)
  const [todayCredit,   setTodayCredit]   = useState(0)
  const [totalTakenQty, setTotalTakenQty] = useState(0)
  const [totalSoldQty,  setTotalSoldQty]  = useState(0)
  const [shortageNote,         setShortageNote]         = useState('')
  const [mismatchExplanation,  setMismatchExplanation]  = useState('')
  const [loading,              setLoading]              = useState(true)
  const [submitting,           setSubmitting]           = useState(false)
  const [showConfirm,          setShowConfirm]          = useState(false)
  const [alreadySubmitted,     setAlreadySubmitted]     = useState(false)
  const [submittedData,        setSubmittedData]        = useState(null)
  const [colSummary,           setColSummary]           = useState(null)

  const today     = getBDToday()
  const dateLabel = getBDDateLabel()

  useEffect(() => {
    const load = async () => {
      try {
        const [settRes, salesRes, stockRes, previewRes, colRes] = await Promise.allSettled([
          api.get('/settlements/my'),
          api.get('/sales/today-summary'),
          api.get('/ledger/my-stock'),
          api.get('/settlements/today-preview'),
          api.get('/collections/settlement-summary'),
        ])

        // আজকের settlement আছে কিনা — BD date দিয়ে check
        if (settRes.status === 'fulfilled') {
          const list    = settRes.value.data.data
          const found   = Array.isArray(list)
            ? list.find(s => s.settlement_date?.startsWith(today))
            : null
          if (found) { setAlreadySubmitted(true); setSubmittedData(found) }
        }

        if (salesRes.status === 'fulfilled') {
          const s = salesRes.value.data.data?.sales || {}
          setTodayCash(parseFloat(s.cash_received || 0))
          setTodaySales(parseFloat(s.total_amount  || 0))
          setTodayCredit(parseFloat(s.credit_given || 0))
        }

        const previewItems = previewRes.status === 'fulfilled'
          ? (previewRes.value.data.data?.items || [])
          : []

        if (stockRes.status === 'fulfilled') {
          const stockData = stockRes.value.data.data || []
          const mapped = stockData
            .map(s => {
              const pi = previewItems.find(p => p.product_id === s.product_id) || {}
              return {
                product_id:      s.product_id,
                name:            s.product_name,
                taken_qty:       parseInt(s.in_hand_qty     || 0),
                sold_qty:        parseInt(pi.sold_qty        || 0),
                replacement_qty: parseInt(pi.replacement_qty || 0),
                price:           parseFloat(s.price          || 0),
              }
            })
            .filter(i => i.taken_qty > 0)

          setStockItems(mapped)
          setTotalTakenQty(mapped.reduce((a, i) => a + i.taken_qty, 0))
          setTotalSoldQty(mapped.reduce((a, i) => a + i.sold_qty, 0))

          const init = {}
          mapped.forEach(i => { init[i.product_id] = 0 })
          setReturnedQtys(init)
          setCarryQtys(init)
        }

        if (colRes.status === 'fulfilled') setColSummary(colRes.value.data.data)

      } catch (err) {
        console.error(err)
        toast.error('তথ্য লোড করতে সমস্যা হয়েছে')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Live shortage calculation
  const livePreview = useMemo(() => {
    let totalShortageVal = 0
    let totalShortageQty = 0
    const items = stockItems.map(item => {
      const ret     = returnedQtys[item.product_id] || 0
      const carry   = carryQtys[item.product_id]    || 0
      const accounted = item.sold_qty + item.replacement_qty + ret + carry
      const shortage  = Math.max(0, item.taken_qty - accounted)
      const sVal      = Math.round(shortage * item.price * 100) / 100
      totalShortageVal += sVal
      totalShortageQty += shortage
      return { ...item, returned_qty: ret, carry_forward_qty: carry, shortage_qty: shortage, shortage_value: sVal }
    })
    const enteredCash = parseFloat(cashAmount || 0)
    const cashDiff    = enteredCash - todayCash
    const absDiff     = Math.abs(cashDiff)
    return {
      items,
      totalShortageVal,
      totalShortageQty,
      enteredCash,
      cashDiff,
      absDiff,
      cashMismatch: absDiff > CASH_WARN_LIMIT,
      cashBlocked:  absDiff > CASH_BLOCK_LIMIT,
    }
  }, [stockItems, returnedQtys, carryQtys, cashAmount, todayCash])

  const handleSubmit = async () => {
    if (submitting || alreadySubmitted) return
    if (checkedIn === false) { toast.error('আগে আজকের চেক-ইন করুন — তারপর হিসাব জমা দেওয়া যাবে।'); setShowConfirm(false); return }
    if (!cashAmount) { toast.error('নগদ জমার পরিমাণ দিন'); return }
    if (livePreview.cashBlocked && !mismatchExplanation.trim()) {
      toast.error('নগদ পার্থক্যের কারণ অবশ্যই লিখুন')
      return
    }
    setSubmitting(true)
    try {
      const returned_items      = Object.entries(returnedQtys)
        .filter(([, q]) => q > 0).map(([pid, qty]) => ({ product_id: pid, qty }))
      const carry_forward_items = Object.entries(carryQtys)
        .filter(([, q]) => q > 0).map(([pid, qty]) => ({ product_id: pid, qty }))

      await api.post('/settlements', {
        cash_collected:       parseFloat(cashAmount),
        returned_items,
        carry_forward_items,
        shortage_note:        shortageNote || undefined,
        mismatch_explanation: mismatchExplanation.trim() || undefined,
      })
      setAlreadySubmitted(true)
      setShowConfirm(false)
      toast.success('হিসাব জমা দেওয়া হয়েছে ✅')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ─────────────────────────────────────────────
  if (loading) return (
    <div className="p-4 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
      ))}
    </div>
  )

  // ─── Already Submitted ───────────────────────────────────
  if (alreadySubmitted) {
    const s = submittedData
    return (
      <div className="p-4 pb-8 space-y-4">
        {/* Date header */}
        <div className="flex items-center gap-2 text-gray-400">
          <FiCalendar size={14} />
          <span className="text-xs">{dateLabel}</span>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <FiCheckCircle className="text-emerald-500 mx-auto mb-3" size={44} />
          <p className="font-bold text-emerald-700 text-lg">হিসাব জমা দেওয়া হয়েছে</p>
          <p className="text-sm text-emerald-600 mt-1">Manager এর অনুমোদনের অপেক্ষায়</p>
        </div>

        {s && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-semibold text-gray-700 text-sm border-b border-gray-50 pb-2">জমার সারসংক্ষেপ</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="মোট বিক্রয়"  value={taka(s.total_sales_amount || 0)} color="text-secondary" />
              <StatCard label="নগদ সংগ্রহ"  value={taka(s.cash_collected    || 0)} color="text-primary" />
              <StatCard label="বাকি দেওয়া"   value={taka(s.credit_given      || 0)} color="text-amber-600" />
              <StatCard
                label="পণ্য ঘাটতি"
                value={taka(s.shortage_qty_value || 0)}
                color={parseFloat(s.shortage_qty_value) > 0 ? 'text-red-600' : 'text-emerald-600'}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                s.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                : s.status === 'disputed' ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'}`}>
                {s.status === 'approved' ? '✅ অনুমোদিত'
                : s.status === 'disputed' ? '⚠️ ঘাটতি চিহ্নিত'
                : '⏳ অপেক্ষমান'}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Main Form ───────────────────────────────────────────
  const hasItems          = stockItems.length > 0
  const totalShortage     = livePreview.totalShortageVal
  const hasShortage       = totalShortage > 0
  const hasCashMismatch   = livePreview.cashMismatch && cashAmount !== ''
  const hasCashBlocked    = livePreview.cashBlocked  && cashAmount !== ''

  return (
    <div className="p-4 pb-8 space-y-4">

      {/* ─── Date header ─── */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800 text-lg">হিসাব জমা</h2>
        <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl px-3 py-1.5">
          <FiCalendar size={12} className="text-gray-500" />
          <span className="text-xs text-gray-600 font-medium">{dateLabel}</span>
        </div>
      </div>

      {/* ─── Checkin Required Banner ─── */}
      {checkedIn === false && (
        <div
          onClick={() => navigate('/worker/attendance')}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2.5 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <FiLock size={14} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-800 text-xs font-bold">হিসাব দেখা যাচ্ছে, কিন্তু জমা দিতে checkin লাগবে</p>
            <p className="text-amber-600 text-[11px]">এখনই চেক-ইন করুন 👆</p>
          </div>
        </div>
      )}

      {/* ─── Section 1: আজকের বিক্রয় ─── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">আজকের বিক্রয়</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="মোট বিক্রয়" value={taka(todaySales)}  color="text-secondary" bg="bg-secondary/5" />
          <StatCard label="নগদ সংগ্রহ" value={taka(todayCash)}   color="text-primary"   bg="bg-primary/5" />
          <StatCard label="বাকি দেওয়া"  value={taka(todayCredit)} color="text-amber-600" bg="bg-amber-50" />
        </div>
        {/* Sell performance bar */}
        {hasItems && (
          <SellBar sold={totalSoldQty} taken={totalTakenQty} />
        )}
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <FiInfo size={10} /> বিক্রয় রেকর্ড থেকে স্বয়ংক্রিয়ভাবে আসছে
        </p>
      </div>

      {/* ─── বাকি আদায় ─── */}
      {colSummary?.count > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-600 font-bold">💰 আজকের বাকি আদায়</p>
            <p className="text-[10px] text-emerald-500 mt-0.5">{colSummary.count}টি দোকান</p>
          </div>
          <p className="text-lg font-extrabold text-emerald-700">{taka(colSummary.total_cash)}</p>
        </div>
      )}

      {/* ─── Section 2: পণ্যের হিসাব ─── */}
      {hasItems && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <FiPackage className="text-primary" size={16} />
                <p className="font-bold text-gray-700 text-sm">পণ্যের হিসাব</p>
              </div>
              {/* Live shortage badge */}
              {hasShortage
                ? <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl">
                    ⚠️ {taka(totalShortage)} ঘাটতি
                  </span>
                : livePreview.totalShortageQty === 0 && Object.values(returnedQtys).some(v => v > 0) || Object.values(carryQtys).some(v => v > 0)
                ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">✅ সব হিসাব হয়েছে</span>
                : null
              }
            </div>

            {/* Guide banner */}
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 rounded-xl px-3 py-2">
              <div className="flex gap-4 flex-wrap">
                <span className="text-[10px] text-blue-600 font-medium">🔵 আজকে ফেরত → গুদামে দিচ্ছেন</span>
                <span className="text-[10px] text-violet-600 font-medium">🟣 কাল রাখছি → আগামীকাল বিক্রি করবেন</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">হিসাব না হওয়া পণ্য ঘাটতি হিসেবে যাবে</p>
            </div>
          </div>

          {/* Items list */}
          <div className="px-4">
            {stockItems.map(item => (
              <ItemRow
                key={item.product_id}
                item={item}
                returnedQty={returnedQtys[item.product_id] || 0}
                carryQty={carryQtys[item.product_id] || 0}
                onReturn={(pid, qty) => setReturnedQtys(p => ({ ...p, [pid]: qty }))}
                onCarry={(pid, qty)  => setCarryQtys(p => ({ ...p, [pid]: qty }))}
              />
            ))}
          </div>

          {/* Global shortage warning */}
          {hasShortage && (
            <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <FiAlertTriangle className="text-red-500 flex-shrink-0" size={14} />
              <p className="text-xs text-red-700">
                <span className="font-bold">{taka(totalShortage)} ঘাটতি</span> — Manager অনুমোদন করলে বকেয়ায় যোগ হবে।
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Section 3: নগদ জমা ─── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-700 text-sm flex items-center gap-2">
            <FiDollarSign className="text-primary" size={15} /> নগদ জমার পরিমাণ
          </p>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">সিস্টেম হিসাব</p>
            <p className="text-sm font-extrabold text-primary">{taka(todayCash)}</p>
          </div>
        </div>

        <input
          type="number" inputMode="numeric"
          value={cashAmount}
          onChange={e => setCashAmount(e.target.value)}
          placeholder={`${parseInt(todayCash) || 0}`}
          className={`w-full border rounded-xl px-4 py-3.5 text-base font-bold text-center focus:outline-none focus:ring-2 transition-colors ${
            hasCashBlocked  ? 'border-red-300 focus:ring-red-200 bg-red-50/30 text-red-700'
            : hasCashMismatch ? 'border-amber-300 focus:ring-amber-200 bg-amber-50/30'
            : 'border-gray-200 focus:ring-primary/20'
          }`}
        />

        {/* Live cash mismatch feedback */}
        {cashAmount !== '' && (
          <>
            {hasCashBlocked ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FiLock className="text-red-500 flex-shrink-0" size={14} />
                  <p className="text-xs font-bold text-red-700">
                    ৳{livePreview.absDiff.toFixed(0)} পার্থক্য — কারণ লিখুন
                  </p>
                </div>
                <textarea
                  value={mismatchExplanation}
                  onChange={e => setMismatchExplanation(e.target.value)}
                  placeholder="যেমন: গ্রাহক ভাঙতি দিতে পারেননি..."
                  rows={2}
                  className="w-full border border-red-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-200 resize-none bg-white"
                />
              </div>
            ) : hasCashMismatch ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
                <FiAlertTriangle className="text-amber-500 flex-shrink-0" size={13} />
                <p className="text-xs text-amber-700">
                  সিস্টেমের চেয়ে{' '}
                  <span className="font-bold">
                    {livePreview.cashDiff > 0 ? `৳${Math.abs(livePreview.cashDiff).toFixed(0)} বেশি` : `৳${Math.abs(livePreview.cashDiff).toFixed(0)} কম`}
                  </span>
                  {' '}দিচ্ছেন
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50 rounded-xl px-3 py-2 flex items-center gap-2">
                <FiCheckCircle className="text-emerald-500" size={13} />
                <p className="text-xs text-emerald-700 font-medium">নগদ মিলছে ✅</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Section 4: বিশেষ নোট ─── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-sm font-bold text-gray-700 mb-2 block">
          বিশেষ নোট <span className="text-gray-400 font-normal text-xs">(ঐচ্ছিক)</span>
        </label>
        <textarea
          value={shortageNote}
          onChange={e => setShortageNote(e.target.value)}
          placeholder="ঘাটতি বা অন্য কোনো সমস্যা থাকলে লিখুন..."
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
        />
      </div>

      {/* ─── Submit Button ─── */}
      <button
        onClick={() => {
          if (checkedIn === false) return toast.error('আগে আজকের চেক-ইন করুন — তারপর হিসাব জমা দেওয়া যাবে।')
          if (!cashAmount) return toast.error('নগদ জমার পরিমাণ দিন')
          setShowConfirm(true)
        }}
        className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
      >
        <FiSend size={17} /> হিসাব পর্যালোচনা করুন
      </button>

      {/* ─── Confirm Modal ─── */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="হিসাব নিশ্চিত করুন" size="lg">
        <div className="space-y-4">

          {/* Cash mismatch in modal */}
          {livePreview.cashMismatch && (
            <div className={`rounded-xl p-3 border ${livePreview.cashBlocked ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                {livePreview.cashBlocked
                  ? <FiLock className="text-red-500" size={14} />
                  : <FiAlertTriangle className="text-amber-500" size={14} />}
                <p className={`text-sm font-bold ${livePreview.cashBlocked ? 'text-red-700' : 'text-amber-700'}`}>
                  নগদ পার্থক্য: {taka(livePreview.absDiff)}
                </p>
              </div>
              <p className={`text-xs ${livePreview.cashBlocked ? 'text-red-600' : 'text-amber-600'}`}>
                সিস্টেম {taka(todayCash)} → আপনি দিচ্ছেন {taka(livePreview.enteredCash)}
              </p>
              {livePreview.cashBlocked && !mismatchExplanation.trim() && (
                <p className="text-xs text-red-500 mt-1 font-medium">⚠️ কারণ না দিলে submit হবে না</p>
              )}
            </div>
          )}

          {/* Items summary table */}
          {livePreview.items.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {['পণ্য','হাতে','বিক্রি','ফেরত','কাল','ঘাটতি'].map(h => (
                      <th key={h} className="px-2 py-2.5 text-left font-bold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {livePreview.items.map((item, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${item.shortage_qty > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-2 py-2 font-semibold text-gray-700 max-w-[80px] truncate">{item.name}</td>
                      <td className="px-2 py-2 text-gray-500">{item.taken_qty}</td>
                      <td className="px-2 py-2 text-emerald-600 font-bold">{item.sold_qty}</td>
                      <td className="px-2 py-2 text-blue-600">{item.returned_qty}</td>
                      <td className="px-2 py-2 text-violet-600">{item.carry_forward_qty}</td>
                      <td className="px-2 py-2">
                        {item.shortage_qty > 0
                          ? <span className="text-red-600 font-extrabold leading-none">
                              {item.shortage_qty}<br/>
                              <span className="text-[9px]">{taka(item.shortage_value)}</span>
                            </span>
                          : <span className="text-emerald-500 font-bold">✅</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Final summary */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="নগদ জমা"   value={taka(livePreview.enteredCash)} color="text-primary"   bg="bg-primary/5" />
            <StatCard label="বাকি দেওয়া" value={taka(todayCredit)}            color="text-amber-600" bg="bg-amber-50" />
            <StatCard label="মোট ঘাটতি" value={taka(totalShortage)}
              color={hasShortage ? 'text-red-600' : 'text-emerald-600'}
              bg={hasShortage ? 'bg-red-50' : 'bg-emerald-50'} />
          </div>

          {hasShortage && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <FiAlertTriangle className="text-red-500 flex-shrink-0" size={13} />
              <p className="text-xs text-red-700">
                <span className="font-bold">{taka(totalShortage)} ঘাটতি</span> — Manager অনুমোদন করলে বকেয়ায় যোগ হবে।
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>সংশোধন করুন</Button>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={livePreview.cashBlocked && !mismatchExplanation.trim()}
              icon={<FiSend size={14} />}
            >
              নিশ্চিত করে জমা দিন
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
