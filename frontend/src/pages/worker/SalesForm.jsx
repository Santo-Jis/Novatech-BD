import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAppStore } from '../../store/app.store'
import toast from 'react-hot-toast'
import { FiMinus, FiPlus, FiCheck } from 'react-icons/fi'

export default function SalesForm() {
  const { id: customerId }    = useParams()
  const [searchParams]         = useSearchParams()
  const visitId                = searchParams.get('visit_id')
  const navigate               = useNavigate()
  const { setCurrentSale }     = useAppStore()

  const [customer,  setCustomer]  = useState(null)
  const [products,  setProducts]  = useState([])
  const [selected,  setSelected]  = useState({})
  const [replacements, setReplacements] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [useCreditBalance, setUseCreditBalance] = useState(false)
  const [vatRate,   setVatRate]   = useState(0)
  const [receiptPhoto, setReceiptPhoto] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [step,      setStep]      = useState('products') // products | replacement | payment

  useEffect(() => {
    Promise.all([
      api.get(`/customers/${customerId}`),
      api.get('/products?is_active=true')
    ]).then(([custRes, prodRes]) => {
      setCustomer(custRes.data.data)
      setProducts(prodRes.data.data)
    }).finally(() => setLoading(false))
  }, [customerId])

  const updateQty = (pid, delta, isReplacement = false) => {
    const setter = isReplacement ? setReplacements : setSelected
    setter(prev => {
      const curr = prev[pid] || 0
      const next = Math.max(0, curr + delta)
      if (next === 0) { const { [pid]: _, ...rest } = prev; return rest }
      return { ...prev, [pid]: next }
    })
  }

  // হিসাব
  const totalAmount = products
    .filter(p => selected[p.id])
    .reduce((sum, p) => sum + p.price * selected[p.id], 0)

  const replacementValue = products
    .filter(p => replacements[p.id])
    .reduce((sum, p) => sum + p.price * replacements[p.id], 0)

  const creditBalance     = parseFloat(customer?.credit_balance || 0)
  const discountAmount    = useCreditBalance ? Math.min(creditBalance, totalAmount) : 0
  const netAfterDiscount  = totalAmount - discountAmount
  const vatAmount         = parseFloat(((netAfterDiscount - replacementValue) * vatRate / 100).toFixed(2))
  const netAmount         = Math.max(0, netAfterDiscount - replacementValue + vatAmount)
  const creditBalanceAdded = Math.max(0, replacementValue - netAfterDiscount)

  const canCredit = paymentMethod === 'credit' &&
    parseFloat(customer?.current_credit || 0) + netAmount <= parseFloat(customer?.credit_limit || 0)

  const submit = async () => {
    if (Object.keys(selected).length === 0) { toast.error('পণ্য সিলেক্ট করুন।'); return }
    if (paymentMethod === 'credit' && !canCredit) {
      toast.error('ক্রেডিট লিমিট পার হবে। পেমেন্ট পদ্ধতি পরিবর্তন করুন।')
      return
    }

    setSubmitting(true)
    try {
      const items = Object.entries(selected).map(([product_id, qty]) => ({ product_id, qty }))
      const replacementItems = Object.entries(replacements).map(([product_id, qty]) => ({ product_id, qty }))

      const todayOrder = await api.get('/orders/today')
      const orderId = todayOrder.data.data?.id

      const formData = new FormData()
      formData.append('customer_id', customerId)
      if (visitId) formData.append('visit_id', visitId)
      if (orderId) formData.append('order_id', orderId)
      formData.append('items', JSON.stringify(items))
      formData.append('payment_method', paymentMethod)
      formData.append('replacement_items', JSON.stringify(replacementItems))
      formData.append('use_credit_balance', useCreditBalance)
      formData.append('vat_rate', vatRate)
      if (receiptPhoto) formData.append('receipt_photo', receiptPhoto, 'receipt.jpg')

      const res = await api.post('/sales', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setCurrentSale({
        ...res.data.data,
        customer,
        items: products.filter(p => selected[p.id]).map(p => ({
          product_id: p.id, product_name: p.name, qty: selected[p.id], price: p.price, subtotal: p.price * selected[p.id]
        }))
      })

      navigate(`/worker/otp/${res.data.data.sale_id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-36">
      {/* Customer header */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🏪</div>
        <div>
          <p className="font-bold text-sm text-gray-800">{customer?.shop_name}</p>
          <p className="text-xs text-gray-500">{customer?.owner_name}</p>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl">
        {[['products', '📦 পণ্য'], ['replacement', '🔄 রিপ্লেস'], ['payment', '💰 পেমেন্ট']].map(([key, label]) => (
          <button key={key} onClick={() => setStep(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${step === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Products */}
      {step === 'products' && (
        <div className="space-y-3">
          {products.map(p => {
            const qty = selected[p.id] || 0
            return (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                    <p className="text-xs text-secondary font-bold">৳{p.price} / {p.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(p.id, -1)} disabled={qty === 0}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30">
                      <FiMinus className="text-sm" />
                    </button>
                    <span className={`w-8 text-center font-bold text-sm ${qty > 0 ? 'text-primary' : 'text-gray-300'}`}>{qty}</span>
                    <button onClick={() => updateQty(p.id, 1)}
                      className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <FiPlus className="text-sm" />
                    </button>
                  </div>
                </div>
                {qty > 0 && (
                  <p className="text-xs text-right text-secondary font-semibold mt-1">
                    = ৳{(qty * p.price).toLocaleString('bn-BD')}
                  </p>
                )}
              </div>
            )
          })}
          <button onClick={() => setStep('replacement')}
            className="w-full py-3 bg-primary text-white rounded-2xl font-semibold">
            পরবর্তী →
          </button>
        </div>
      )}

      {/* Replacement */}
      {step === 'replacement' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">কাস্টমার কোনো পণ্য ফেরত দিচ্ছেন?</p>
          {products.map(p => {
            const qty = replacements[p.id] || 0
            return (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                    <p className="text-xs text-orange-500 font-bold">৳{p.price} ফেরত মূল্য</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(p.id, -1, true)} disabled={qty === 0}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30">
                      <FiMinus className="text-sm" />
                    </button>
                    <span className={`w-8 text-center font-bold text-sm ${qty > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{qty}</span>
                    <button onClick={() => updateQty(p.id, 1, true)}
                      className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                      <FiPlus className="text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {replacementValue > 0 && (
            <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-700 font-semibold">
              রিপ্লেসমেন্ট মূল্য: ৳{replacementValue.toLocaleString('bn-BD')}
              {creditBalanceAdded > 0 && (
                <p className="text-xs text-emerald-600 mt-1">৳{creditBalanceAdded} কাস্টমারের ব্যালেন্সে যাবে</p>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep('products')} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold">← পিছনে</button>
            <button onClick={() => setStep('payment')} className="flex-1 py-3 bg-primary text-white rounded-2xl font-semibold">পরবর্তী →</button>
          </div>
        </div>
      )}

      {/* Payment */}
      {step === 'payment' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">পণ্যের মোট</span><span className="font-semibold">৳{totalAmount.toLocaleString('bn-BD')}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>ব্যালেন্স ছাড়</span><span>-৳{discountAmount}</span></div>}
            {replacementValue > 0 && <div className="flex justify-between text-orange-600"><span>রিপ্লেসমেন্ট</span><span>-৳{replacementValue}</span></div>}
            {vatAmount > 0 && <div className="flex justify-between text-amber-600"><span>ভ্যাট ({vatRate}%)</span><span>+৳{vatAmount}</span></div>}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-100 dark:border-slate-700">
              <span>পরিশোধযোগ্য</span>
              <span className="text-secondary">৳{netAmount.toLocaleString('bn-BD')}</span>
            </div>
          </div>

          {/* VAT */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">ভ্যাট হার (%) — ঐচ্ছিক</p>
            <div className="flex gap-2">
              {[0, 5, 7.5, 10, 15].map(r => (
                <button key={r} onClick={() => setVatRate(r)}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${vatRate === r ? 'bg-amber-100 border-amber-400 text-amber-700 font-bold' : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300'}`}>
                  {r}%
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Photo */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">📷 রশিদ ছবি (ঐচ্ছিক)</p>
            <label className="cursor-pointer block">
              <div className={`border-2 border-dashed rounded-xl overflow-hidden flex items-center justify-center transition-colors ${receiptPreview ? 'border-primary h-40' : 'border-gray-200 dark:border-slate-600 h-16 hover:border-primary'}`}>
                {receiptPreview
                  ? <img src={receiptPreview} alt="receipt" className="w-full h-full object-cover" />
                  : <span className="text-sm text-gray-400 dark:text-gray-500">ট্যাপ করে ছবি নিন</span>
                }
              </div>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  setReceiptPhoto(file)
                  setReceiptPreview(URL.createObjectURL(file))
                }} />
            </label>
          </div>

          {/* Credit balance toggle */}
          {creditBalance > 0 && (
            <button
              onClick={() => setUseCreditBalance(!useCreditBalance)}
              className={`w-full py-3 rounded-xl text-sm font-semibold border transition-colors ${useCreditBalance ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              {useCreditBalance ? '✅' : '○'} ব্যালেন্স ব্যবহার করুন (৳{creditBalance})
            </button>
          )}

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">পেমেন্ট পদ্ধতি:</p>
            {[
              { key: 'cash', label: '💵 নগদ', desc: 'সম্পূর্ণ নগদে পরিশোধ' },
              { key: 'credit', label: '📋 বাকি', desc: `লিমিট: ৳${parseFloat(customer?.credit_limit || 0)} | বাকি: ৳${parseFloat(customer?.current_credit || 0)}` },
            ].map(pm => (
              <button
                key={pm.key}
                onClick={() => setPaymentMethod(pm.key)}
                disabled={pm.key === 'credit' && parseFloat(customer?.credit_limit || 0) === 0}
                className={`w-full p-4 rounded-2xl border text-left transition-all disabled:opacity-40 ${
                  paymentMethod === pm.key ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${paymentMethod === pm.key ? 'border-primary bg-primary' : 'border-gray-300'}`} />
                  <div>
                    <p className="font-semibold text-sm">{pm.label}</p>
                    <p className="text-xs text-gray-400">{pm.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('replacement')} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold">← পিছনে</button>
            <button onClick={submit} disabled={submitting}
              className="flex-1 py-3 bg-secondary text-white rounded-2xl font-bold disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiCheck />}
              {submitting ? 'সাবমিট...' : 'বিক্রয় সম্পন্ন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
