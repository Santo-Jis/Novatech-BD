import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { FiShoppingCart, FiPlus, FiMinus, FiSend } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function OrderForm() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [products, setProducts] = useState([])
  const [quantities, setQuantities] = useState({})
  const [loading, setLoading] = useState(true)
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
    return sum + (quantities[p.id] || 0) * parseFloat(p.price || 0)
  }, 0)

  const handleSubmit = async () => {
    const items = products
      .filter(p => quantities[p.id] > 0)
      .map(p => ({ product_id: p.id, requested_qty: quantities[p.id], price: p.price }))

    if (items.length === 0) return toast.error('কোনো পণ্য সিলেক্ট করুন')

    setSubmitting(true)
    try {
      await api.post('/orders', {
        route_id: selectedRoute?.id,
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
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 text-sm">{p.name}</h3>
                <p className="text-xs text-gray-500">৳{parseFloat(p.price || 0).toLocaleString()} / {p.unit || 'পিস'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => updateQty(p.id, -1)}
                  className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <FiMinus className="text-sm" />
                </button>
                <span className="w-8 text-center font-bold text-gray-800">{quantities[p.id] || 0}</span>
                <button onClick={() => updateQty(p.id, 1)}
                  className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <FiPlus className="text-white text-sm" />
                </button>
              </div>
            </div>
            {(quantities[p.id] || 0) > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between">
                <span className="text-xs text-gray-500">মোট</span>
                <span className="text-xs font-bold text-primary">৳{((quantities[p.id] || 0) * parseFloat(p.price || 0)).toLocaleString()}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-gray-500">মোট অর্ডার</span>
          <span className="font-bold text-primary text-lg">৳{totalAmount.toLocaleString()}</span>
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
          {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend />}
          অর্ডার পাঠান
        </button>
      </div>
    </div>
  )
}
