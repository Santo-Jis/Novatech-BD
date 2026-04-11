import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAppStore } from '../../store/app.store'
import toast from 'react-hot-toast'
import { FiMinus, FiPlus, FiSend, FiMapPin } from 'react-icons/fi'

// ============================================================
// Route Select Page
// ============================================================
export function RouteSelect() {
  const navigate          = useNavigate()
  const { setSelectedRoute } = useAppStore()
  const [routes,  setRoutes]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/routes')
      .then(res => setRoutes(res.data.data))
      .finally(() => setLoading(false))
  }, [])

  const selectRoute = (route) => {
    setSelectedRoute(route)
    navigate('/worker/customers')
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800">রুট নির্বাচন করুন</h2>
      <p className="text-sm text-gray-500">আজকের রুট সিলেক্ট করুন</p>

      {routes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FiMapPin className="text-4xl mx-auto mb-2" />
          <p>কোনো রুট নেই।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(route => (
            <button
              key={route.id}
              onClick={() => selectRoute(route)}
              className="w-full bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-primary hover:shadow-md transition-all text-left active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🗺️</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800">{route.name}</p>
                  {route.description && <p className="text-xs text-gray-500 mt-0.5">{route.description}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>SR: {route.worker_count || 0}</span>
                    <span>দোকান: {route.customer_count || 0}</span>
                  </div>
                </div>
                <span className="text-primary text-xl">→</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Order Form Page
// ============================================================
export function OrderForm() {
  const navigate          = useNavigate()
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [todayOrder, setTodayOrder] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/products?is_active=true'),
      api.get('/orders/today')
    ]).then(([prodRes, orderRes]) => {
      setProducts(prodRes.data.data)
      setTodayOrder(orderRes.data.data)
    }).finally(() => setLoading(false))
  }, [])

  const updateQty = (productId, delta) => {
    setSelected(prev => {
      const curr = prev[productId] || 0
      const next = Math.max(0, curr + delta)
      if (next === 0) {
        const { [productId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: next }
    })
  }

  const totalItems = Object.keys(selected).length
  const totalAmount = products
    .filter(p => selected[p.id])
    .reduce((sum, p) => sum + p.price * (selected[p.id] || 0), 0)

  const submit = async () => {
    if (totalItems === 0) { toast.error('কমপক্ষে একটি পণ্য সিলেক্ট করুন।'); return }
    setSubmitting(true)
    try {
      const items = Object.entries(selected).map(([product_id, qty]) => ({ product_id, qty }))
      await api.post('/orders', { items })
      toast.success('অর্ডার পাঠানো হয়েছে। Manager এর অনুমোদনের অপেক্ষায়।')
      navigate('/worker/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  if (todayOrder) {
    return (
      <div className="p-4 animate-fade-in">
        <h2 className="text-xl font-bold text-gray-800 mb-4">আজকের অর্ডার</h2>
        <div className={`rounded-2xl p-4 border ${todayOrder.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="font-semibold text-gray-800">
            {todayOrder.status === 'approved' ? '✅ অনুমোদিত' : '⏳ অপেক্ষায়'}
          </p>
          <p className="text-sm text-gray-600 mt-1">মোট: ৳{parseInt(todayOrder.total_amount || 0).toLocaleString()}</p>
          <div className="mt-3 space-y-1">
            {todayOrder.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.product_name}</span>
                <span className="font-semibold">{item.approved_qty || item.requested_qty} পিস</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => navigate(-1)} className="mt-4 w-full py-3 border border-gray-200 rounded-2xl text-gray-600">
          পিছনে যান
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-32">
      <h2 className="text-xl font-bold text-gray-800">পণ্য অর্ডার</h2>
      <p className="text-sm text-gray-500">প্রয়োজনীয় পণ্য ও পরিমাণ সিলেক্ট করুন</p>

      <div className="space-y-3">
        {products.map(product => {
          const qty          = selected[product.id] || 0
          const available    = product.available_stock
          const isLowStock   = available <= 10

          return (
            <div key={product.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                    <span className="text-gray-200">|</span>
                    <p className="text-xs font-bold text-secondary">৳{product.price}</p>
                    <span className="text-gray-200">|</span>
                    <p className={`text-xs ${isLowStock ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                      স্টক: {available}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(product.id, -1)}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 active:scale-90 transition-transform"
                  >
                    <FiMinus className="text-sm" />
                  </button>
                  <span className={`w-8 text-center font-bold text-sm ${qty > 0 ? 'text-primary' : 'text-gray-300'}`}>
                    {qty}
                  </span>
                  <button
                    onClick={() => updateQty(product.id, 1)}
                    disabled={qty >= available}
                    className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary disabled:opacity-30 active:scale-90 transition-transform"
                  >
                    <FiPlus className="text-sm" />
                  </button>
                </div>
              </div>

              {qty > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                  <span className="text-gray-500">{qty} × ৳{product.price}</span>
                  <span className="font-bold text-secondary">= ৳{(qty * product.price).toLocaleString()}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Fixed bottom */}
      {totalItems > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-600">{totalItems} ধরনের পণ্য</span>
              <span className="font-bold text-secondary">মোট: ৳{totalAmount.toLocaleString()}</span>
            </div>
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend />}
              {submitting ? 'পাঠানো হচ্ছে...' : 'অর্ডার পাঠান'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RouteSelect
