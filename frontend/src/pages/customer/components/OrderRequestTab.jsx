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
//
// ✅ পরের আপডেট (৩টা ফিক্স):
//   ১. বাল্ক কোয়ান্টিটি — QtyStepper-এর সংখ্যায় ট্যাপ করে সরাসরি
//      টাইপ করা যায় এখন (আগে শুধু +/- ট্যাপ, ৫০ পিসের জন্য ৫০ ট্যাপ লাগত)
//   ২. ক্যাটাগরি ফিল্টার — /portal/categories (নতুন এন্ডপয়েন্ট) +
//      getPortalProducts-এ ?category= প্যারাম। কোনো ক্যাটাগরি/অ্যাসাইনমেন্ট
//      না থাকলে চিপ রো-ই দেখাবে না (graceful — কিছু ভাঙে না)
//   ৩. ছবি lazy-loading + fade-in — স্লো নেটওয়ার্কে ভালো অভিজ্ঞতা
//
// ✅ NEW (পার্ট ৩ — Shop কোম্পানি ফিল্টার + ব্যাজ):
//   • sellers/sellerId — ক্যাটাগরির মতোই সার্ভার-সাইড ফিল্টার
//     (/portal/product-sellers + getPortalProducts-এ ?seller=)
//   • connectedCompanyIds — /portal/connections/my-companies থেকে,
//     ProductCard-এ "নতুন কোম্পানি" ব্যাজ দেখানোর জন্য
//
// ✅ FIX (ফেজ ০): উপরের #২-তে যে ক্যাটাগরি ফিল্টার বাগের কথা বলা
// হয়েছিল (portalAuth দিয়ে /portal/categories রুট না থাকা, আর
// getPortalProducts-এ ?category= না পড়া) — সেটা এখন ঠিক হয়েছে।
// এই ফাইলে কোনো পরিবর্তন লাগেনি, শুধু ব্যাকএন্ড wiring।
//
// ✅ NEW (ফেজ ০ — "বিশেষ মূল্য" ব্যাজ): getPortalProducts এখন
// list_price/has_special_price পাঠায় (ProductCard ও ProductDetailSheet-এ
// দেখানো হয়) — এই ফাইলে কোনো পরিবর্তন লাগেনি, ডেটা এমনিতেই pass-through হয়।
// ============================================================
import { useState, useEffect, useRef, useMemo } from 'react'
import { FiShoppingBag, FiClock, FiHeart } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import OrderTrackingModal from './OrderTrackingModal'
import ShopView from './ecommerce/ShopView'
import ProductDetailSheet from './ecommerce/ProductDetailSheet'
import CartBar from './ecommerce/CartBar'
import CheckoutSheet from './ecommerce/CheckoutSheet'
import OrderHistoryView from './ecommerce/OrderHistoryView'
import WishlistView from './ecommerce/WishlistView'

const PAGE_SIZE = 12

export default function OrderRequestTab({ portalJWT }) {
  // ── সাব-ট্যাব ──────────────────────────────────────────────
  const [subTab, setSubTab] = useState('shop')   // 'shop' | 'history' | 'saved' ✅ ফেজ ৩

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
  const [categories,      setCategories]      = useState([])   // ✅ নতুন
  const [categoryId,      setCategoryId]      = useState('')   // ✅ নতুন — '' = সব
  const [sellers,         setSellers]         = useState([])   // ✅ নতুন (পার্ট ৩)
  const [sellerId,        setSellerId]        = useState('')   // ✅ নতুন (পার্ট ৩) — '' = সব
  // ✅ নতুন (পার্ট ৩) — কাস্টমার কোন কোম্পানিগুলোর সাথে connected তার
  // tenant_id সেট। null = এখনো লোড হয়নি (এই অবস্থায় ProductCard কোনো
  // "নতুন কোম্পানি" ব্যাজ দেখাবে না — লোড হওয়ার আগে ভুল ব্যাজ ফ্ল্যাশ
  // করার চেয়ে চুপ থাকা ভালো)
  const [connectedCompanyIds, setConnectedCompanyIds] = useState(null)
  // ✅ NEW (ফেজ ১ — আইটেম ৩) — হোরাইজন্টাল-স্ক্রল রো, শুধু ডিফল্ট
  // (কোনো সার্চ/ফিল্টার একটিভ না থাকা) ভিউতে দেখা যায়
  const [bestsellers,        setBestsellers]        = useState([])
  const [newArrivals,        setNewArrivals]        = useState([])
  // ✅ NEW (ফেজ ৩ — উইশলিস্ট)
  const [wishlist,        setWishlist]        = useState([])
  const [wishlistLoading, setWishlistLoading] = useState(true)
  const wishlistIds = useMemo(() => new Set(wishlist.map(p => p.id)), [wishlist])
  // ✅ NEW (ফেজ ৩ — সম্প্রতি দেখা) — শুধু session state, নতুন টেবিল লাগেনি
  const [recentlyViewedIds, setRecentlyViewedIds] = useState([]) // সাম্প্রতিক আগে

  // প্রতিটা fetch/add-এ প্রতিটা প্রোডাক্ট এখানে জমা হয় (id → product)
  // ✅ FIX (১ সেপ্টেম্বর ২০২৬): এটা নিচে recentlyViewed-এর ব্যবহারের
  // *আগে* থাকা আবশ্যক — const হওয়ায় TDZ-তে পড়ে "Cannot access
  // 'productCache' before initialization" ছুঁড়ছিল, কিন্তু শুধু তখনই
  // যখন recentlyViewedIds খালি না (মানে প্রথম প্রোডাক্ট ক্লিকের পরে,
  // .map() callback আসলে চালু হলে) — তাই প্রথম রেন্ডারে ধরা পড়েনি,
  // শুধু প্রোডাক্ট ডিটেইল খোলার সাথে সাথেই পুরো shop view ক্র্যাশ করত।
  const productCache = useRef({})

  const recentlyViewed = recentlyViewedIds.map(id => productCache.current[id]).filter(Boolean)

  // ── কার্ট ──────────────────────────────────────────────────
  const [cart,            setCart]            = useState({})  // { [productId]: qty }
  const [note,            setNote]            = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  // ✅ NEW (ফেজ ২ — প্রোডাক্ট পেজ রিচনেস)
  const [relatedProducts, setRelatedProducts] = useState([])
  const [relatedLoading,  setRelatedLoading]  = useState(false)
  const [showCheckout,    setShowCheckout]    = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [submitError,     setSubmitError]     = useState(null)
  // ✅ NEW (ফেজ ০ — Promotions এক্সপোজার): checkout খোলা অবস্থায়
  // { applicable_promotions, total_discount, free_items } | null
  const [promotionInfo,   setPromotionInfo]   = useState(null)

  // ── অর্ডার হিস্টোরি ────────────────────────────────────────
  const [requests,        setRequests]        = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError,   setRequestsError]   = useState(null)
  const [trackingId,      setTrackingId]      = useState(null)
  const [deliveredToast,  setDeliveredToast]  = useState(null)
  const [successMsg,      setSuccessMsg]      = useState('')

  // ── ডেটা লোড ───────────────────────────────────────────────
  // categoryFilter/sellerFilter override না দিলে বর্তমান categoryId/
  // sellerId state ব্যবহার হয় (search-এর overrideValue প্যাটার্নের
  // মতোই — চিপ ট্যাপে stale closure এড়াতে explicit override পাঠানো হয়)
  const loadProducts = async (searchTerm = '', pageNum = 1, append = false, categoryFilter, sellerFilter) => {
    if (append) setLoadingMore(true); else setInitialLoading(true)
    setProductsError(null)
    try {
      const cat    = categoryFilter !== undefined ? categoryFilter : categoryId
      const seller = sellerFilter   !== undefined ? sellerFilter   : sellerId
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE })
      if (searchTerm) params.set('search', searchTerm)
      if (cat)        params.set('category', cat)
      if (seller)     params.set('seller', seller)   // ✅ নতুন (পার্ট ৩)
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

  // ✅ নতুন — ক্যাটাগরি চিপ লিস্ট। ব্যর্থ হলে চুপচাপ (চিপ রো-ই দেখাবে
  // না, শপিং-এ বাধা দেবে না — migration না চালানো থাকলেও অ্যাপ
  // স্বাভাবিকভাবে চলবে)
  const loadCategories = async () => {
    try {
      const data = await portalFetch('/portal/categories', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setCategories(data.data || [])
    } catch { /* silent — ক্যাটাগরি ফিচার optional, ব্যর্থ হলে শুধু চিপ রো লুকানো থাকবে */ }
  }

  // ✅ নতুন (পার্ট ৩) — বিক্রেতা/কোম্পানি চিপ লিস্ট, loadCategories-এর
  // মতোই graceful — ব্যর্থ হলে চুপচাপ, চিপ রো লুকানো থাকবে
  const loadSellers = async () => {
    try {
      const data = await portalFetch('/portal/product-sellers', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setSellers(data.data || [])
    } catch { /* silent — filter চিপ optional */ }
  }

  // ✅ নতুন (পার্ট ৩) — কাস্টমার কোন কোম্পানিগুলোর সাথে connected তা
  // জানার জন্য (ProductCard-এ "নতুন কোম্পানি" ব্যাজ দেখানোর জন্য)।
  // ব্যর্থ হলেও চুপচাপ — connectedCompanyIds null-ই থেকে যাবে, ব্যাজ
  // কোথাও দেখাবে না (fail-safe: ভুল করে "নতুন" ট্যাগ লাগানোর চেয়ে
  // কোনো ট্যাগ না-লাগানো নিরাপদ)
  const loadConnectedCompanies = async () => {
    try {
      const data = await portalFetch('/portal/connections/my-companies', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setConnectedCompanyIds(new Set((data.data || []).map(c => c.tenant_id)))
    } catch { /* silent */ }
  }

  // ✅ NEW (ফেজ ১ — আইটেম ৩) — বেস্টসেলার/নতুন রো। loadCategories-এর
  // মতোই graceful — ব্যর্থ হলে চুপচাপ, রো-ই দেখাবে না
  const loadBestsellers = async () => {
    try {
      const data = await portalFetch('/portal/products?sort=bestseller&limit=10', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const prods = data.data || []
      prods.forEach(p => { productCache.current[p.id] = p })
      setBestsellers(prods)
    } catch { /* silent — optional রো */ }
  }

  const loadNewArrivals = async () => {
    try {
      const data = await portalFetch('/portal/products?sort=newest&limit=10', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const prods = data.data || []
      prods.forEach(p => { productCache.current[p.id] = p })
      setNewArrivals(prods)
    } catch { /* silent — optional রো */ }
  }

  // ✅ NEW (ফেজ ৩ — উইশলিস্ট)
  const loadWishlist = async () => {
    setWishlistLoading(true)
    try {
      const data = await portalFetch('/portal/wishlist', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const items = data.data || []
      items.forEach(p => { productCache.current[p.id] = p })
      setWishlist(items)
    } catch { /* silent — ট্যাবটা খালি দেখাবে, ক্র্যাশ করবে না */ }
    finally { setWishlistLoading(false) }
  }

  // অপ্টিমিস্টিক — UI সাথে সাথে বদলায়, API ব্যাকগ্রাউন্ডে; ব্যর্থ হলে revert
  const toggleWishlist = async (product) => {
    const already = wishlistIds.has(product.id)
    if (already) {
      setWishlist(prev => prev.filter(p => p.id !== product.id))
      try {
        await portalFetch(`/portal/wishlist/${product.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${portalJWT}` }
        })
      } catch {
        setWishlist(prev => [...prev, product]) // revert
      }
    } else {
      setWishlist(prev => [product, ...prev])
      try {
        await portalFetch('/portal/wishlist', {
          method: 'POST',
          headers: { Authorization: `Bearer ${portalJWT}` },
          body: JSON.stringify({ product_id: product.id })
        })
      } catch {
        setWishlist(prev => prev.filter(p => p.id !== product.id)) // revert
      }
    }
  }

  // ✅ NEW (ফেজ ২ — প্রোডাক্ট পেজ রিচনেস) — শিট সাথে সাথে cached ডেটা
  // দিয়ে খুলে যায় (ইনস্ট্যান্ট, আগের UX অপরিবর্তিত), তারপর background-এ
  // গ্যালারি + রিলেটেড প্রোডাক্ট fetch হয়ে merge হয়। fetch ব্যর্থ হলে
  // চুপচাপ — cached ডেটা দিয়েই (গ্যালারি/রিলেটেড ছাড়া) চলবে।
  const openProductDetail = async (product) => {
    setSelectedProduct(product)
    setRelatedProducts([])
    setRelatedLoading(true)

    // ✅ NEW (ফেজ ৩ — সম্প্রতি দেখা) — সবচেয়ে সাম্প্রতিক আগে, ডুপ্লিকেট
    // বাদ, সর্বোচ্চ ১০টা
    setRecentlyViewedIds(prev => [product.id, ...prev.filter(id => id !== product.id)].slice(0, 10))

    portalFetch(`/portal/products/${product.id}`, {
      headers: { Authorization: `Bearer ${portalJWT}` }
    }).then(data => {
      const detail = data.data
      if (!detail) return
      const merged = {
        ...product,
        gallery:           detail.gallery || [],
        base_price:        detail.pricing?.base_price        ?? product.base_price,
        final_price:       detail.pricing?.final_price       ?? product.final_price,
        list_price:        detail.pricing?.list_price        ?? product.list_price,
        has_special_price: detail.pricing?.has_special_price ?? product.has_special_price,
        available_stock:   detail.available_stock ?? product.available_stock,
      }
      productCache.current[product.id] = merged
      // ইউজার ইতিমধ্যে অন্য প্রোডাক্টে সরে গেলে পুরনো fetch-এর ফলাফল বসিয়ে দেওয়া ঠিক না
      setSelectedProduct(curr => (curr && curr.id === product.id) ? merged : curr)
    }).catch(() => { /* silent — cached data দিয়েই চলবে */ })

    portalFetch(`/portal/products/${product.id}/related`, {
      headers: { Authorization: `Bearer ${portalJWT}` }
    }).then(data => {
      setRelatedProducts(data.data || [])
    }).catch(() => { /* silent — রো-টাই দেখাবে না */ })
      .finally(() => setRelatedLoading(false))
  }

  const loadRequests = async () => {
    setRequestsLoading(true)
    setRequestsError(null)
    try {
      // ✅ ফিক্স — আগে /portal/order-requests (সেশনের এক কোম্পানি) কল হতো।
      // createOrderRequest এখন একাধিক কোম্পানিতে ভাগ করে অর্ডার বানায়,
      // তাই হিস্ট্রিও সব কোম্পানি জুড়ে (aggregate + company-ট্যাগ) হওয়া
      // দরকার — নাহলে ৩-কোম্পানির অর্ডারের ২টা এখানে দেখাই যেত না।
      const data = await portalFetch('/portal/connections/all-order-requests', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setRequests(data.data || [])
    } catch {
      setRequestsError('অর্ডার লিস্ট আনতে সমস্যা হয়েছে।')
    } finally {
      setRequestsLoading(false)
    }
  }

  // ✅ NEW (ফেজ ৪ — রিফান্ড ফ্লো) — pending অর্ডার বাতিল। ব্যাকএন্ড
  // (cancelMyOrderRequest) নিজে থেকেই বুঝে নেয় payment_status='paid'
  // থাকলে refund_pending-এ পাঠাতে হবে কিনা — এখানে শুধু কল + রিফ্রেশ।
  const cancelOrder = async (id) => {
    try {
      const res = await portalFetch(`/portal/order-requests/${id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setSuccessMsg(res.message || 'অর্ডার বাতিল করা হয়েছে।')
      loadRequests()
    } catch (e) {
      setRequestsError(e.message || 'অর্ডার বাতিল করতে সমস্যা হয়েছে।')
    }
  }

  // ✅ শপ ডিফল্ট ল্যান্ডিং হলেও হিস্টোরি সমান্তরালে লোড হয় —
  // তাই "আমার অর্ডার"-এ সুইচ করলে অপেক্ষা করতে হয় না, আর
  // pendingCount ব্যাজ শুরু থেকেই সঠিক দেখায়।
  useEffect(() => {
    loadProducts()
    loadRequests()
    loadCategories()
    loadSellers()             // ✅ নতুন (পার্ট ৩)
    loadConnectedCompanies()  // ✅ নতুন (পার্ট ৩)
    loadBestsellers()         // ✅ NEW (ফেজ ১ — আইটেম ৩)
    loadNewArrivals()         // ✅ NEW (ফেজ ১ — আইটেম ৩)
    loadWishlist()            // ✅ NEW (ফেজ ৩)
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
        // ✅ ফিক্স — এটাও aggregate এন্ডপয়েন্টে, নাহলে অন্য কোম্পানির
        // অর্ডার ডেলিভারড হলে "পৌঁছে গেছে" টোস্ট কখনো দেখাত না
        const data = await portalFetch('/portal/connections/all-order-requests', {
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

  // ✅ নতুন — QtyStepper-এ সংখ্যায় ট্যাপ করে সরাসরি টাইপ করলে এটা
  // কল হয় (বাল্ক অর্ডারের জন্য, ৫০ বার ট্যাপ করা লাগবে না)
  const setExactQty = (productId, qty) => {
    setCart(prev => {
      if (qty <= 0) {
        const { [productId]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: qty }
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

  // ✅ NEW (ফেজ ৩ — কুপন-কোড)
  const [promoCode, setPromoCode] = useState('')
  // ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং)
  const [paymentMethod, setPaymentMethod] = useState('cod')   // 'cod' | 'bkash_manual' | 'nagad_manual'
  const [tenantPaymentInfo, setTenantPaymentInfo] = useState({}) // { [tenantId]: {bkash_number, nagad_number} }
  const [trxInputs, setTrxInputs] = useState({})                // { [tenantId]: {trx_id, sender_number} }

  // ✅ NEW (ফেজ ০ — Promotions এক্সপোজার) — CheckoutSheet-এর sellerGroups
  // এর মতোই tenant_id দিয়ে পাঠানো হয়, ব্যাকএন্ড প্রতিটা কোম্পানির জন্য
  // আলাদাভাবে ক্যালকুলেট করে। শুধু তথ্যমূলক — ব্যর্থ হলে চুপচাপ লুকানো
  // থাকে (কার্ট/চেকআউট ব্লক হয় না)।
  // codeOverride দিলে (কুপন "প্রয়োগ" বাটনে) সেটা ব্যবহার হয়, নাহলে
  // বর্তমান promoCode state — undefined vs '' আলাদা রাখা হয়েছে যাতে
  // "কোড ফাঁকা করে আবার লোড" আর "state-এর বর্তমান মান দিয়ে লোড" গুলিয়ে
  // না যায়।
  const loadPromotions = async (codeOverride) => {
    if (checkoutItems.length === 0) { setPromotionInfo(null); return }
    try {
      const items = checkoutItems.map(({ product, qty }) => ({
        product_id: product.id,
        tenant_id:  product.tenant_id,
        price:      Number(product.base_price) || 0,
        qty,
      }))
      const code = codeOverride !== undefined ? codeOverride : promoCode
      const data = await portalFetch('/portal/promotions/calculate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, promo_code: code || undefined })
      })
      setPromotionInfo(data.data || null)
    } catch {
      setPromotionInfo(null)
    }
  }

  // কুপন "প্রয়োগ করুন" বাটনে ক্লিক — state আপডেট + সাথে সাথে রিক্যালকুলেট
  const applyPromoCode = (code) => {
    setPromoCode(code)
    loadPromotions(code)
  }

  // ✅ NEW (ফেজ ৪) — checkout-এ থাকা প্রতিটা কোম্পানির bKash/Nagad নম্বর
  const loadPaymentInfo = async () => {
    const tenantIds = [...new Set(checkoutItems.map(({ product }) => product.tenant_id))]
    if (tenantIds.length === 0) { setTenantPaymentInfo({}); return }
    try {
      const data = await portalFetch(`/portal/payment-info?tenant_ids=${tenantIds.join(',')}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setTenantPaymentInfo(data.data || {})
    } catch { setTenantPaymentInfo({}) } // silent — মোবাইল ব্যাংকিং অপশনটাই লুকানো থাকবে
  }

  const updateTrxInput = (tenantId, field, value) => {
    setTrxInputs(prev => ({ ...prev, [tenantId]: { ...prev[tenantId], [field]: value } }))
  }

  // checkout খোলার সময়, বা খোলা অবস্থায় আইটেম/qty বদলালে রিক্যালকুলেট
  useEffect(() => {
    if (showCheckout) { loadPromotions(); loadPaymentInfo() }
    else setPromotionInfo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCheckout, checkoutItems.map(i => `${i.product.id}:${i.qty}`).join(',')])

  // ── সার্চ ──────────────────────────────────────────────────
  // overrideValue দরকার কারণ "✕ ক্লিয়ার" বাটনে onSearchChange('')
  // আর onSearchSubmit('') একই হ্যান্ডলারে পরপর কল হয় — React state
  // batching-এর কারণে তখনো `search` state আপডেট হয়নি, তাই override
  // ছাড়া পুরনো (স্টেল) মান দিয়ে সার্চ হয়ে যেত।
  const runSearch = (overrideValue) => {
    const q = overrideValue !== undefined ? overrideValue : search
    setCommittedSearch(q)
    loadProducts(q, 1, false, categoryId, sellerId)
  }

  // ✅ নতুন — ক্যাটাগরি চিপে ট্যাপ করলে, বর্তমান সার্চ/বিক্রেতা-ফিল্টার
  // বজায় রেখে page ১ থেকে রিলোড
  const selectCategory = (id) => {
    setCategoryId(id)
    loadProducts(committedSearch, 1, false, id, sellerId)
  }

  // ✅ নতুন (পার্ট ৩) — বিক্রেতা চিপে ট্যাপ করলে, বর্তমান সার্চ/ক্যাটাগরি
  // বজায় রেখে page ১ থেকে রিলোড
  const selectSeller = (id) => {
    setSellerId(id)
    loadProducts(committedSearch, 1, false, categoryId, id)
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
    // ✅ NEW (ফেজ ৪) — মোবাইল ব্যাংকিং হলে প্রতিটা কোম্পানির TrxID লাগবে
    // (CheckoutSheet-এও একই ভ্যালিডেশনে সাবমিট বাটন disabled থাকে,
    // এখানে দ্বিতীয়বার — সরাসরি এই ফাংশন কল হলেও যেন গার্ড থাকে)
    const isMobileBanking = paymentMethod === 'bkash_manual' || paymentMethod === 'nagad_manual'
    if (isMobileBanking) {
      const tenantIds = [...new Set(checkoutItems.map(({ product }) => product.tenant_id))]
      const allFilled = tenantIds.every(tid => trxInputs[tid]?.trx_id?.trim())
      if (!allFilled) {
        setSubmitError('প্রতিটা কোম্পানির জন্য Transaction ID দিন।')
        return
      }
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const items = checkoutItems.map(({ product, qty }) => ({ product_id: product.id, qty }))
      const payment = isMobileBanking
        ? { method: paymentMethod, by_tenant: trxInputs }
        : { method: 'cod' }
      const res = await portalFetch('/portal/order-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, note, payment })
      })
      setCart({})
      setNote('')
      setShowCheckout(false)
      setPromotionInfo(null)
      setPromoCode('')
      setPaymentMethod('cod')
      setTrxInputs({})
      // ✅ ব্যাকএন্ডের নিজের message সরাসরি ব্যবহার — এতে "একাধিক কোম্পানিতে
      // ভাগ হয়ে গেছে" কেসটাও সঠিকভাবে দেখা যাবে (আগে এখানে client-side
      // আলাদা করে মেসেজ বানানো হতো যা শুধু ২টা কেস জানত, split-এর কথা জানত না)
      setSuccessMsg(res.message || 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে!')
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
      {/* সাব-ট্যাব সুইচ: শপ ⇄ আমার অর্ডার ⇄ সেভড (✅ ফেজ ৩) */}
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
          <FiClock className="w-3.5 h-3.5" /> অর্ডার
          {pendingCount > 0 && (
            <span className="bg-cp-warmth-600 text-white text-[9.5px] font-cp-head font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('saved')}
          className={
            subTab === 'saved'
              ? 'flex-1 h-9 rounded-lg bg-white shadow-sm text-cp-trust-700 text-[13px] font-cp-head font-bold flex items-center justify-center gap-1.5 transition-colors'
              : 'flex-1 h-9 rounded-lg text-cp-text-secondary text-[13px] font-cp-head font-semibold flex items-center justify-center gap-1.5 transition-colors'
          }
        >
          <FiHeart className="w-3.5 h-3.5" /> সেভড
          {wishlist.length > 0 && (
            <span className="bg-cp-trust-600 text-white text-[9.5px] font-cp-head font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center">
              {wishlist.length}
            </span>
          )}
        </button>
      </div>

      {subTab === 'shop' && (
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
          onOpenDetail={openProductDetail}
          onAdd={addToCart}
          onInc={incQty}
          onDec={decQty}
          onSetQty={setExactQty}
          hasNext={hasNext}
          onLoadMore={() => loadProducts(committedSearch, page + 1, true)}
          total={total}
          onRetry={() => loadProducts(committedSearch, 1)}
          categories={categories}
          selectedCategory={categoryId}
          onSelectCategory={selectCategory}
          sellers={sellers}
          selectedSeller={sellerId}
          onSelectSeller={selectSeller}
          connectedCompanyIds={connectedCompanyIds}
          bestsellers={bestsellers}
          newArrivals={newArrivals}
          recentlyViewed={recentlyViewed}
          wishlistIds={wishlistIds}
          onToggleWishlist={toggleWishlist}
        />
      )}

      {subTab === 'history' && (
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
          onCancelOrder={cancelOrder}
          onGoShop={() => setSubTab('shop')}
        />
      )}

      {subTab === 'saved' && (
        <WishlistView
          items={wishlist}
          loading={wishlistLoading}
          cart={cart}
          onOpenDetail={openProductDetail}
          onAdd={addToCart}
          onInc={incQty}
          onDec={decQty}
          onSetQty={setExactQty}
          connectedCompanyIds={connectedCompanyIds}
          wishlistIds={wishlistIds}
          onToggleWishlist={toggleWishlist}
          onGoShop={() => setSubTab('shop')}
        />
      )}

      <ProductDetailSheet
        product={selectedProduct}
        qty={selectedProduct ? (cart[selectedProduct.id] || 0) : 0}
        onClose={() => { setSelectedProduct(null); setRelatedProducts([]) }}
        onAdd={addToCart}
        onInc={incQty}
        onDec={decQty}
        onSetQty={setExactQty}
        cart={cart}
        relatedProducts={relatedProducts}
        relatedLoading={relatedLoading}
        onOpenRelated={openProductDetail}
        connectedCompanyIds={connectedCompanyIds}
        isWishlisted={selectedProduct ? wishlistIds.has(selectedProduct.id) : false}
        onToggleWishlist={toggleWishlist}
        wishlistIds={wishlistIds}
        isConnected={
          connectedCompanyIds === null || !selectedProduct
            ? true
            : connectedCompanyIds.has(selectedProduct.tenant_id)
        }
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
          onSetQty={setExactQty}
          onRemove={removeFromCart}
          pendingCount={pendingCount}
          promotionInfo={promotionInfo}
          promoCode={promoCode}
          onApplyPromoCode={applyPromoCode}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          tenantPaymentInfo={tenantPaymentInfo}
          trxInputs={trxInputs}
          onTrxInputChange={updateTrxInput}
          submitting={submitting}
          submitError={submitError}
          onClose={() => { if (!submitting) { setShowCheckout(false); setSubmitError(null); setPromoCode(''); setPaymentMethod('cod'); setTrxInputs({}) } }}
          onConfirm={handleConfirm}
        />
      )}

      <OrderTrackingModal orderId={trackingId} jwt={portalJWT} onClose={() => setTrackingId(null)} />
    </div>
  )
}
