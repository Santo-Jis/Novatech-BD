import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAppStore } from '../../store/app.store'
import toast from 'react-hot-toast'
import { FiMinus, FiPlus, FiCheck, FiPackage, FiChevronDown, FiChevronUp, FiWifiOff } from 'react-icons/fi'
import { enqueue, saveCache, getCache } from '../../api/offlineQueue'

// ─── ছবি compress helper (max 1280px, max 8MB) ────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_PX   = 1280
    const MAX_BYTES = 8 * 1024 * 1024
    const img      = new Image()
    const url      = URL.createObjectURL(file)

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
        if (blob.size > MAX_BYTES) return reject(new Error('TOO_LARGE'))
        resolve(blob)
      }, 'image/jpeg', 0.82)
    }
    img.onerror = () => reject(new Error('ছবি লোড ব্যর্থ'))
    img.src = url
  })
}

// ─── চূড়ান্ত মূল্য গণনা ───────────────────────────────────
function calcFinalPrice(p) {
  const price    = parseFloat(p.price)    || 0
  const discount = parseFloat(p.discount) || 0
  const vat      = parseFloat(p.vat)      || 0
  const tax      = parseFloat(p.tax)      || 0

  const discAmt = p.discount_type === 'percent' ? (price * discount) / 100 : discount
  const after   = Math.max(0, price - discAmt)
  return after + (after * vat / 100) + (after * tax / 100)
}

// ─── একটি পণ্য কার্ড ──────────────────────────────────────
function ProductCard({ p, qty, onUpdate, isReplacement = false }) {
  const [expanded, setExpanded] = useState(false)
  const finalPrice = calcFinalPrice(p)
  const hasDiscount = parseFloat(p.discount) > 0
  const hasVat      = parseFloat(p.vat)      > 0
  const hasTax      = parseFloat(p.tax)      > 0
  const hasExtras   = hasDiscount || hasVat || hasTax || p.description

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${qty > 0 ? 'border-primary/30' : 'border-gray-100'}`}>
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
            <p className="font-semibold text-sm text-gray-800 leading-tight">{p.name}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{p.sku}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {hasDiscount ? (
                <>
                  <span className="text-xs text-gray-400 line-through">৳{parseFloat(p.price).toLocaleString()}</span>
                  <span className={`text-sm font-bold ${isReplacement ? 'text-orange-500' : 'text-secondary'}`}>
                    ৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    ছাড় {p.discount_type === 'percent' ? `${p.discount}%` : `৳${p.discount}`}
                  </span>
                </>
              ) : (
                <span className={`text-sm font-bold ${isReplacement ? 'text-orange-500' : 'text-secondary'}`}>
                  ৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })} / {p.unit}
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
            <button
              onClick={() => onUpdate(p.id, -1)}
              disabled={qty === 0}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95"
            >
              <FiMinus size={13} />
            </button>
            <span className={`w-7 text-center font-bold text-sm ${qty > 0 ? 'text-primary' : 'text-gray-300'}`}>{qty}</span>
            <button
              onClick={() => onUpdate(p.id, 1)}
              className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary active:scale-95"
            >
              <FiPlus size={13} />
            </button>
          </div>
        </div>

        {/* সাবটোটাল */}
        {qty > 0 && (
          <p className="text-xs text-right text-secondary font-semibold mt-2">
            {qty} × ৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })} = ৳{(qty * finalPrice).toLocaleString('en', { maximumFractionDigits: 2 })}
          </p>
        )}

        {/* বিবরণ টগল বাটন */}
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
        <div className="px-4 pb-4 pt-0">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 font-medium">বিবরণ</p>
            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{p.description}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function SalesForm() {
  const { id: customerId }    = useParams()
  const [searchParams]         = useSearchParams()
  const visitId                = searchParams.get('visit_id')
  const navigate               = useNavigate()
  const { setCurrentSale }     = useAppStore()

  const [customer,     setCustomer]     = useState(null)
  const [products,     setProducts]     = useState([])
  const [selected,     setSelected]     = useState({})
  const [replacements, setReplacements] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [useCreditBalance, setUseCreditBalance] = useState(false)

  const [receiptPhoto, setReceiptPhoto] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [step,         setStep]         = useState('products')

  // ── বাকি সতর্কতা (Credit Alert) ───────────────────────────
  const [creditAlert,       setCreditAlert]       = useState(null)   // API response
  const [showCreditModal,   setShowCreditModal]   = useState(false)  // modal দেখাবে কিনা
  const [creditAlertDismissed, setCreditAlertDismissed] = useState(false)

  // ── Credit Approval (Manager approval workflow) ────────────
  const [creditSettings,    setCreditSettings]    = useState(null)   // { alert_threshold_pct, require_approval }
  const [approvalStatus,    setApprovalStatus]    = useState('none') // 'none'|'pending'|'approved'|'rejected'
  const [approvalRequestId, setApprovalRequestId] = useState(null)
  const [requestingApproval, setRequestingApproval] = useState(false)
  const [approvalNote,      setApprovalNote]      = useState('')

  // ── অনুমোদিত অর্ডার state ─────────────────────────────────
  const [approvedOrder,    setApprovedOrder]    = useState(null)   // approved order object
  const [orderCheckDone,   setOrderCheckDone]   = useState(false)  // check শেষ হয়েছে কিনা
  const [orderCheckError,  setOrderCheckError]  = useState(false)  // নেটওয়ার্ক error হয়েছে কিনা

  useEffect(() => {
    const loadData = async () => {
      // প্রথমে cache থেকে দেখাও (offline fast load)
      const cachedCustomer = await getCache(`customer_${customerId}`)
      const cachedProducts = await getCache('products_active')
      if (cachedCustomer?.isToday) setCustomer(cachedCustomer.data)
      if (cachedProducts?.isToday)  setProducts(cachedProducts.data)
      if (cachedCustomer?.isToday && cachedProducts?.isToday) setLoading(false)

      // Online হলে fresh data নাও + cache আপডেট করো
      if (navigator.onLine) {
        try {
          const [custRes, prodRes] = await Promise.all([
            api.get(`/customers/${customerId}`),
            api.get('/products?is_active=true'),
          ])
          setCustomer(custRes.data.data)
          setProducts(prodRes.data.data)
          saveCache(`customer_${customerId}`, custRes.data.data)
          saveCache('products_active', prodRes.data.data)
        } catch { /* cache দিয়েই চলবে */ }

        // ── বাকি সতর্কতা লোড করো ─────────────────────────────
        try {
          const alertRes = await api.get(`/customers/${customerId}/credit-alert`)
          if (alertRes.data.has_due) {
            setCreditAlert(alertRes.data)
            setShowCreditModal(true)
          }
        } catch { /* সাইলেন্টলি ignore করো */ }

        // ── Credit settings + approval status লোড করো ────────
        try {
          const [settingsRes, approvalRes] = await Promise.all([
            api.get('/credit-approvals/settings'),
            api.get(`/credit-approvals/check/${customerId}`)
          ])
          setCreditSettings(settingsRes.data.data)
          setApprovalStatus(approvalRes.data.status)
          if (approvalRes.data.data?.id) setApprovalRequestId(approvalRes.data.data.id)
        } catch { /* ignore — approval workflow optional */ }

        // ── আজকের অনুমোদিত অর্ডার চেক করো ──────────────────
        try {
          const orderRes = await api.get('/orders/today')
          const allOrders = orderRes.data.all_orders || []
          // status === 'approved' এমন অর্ডার খোঁজো
          const found = allOrders.find(o => o.status === 'approved')
          setApprovedOrder(found || null)
        } catch {
          setOrderCheckError(true)
        } finally {
          setOrderCheckDone(true)
        }
      } else {
        // অফলাইনে order check সম্ভব না — এটি জানিয়ে দেব
        setOrderCheckDone(true)
      }

      setLoading(false)
    }
    loadData()
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

  // চূড়ান্ত মূল্য দিয়ে হিসাব
  const totalAmount = products
    .filter(p => selected[p.id])
    .reduce((sum, p) => sum + calcFinalPrice(p) * selected[p.id], 0)

  const replacementValue = products
    .filter(p => replacements[p.id])
    .reduce((sum, p) => sum + calcFinalPrice(p) * replacements[p.id], 0)

  const creditBalance      = parseFloat(customer?.credit_balance || 0)
  const discountAmount     = useCreditBalance ? Math.min(creditBalance, totalAmount) : 0
  const netAfterDiscount   = totalAmount - discountAmount
  const vatAmount          = products
    .filter(p => selected[p.id])
    .reduce((sum, p) => {
      const vat  = parseFloat(p.vat) || 0
      const base = calcFinalPrice(p) * selected[p.id]
      return sum + parseFloat((base * vat / 100).toFixed(2))
    }, 0)
  const netAmount          = Math.max(0, netAfterDiscount - replacementValue + vatAmount)
  const creditBalanceAdded = Math.max(0, replacementValue - netAfterDiscount)

  const canCredit = paymentMethod === 'credit' &&
    parseFloat(customer?.current_credit || 0) + netAmount <= parseFloat(customer?.credit_limit || 0)

  // approval দরকার কিনা: settings-এ require_approval=true AND credit limit-এ পৌঁছাবে
  const needsApproval = creditSettings?.require_approval === true &&
    paymentMethod === 'credit' && !canCredit

  const sendApprovalRequest = async () => {
    if (requestingApproval) return
    setRequestingApproval(true)
    try {
      const res = await api.post('/credit-approvals/request', {
        customer_id:      customerId,
        requested_amount: netAmount,
        note:             approvalNote || undefined
      })
      setApprovalStatus('pending')
      setApprovalRequestId(res.data.request_id)
      toast.success('✅ ম্যানেজারের কাছে approval request পাঠানো হয়েছে।', { duration: 4000 })
    } catch (err) {
      if (err.response?.status === 409) {
        // ইতোমধ্যে pending
        setApprovalStatus('pending')
        toast('ইতোমধ্যে একটি pending request আছে। ম্যানেজারের অনুমোদনের অপেক্ষায় থাকুন।', { icon: 'ℹ️' })
      } else {
        toast.error(err.response?.data?.message || 'Request পাঠাতে সমস্যা হয়েছে।')
      }
    } finally {
      setRequestingApproval(false)
    }
  }

  const submit = async () => {
    if (Object.keys(selected).length === 0) { toast.error('পণ্য সিলেক্ট করুন।'); return }

    // approval বাধ্যতামূলক এবং এখনো approved হয়নি
    if (needsApproval && approvalStatus !== 'approved') {
      if (approvalStatus === 'pending') {
        toast('ম্যানেজারের অনুমোদনের অপেক্ষায়। অনুমোদন পেলে বিক্রয় করুন।', { icon: '⏳', duration: 3000 })
      } else if (approvalStatus === 'rejected') {
        toast.error('Manager approval reject করেছেন। নগদে বিক্রি করুন অথবা পরিমাণ কমান।')
      } else {
        toast.error('Credit limit অতিক্রম করবে। Manager approval নিন।')
      }
      return
    }

    if (paymentMethod === 'credit' && !canCredit && !needsApproval) {
      toast.error('ক্রেডিট লিমিট পার হবে। পেমেন্ট পদ্ধতি পরিবর্তন করুন।')
      return
    }

    setSubmitting(true)

    // ── OFFLINE MODE ─────────────────────────────────────────
    if (!navigator.onLine) {
      try {
        const items = Object.entries(selected).map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))
        const replacementItems = Object.entries(replacements).map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

        // receipt photo → base64 (IndexedDB তে store করার জন্য)
        // file input থেকে ইতিমধ্যে compressed blob আসে
        let receiptPhotoBase64 = null
        if (receiptPhoto) {
          receiptPhotoBase64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(receiptPhoto)
          })
        }

        await enqueue({
          type: 'SALE',
          payload: {
            customer_id:        customerId,
            visit_id:           visitId || undefined,
            items,
            payment_method:     paymentMethod,
            replacement_items:  replacementItems,
            use_credit_balance: useCreditBalance,
            _receipt_photo_base64: receiptPhotoBase64 || undefined,
            // Idempotency key — retry-তে duplicate invoice প্রতিরোধ
            // crypto.randomUUID() — browser built-in, cryptographically secure UUID v4
            idempotency_key: crypto.randomUUID(),
            // offline summary (UI তে দেখানোর জন্য)
            _customer_name: customer?.shop_name,
            _total:         netAmount,
          },
        })

        toast.success('✅ বিক্রয় offline এ সংরক্ষিত হয়েছে! নেটওয়ার্ক ফিরলে sync হবে।', {
          duration: 5000,
          icon: '📶',
        })
        navigate('/worker/customers')
      } catch {
        toast.error('Offline save ব্যর্থ হয়েছে।')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // ── ONLINE MODE ──────────────────────────────────────────
    try {
      const items = Object.entries(selected).map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))
      const replacementItems = Object.entries(replacements).map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

      // ── অনুমোদিত অর্ডার বাধ্যতামূলক ──────────────────────
      if (!approvedOrder) {
        toast.error('❌ আজকের অর্ডার ম্যানেজার অনুমোদন করেননি। বিক্রয় করা সম্ভব নয়।', { duration: 5000 })
        setSubmitting(false)
        return
      }
      const orderId = approvedOrder.id

      let receiptPhotoUrl = null
      if (receiptPhoto) {
        const photoForm = new FormData()
        photoForm.append('receipt_photo', receiptPhoto, 'receipt.jpg')
        try {
          const uploadRes = await api.post('/sales/upload-receipt', photoForm, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          receiptPhotoUrl = uploadRes.data.data?.url
        } catch { /* ছবি upload ব্যর্থ হলেও sale চলবে */ }
      }

      const payload = {
        customer_id:        customerId,
        visit_id:           visitId || undefined,
        order_id:           orderId || undefined,
        items,
        payment_method:     paymentMethod,
        replacement_items:  replacementItems,
        use_credit_balance: useCreditBalance,
        receipt_photo:      receiptPhotoUrl || undefined,
        // Idempotency key — network retry-তে duplicate invoice প্রতিরোধ
        // crypto.randomUUID() — browser built-in, cryptographically secure UUID v4
        idempotency_key: crypto.randomUUID(),
      }

      const res = await api.post('/sales', payload)

      setCurrentSale({
        ...res.data.data,
        otp_required: res.data.data.otp_required,
        customer,
        items: products.filter(p => selected[p.id]).map(p => ({
          product_id: p.id, product_name: p.name, qty: selected[p.id],
          price: calcFinalPrice(p),
          subtotal: calcFinalPrice(p) * selected[p.id]
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

  // ── অনুমোদিত অর্ডার না থাকলে hard block ─────────────────
  if (navigator.onLine && orderCheckDone && !approvedOrder && !orderCheckError) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl">🚫</div>
        <div className="text-center space-y-2">
          <p className="font-bold text-gray-800 text-base">অর্ডার অনুমোদিত হয়নি</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            আজকের অর্ডার এখনো ম্যানেজার অনুমোদন করেননি।<br />
            অনুমোদন ছাড়া বিক্রয় করা সম্ভব নয়।
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 text-center w-full max-w-xs">
          ম্যানেজারকে অর্ডার অনুমোদন করতে বলুন, তারপর এই পেজ রিফ্রেশ করুন।
        </div>
        <button
          onClick={() => { setOrderCheckDone(false); setApprovedOrder(null); window.location.reload() }}
          className="mt-2 px-6 py-3 bg-primary text-white rounded-2xl font-semibold text-sm"
        >
          🔄 রিফ্রেশ করুন
        </button>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-400 underline">পিছনে যান</button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-36">

      {/* ── বাকি সতর্কতা Modal ─────────────────────────────── */}
      {showCreditModal && creditAlert && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">⚠️</div>
              <div>
                <p className="font-bold text-gray-800 text-base">বাকির সতর্কতা!</p>
                <p className="text-xs text-gray-500">{creditAlert.customer.shop_name} — {creditAlert.customer.owner_name}</p>
              </div>
            </div>

            {/* বর্তমান বাকি summary */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-red-700 font-medium">মোট বকেয়া</span>
                <span className="text-xl font-bold text-red-600">
                  ৳{parseInt(creditAlert.customer.current_credit).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">ক্রেডিট লিমিট</span>
                <span className="text-xs text-gray-600 font-semibold">
                  ৳{parseInt(creditAlert.customer.credit_limit).toLocaleString()}
                </span>
              </div>
              {/* Progress bar */}
              {creditAlert.customer.credit_limit > 0 && (
                <div className="mt-2">
                  <div className="w-full h-2 bg-red-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((creditAlert.customer.current_credit / creditAlert.customer.credit_limit) * 100))}%`
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-red-400 text-right mt-0.5">
                    {Math.min(100, Math.round((creditAlert.customer.current_credit / creditAlert.customer.credit_limit) * 100))}% ব্যবহৃত
                  </p>
                </div>
              )}
            </div>

            {/* বাকির বিস্তারিত ইতিহাস */}
            {creditAlert.due_sales && creditAlert.due_sales.length > 0 && (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">বাকির ইতিহাস</p>
                {creditAlert.due_sales.map((sale, idx) => (
                  <div key={sale.sale_id || idx} className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700">
                        🧾 {sale.invoice_number || `#${String(sale.sale_id).slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        📅 {new Date(sale.created_at).toLocaleDateString('bn-BD', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                      <p className="text-[10px] text-blue-500 mt-0.5">
                        👤 SR: {sale.sr_name}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-red-500">
                        ৳{parseInt(sale.credit_used).toLocaleString()}
                      </p>
                      <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">বাকি</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowCreditModal(false); setCreditAlertDismissed(true) }}
                className="flex-1 py-3 border-2 border-gray-200 rounded-2xl text-gray-600 font-semibold text-sm"
              >
                বুঝেছি, এগিয়ে যাই
              </button>
              <button
                onClick={() => navigate(-1)}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-semibold text-sm"
              >
                ফিরে যাই
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer header */}
      <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🏪</div>
        <div>
          <p className="font-bold text-sm text-gray-800">{customer?.shop_name}</p>
          <p className="text-xs text-gray-500">{customer?.owner_name}</p>
        </div>
      </div>

      {/* ── বাকি সতর্কতা Banner (modal dismiss-এর পরেও দেখাবে) ── */}
      {creditAlertDismissed && creditAlert?.has_due && (
        <button
          onClick={() => setShowCreditModal(true)}
          className="w-full flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
        >
          <span className="text-xl flex-shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-700">বকেয়া আছে — ৳{parseInt(creditAlert.customer.current_credit).toLocaleString()}</p>
            <p className="text-[10px] text-red-400 mt-0.5">
              {creditAlert.due_sales?.length > 0
                ? `সর্বশেষ বাকি: ${new Date(creditAlert.due_sales[0].created_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })} — ${creditAlert.due_sales[0].sr_name}`
                : 'বিস্তারিত দেখতে ট্যাপ করুন'}
            </p>
          </div>
          <span className="text-red-400 text-xs">বিস্তারিত ›</span>
        </button>
      )}

      {/* অনুমোদিত অর্ডার ব্যাজ */}
      {approvedOrder && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
          <span className="text-green-600 text-base">✅</span>
          <div>
            <p className="text-xs font-semibold text-green-700">অর্ডার অনুমোদিত</p>
            <p className="text-[10px] text-green-500">অর্ডার #{approvedOrder.id} — বিক্রয় করা যাবে</p>
          </div>
        </div>
      )}

      {/* Step tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl">
        {[['products', '📦 পণ্য'], ['replacement', '🔄 রিপ্লেস'], ['payment', '💰 পেমেন্ট']].map(([key, label]) => (
          <button key={key} onClick={() => setStep(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${step === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Products ── */}
      {step === 'products' && (
        <div className="space-y-3">
          {products.map(p => (
            <ProductCard
              key={p.id}
              p={p}
              qty={selected[p.id] || 0}
              onUpdate={updateQty}
            />
          ))}
          <button onClick={() => setStep('replacement')}
            className="w-full py-3 bg-primary text-white rounded-2xl font-semibold">
            পরবর্তী →
          </button>
        </div>
      )}

      {/* ── Replacement ── */}
      {step === 'replacement' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">কাস্টমার কোনো পণ্য ফেরত দিচ্ছেন?</p>
          {products.map(p => (
            <ProductCard
              key={p.id}
              p={p}
              qty={replacements[p.id] || 0}
              onUpdate={(pid, delta) => updateQty(pid, delta, true)}
              isReplacement
            />
          ))}
          {replacementValue > 0 && (
            <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-700 font-semibold">
              রিপ্লেসমেন্ট মূল্য: ৳{replacementValue.toLocaleString('en', { maximumFractionDigits: 2 })}
              {creditBalanceAdded > 0 && (
                <p className="text-xs text-emerald-600 mt-1">৳{creditBalanceAdded.toFixed(2)} কাস্টমারের ব্যালেন্সে যাবে</p>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep('products')} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold">← পিছনে</button>
            <button onClick={() => setStep('payment')} className="flex-1 py-3 bg-primary text-white rounded-2xl font-semibold">পরবর্তী →</button>
          </div>
        </div>
      )}

      {/* ── Payment ── */}
      {step === 'payment' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">পণ্যের মোট</span><span className="font-semibold">৳{totalAmount.toLocaleString('en', { maximumFractionDigits: 2 })}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>ব্যালেন্স ছাড়</span><span>-৳{discountAmount.toFixed(2)}</span></div>}
            {replacementValue > 0 && <div className="flex justify-between text-orange-600"><span>রিপ্লেসমেন্ট</span><span>-৳{replacementValue.toFixed(2)}</span></div>}
            {vatAmount > 0 && <div className="flex justify-between text-amber-600"><span>ভ্যাট</span><span>+৳{vatAmount.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-100">
              <span>পরিশোধযোগ্য</span>
              <span className="text-secondary">৳{netAmount.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>



          {/* Receipt Photo */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-2">📷 রশিদ ছবি (ঐচ্ছিক)</p>
            <label className="cursor-pointer block">
              <div className={`border-2 border-dashed rounded-xl overflow-hidden flex items-center justify-center transition-colors ${receiptPreview ? 'border-primary h-40' : 'border-gray-200 h-16 hover:border-primary'}`}>
                {receiptPreview
                  ? <img src={receiptPreview} alt="receipt" className="w-full h-full object-cover" />
                  : <span className="text-sm text-gray-400">ট্যাপ করে ছবি নিন</span>
                }
              </div>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async e => {
                  const file = e.target.files[0]
                  if (!file) return
                  try {
                    const compressed = await compressImage(file)
                    setReceiptPhoto(compressed)
                    setReceiptPreview(URL.createObjectURL(compressed))
                  } catch (err) {
                    // ❌ compress ব্যর্থ — state ও preview পরিষ্কার করো
                    setReceiptPhoto(null)
                    setReceiptPreview(null)
                    e.target.value = ''
                    if (err.message === 'TOO_LARGE') {
                      toast.error('ছবি ৮ MB এর বেশি। ছোট ছবি তুলুন।', { duration: 4000 })
                    } else if (err.message === 'ছবি লোড ব্যর্থ') {
                      toast.error('ছবি লোড করা যায়নি। অন্য ছবি বেছে নিন।', { duration: 4000 })
                    } else {
                      toast.error('ছবি প্রসেস করা যায়নি। আবার চেষ্টা করুন।', { duration: 4000 })
                    }
                  }
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

          {/* ── ক্রেডিট লিমিট স্ট্যাটাস কার্ড ── */}
          {(() => {
            const limit  = parseFloat(customer?.credit_limit  || 0)
            const used   = parseFloat(customer?.current_credit || 0)
            const pct    = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
            const remaining = Math.max(0, limit - used)
            const isFull = limit > 0 && used >= limit
            const isHigh = pct >= 80 && !isFull
            const willExceed = paymentMethod === 'credit' && (used + netAmount) > limit

            if (limit === 0) return null

            return (
              <div className={`rounded-2xl border-2 p-4 space-y-3 ${
                isFull        ? 'bg-red-50 border-red-300'
                : willExceed  ? 'bg-red-50 border-red-200'
                : isHigh      ? 'bg-amber-50 border-amber-200'
                : 'bg-white border-gray-100'
              }`}>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{isFull || willExceed ? '🚫' : isHigh ? '⚠️' : '📊'}</span>
                    <p className={`text-sm font-bold ${isFull || willExceed ? 'text-red-700' : isHigh ? 'text-amber-700' : 'text-gray-700'}`}>
                      {customer?.shop_name}-এর বাকি স্ট্যাটাস
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isFull || willExceed ? 'bg-red-100 text-red-700'
                    : isHigh ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {pct}% ব্যবহার
                  </span>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFull || willExceed ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${paymentMethod === 'credit' ? Math.min(100, Math.round(((used + netAmount) / limit) * 100)) : pct}%` }}
                    />
                  </div>
                  {paymentMethod === 'credit' && !isFull && (
                    <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                      এই বিক্রয়ের পর: {Math.min(100, Math.round(((used + netAmount) / limit) * 100))}%
                    </p>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/70 rounded-xl py-2 px-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">বর্তমান বাকি</p>
                    <p className="text-sm font-bold text-red-500">৳{parseInt(used).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/70 rounded-xl py-2 px-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">মোট লিমিট</p>
                    <p className="text-sm font-bold text-gray-700">৳{parseInt(limit).toLocaleString()}</p>
                  </div>
                  <div className="bg-white/70 rounded-xl py-2 px-1">
                    <p className="text-[10px] text-gray-400 mb-0.5">আরো দিতে পারবেন</p>
                    <p className={`text-sm font-bold ${remaining === 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      ৳{parseInt(remaining).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Warning messages */}
                {isFull && (
                  <div className="bg-red-100 rounded-xl px-3 py-2 text-xs text-red-800 font-semibold text-center">
                    🚫 এই কাস্টমারের ক্রেডিট লিমিট পূর্ণ। শুধুমাত্র নগদে বিক্রয় করুন।
                  </div>
                )}
                {willExceed && !isFull && (
                  <div className="bg-red-100 rounded-xl px-3 py-2 text-xs text-red-800 font-semibold text-center">
                    ⚠️ এই বিক্রয়ে লিমিট পার হয়ে যাবে! নগদে নিন অথবা পরিমাণ কমান।
                  </div>
                )}
                {isHigh && !willExceed && paymentMethod === 'credit' && (
                  <div className="bg-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800 font-semibold text-center">
                    ⚠️ লিমিটের ৮০% পার হয়েছে। সতর্কতার সাথে বাকি দিন।
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Manager Approval Block ─────────────────────── */}
          {needsApproval && (
            <div className={`rounded-2xl border-2 p-4 space-y-3 transition-colors ${
              approvalStatus === 'approved' ? 'bg-emerald-50 border-emerald-300' :
              approvalStatus === 'rejected' ? 'bg-red-50 border-red-200' :
              approvalStatus === 'pending'  ? 'bg-blue-50 border-blue-200' :
              'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {approvalStatus === 'approved' ? '✅' :
                   approvalStatus === 'rejected' ? '🚫' :
                   approvalStatus === 'pending'  ? '⏳' : '🔒'}
                </span>
                <div>
                  <p className={`text-sm font-bold ${
                    approvalStatus === 'approved' ? 'text-emerald-700' :
                    approvalStatus === 'rejected' ? 'text-red-700' :
                    approvalStatus === 'pending'  ? 'text-blue-700' :
                    'text-amber-700'
                  }`}>
                    {approvalStatus === 'approved' ? 'Manager অনুমোদন দিয়েছেন' :
                     approvalStatus === 'rejected' ? 'Manager reject করেছেন' :
                     approvalStatus === 'pending'  ? 'Approval-এর অপেক্ষায়...' :
                     'Manager Approval প্রয়োজন'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {approvalStatus === 'approved' ? 'এখন বাকিতে বিক্রয় করা যাবে।' :
                     approvalStatus === 'rejected' ? 'নগদে বিক্রি করুন অথবা পরিমাণ কমান।' :
                     approvalStatus === 'pending'  ? 'Manager অনুমোদন দিলে বিক্রয় করুন।' :
                     'Credit limit অতিক্রম করবে। ম্যানেজারের অনুমোদন নিতে হবে।'}
                  </p>
                </div>
              </div>

              {/* Approval request form */}
              {approvalStatus === 'none' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="কারণ লিখুন (ঐচ্ছিক) — ম্যানেজার দেখবেন"
                    value={approvalNote}
                    onChange={e => setApprovalNote(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs border border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 bg-white"
                  />
                  <button
                    onClick={sendApprovalRequest}
                    disabled={requestingApproval}
                    className="w-full py-3 bg-amber-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98]"
                  >
                    {requestingApproval
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : '📨'
                    }
                    {requestingApproval ? 'পাঠানো হচ্ছে...' : 'ম্যানেজারের কাছে Approval চান'}
                  </button>
                </div>
              )}

              {approvalStatus === 'pending' && (
                <div className="bg-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                  <p className="text-[11px] text-blue-700">ম্যানেজার অনুমোদন দিলে পেজ রিফ্রেশ করুন।</p>
                </div>
              )}

              {approvalStatus === 'rejected' && (
                <button
                  onClick={() => { setApprovalStatus('none'); setApprovalNote('') }}
                  className="w-full py-2.5 border border-red-200 rounded-xl text-xs text-red-600 font-medium"
                >
                  🔄 আবার request করুন
                </button>
              )}
            </div>
          )}

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">পেমেন্ট পদ্ধতি:</p>
            {[
              { key: 'cash',   label: '💵 নগদ',  desc: 'সম্পূর্ণ নগদে পরিশোধ' },
              { key: 'credit', label: '📋 বাকি', desc: `লিমিট: ৳${parseFloat(customer?.credit_limit || 0).toLocaleString()} | বর্তমান বাকি: ৳${parseFloat(customer?.current_credit || 0).toLocaleString()}` },
            ].map(pm => (
              <button
                key={pm.key}
                onClick={() => setPaymentMethod(pm.key)}
                disabled={pm.key === 'credit' && parseFloat(customer?.credit_limit || 0) === 0}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all disabled:opacity-40 active:scale-[0.98] ${paymentMethod === pm.key ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${paymentMethod === pm.key ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                    {paymentMethod === pm.key && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{pm.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{pm.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Offline notice */}
          {!navigator.onLine && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <FiWifiOff size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                অফলাইন মোড — Save হবে, নেটওয়ার্ক ফিরলে auto sync হবে
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('replacement')} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold">← পিছনে</button>
            <button onClick={submit} disabled={submitting}
              className={`flex-1 py-3 rounded-2xl font-bold disabled:opacity-60 flex items-center justify-center gap-2 text-white ${navigator.onLine ? 'bg-secondary' : 'bg-amber-500'}`}>
              {submitting
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : navigator.onLine ? <FiCheck /> : <FiWifiOff size={16} />
              }
              {submitting ? 'সাবমিট...' : navigator.onLine ? 'বিক্রয় সম্পন্ন' : 'Offline এ Save করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
