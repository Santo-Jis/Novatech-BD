import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api, { isNetworkError } from '../../api/axios'
import { enqueue, saveCache, getCache } from '../../api/offlineQueue'
import { useProductFilter } from '../../components/worker/ProductFilterBar'
import OrderFilterBar from '../../components/worker/OrderFilterBar'
import { FiPlus, FiMinus, FiSend, FiPackage, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import toast from 'react-hot-toast'

// ─── মূল্য বিস্তারিত (দাম, ছাড়, VAT, Tax, চূড়ান্ত) ──────────
function getPriceBreakdown(p) {
  const price    = parseFloat(p.price)    || 0
  const discount = parseFloat(p.discount) || 0
  const vat      = parseFloat(p.vat)      || 0
  const tax      = parseFloat(p.tax)      || 0
  const discAmt  = p.discount_type === 'percent' ? (price * discount) / 100 : discount
  const afterDiscount = Math.max(0, price - discAmt)
  const vatAmt   = afterDiscount * vat / 100
  const taxAmt   = afterDiscount * tax / 100
  const final    = afterDiscount + vatAmt + taxAmt
  return { price, discAmt, afterDiscount, vatAmt, taxAmt, final }
}

// ─── চূড়ান্ত মূল্য গণনা ───────────────────────────────────
function calcFinalPrice(p) {
  return getPriceBreakdown(p).final
}

// ─── একটি পণ্য কার্ড ──────────────────────────────────────
// ডিজাইন: বড় (৪৪px) + / − বাটন, বাছাই করা পণ্য নীল বর্ডারে আলাদা, মোট টাকা সাথেই দেখায়।
function ProductCard({ p, qty, onUpdate, onSetQty }) {
  const [expanded, setExpanded] = useState(false)
  const breakdown    = getPriceBreakdown(p)
  const finalPrice   = breakdown.final
  const hasDiscount  = parseFloat(p.discount) > 0
  const hasVat       = parseFloat(p.vat)      > 0
  const hasTax       = parseFloat(p.tax)      > 0
  const hasPriceInfo = hasDiscount || hasVat || hasTax
  const hasExtras    = hasPriceInfo || p.description
  const selected     = qty > 0
  const money        = (n) => n.toLocaleString('en', { maximumFractionDigits: 2 })

  return (
    <div className={`rounded-2xl border-[1.5px] transition-colors ${selected ? 'bg-primary/5 border-primary' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-3 p-3">
        {/* ছবি */}
        {p.image_url ? (
          <img
            src={p.image_url}
            alt=""
            loading="lazy"
            className="w-12 h-12 rounded-xl object-cover border border-gray-100 flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiPackage className="text-primary" size={22} />
          </div>
        )}

        {/* নাম ও মূল্য */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-base leading-snug break-words">{p.name}</p>
          <div className="flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap">
            {hasDiscount && (
              <span className="text-xs text-gray-500 line-through">৳{parseFloat(p.price).toLocaleString()}</span>
            )}
            <span className="text-[15px] font-bold text-secondary">
              ৳{money(finalPrice)}
              <span className="text-xs font-medium text-gray-500"> / {p.unit || 'pcs'}</span>
            </span>
            {hasDiscount && (
              <span className="text-[11px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
                ছাড় {p.discount_type === 'percent' ? `${p.discount}%` : `৳${p.discount}`}
              </span>
            )}
            {hasVat && (
              <span className="text-[11px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full">VAT {p.vat}%</span>
            )}
            {hasTax && (
              <span className="text-[11px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">Tax {p.tax}%</span>
            )}
          </div>
          {selected && (
            <p className="text-sm font-semibold text-primary mt-0.5">মোট ৳{money(qty * finalPrice)}</p>
          )}
        </div>

        {/* কাউন্টার — পরিমাণ সরাসরি টাইপও করা যায় */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onUpdate(p.id, -1)}
            disabled={qty === 0}
            aria-label="কমান"
            className={`w-11 h-11 rounded-full flex items-center justify-center active:scale-95 ${
              qty === 0 ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 text-primary'
            }`}
          >
            <FiMinus size={18} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="পরিমাণ"
            value={qty === 0 ? '' : qty}
            placeholder="0"
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '')
              onSetQty(p.id, digits === '' ? 0 : parseInt(digits, 10))
            }}
            className={`w-11 h-11 text-center font-bold text-base rounded-xl border-[1.5px] outline-none focus:border-primary focus:bg-white
              ${selected ? 'text-primary border-primary/40 bg-white' : 'text-gray-500 border-gray-200 bg-gray-50'}`}
          />
          <button
            type="button"
            onClick={() => onUpdate(p.id, 1)}
            aria-label="বাড়ান"
            className="w-11 h-11 bg-primary rounded-full flex items-center justify-center active:scale-95"
          >
            <FiPlus className="text-white" size={18} />
          </button>
        </div>
      </div>

      {/* বিবরণ টগল */}
      {hasExtras && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="ml-3 mb-1 h-9 px-1 text-sm text-primary font-medium flex items-center gap-1"
        >
          {expanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
          {expanded ? 'কম দেখুন' : 'বিস্তারিত দেখুন'}
        </button>
      )}

      {/* Expanded: মূল্য বিস্তারিত + বিবরণ */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="bg-white/80 border border-gray-200 rounded-xl p-3 space-y-2">
            {hasPriceInfo && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">মূল্য</span>
                  <span className="text-gray-800 font-medium">৳{money(breakdown.price)}</span>
                </div>
                {hasDiscount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">ছাড়</span>
                    <span className="text-green-700 font-medium">− ৳{money(breakdown.discAmt)}</span>
                  </div>
                )}
                {hasVat && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">VAT ({p.vat}%)</span>
                    <span className="text-gray-800 font-medium">+ ৳{money(breakdown.vatAmt)}</span>
                  </div>
                )}
                {hasTax && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax ({p.tax}%)</span>
                    <span className="text-gray-800 font-medium">+ ৳{money(breakdown.taxAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                  <span className="text-gray-700 font-medium">সর্বমোট (প্রতি {p.unit || 'pcs'})</span>
                  <span className="text-primary font-bold">৳{money(breakdown.final)}</span>
                </div>
              </div>
            )}
            {p.description && (
              <div className={hasPriceInfo ? 'pt-2 border-t border-gray-200' : ''}>
                <p className="text-sm text-gray-500 mb-1 font-medium">বিবরণ</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{p.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN ──────────────────────────────────────────────────
export default function OrderForm() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [products,   setProducts]   = useState([])
  const productFilter = useProductFilter(products)   // ক্যাটাগরি / কোম্পানি / সার্চ ফিল্টার
  const [quantities, setQuantities] = useState({})
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // ✅ F3: পণ্য তালিকা cache-first — অফলাইনে থাকলে আজকের সংরক্ষিত তালিকা দেখাও
  // (এটা ছাড়া অফলাইনে Order পেজ খুললে পণ্য তালিকা খালি থাকতো, queue করার মতো কিছুই বাছাই করা যেত না)
  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    if (!navigator.onLine) {
      const cached = await getCache('products_catalog')
      if (cached?.isToday) {
        setProducts(cached.data)
      } else {
        toast.error('পণ্যের তালিকা সংরক্ষিত নেই। একবার অনলাইনে থাকা অবস্থায় এই পেজ খুলুন।', { duration: 5000 })
      }
      setLoading(false)
      return
    }

    try {
      const res  = await api.get('/products')
      const data = res.data.data || []
      setProducts(data)
      saveCache('products_catalog', data)
    } catch (err) {
      if (isNetworkError(err)) {
        const cached = await getCache('products_catalog')
        if (cached?.isToday) {
          setProducts(cached.data)
          toast('নেটওয়ার্ক ধীর — সংরক্ষিত পণ্য তালিকা দেখানো হচ্ছে', { icon: '📶', duration: 3000 })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const updateQty = (id, delta) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta)
    }))
  }

  // সরাসরি সংখ্যা টাইপ করে পরিমাণ বসানোর জন্য (৫০ বার + চাপার বদলে একবারে "৫০" লেখা যায়)
  const setQty = (id, value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    setQuantities(prev => ({ ...prev, [id]: n }))
  }

  const totalAmount = products.reduce((sum, p) => {
    return sum + (quantities[p.id] || 0) * calcFinalPrice(p)
  }, 0)

  // নিচের কার্ট বারের জন্য: কয়টি পণ্য, মোট কত পিস
  const selectedCount = products.filter(p => (quantities[p.id] || 0) > 0).length
  const totalPieces   = products.reduce((sum, p) => sum + (quantities[p.id] || 0), 0)
  const clearAll      = () => setQuantities({})

  const handleSubmit = async () => {
    const items = products
      .filter(p => quantities[p.id] > 0)
      .map(p => ({ product_id: p.id, requested_qty: quantities[p.id], price: calcFinalPrice(p) }))

    if (items.length === 0) return toast.error('কোনো পণ্য সিলেক্ট করুন')

    const payload = {
      route_id:     selectedRoute?.id,
      items,
      total_amount: totalAmount,
    }

    setSubmitting(true)

    // ✅ F3: অফলাইনে থাকলে queue-তে জমা রাখো — নেটওয়ার্ক ফিরলে syncService.js
    // (ORDER case আগে থেকেই রেডি ছিল) নিজে থেকে সার্ভারে পাঠাবে
    if (!navigator.onLine) {
      try {
        await enqueue({ type: 'ORDER', payload })
        toast.success('✅ অর্ডার offline এ সংরক্ষিত! নেটওয়ার্ক ফিরলে sync হবে।', {
          duration: 5000, icon: '📶',
        })
        navigate('/worker/dashboard')
      } catch {
        toast.error('Offline save ব্যর্থ হয়েছে।')
      } finally {
        setSubmitting(false)
      }
      return
    }

    try {
      await api.post('/orders', payload)
      toast.success('অর্ডার পাঠানো হয়েছে ✅')
      navigate('/worker/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'অর্ডার হয়নি')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="px-4 pt-3 pb-52">
      <div className="mb-3">
        <h2 className="font-bold text-gray-900 text-xl">অর্ডার দিন</h2>
        <p className="text-sm text-gray-600">{selectedRoute?.name || 'রুট সিলেক্ট করুন'}</p>
      </div>

      {/* সার্চ + ক্যাটাগরি: স্ক্রল করলেও ওপরে থাকে */}
      <OrderFilterBar filter={productFilter} total={products.length} />

      <div className="space-y-2 mt-3">
        {productFilter.filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            <p className="text-base text-gray-700 font-medium">কোনো পণ্য পাওয়া যায়নি</p>
            <p className="text-sm text-gray-500 mt-1">অন্য নামে খুঁজুন বা ফিল্টার মুছে দিন।</p>
            {productFilter.hasActiveFilter && (
              <button
                type="button"
                onClick={productFilter.clear}
                className="mt-4 h-11 px-5 rounded-xl border border-primary text-primary font-semibold"
              >
                ফিল্টার মুছুন
              </button>
            )}
          </div>
        )}
        {productFilter.filtered.map(p => (
          <ProductCard
            key={p.id}
            p={p}
            qty={quantities[p.id] || 0}
            onUpdate={updateQty}
            onSetQty={setQty}
          />
        ))}
      </div>

      {/* Fixed bottom bar — নিচের navigation bar এর উপরে (bottom-20 + z-40) */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-white border-t border-gray-200 px-4 pt-3 pb-3 shadow-[0_-4px_14px_rgba(20,30,60,0.08)]">
        <div className="flex justify-between items-center mb-2 min-h-[28px]">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {selectedCount > 0 ? (
              <>
                <span>{selectedCount} টি পণ্য · {totalPieces} পিস</span>
                <button type="button" onClick={clearAll} className="text-danger font-semibold h-8 px-1">
                  মুছুন
                </button>
              </>
            ) : (
              <span>পণ্যের পাশে + চেপে যোগ করুন</span>
            )}
          </div>
          <span className="font-bold text-primary text-xl">
            ৳{totalAmount.toLocaleString('en', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || selectedCount === 0}
          className={`w-full h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors ${
            selectedCount === 0 ? 'bg-gray-200 text-gray-500' : 'bg-primary text-white active:bg-primary-dark'
          }`}
        >
          {submitting
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiSend />}
          অর্ডার পাঠান
        </button>
      </div>
    </div>
  )
}
