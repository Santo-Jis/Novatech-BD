// ============================================================
// components/OrderRequestTab.jsx
// ============================================================
// E-commerce ট্যাব — অর্কেস্ট্রেটর। এই ফাইলটা নিজে কোনো UI আঁকে
// না (সাব-ট্যাব সুইচ ছাড়া) — ভারী সব কাজ ./ecommerce/ ফোল্ডারের
// কম্পোনেন্টে ভাগ করা:
//
//   ShopView            → সার্চ/সর্ট/প্রোডাক্ট গ্রিড (ডিফল্ট ল্যান্ডিং)
//   ProductCard          → গ্রিডের একটা কার্ড
//   ProductDetailSheet   → কার্ডে ট্যাপ করলে যে শিট খোলে
//   CartBar              → নিচে ভাসমান persistent কার্ট বার
//   CheckoutSheet        → রিভিউ + দাম ব্রেকডাউন + সাবমিট
//   OrderHistoryView     → "আমার অর্ডার" সাব-ট্যাব
//
// এই ফাইল যা মালিকানায় রাখে (শেয়ার্ড স্টেট, তাই এখানেই থাকা
// দরকার):
//   • cart + productCache  — কার্ট আইটেমের নাম/দাম যেন সার্চ
//     পাল্টালেও হারিয়ে না যায় (পুরনো বাগ ফিক্স — নিচে দ্রষ্টব্য)
//   • সব API কল (endpoint অপরিবর্তিত: /portal/products,
//     /portal/order-requests, /portal/order-request)
//   • ডেলিভারি polling (৩০s, অপরিবর্তিত লজিক)
//
// ✅ প্রোডাক্ট cache ফিক্স: আগে রিভিউ শিটে প্রোডাক্টের নাম খোঁজা
// হতো তখনকার filtered `products` লিস্ট থেকে — সার্চ পাল্টালে
// সেই লিস্ট বদলে যেত আর কার্টে-রাখা প্রোডাক্টের নাম না পেয়ে raw
// UUID দেখাত। এখন productCache (ref) প্রতিটা fetch/add-এ প্রতিটা
// প্রোডাক্ট জমা রাখে, id দিয়ে — তাই যেকোনো সময় কার্টে থাকা যেকোনো
// আইটেমের নাম/দাম/স্টক নির্ভরযোগ্যভাবে পাওয়া যায়।
// ============================================================
import { useState, useEffect, useRef } from 'react'
import { FiShoppingBag, FiClock } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import OrderTrackingModal from './OrderTrackingModal'
import ShopView from './ecommerce/ShopView'
import ProductDetailSheet from './ecommerce/ProductDetailSheet'
import CartBar from './ecommerce/CartBar'
import CheckoutSheet from './ecommerce/CheckoutSheet'
import OrderHistoryView from './ecommerce/OrderHistoryView'

const PAGE_SIZE = 12

export default function OrderRequestTab({ portalJWT }) {
  // ── সাব-ট্যাব ──────────────────────────────────────────────
  const [subTab, setSubTab] = useState('shop')   // 'shop' | 'history'

  // ── শপ / প্রোডাক্ট ─────────────────────────────────────────
  const [products,        setProducts]        = useState([])
  const [initialLoading,  setInitialLoading]  = useState(true)
  const [loadingMore,     setLoadingMore]     = useState(false)
  const [productsError,   setProductsError]   = useState(null)
  const [search,          setSearch]          = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [sort,            setSort]            = useState('name')
  const [page,            setPage]            = useState(1)
  const [hasNext,         setHasNext]         = useState(false)
  const [total,           setTotal]           = useState(0)

  // প্রতিটা fetch/add-এ প্রতিটা প্রোডাক্ট এখানে জমা হয় (id → product)
  const productCache = useRef({})

  // ── কার্ট ──────────────────────────────────────────────────
  const [cart,            setCart]            = useState({})  // { [productId]: qty }
  const [note,            setNote]            = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showCheckout,    setShowCheckout]    = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [submitError,     setSubmitError]     = useState(null)

  // ── অর্ডার হিস্টোরি ────────────────────────────────────────
  const [requests,        setRequests]        = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError,   setRequestsError]   = useState(null)
  const [trackingId,      setTrackingId]      = useState(null)
  const [deliveredToast,  setDeliveredToast]  = useState(null)
  const [successMsg,      setSuccessMsg]      = useState('')

  // ── ডেটা লোড ───────────────────────────────────────────────
  const loadProducts = async (searchTerm = '', pageNum = 1, append = false) => {
    if (append) setLoadingMore(true); else setInitialLoading(true)
    setProductsError(null)
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE })
      if (searchTerm) params.set('search', searchTerm)
      const data = await portalFetch(`/portal/products?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const prods = data.data || []
      prods.forEach(p => { productCache.current[p.id] = p })
      setProducts(prev => append ? [...prev, ...prods] : prods)
      setPage(data.pagination?.page || pageNum)
      setTotal(data.pagination?.total || 0)
      setHasNext(data.pagination?.has_next || false)
    } catch {
      setProductsError('পণ্য তালিকা আনতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।')
    } finally {
      setInitialLoading(false)
      setLoadingMore(false)
    }
  }

  const loadRequests = async () => {
    setRequestsLoading(true)
    setRequestsError(null)
    try {
      const data = await portalFetch('/portal/order-requests', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setRequests(data.data || [])
    } catch {
      setRequestsError('অর্ডার লিস্ট আনতে সমস্যা হয়েছে।')
    } finally {
      setRequestsLoading(false)
    }
  }

  // ✅ শপ ডিফল্ট ল্যান্ডিং হলেও হিস্টোরি সমান্তরালে লোড হয় —
  // তাই "আমার অর্ডার"-এ সুইচ করলে অপেক্ষা করতে হয় না, আর
  // pendingCount ব্যাজ শুরু থেকেই সঠিক দেখায়।
  useEffect(() => {
    loadProducts()
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── ডেলিভারি নোটিফিকেশন পোলিং (৩০s) ─────────────────────────
  // ✅ আগে শুধু history ভিউতে থাকলে পোল করত। এখন E-commerce ট্যাবে
  // থাকা অবস্থায় (শপ/হিস্টোরি যেকোনোটাতেই) সক্রিয় থাকে — কারণ
  // "আপনার অর্ডার পৌঁছে গেছে" নোটিফিকেশন শপিং করার সময়ও প্রাসঙ্গিক।
  // ট্যাব থেকে বেরিয়ে গেলে (কম্পোনেন্ট আনমাউন্ট) নিজে থেকেই বন্ধ
  // হয়ে যায়।
  const prevStatusesRef = useRef({})
  useEffect(() => {
    prevStatusesRef.current = {}
    requests.forEach(r => { prevStatusesRef.current[r.id] = r.status })
  }, [requests])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await portalFetch('/portal/order-requests', {
          headers: { Authorization: `Bearer ${portalJWT}` }
        })
        const updated = data.data || []
        const newlyDelivered = updated.find(r =>
          r.status === 'delivered' &&
          prevStatusesRef.current[r.id] &&
          prevStatusesRef.current[r.id] !== 'delivered'
        )
        if (newlyDelivered) {
          setDeliveredToast(newlyDelivered)
          setTimeout(() => setDeliveredToast(null), 6000)
        }
        setRequests(updated)
      } catch { /* silent — background poll, ব্যর্থ হলে চুপচাপ পরের বার চেষ্টা */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [portalJWT])

  // ── কার্ট হেল্পার ──────────────────────────────────────────
  const addToCart = (product) => {
    productCache.current[product.id] = product
    setCart(prev => ({ ...prev, [product.id]: 1 }))
  }

  const incQty = (productId) => {
    const product = productCache.current[productId]
    const stock = product ? (Number(product.available_stock) || 0) : Infinity
    setCart(prev => {
      const next = (prev[productId] || 0) + 1
      if (next > stock) return prev
      return { ...prev, [productId]: next }
    })
  }

  const decQty = (productId) => {
    setCart(prev => {
      const next = (prev[productId] || 0) - 1
      if (next <= 0) {
        const { [productId]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: next }
    })
  }

  const removeFromCart = (productId) => {
    setCart(prev => {
      const { [productId]: _drop, ...rest } = prev
      return rest
    })
  }

  const cartEntries = Object.entries(cart).filter(([, qty]) => qty > 0)
  const cartCount   = cartEntries.length
  const itemCount   = cartEntries.reduce((s, [, qty]) => s + qty, 0)
  const checkoutItems = cartEntries
    .map(([id, qty]) => ({ product: productCache.current[id], qty }))
    .filter(x => x.product)   // ডিফেন্সিভ — cache-এ না থাকলে (ঘটার কথা না) স্কিপ
  const totalAmount = checkoutItems.reduce(
    (s, { product, qty }) => s + (Number(product.final_price ?? product.base_price) || 0) * qty,
    0
  )
  const pendingCount = requests.filter(r => r.status === 'pending').length

  // চেকআউট শিট খোলা অবস্থায় সবগুলো আইটেম রিমুভ হয়ে গেলে শিট নিজে
  // থেকেই বন্ধ হয়ে যাবে — খালি "কার্ট খালি" স্ক্রিনে আটকে থাকতে হবে না
  useEffect(() => {
    if (showCheckout && checkoutItems.length === 0) setShowCheckout(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutItems.length, showCheckout])

  // ── সার্চ ──────────────────────────────────────────────────
  // overrideValue দরকার কারণ "✕ ক্লিয়ার" বাটনে onSearchChange('')
  // আর onSearchSubmit('') একই হ্যান্ডলারে পরপর কল হয় — React state
  // batching-এর কারণে তখনো `search` state আপডেট হয়নি, তাই override
  // ছাড়া পুরনো (স্টেল) মান দিয়ে সার্চ হয়ে যেত।
  const runSearch = (overrideValue) => {
    const q = overrideValue !== undefined ? overrideValue : search
    setCommittedSearch(q)
    loadProducts(q, 1, false)
  }

  // ── সর্ট (ক্লায়েন্ট-সাইড, লোড-করা প্রোডাক্টের উপর) ────────────
  const sortedProducts = [...products].sort((a, b) => {
    if (sort === 'price_asc')  return (Number(a.final_price ?? a.base_price) || 0) - (Number(b.final_price ?? b.base_price) || 0)
    if (sort === 'price_desc') return (Number(b.final_price ?? b.base_price) || 0) - (Number(a.final_price ?? a.base_price) || 0)
    return (a.name || '').localeCompare(b.name || '', 'bn')
  })

  // ── চেকআউট সাবমিট ───────────────────────────────────────────
  // ✅ আগে "নিশ্চিত করুন"-এ ট্যাপ করলেই শিট সাথে সাথে বন্ধ হয়ে যেত
  // (রেসপন্সের অপেক্ষা না করেই) — ফেইল করলে ইউজার খালি পেইজে একটা
  // ছোট এরর টেক্সট দেখত। এখন শিট খোলা থাকে যতক্ষণ না সফল হয়;
  // ফেইল করলে শিটের ভেতরেই কারণ দেখায়, কার্ট/নোট অক্ষত থাকে।
  const handleConfirm = async () => {
    if (checkoutItems.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const items = checkoutItems.map(({ product, qty }) => ({ product_id: product.id, qty }))
      const res = await portalFetch('/portal/order-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, note })
      })
      setCart({})
      setNote('')
      setShowCheckout(false)
      setSuccessMsg(
        res.has_pending_order
          ? '✅ অর্ডার পাঠানো হয়েছে। তবে আগের একটি অর্ডার এখনো pending আছে — SR শীঘ্রই আসবে। 🎉'
          : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে। 🎉'
      )
      setSubTab('history')
      loadRequests()
    } catch (e) {
      setSubmitError(e.message || 'অর্ডার পাঠাতে সমস্যা হয়েছে। আবার চেষ্টা করুন।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* সাব-ট্যাব সুইচ: শপ ⇄ আমার অর্ডার */}
      <div className="flex bg-cp-bg-alt rounded-xl p-1 gap-1">
        <button
          onClick={() => setSubTab('shop')}
          className={
            subTab === 'shop'
              ? 'flex-1 h-9 rounded-lg bg-white shadow-sm text-cp-trust-700 text-[13px] font-cp-head font-bold flex items-center justify-center gap-1.5 transition-colors'
              : 'flex-1 h-9 rounded-lg text-cp-text-secondary text-[13px] font-cp-head font-semibold flex items-center justify-center gap-1.5 transition-colors'
          }
        >
          <FiShoppingBag className="w-3.5 h-3.5" /> শপ
        </button>
        <button
          onClick={() => setSubTab('history')}
          className={
            subTab === 'history'
              ? 'flex-1 h-9 rounded-lg bg-white shadow-sm text-cp-trust-700 text-[13px] font-cp-head font-bold flex items-center justify-center gap-1.5 transition-colors'
              : 'flex-1 h-9 rounded-lg text-cp-text-secondary text-[13px] font-cp-head font-semibold flex items-center justify-center gap-1.5 transition-colors'
          }
        >
          <FiClock className="w-3.5 h-3.5" /> আমার অর্ডার
          {pendingCount > 0 && (
            <span className="bg-cp-warmth-600 text-white text-[9.5px] font-cp-head font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {subTab === 'shop' ? (
        <ShopView
          products={sortedProducts}
          initialLoading={initialLoading}
          loadingMore={loadingMore}
          error={productsError}
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={runSearch}
          committedSearch={committedSearch}
          sort={sort}
          onSortChange={setSort}
          cart={cart}
          onOpenDetail={setSelectedProduct}
          onAdd={addToCart}
          onInc={incQty}
          onDec={decQty}
          hasNext={hasNext}
          onLoadMore={() => loadProducts(committedSearch, page + 1, true)}
          total={total}
          onRetry={() => loadProducts(committedSearch, 1)}
        />
      ) : (
        <OrderHistoryView
          requests={requests}
          loading={requestsLoading}
          error={requestsError}
          onRetry={loadRequests}
          deliveredToast={deliveredToast}
          onDismissToast={() => setDeliveredToast(null)}
          successMsg={successMsg}
          onDismissSuccess={() => setSuccessMsg('')}
          onTrack={setTrackingId}
          onGoShop={() => setSubTab('shop')}
        />
      )}

      <ProductDetailSheet
        product={selectedProduct}
        qty={selectedProduct ? (cart[selectedProduct.id] || 0) : 0}
        onClose={() => setSelectedProduct(null)}
        onAdd={addToCart}
        onInc={incQty}
        onDec={decQty}
      />

      {!showCheckout && (
        <CartBar
          cartCount={cartCount}
          itemCount={itemCount}
          totalAmount={totalAmount}
          onCheckout={() => setShowCheckout(true)}
        />
      )}

      {showCheckout && (
        <CheckoutSheet
          items={checkoutItems}
          note={note}
          onNoteChange={setNote}
          onInc={incQty}
          onDec={decQty}
          onRemove={removeFromCart}
          pendingCount={pendingCount}
          submitting={submitting}
          submitError={submitError}
          onClose={() => { if (!submitting) { setShowCheckout(false); setSubmitError(null) } }}
          onConfirm={handleConfirm}
        />
      )}

      <OrderTrackingModal orderId={trackingId} jwt={portalJWT} onClose={() => setTrackingId(null)} />
    </div>
  )
}
