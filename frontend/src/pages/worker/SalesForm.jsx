import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { useAppStore } from '../../store/app.store'
import toast from 'react-hot-toast'
import { FiMinus, FiPlus, FiCheck, FiPackage, FiChevronDown, FiChevronUp, FiWifiOff } from 'react-icons/fi'
import { enqueue, saveCache, getCache } from '../../api/offlineQueue'
import { fetchAndCachePromoSnapshot, loadPromoSnapshot, calculateOfflinePromotions } from '../../utils/offlinePromotions'
import ProductFilterBar, { useProductFilter } from '../../components/worker/ProductFilterBar'

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

// স্টক এই সংখ্যা বা তার কম হলে কমলা রঙে "কম" দেখাবে
const LOW_STOCK_LIMIT = 5

// ─── একটি পণ্য কার্ড ──────────────────────────────────────
// have: SR-এর হাতে এই পণ্য কত পিস আছে (সংখ্যা) — null/undefined হলে স্টক UI দেখানো হয় না
// (রিপ্লেসমেন্ট ট্যাবে বা স্টকের তথ্য না থাকলে আগের মতোই চলে)
function ProductCard({ p, qty, onUpdate, isReplacement = false, have = null, onFixQty }) {
  const [expanded, setExpanded] = useState(false)
  const finalPrice = calcFinalPrice(p)
  const hasDiscount = parseFloat(p.discount) > 0
  const hasVat      = parseFloat(p.vat)      > 0
  const hasTax      = parseFloat(p.tax)      > 0
  const hasExtras   = hasDiscount || hasVat || hasTax || p.description

  const showStock   = !isReplacement && have !== null && have !== undefined
  const unit        = p.unit || 'pcs'
  const overStock   = showStock && qty > have                  // স্টকের বেশি দেওয়া আছে (লাল সতর্কতা)
  const outOfStock  = showStock && have <= 0 && !overStock     // স্টক শূন্য — কার্ড ধূসর
  const atMax       = showStock && have > 0 && qty >= have && !overStock
  const lowStock    = showStock && have > 0 && have <= LOW_STOCK_LIMIT
  const plusBlocked = showStock && qty >= have

  const cardStyle = overStock
    ? 'border-red-400 bg-red-50 ring-1 ring-red-200'
    : outOfStock
      ? 'border-gray-100 bg-gray-50 opacity-60'
      : qty > 0 ? 'border-primary/30 bg-white' : 'border-gray-100 bg-white'

  return (
    <div id={`prod-${p.id}`} className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${cardStyle}`}>
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

            {/* ── হাতে কত স্টক আছে ── */}
            {showStock && (
              <p className={`text-xs font-semibold mt-1 ${
                have <= 0 ? 'text-red-500' : lowStock ? 'text-orange-500' : 'text-gray-500'
              }`}>
                {have <= 0
                  ? '● স্টক নেই'
                  : `স্টক: ${have} ${unit}${lowStock ? ' (কম)' : ''}`}
              </p>
            )}
          </div>

          {/* কাউন্টার */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdate(p.id, -1)}
                disabled={qty === 0}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95"
              >
                <FiMinus size={13} />
              </button>
              <span className={`w-7 text-center font-bold text-sm ${overStock ? 'text-red-600' : qty > 0 ? 'text-primary' : 'text-gray-300'}`}>{qty}</span>
              <button
                onClick={() => onUpdate(p.id, 1)}
                disabled={plusBlocked}
                aria-label={plusBlocked ? 'স্টকের সর্বোচ্চ সীমায় পৌঁছেছে' : 'বাড়ান'}
                className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary active:scale-95 disabled:opacity-30 disabled:active:scale-100"
              >
                <FiPlus size={13} />
              </button>
            </div>
            {atMax && <span className="text-[10px] font-semibold text-amber-600">সর্বোচ্চ স্টক</span>}
          </div>
        </div>

        {/* স্টকের বেশি দেওয়া থাকলে — এই কার্ডেই লাল সতর্কতা + এক ট্যাপে ঠিক করার বাটন */}
        {overStock && (
          <div className="mt-2 pt-2 border-t border-red-200 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-red-600">
              ⚠️ {have > 0 ? `স্টকে আছে ${have} ${unit}, আপনি ${qty} দিয়েছেন` : `স্টক নেই, আপনি ${qty} দিয়েছেন`}
            </p>
            {onFixQty && (
              <button
                onClick={() => onFixQty(p.id)}
                className="text-xs font-bold text-white bg-red-500 px-3 py-1 rounded-full active:scale-95 flex-shrink-0"
              >
                {have > 0 ? `${have} করুন` : 'সরান'}
              </button>
            )}
          </div>
        )}

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

// ─── স্টক সতর্কতা বক্স ─────────────────────────────────────
// বিক্রয় নিশ্চিত করার সময় (বা তার আগে) স্টক কম ধরা পড়লে এই পেইজেই দেখায় —
// SR-কে পিছনের ধাপে যেতে হয় না, এক ট্যাপে "স্টক অনুযায়ী ঠিক করুন" চাপলেই হয়।
function StockAlert({ lines, onFixAll, onShowProducts, boxRef }) {
  if (lines.length === 0) return null
  return (
    <div ref={boxRef} className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">🚫</span>
        <div>
          <p className="text-sm font-bold text-red-700">হাতের স্টকের বেশি দেওয়া আছে</p>
          <p className="text-[11px] text-red-500 mt-0.5">নিচের পণ্যগুলোর পরিমাণ ঠিক না করলে বিক্রয় সম্পন্ন হবে না।</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {lines.map(l => (
          <div key={l.id} className="flex items-center justify-between gap-2 bg-white/80 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-gray-800 min-w-0 truncate">{l.name}</p>
            <p className="text-[11px] font-semibold text-red-600 flex-shrink-0">
              {l.have > 0 ? `হাতে ${l.have}, দিয়েছেন ${l.need}` : `স্টক নেই, দিয়েছেন ${l.need}`}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onFixAll}
          className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold active:scale-[0.98]">
          স্টক অনুযায়ী ঠিক করুন
        </button>
        {onShowProducts && (
          <button onClick={onShowProducts}
            className="px-4 py-2.5 border border-red-300 text-red-600 rounded-xl text-xs font-semibold bg-white active:scale-[0.98]">
            পণ্য দেখুন
          </button>
        )}
      </div>
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
  const productFilter = useProductFilter(products)   // ক্যাটাগরি / কোম্পানি / সার্চ ফিল্টার
  const [selected,     setSelected]     = useState({})
  const [replacements, setReplacements] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('cash')
  // আংশিক পেমেন্ট: 'partial' শুধু UI-র অপশন — server-এ payment_method='credit' + cash_received যায়
  const [cashNow, setCashNow] = useState('')
  const [useCreditBalance, setUseCreditBalance] = useState(false)
  const [promoPreview, setPromoPreview] = useState(null) // ← নতুন: /promotions/calculate-এর ফলাফল
  const [promoSnapshot, setPromoSnapshot] = useState(null)   // অফলাইন প্রমোশন হিসাবের ক্যাশ
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [promoCode, setPromoCode] = useState('')          // ← নতুন (Phase ২): কোড-ভিত্তিক অফার

  const [receiptPhoto, setReceiptPhoto] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [step,         setStep]         = useState('products')

  // ── SR-এর হাতের স্টক (sr_stock_ledger) ─────────────────────
  // srStock: { [product_id]: হাতে কত পিস } — শুধু যেসব পণ্য হাতে আছে সেগুলোর এন্ট্রি থাকে।
  // stockKnown=true মানে তালিকাটা সম্পূর্ণ, তাই এন্ট্রি না থাকা পণ্য = হাতে ০।
  // stockKnown=false (অফলাইনে ক্যাশও নেই / লোড ব্যর্থ) হলে স্টক আটকানো হয় না — আগের মতো চলে,
  // আর সার্ভার বিক্রয়ের সময় যাচাই করবেই।
  const [srStock,    setSrStock]    = useState({})
  const [stockKnown, setStockKnown] = useState(false)
  const stockAlertRef = useRef(null)

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

  // নেট আসা-যাওয়ায় প্রিভিউ নিজে থেকে অনলাইন/অফলাইন হিসাবে বদলাবে
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      // প্রথমে cache থেকে দেখাও (offline fast load)
      const cachedCustomer = await getCache(`customer_${customerId}`)
      const cachedProducts = (await getCache('products_active')) || (await getCache('products_catalog'))
      // পুরনো (গতকালের) cache হলেও দেখাও — খালি দেখানোর চেয়ে ভালো; অনলাইনে এলে নতুন ডেটা বসবে
      if (cachedCustomer?.data) setCustomer(cachedCustomer.data)
      loadPromoSnapshot(customerId).then(snap => { if (snap) setPromoSnapshot(snap) })
      if (cachedProducts?.data) setProducts(cachedProducts.data)
      // হাতের স্টকের ক্যাশ — অফলাইনেও স্টক দেখানো/আটকানোর জন্য (আজকের না হলে ভরসা করা যায় না)
      const cachedStock = await getCache('sr_stock')
      if (cachedStock?.data && cachedStock.isToday) {
        setSrStock(cachedStock.data)
        setStockKnown(true)
      }
      if (cachedCustomer?.data && cachedProducts?.data) setLoading(false)
      if (!navigator.onLine && !cachedProducts?.data) {
        toast.error('পণ্যের তালিকা সংরক্ষিত নেই। একবার ইন্টারনেট চালু করে অ্যাপ খুলুন।', { duration: 5000 })
      }

      // Online হলে fresh data নাও + cache আপডেট করো
      if (navigator.onLine) {
        try {
          const [custRes, prodRes, stockRes] = await Promise.all([
            api.get(`/customers/${customerId}`),
            api.get('/products?is_active=true'),
            // স্টক আনতে ব্যর্থ হলে বাকি লোড যেন না আটকায় — তাই আলাদা catch
            api.get('/ledger/stock').catch(() => null),
          ])
          if (stockRes?.data?.success) {
            const map = {}
            for (const it of stockRes.data.items || []) {
              const n = Math.max(0, parseInt(it.in_hand_qty) || 0)
              if (n > 0) map[String(it.product_id)] = n
            }
            setSrStock(map)
            setStockKnown(true)
            saveCache('sr_stock', map)
          }
          setCustomer(custRes.data.data)
          setProducts(prodRes.data.data)
          saveCache(`customer_${customerId}`, custRes.data.data)
          saveCache('products_active', prodRes.data.data)
          saveCache('products_catalog', prodRes.data.data)
          // অফলাইন প্রমোশন হিসাবের জন্য snapshot ক্যাশ করো
          fetchAndCachePromoSnapshot(customerId).then(snap => { if (snap) setPromoSnapshot(snap) })
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

  // ── প্রমোশন প্রিভিউ — কার্ট/কাস্টমার বদলালে recalculate ──────────
  // এটাই আগে কখনো call হতো না (Promotions Phase ১ ফিক্স)। ৪০০ms debounce
  // দেওয়া হয়েছে যাতে qty-তে দ্রুত +/- ক্লিকে বারবার API call না হয়।
  // অফলাইনে/error হলে চুপচাপ null — backend createSale নিজে থেকেই সঠিক
  // discount ধরবে (offline sale sync হওয়ার সময়ও), শুধু প্রিভিউটা মিস হবে।
  useEffect(() => {
    const items = Object.entries(selected).map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))
    if (!items.length || !customerId) { setPromoPreview(null); return }

    // ── অফলাইন: ক্যাশ করা অফার দিয়ে ফোনেই হিসাব (আনুমানিক — সিঙ্কে সার্ভার চূড়ান্ত করবে) ──
    if (!isOnline) {
      let cancelled = false
      calculateOfflinePromotions({ snapshot: promoSnapshot, products, items, customer, customerId, promoCode })
        .then(r => { if (!cancelled) setPromoPreview(r) })
        .catch(() => { if (!cancelled) setPromoPreview(null) })
      return () => { cancelled = true }
    }

    const timer = setTimeout(() => {
      api.post('/promotions/calculate', { items, customer_id: customerId, promo_code: promoCode || undefined })
        .then(r => setPromoPreview(r.data.data))
        .catch(() => setPromoPreview(null))
    }, 400)

    return () => clearTimeout(timer)
  }, [selected, customerId, promoCode, isOnline, promoSnapshot, products, customer])

  // এই পণ্য SR-এর হাতে কত পিস আছে। null = জানা নেই (তখন আটকানো হবে না)।
  const getHave = (pid) => {
    const key = String(pid)
    if (key in srStock) return srStock[key]
    return stockKnown ? 0 : null
  }

  // সার্ভার "স্টক কম" জানালে সেই সংখ্যা বসিয়ে দাও — তখন কার্ডগুলো নিজে থেকেই লাল হবে
  // ০-ও স্পষ্টভাবে বসানো হয়: stockKnown=false থাকলেও ওই পণ্যটা "হাতে নেই" হিসেবে ধরা পড়বে,
  // অথচ বাকি পণ্যগুলো (যাদের সংখ্যা জানা নেই) ভুল করে ০ হয়ে যাবে না।
  const applyServerShortages = (shortages) => {
    setSrStock(prev => {
      const next = { ...prev }
      for (const s of shortages) {
        next[String(s.product_id)] = Math.max(0, parseInt(s.have) || 0)
      }
      return next
    })
  }

  // স্টকের বেশি দেওয়া পণ্যের তালিকা — state নয়, প্রতি রেন্ডারে হিসাব হয়, তাই
  // পরিমাণ কমালেই লাল চিহ্ন ও সতর্কতা নিজে থেকে মিলিয়ে যায়
  const overStockLines = products
    .map(p => ({ p, have: getHave(p.id), need: selected[p.id] || 0 }))
    .filter(x => x.have !== null && x.need > x.have)
    .map(x => ({ id: x.p.id, name: x.p.name, have: x.have, need: x.need, unit: x.p.unit || 'pcs' }))

  // এক ট্যাপে স্টক অনুযায়ী ঠিক করা: হাতে যতটা আছে ততটা রাখো, ০ হলে বাদ দাও
  const fixOverStock = (onlyId = null) => {
    const lines = onlyId ? overStockLines.filter(l => String(l.id) === String(onlyId)) : overStockLines
    if (lines.length === 0) return
    setSelected(prev => {
      const next = { ...prev }
      for (const l of lines) {
        if (l.have > 0) next[l.id] = l.have
        else delete next[l.id]
      }
      return next
    })
    if (!onlyId) toast.success('পরিমাণ হাতের স্টক অনুযায়ী ঠিক করা হয়েছে', { duration: 2500 })
  }

  // বিক্রয় হয়ে গেলে লোকাল স্টক ক্যাশ থেকে সেই পরিমাণ বাদ দাও
  const commitStockCache = (soldItems) => {
    if (!stockKnown) return
    const next = {}
    for (const [k, v] of Object.entries(srStock)) if (v > 0) next[k] = v
    for (const { product_id, qty } of soldItems) {
      const key  = String(product_id)
      const left = Math.max(0, (next[key] || 0) - (parseInt(qty) || 0))
      if (left > 0) next[key] = left
      else delete next[key]
    }
    saveCache('sr_stock', next)
  }

  // সতর্কতা বক্স/লাল কার্ডে স্ক্রল করে দেখাও (পেইজ বদলায় না)
  const focusStockProblem = (firstId) => {
    setTimeout(() => {
      // পণ্য ট্যাবে থাকলে সরাসরি প্রথম লাল কার্ডে, অন্য ট্যাবে থাকলে সতর্কতা বক্সে
      const target = (firstId ? document.getElementById(`prod-${firstId}`) : null) || stockAlertRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  const updateQty = (pid, delta, isReplacement = false) => {
    // বিক্রয়ে + চাপলে হাতের স্টকের বেশি যাবে না (রিপ্লেসমেন্টে সীমা নেই — ওটা ফেরত আসা মাল)
    if (!isReplacement && delta > 0) {
      const have = getHave(pid)
      if (have !== null && (selected[pid] || 0) + delta > have) {
        toast(have > 0 ? `এই প্রডাক্টের স্টক আছে ${have} পিস` : 'এই প্রডাক্টের স্টক নেই', { icon: '⚠️', id: `stock-${pid}` })
        return
      }
    }
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
  // promoPreview.total_discount ইতোমধ্যে "বিল কমায় এমন" অংশ (backend-এ
  // payableDiscount হিসেবে হিসাব হয় — buy_x_get_y-এর ফ্রি আইটেমের মূল্য
  // এখানে নেই, সেটা শুধু ফ্রি আইটেম হিসেবেই দেখানো হয়, বিলে ছাড় না)
  const promotionDiscount = promoPreview?.total_discount || 0
  const creditDiscount     = useCreditBalance ? Math.min(creditBalance, Math.max(0, totalAmount - promotionDiscount)) : 0
  const discountAmount     = promotionDiscount + creditDiscount
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

  const isCreditType  = paymentMethod === 'credit' || paymentMethod === 'partial'
  const cashNowNum    = paymentMethod === 'partial' ? (parseFloat(cashNow) || 0) : 0
  const partialValid  = paymentMethod !== 'partial' || (cashNowNum > 0 && cashNowNum < netAmount)
  // বাকির অঙ্ক: পুরো বাকিতে = netAmount, আংশিকে = netAmount − নগদ। ক্রেডিট লিমিট শুধু এই অংশের উপর।
  const dueAmount     = paymentMethod === 'credit' ? netAmount
                      : paymentMethod === 'partial' ? Math.max(0, netAmount - cashNowNum) : 0

  const canCredit = isCreditType &&
    parseFloat(customer?.current_credit || 0) + dueAmount <= parseFloat(customer?.credit_limit || 0)

  // approval দরকার কিনা: settings-এ require_approval=true AND credit limit-এ পৌঁছাবে
  const needsApproval = creditSettings?.require_approval === true &&
    isCreditType && !canCredit

  const sendApprovalRequest = async () => {
    if (requestingApproval) return
    setRequestingApproval(true)
    try {
      const res = await api.post('/credit-approvals/request', {
        customer_id:      customerId,
        requested_amount: dueAmount,
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

    // হাতের স্টকের বেশি কিছু দেওয়া থাকলে সার্ভারে না গিয়ে এই পেইজেই লাল করে দেখাও
    // (সার্ভার তবুও নিজে আবার যাচাই করে — নিচে catch-এ দেখুন)
    if (overStockLines.length > 0) {
      toast.error('কিছু পণ্যের স্টক কম — নিচে লাল দেখানো হয়েছে।', { duration: 3500 })
      focusStockProblem(overStockLines[0].id)
      return
    }

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

    if (paymentMethod === 'partial' && !partialValid) {
      toast.error('নগদের অঙ্ক ০-এর বেশি এবং মোট বিলের কম হতে হবে।')
      return
    }

    if (isCreditType && !canCredit && !needsApproval) {
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
            payment_method:     paymentMethod === 'partial' ? 'credit' : paymentMethod,
            cash_received:      paymentMethod === 'partial' ? cashNowNum : undefined,
            replacement_items:  replacementItems,
            use_credit_balance: useCreditBalance,
            promo_code:         promoCode || undefined, // অফলাইনে লেখা প্রমো কোড sync-এ যাবে
            _receipt_photo_base64: receiptPhotoBase64 || undefined,
            // Idempotency key — retry-তে duplicate invoice প্রতিরোধ
            // crypto.randomUUID() — browser built-in, cryptographically secure UUID v4
            idempotency_key: crypto.randomUUID(),
            // offline summary (UI তে দেখানোর জন্য)
            _customer_name: customer?.shop_name,
            _total:         netAmount,
          },
        })

        // পরের অফলাইন বিক্রয়ে যেন এই পরিমাণ বাদ দিয়ে স্টক দেখায় (ledger sync না হওয়া পর্যন্ত)
        commitStockCache(items)

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
        payment_method:     paymentMethod === 'partial' ? 'credit' : paymentMethod,
        cash_received:      paymentMethod === 'partial' ? cashNowNum : undefined,
        replacement_items:  replacementItems,
        use_credit_balance: useCreditBalance,
        receipt_photo:      receiptPhotoUrl || undefined,
        promo_code:         promoCode || undefined, // ← Phase ২: কোড-ভিত্তিক অফার
        // Idempotency key — network retry-তে duplicate invoice প্রতিরোধ
        // crypto.randomUUID() — browser built-in, cryptographically secure UUID v4
        idempotency_key: crypto.randomUUID(),
      }

      const res = await api.post('/sales', payload)

      commitStockCache(items)

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
      const data = err.response?.data
      // সার্ভারের চূড়ান্ত স্টক যাচাইয়ে আটকালে (অন্য কেউ/অন্য ডিভাইসে স্টক বদলে গেলে)
      // পিছনের ধাপে না পাঠিয়ে এই পেইজেই ওই পণ্যগুলো লাল করে দেখাও
      if (data?.code === 'INSUFFICIENT_SR_STOCK' && Array.isArray(data.shortages) && data.shortages.length > 0) {
        applyServerShortages(data.shortages)
        toast.error('কিছু পণ্যের স্টক কম — নিচে লাল দেখানো হয়েছে।', { duration: 4000 })
        focusStockProblem(data.shortages[0].product_id)
      } else {
        toast.error(data?.message || 'সমস্যা হয়েছে।')
      }
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
                      {sale.payment_status === 'paid' ? (
                        <>
                          <p className="text-sm font-bold text-gray-400 line-through">
                            ৳{parseInt(sale.credit_used).toLocaleString()}
                          </p>
                          <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">আদায় হয়েছে</span>
                        </>
                      ) : (
                        <>
                          {/* remaining_amount নতুন API-তে আসে; না এলে (পুরনো সার্ভার) credit_used-ই দেখায় */}
                          <p className="text-sm font-bold text-red-500">
                            ৳{parseInt(sale.remaining_amount ?? sale.credit_used).toLocaleString()}
                          </p>
                          {sale.payment_status === 'partial' ? (
                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                              আংশিক আদায় (মোট ৳{parseInt(sale.credit_used).toLocaleString()})
                            </span>
                          ) : (
                            <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">বাকি</span>
                          )}
                        </>
                      )}
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
            className={`relative flex-1 py-2 rounded-lg text-xs font-medium transition-all ${step === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {label}
            {key === 'products' && overStockLines.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-red-500" aria-label="স্টক সমস্যা" />
            )}
          </button>
        ))}
      </div>

      {/* ── Products ── */}
      {step === 'products' && (
        <div className="space-y-3">
          <StockAlert lines={overStockLines} onFixAll={() => fixOverStock()} boxRef={stockAlertRef} />
          <ProductFilterBar filter={productFilter} total={products.length} />
          {stockKnown && !isOnline && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              📶 অফলাইন — স্টকের সংখ্যা সর্বশেষ সংরক্ষিত তথ্য থেকে দেখানো হচ্ছে।
            </p>
          )}
          {productFilter.filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">এই ফিল্টারে কোনো পণ্য নেই</p>
          )}
          {productFilter.filtered.map(p => (
            <ProductCard
              key={p.id}
              p={p}
              qty={selected[p.id] || 0}
              onUpdate={updateQty}
              have={getHave(p.id)}
              onFixQty={fixOverStock}
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
          <ProductFilterBar filter={productFilter} total={products.length} />
          {productFilter.filtered.map(p => (
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
            {/* প্রমো কোড — শুধু কোড-ভিত্তিক (redeemable) অফারের জন্য; automatic
                অফার এমনিতেই কার্ট/কাস্টমার দেখে ধরা পড়ে, কোড লাগে না */}
            <div className="flex gap-2 pb-2 border-b border-gray-50">
              <input
                value={promoCode}
                onChange={e => setPromoCode(e.target.value.toUpperCase())}
                placeholder="প্রমো কোড থাকলে লিখুন (optional)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm uppercase"
              />
            </div>
            <div className="flex justify-between"><span className="text-gray-500">পণ্যের মোট</span><span className="font-semibold">৳{totalAmount.toLocaleString('en', { maximumFractionDigits: 2 })}</span></div>
            {promotionDiscount > 0 && <div className="flex justify-between text-pink-600"><span>🎁 প্রমোশন ছাড়</span><span>-৳{promotionDiscount.toFixed(2)}</span></div>}
            {promoPreview?.free_items?.length > 0 && (
              <div className="text-xs text-pink-600 bg-pink-50 rounded-lg px-3 py-2">
                ফ্রি পাবেন: {promoPreview.free_items.map(fi => `${fi.qty} x ${fi.name}`).join(', ')}
              </div>
            )}
            {(promoPreview?.target_progress || []).map(tp => (
              <div key={tp.promotion_id} className={`text-xs rounded-lg px-3 py-2 ${tp.reached ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'}`}>
                🎯 {tp.name}: ৳{Math.round(tp.achieved).toLocaleString()} / ৳{Math.round(tp.target).toLocaleString()}
                {tp.reached
                  ? ` — টার্গেট পূর্ণ! ${tp.gift_qty}টা ${tp.gift_name} গিফট পাবেন`
                  : ` — আর ৳${Math.round(tp.remaining).toLocaleString()} কিনলে ${tp.gift_qty}টা ${tp.gift_name} গিফট`}
              </div>
            ))}
            {promoCode && promoPreview && !promotionDiscount && !promoPreview.free_items?.length && (
              <p className="text-xs text-red-500">
                {promoPreview.code_status === 'unverifiable'
                  ? 'এই ডিভাইসে অফলাইনে কোড যাচাই করা যাচ্ছে না — সিঙ্কের সময় সার্ভার যাচাই করবে।'
                  : promoPreview.code_status === 'matched'
                    ? 'কোডটা সঠিক, কিন্তু এই কার্ট/কাস্টমারের জন্য শর্ত পূরণ হয়নি (ন্যূনতম অর্ডার, পণ্য বা ব্যবহারসীমা)।'
                    : 'কোডটা মিলছে না বা মেয়াদ শেষ — বানান চেক করুন।'}
              </p>
            )}
            {promoPreview?._offline && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                📶 অফলাইন হিসাব (আনুমানিক) — সিঙ্কের সময় সার্ভার চূড়ান্ত ছাড় নিশ্চিত করবে।
                {promoPreview._noSnapshot && ' এই ডিভাইসে অফারের তালিকা সংরক্ষিত নেই — একবার অনলাইনে এই পেজ খুলুন।'}
              </p>
            )}
            {creditDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>ব্যালেন্স ছাড়</span><span>-৳{creditDiscount.toFixed(2)}</span></div>}
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
            const willExceed = isCreditType && (used + dueAmount) > limit

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
                      style={{ width: `${isCreditType ? Math.min(100, Math.round(((used + dueAmount) / limit) * 100)) : pct}%` }}
                    />
                  </div>
                  {isCreditType && !isFull && (
                    <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                      এই বিক্রয়ের পর: {Math.min(100, Math.round(((used + dueAmount) / limit) * 100))}%
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
                {isHigh && !willExceed && isCreditType && (
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
              { key: 'partial', label: '💵+📋 আংশিক (নগদ + বাকি)', desc: 'কিছু নগদ নিন, বাকিটা বাকি রাখুন — কমিশন শুধু নগদের উপর' },
              { key: 'credit', label: '📋 বাকি', desc: `লিমিট: ৳${parseFloat(customer?.credit_limit || 0).toLocaleString()} | বর্তমান বাকি: ৳${parseFloat(customer?.current_credit || 0).toLocaleString()}` },
            ].map(pm => (
              <button
                key={pm.key}
                onClick={() => setPaymentMethod(pm.key)}
                disabled={(pm.key === 'credit' || pm.key === 'partial') && parseFloat(customer?.credit_limit || 0) === 0}
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

            {paymentMethod === 'partial' && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
                <label className="text-xs font-semibold text-gray-700">এখন কত টাকা নগদ নিলেন? (৳)</label>
                <input
                  type="number" inputMode="decimal" min="0" value={cashNow}
                  onChange={e => setCashNow(e.target.value)}
                  placeholder="যেমন: 4500"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700 font-semibold">💵 নগদ: ৳{cashNowNum.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
                  <span className="text-amber-700 font-semibold">📋 বাকি: ৳{dueAmount.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
                </div>
                {cashNow !== '' && !partialValid && (
                  <p className="text-[11px] text-red-600">নগদ ০-এর বেশি এবং মোট বিলের (৳{netAmount.toLocaleString('en', { maximumFractionDigits: 2 })}) কম হতে হবে।</p>
                )}
              </div>
            )}
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

          {/* স্টক সমস্যা ধরা পড়লে এখানেই দেখাবে — পিছনের ধাপে যেতে হবে না */}
          <StockAlert
            lines={overStockLines}
            onFixAll={() => fixOverStock()}
            onShowProducts={() => { setStep('products'); focusStockProblem(overStockLines[0]?.id) }}
            boxRef={stockAlertRef}
          />

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
