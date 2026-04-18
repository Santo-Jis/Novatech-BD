import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { FiShoppingCart, FiPlus, FiMinus, FiSend, FiPackage, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import toast from 'react-hot-toast'

// ─── চূড়ান্ত মূল্য গণনা ───────────────────────────────────
function calcFinalPrice(p) {
  const price    = parseFloat(p.price)    || 0
  const discount = parseFloat(p.discount) || 0
  const vat      = parseFloat(p.vat)      || 0
  const tax      = parseFloat(p.tax)      || 0
  const discAmt  = p.discount_type === 'percent' ? (price * discount) / 100 : discount
  const after    = Math.max(0, price - discAmt)
  return after + (after * vat / 100) + (after * tax / 100)
}

// ─── একটি পণ্য কার্ড ──────────────────────────────────────
function ProductCard({ p, qty, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const finalPrice  = calcFinalPrice(p)
  const hasDiscount = parseFloat(p.discount) > 0
  const hasVat      = parseFloat(p.vat)      > 0
  const hasTax      = parseFloat(p.tax)      > 0
  const hasExtras   = hasDiscount || hasVat || hasTax || p.description

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${qty > 0 ? 'ring-2 ring-primary/30' : ''}`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* ছবি */}
          {p.image_url ? (
            <img
              src={p.image_url}
              alt={p.name}
              className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FiPackage className="text-gray-400" size={22} />
            </div>
          )}

          {/* নাম ও মূল্য */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm leading-tight">{p.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {hasDiscount ? (
                <>
                  <span className="text-xs text-gray-400 line-through">৳{parseFloat(p.price).toLocaleString()}</span>
                  <span className="text-sm font-bold text-secondary">
                    ৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })} / {p.unit || 'pcs'}
                  </span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    ছাড় {p.discount_type === 'percent' ? `${p.discount}%` : `৳${p.discount}`}
                  </span>
                </>
              ) : (
                <span className="text-sm font-bold text-secondary">
                  ৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })} / {p.unit || 'pcs'}
                </span>
              )}
              {hasVat && (
                <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">VAT {p.vat}%</span>
              )}
              {hasTax && (
                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Tax {p.tax}%</span>
              )}
            </div>
          </div>

          {/* কাউন্টার */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onUpdate(p.id, -1)} disabled={qty === 0}
              className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95">
              <FiMinus size={13} />
            </button>
            <span className={`w-7 text-center font-bold text-sm ${qty > 0 ? 'text-primary' : 'text-gray-300'}`}>{qty}</span>
            <button onClick={() => onUpdate(p.id, 1)}
              className="w-8 h-8 bg-primary rounded-full flex items-center justify-center active:scale-95">
              <FiPlus className="text-white" size={13} />
            </button>
          </div>
        </div>

        {/* সাবটোটাল */}
        {qty > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between">
            <span className="text-xs text-gray-500">মোট</span>
            <span className="text-xs font-bold text-primary">
              ৳{(qty * finalPrice).toLocaleString('en', { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* বিবরণ টগল */}
        {hasExtras && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-primary flex items-center gap-1"
          >
            {expanded ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
            {expanded ? 'কম দেখুন' : 'বিস্তারিত দেখুন'}
          </button>
        )}
      </div>

      {/* Expanded: description */}
      {expanded && p.description && (
        <div className="px-4 pb-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 font-medium">বিবরণ</p>
            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{p.description}</p>
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
  const [quantities, setQuantities] = useState({})
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/products')
      .then(res => setProducts(res.data.data || []))
      .finally(() => setLoading(false))
  }, [])

  const updateQty = (id, delta) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta)
    }))
  }

  const totalAmount = products.reduce((sum, p) => {
    return sum + (quantities[p.id] || 0) * calcFinalPrice(p)
  }, 0)

  const handleSubmit = async () => {
    const items = products
      .filter(p => quantities[p.id] > 0)
      .map(p => ({ product_id: p.id, requested_qty: quantities[p.id], price: calcFinalPrice(p) }))

    if (items.length === 0) return toast.error('কোনো পণ্য সিলেক্ট করুন')

    setSubmitting(true)
    try {
      await api.post('/orders', {
        route_id:     selectedRoute?.id,
        items,
        total_amount: totalAmount
      })
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
    <div className="p-4 space-y-4 pb-32">
      <div>
        <h2 className="font-bold text-gray-800 text-lg">অর্ডার দিন</h2>
        <p className="text-xs text-gray-500">{selectedRoute?.name || 'রুট সিলেক্ট করুন'}</p>
      </div>

      <div className="space-y-3">
        {products.map(p => (
          <ProductCard
            key={p.id}
            p={p}
            qty={quantities[p.id] || 0}
            onUpdate={updateQty}
          />
        ))}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-gray-500">মোট অর্ডার</span>
          <span className="font-bold text-primary text-lg">
            ৳{totalAmount.toLocaleString('en', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
          {submitting
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiSend />}
          অর্ডার পাঠান
        </button>
      </div>
    </div>
  )
}
