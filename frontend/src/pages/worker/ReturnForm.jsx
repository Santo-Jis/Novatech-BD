// frontend/src/pages/worker/ReturnForm.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiPlus, FiTrash2, FiCamera, FiCheck } from 'react-icons/fi'
import api from '../../api/axios'
import { toast } from 'react-hot-toast'

const REASONS = [
  { value: 'damaged',         label: '⚠️ ক্ষতিগ্রস্ত পণ্য' },
  { value: 'wrong_item',      label: '❌ ভুল পণ্য দেওয়া হয়েছে' },
  { value: 'expired',         label: '📅 মেয়াদোত্তীর্ণ' },
  { value: 'customer_reject', label: '🚫 কাস্টমার নিতে অস্বীকার' },
  { value: 'other',           label: '📝 অন্যান্য' },
]

export default function ReturnForm() {
  const navigate = useNavigate()

  const [type,        setType]        = useState('return')
  const [customers,   setCustomers]   = useState([])
  const [products,    setProducts]    = useState([])
  const [customerId,  setCustomerId]  = useState('')
  const [saleId,      setSaleId]      = useState('')
  const [reason,      setReason]      = useState('')
  const [note,        setNote]        = useState('')
  const [items,       setItems]       = useState([{ product_id: '', qty: 1, reason: '' }])
  const [photos,      setPhotos]      = useState([])
  const [submitting,  setSubmitting]  = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [custRes, prodRes] = await Promise.all([
          api.get('/customers/my'),
          api.get('/products/active'),
        ])
        setCustomers(custRes.data?.data || [])
        setProducts(prodRes.data?.data  || [])
      } catch { toast.error('তথ্য লোড হয়নি।') }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const addItem = () =>
    setItems(prev => [...prev, { product_id: '', qty: 1, reason: '' }])

  const removeItem = (i) =>
    setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateItem = (i, field, value) =>
    setItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item
    ))

  const handlePhoto = async (e) => {
    const files = Array.from(e.target.files)
    if (photos.length + files.length > 4) {
      toast.error('সর্বোচ্চ ৪টি ছবি দেওয়া যাবে।'); return
    }
    // Base64 convert করো
    const converted = await Promise.all(files.map(file =>
      new Promise(res => {
        const reader = new FileReader()
        reader.onload = e => res(e.target.result)
        reader.readAsDataURL(file)
      })
    ))
    setPhotos(prev => [...prev, ...converted])
  }

  const totalValue = items.reduce((sum, item) => {
    if (!item.product_id || !item.qty) return sum
    const prod = products.find(p => p.id === item.product_id)
    if (!prod) return sum
    const price = parseFloat(prod.price || 0)
    return sum + price * parseInt(item.qty)
  }, 0)

  const handleSubmit = async () => {
    if (!customerId) { toast.error('কাস্টমার সিলেক্ট করুন।'); return }
    if (!reason)     { toast.error('কারণ সিলেক্ট করুন।'); return }
    const validItems = items.filter(i => i.product_id && parseInt(i.qty) > 0)
    if (validItems.length === 0) { toast.error('কমপক্ষে একটি পণ্য দিন।'); return }

    setSubmitting(true)
    try {
      await api.post('/return/submit', {
        customer_id: customerId,
        sale_id:     saleId || undefined,
        type, reason, note,
        items: validItems,
        photos
      })
      toast.success(type === 'return' ? 'রিটার্ন রিকোয়েস্ট পাঠানো হয়েছে!' : 'রিপ্লেসমেন্ট রিকোয়েস্ট পাঠানো হয়েছে!')
      navigate('/worker/return-history')
    } catch (e) {
      toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
          <FiArrowLeft className="text-xl text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-800">রিটার্ন / রিপ্লেসমেন্ট</h1>
          <p className="text-xs text-gray-400">নতুন রিকোয়েস্ট</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Type Toggle */}
        <div className="bg-gray-100 rounded-2xl p-1 flex gap-1">
          {[
            { value: 'return',      label: '↩️ রিটার্ন' },
            { value: 'replacement', label: '🔄 রিপ্লেসমেন্ট' }
          ].map(t => (
            <button key={t.value} onClick={() => setType(t.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${type === t.value ? 'bg-white text-indigo-700 shadow' : 'text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* কাস্টমার */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">কাস্টমার *</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">-- কাস্টমার সিলেক্ট করুন --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.shop_name || c.name}</option>
            ))}
          </select>
        </div>

        {/* বিক্রয় রেফারেন্স (optional) */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
            বিক্রয় রেফারেন্স
            <span className="text-gray-400 font-normal ml-1">(ঐচ্ছিক)</span>
          </label>
          <input type="text" value={saleId}
            onChange={e => setSaleId(e.target.value)}
            placeholder="Invoice নম্বর বা ID"
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-indigo-400" />
        </div>

        {/* কারণ */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">কারণ *</label>
          <div className="grid grid-cols-1 gap-2">
            {REASONS.map(r => (
              <button key={r.value} onClick={() => setReason(r.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-all
                  ${reason === r.value
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:border-indigo-200'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                  ${reason === r.value ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}`}>
                  {reason === r.value && <FiCheck className="text-white text-xs" />}
                </div>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* পণ্য তালিকা */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">পণ্য তালিকা *</label>
            <button onClick={addItem}
              className="flex items-center gap-1 text-xs text-indigo-600 font-semibold px-3 py-1.5 bg-indigo-50 rounded-xl">
              <FiPlus /> পণ্য যোগ
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                <div className="flex gap-2 mb-2">
                  <select value={item.product_id}
                    onChange={e => updateItem(i, 'product_id', e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                    <option value="">-- পণ্য --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input type="number" min="1" value={item.qty}
                    onChange={e => updateItem(i, 'qty', e.target.value)}
                    className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-indigo-400 bg-white"
                    placeholder="Qty" />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)}
                      className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl">
                      <FiTrash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalValue > 0 && (
            <div className="mt-2 text-right">
              <span className="text-sm text-gray-500">আনুমানিক মূল্য: </span>
              <span className="font-bold text-indigo-700">
                ৳{totalValue.toLocaleString('bn-BD')}
              </span>
            </div>
          )}
        </div>

        {/* ছবি আপলোড */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
            ছবি প্রমাণ
            <span className="text-gray-400 font-normal ml-1">(সর্বোচ্চ ৪টি)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative w-20 h-20">
                <img src={p} alt="" className="w-full h-full object-cover rounded-xl border" />
                <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  ×
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                <FiCamera className="text-gray-400 text-xl mb-1" />
                <span className="text-xs text-gray-400">যোগ করুন</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
              </label>
            )}
          </div>
        </div>

        {/* নোট */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
            অতিরিক্ত নোট
            <span className="text-gray-400 font-normal ml-1">(ঐচ্ছিক)</span>
          </label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="বিস্তারিত বিবরণ..."
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
      </div>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
            text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2
            shadow-lg transition-all active:scale-95">
          {submitting
            ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> পাঠানো হচ্ছে...</>
            : type === 'return' ? '↩️ রিটার্ন রিকোয়েস্ট পাঠান' : '🔄 রিপ্লেসমেন্ট রিকোয়েস্ট পাঠান'
          }
        </button>
      </div>
    </div>
  )
}
