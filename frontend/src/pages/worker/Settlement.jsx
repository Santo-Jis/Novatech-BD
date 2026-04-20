import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import {
  FiDollarSign, FiSend, FiPackage, FiAlertTriangle,
  FiCheckCircle, FiChevronDown, FiChevronUp, FiInfo
} from 'react-icons/fi'
import toast from 'react-hot-toast'

function SummaryCard({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold text-sm ${color}`}>{value}</p>
    </div>
  )
}

function ReturnRow({ item, returnedQty, onChange }) {
  const maxReturn = Math.max(0, item.taken_qty - item.sold_qty - item.replacement_qty)
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          নেওয়া: {item.taken_qty} | বিক্রি: {item.sold_qty} | রিপ্লেস: {item.replacement_qty}
        </p>
        {maxReturn > 0 ? (
          <p className="text-xs text-amber-600 mt-0.5">সর্বোচ্চ ফেরত: {maxReturn} পিস</p>
        ) : (
          <p className="text-xs text-emerald-600 mt-0.5">✅ সব বিক্রি/রিপ্লেস হয়েছে</p>
        )}
      </div>
      <div className="flex-shrink-0 w-24">
        {maxReturn > 0 ? (
          <input
            type="number" min="0" max={maxReturn} value={returnedQty}
            onChange={e => onChange(item.product_id, Math.min(maxReturn, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="0"
          />
        ) : (
          <div className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm text-center text-gray-400">0</div>
        )}
      </div>
    </div>
  )
}

export default function Settlement() {
  const [data,             setData]             = useState(null)
  const [orderItems,       setOrderItems]       = useState([])
  const [returnedQtys,     setReturnedQtys]     = useState({})
  const [cashAmount,       setCashAmount]       = useState('')
  const [todayCash,        setTodayCash]        = useState(0)
  const [shortageNote,     setShortageNote]     = useState('')
  const [loading,          setLoading]          = useState(true)
  const [submitting,       setSubmitting]       = useState(false)
  const [showConfirm,      setShowConfirm]      = useState(false)
  const [preview,          setPreview]          = useState(null)
  const [showReturnHelp,   setShowReturnHelp]   = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryRes, orderRes] = await Promise.all([
          api.get('/settlements/my'),
          api.get('/orders/today')
        ])

        const settlements = summaryRes.data.data
        const todayStr    = new Date().toISOString().split('T')[0]
        const todaySett   = Array.isArray(settlements)
          ? settlements.find(s => s.settlement_date === todayStr)
          : null

        if (todaySett) {
          setAlreadySubmitted(true)
          setData(todaySett)
        } else {
          setData(Array.isArray(settlements) ? settlements[0] : settlements)
        }

        // আজকের sale summary থেকে sold_qty এবং নগদ সংগ্রহ আনা
        let salesMap = {}
        try {
          const salesRes = await api.get('/sales/today-summary')
          const items = salesRes.data.data?.sales?.items_sold || []
          items.forEach(it => { salesMap[it.product_id] = it.qty })
          const cashReceived = parseFloat(salesRes.data.data?.sales?.cash_received || 0)
          setTodayCash(cashReceived)
        } catch {}

        const order = orderRes.data.data
        if (order?.items) {
          const mapped = order.items.map(i => ({
            product_id:      i.product_id,
            name:            i.product_name || i.name,
            taken_qty:       i.approved_qty || i.requested_qty || 0,
            sold_qty:        salesMap[i.product_id] || 0,
            replacement_qty: 0,
            price:           parseFloat(i.price) || 0,
          }))
          setOrderItems(mapped)
          const initQtys = {}
          mapped.forEach(it => { initQtys[it.product_id] = 0 })
          setReturnedQtys(initQtys)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleReturnChange = (productId, qty) => {
    setReturnedQtys(prev => ({ ...prev, [productId]: qty }))
  }

  const calcPreview = () => {
    let totalShortage = 0
    const items = orderItems.map(item => {
      const returned  = returnedQtys[item.product_id] || 0
      const accounted = item.sold_qty + item.replacement_qty + returned
      const shortage  = Math.max(0, item.taken_qty - accounted)
      const sVal      = shortage * item.price
      totalShortage  += sVal
      return { ...item, returned_qty: returned, shortage_qty: shortage, shortage_value: sVal }
    })
    const systemCash   = alreadySubmitted ? parseFloat(data?.cash_collected || 0) : todayCash
    const enteredCash  = parseFloat(cashAmount || 0)
    const cashDiff     = Math.abs(enteredCash - systemCash)
    const cashMismatch = cashDiff > 1
    return { items, totalShortage, systemCash, enteredCash, cashDiff, cashMismatch }
  }

  const handleReview = () => {
    if (!cashAmount) return toast.error('নগদ জমার পরিমাণ দিন')
    setPreview(calcPreview())
    setShowConfirm(true)
  }

  const handleSubmit = async () => {
    if (!preview) return
    setSubmitting(true)
    try {
      const returnedItems = Object.entries(returnedQtys)
        .filter(([, qty]) => qty > 0)
        .map(([product_id, qty]) => ({ product_id, qty }))

      await api.post('/settlements', {
        cash_collected: parseFloat(cashAmount),
        returned_items: returnedItems,
        shortage_note:  shortageNote || undefined,
      })
      toast.success('হিসাব জমা দেওয়া হয়েছে ✅ Manager এর অনুমোদনের অপেক্ষায়।')
      setShowConfirm(false)
      setAlreadySubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (alreadySubmitted) {
    const s = data
    return (
      <div className="p-4 space-y-4">
        <h2 className="font-bold text-gray-800 text-lg">হিসাব জমা</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
          <FiCheckCircle className="text-emerald-500 text-4xl mx-auto mb-3" />
          <p className="font-bold text-emerald-700 text-lg">আজকের হিসাব জমা দেওয়া হয়েছে</p>
          <p className="text-sm text-emerald-600 mt-1">Manager এর অনুমোদনের অপেক্ষায় আছে</p>
        </div>
        {s && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-semibold text-gray-700 text-sm">জমার সারসংক্ষেপ</p>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="মোট বিক্রয়"  value={`৳${parseInt(s.total_sales_amount || s.total_sales || 0).toLocaleString()}`} color="text-secondary" />
              <SummaryCard label="নগদ সংগ্রহ"  value={`৳${parseInt(s.cash_collected || 0).toLocaleString()}`} color="text-primary" />
              <SummaryCard label="বাকি দেওয়া"   value={`৳${parseInt(s.credit_given || 0).toLocaleString()}`} color="text-amber-600" />
              <SummaryCard label="ঘাটতি মূল্য"  value={`৳${parseInt(s.shortage_qty_value || 0).toLocaleString()}`}
                color={parseFloat(s.shortage_qty_value) > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>
            <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold mt-1
              ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
              : s.status === 'disputed' ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'}`}>
              {s.status === 'approved' ? '✅ অনুমোদিত'
               : s.status === 'disputed' ? '⚠️ ঘাটতি চিহ্নিত'
               : '⏳ অপেক্ষমান'}
            </span>
          </div>
        )}
      </div>
    )
  }

  const systemCash  = parseFloat(data?.cash_collected || 0)
  const totalSales  = parseFloat(data?.total_sales || data?.total_sales_amount || 0)
  const creditGiven = parseFloat(data?.credit_given || 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-gray-800 text-lg">হিসাব জমা</h2>

      {/* আজকের বিক্রয় সারাংশ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">আজকের বিক্রয়</p>
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="মোট বিক্রয়" value={`৳${parseInt(totalSales).toLocaleString()}`}   color="text-secondary" />
          <SummaryCard label="নগদ সংগ্রহ" value={`৳${parseInt(systemCash).toLocaleString()}`}  color="text-primary" />
          <SummaryCard label="বাকি দেওয়া"  value={`৳${parseInt(creditGiven).toLocaleString()}`} color="text-amber-600" />
        </div>
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
          <FiInfo size={11} /> এই তথ্য বিক্রয় রেকর্ড থেকে স্বয়ংক্রিয়ভাবে আসছে
        </p>
      </div>

      {/* ফেরত পণ্যের ইনপুট */}
      {orderItems.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <button onClick={() => setShowReturnHelp(v => !v)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiPackage className="text-primary" />
              <p className="font-semibold text-gray-700 text-sm">ফেরত পণ্যের পরিমাণ</p>
            </div>
            {showReturnHelp ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
          </button>
          {showReturnHelp && (
            <p className="text-xs text-gray-400 mt-2 mb-1 bg-blue-50 rounded-xl p-2">
              যে পণ্য বিক্রি হয়নি ও রিপ্লেসমেন্টে যায়নি, তার পরিমাণ দিন।
              না দিলে ঘাটতি হিসেবে ধরা হবে।
            </p>
          )}
          <div className="mt-3">
            {orderItems.map(item => (
              <ReturnRow
                key={item.product_id}
                item={item}
                returnedQty={returnedQtys[item.product_id] || 0}
                onChange={handleReturnChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* নগদ জমার ইনপুট */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-sm font-semibold text-gray-700 mb-1 block">নগদ জমার পরিমাণ (৳)</label>
        <p className="text-xs text-gray-400 mb-3">
          সিস্টেম হিসাব: <span className="font-bold text-primary">৳{parseInt(systemCash).toLocaleString()}</span>
        </p>
        <input
          type="number" value={cashAmount}
          onChange={e => setCashAmount(e.target.value)}
          placeholder={`${parseInt(systemCash) || 0}`}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {cashAmount && Math.abs(parseFloat(cashAmount) - systemCash) > 1 && (
          <div className="mt-2 flex items-start gap-2 bg-amber-50 rounded-xl p-3">
            <FiAlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={14} />
            <p className="text-xs text-amber-700">
              সিস্টেমের নগদ ({parseInt(systemCash).toLocaleString()} ৳) এর সাথে মিলছে না।
              পার্থক্য: ৳{Math.abs(parseFloat(cashAmount) - systemCash).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* ঘাটতির নোট */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-sm font-semibold text-gray-700 mb-1 block">
          বিশেষ নোট <span className="text-gray-400 font-normal">(ঐচ্ছিক)</span>
        </label>
        <textarea
          value={shortageNote} onChange={e => setShortageNote(e.target.value)}
          placeholder="ঘাটতি বা অন্য কোনো সমস্যা থাকলে এখানে লিখুন..."
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>

      <button
        onClick={handleReview}
        className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <FiSend size={16} /> হিসাব পর্যালোচনা করুন
      </button>

      {/* Confirmation Modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="হিসাব নিশ্চিত করুন" size="lg">
        {preview && (
          <div className="space-y-4">

            {preview.cashMismatch && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <FiAlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700">নগদ মিলছে না!</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    সিস্টেম: ৳{parseInt(preview.systemCash).toLocaleString()} —
                    আপনার দেওয়া: ৳{parseInt(preview.enteredCash).toLocaleString()} —
                    পার্থক্য: ৳{preview.cashDiff.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {preview.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {['পণ্য', 'নেওয়া', 'বিক্রি', 'রিপ্লেস', 'ফেরত', 'ঘাটতি'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-2 font-medium text-gray-700 max-w-[90px] truncate">{item.name}</td>
                        <td className="px-2 py-2 text-gray-600">{item.taken_qty}</td>
                        <td className="px-2 py-2 text-secondary font-semibold">{item.sold_qty}</td>
                        <td className="px-2 py-2 text-purple-600">{item.replacement_qty}</td>
                        <td className="px-2 py-2 text-blue-600">{item.returned_qty}</td>
                        <td className="px-2 py-2">
                          {item.shortage_qty > 0
                            ? <span className="text-red-600 font-bold">{item.shortage_qty} (৳{item.shortage_value})</span>
                            : <span className="text-emerald-600">✅</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="নগদ জমা"   value={`৳${parseInt(preview.enteredCash).toLocaleString()}`} color="text-primary" />
              <SummaryCard label="মোট ঘাটতি" value={`৳${parseInt(preview.totalShortage).toLocaleString()}`}
                color={preview.totalShortage > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>

            {preview.totalShortage > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <FiAlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
                <p className="text-xs text-red-700">
                  <span className="font-bold">৳{parseInt(preview.totalShortage).toLocaleString()} ঘাটতি</span> শনাক্ত।
                  Manager অনুমোদন করলে আপনার বকেয়ায় যোগ হবে।
                </p>
              </div>
            )}

            {shortageNote && (
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-blue-700"><span className="font-semibold">নোট:</span> {shortageNote}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>সংশোধন করুন</Button>
              <Button onClick={handleSubmit} loading={submitting} icon={<FiSend size={14} />}>
                নিশ্চিত করে জমা দিন
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
