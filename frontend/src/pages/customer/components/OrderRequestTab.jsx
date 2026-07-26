// components/OrderRequestTab.jsx
// ✅ REDESIGNED — Orders ট্যাব redesign (cp- design system, customer-design-system.html)
//
// InvoicesTab.jsx/PaymentsTab.jsx/CreditTab.jsx/ComplaintsTab.jsx/ReturnsTab.jsx-এর
// মতোই ভিজ্যুয়াল ভাষা — CpButton/CpCard/CpInput primitives, cp- টোকেন।
//
// ⚠️ এই ট্যাব বাকিগুলোর (Invoices/Payments/Credit/Complaints/Returns) মতো
// aggregate + company-ট্যাগ প্যাটার্ন অনুসরণ করে না — কারণ Order Request
// আসলে portalAuth (single-company JWT, customerPortal.routes.js) দিয়ে চলে,
// connections/person_id-ভিত্তিক নয়। তাই কোনো কোম্পানি-সিলেক্টর নেই (ইচ্ছাকৃত)।
//
// একই props, একই imports, একই backend logic — শুধু UI redesign।
// তিনটা phase (list/new/catalog) + review bottom-sheet — কার্যকারিতা অপরিবর্তিত।

import { useState, useEffect, useRef } from 'react'
import {
  FiShoppingCart, FiPlus, FiMinus, FiSearch, FiX, FiPackage,
  FiChevronLeft, FiGrid, FiSend, FiMapPin, FiCheck,
} from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import OrderTrackingModal from './OrderTrackingModal'

const STATUS_LABEL = {
  pending:   { text: '⏳ অপেক্ষমাণ',  cls: 'bg-cp-warning/10 text-cp-warning' },
  confirmed: { text: '✅ কনফার্ম',    cls: 'bg-cp-info/10 text-cp-info' },
  assigned:  { text: '🚶 SR আসছে',    cls: 'bg-cp-trust-500/10 text-cp-trust-700' },
  delivered: { text: '📦 সম্পন্ন',    cls: 'bg-cp-success/10 text-cp-success' },
  cancelled: { text: '❌ বাতিল',      cls: 'bg-cp-error/10 text-cp-error' },
}

export default function OrderRequestTab({ portalJWT }) {
  const [phase,        setPhase]        = useState('list')
  const [products,     setProducts]     = useState([])
  const [requests,     setRequests]     = useState([])
  const [cart,         setCart]         = useState({})
  const [note,         setNote]         = useState('')
  const [loading,      setLoading]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [successMsg,   setSuccessMsg]   = useState('')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [trackingId,   setTrackingId]   = useState(null)
  const [deliveredToast, setDeliveredToast] = useState(null)

  const [showReview,      setShowReview]      = useState(false)

  const [catalogSearch,   setCatalogSearch]   = useState('')
  const [catalogHasNext,  setCatalogHasNext]  = useState(false)
  const [catalogPage,     setCatalogPage]     = useState(1)
  const [catalogTotal,    setCatalogTotal]    = useState(0)
  const [selectedProduct, setSelectedProduct] = useState(null)

  // ── ডেটা লোড (অপরিবর্তিত) ────────────────────────────────────
  const loadRequests = async () => {
    setLoading(true)
    try {
      const data = await portalFetch('/portal/order-requests', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setRequests(data.data || [])
    } catch { setErrorMsg('অর্ডার লিস্ট আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const loadProducts = async (search = '', page = 1, append = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 12 })
      if (search) params.set('search', search)
      const data = await portalFetch(`/portal/products?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const prods = data.data || []
      if (append) setProducts(prev => [...prev, ...prods])
      else setProducts(prods)
      setCatalogPage(data.pagination?.page || page)
      setCatalogTotal(data.pagination?.total || 0)
      setCatalogHasNext(data.pagination?.has_next || false)
    } catch { setErrorMsg('পণ্য তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRequests() }, [])
  useEffect(() => {
    if ((phase === 'new' || phase === 'catalog') && products.length === 0) loadProducts()
  }, [phase])

  // ── Delivered Notification Polling (প্রতি ৩০ সেকেন্ড, অপরিবর্তিত) ──
  const prevStatusesRef = useRef({})
  useEffect(() => {
    prevStatusesRef.current = {}
    requests.forEach(r => { prevStatusesRef.current[r.id] = r.status })
  }, [requests])

  useEffect(() => {
    if (phase !== 'list') return

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
      } catch { /* silent */ }
    }, 30000)

    return () => clearInterval(interval)
  }, [phase, portalJWT])

  const cartCount = Object.values(cart).filter(q => q > 0).length

  const setQty = (productId, qty) => {
    setCart(prev => ({ ...prev, [productId]: Math.max(0, parseInt(qty) || 0) }))
  }

  const handleSubmit = async () => {
    const items = Object.entries(cart)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

    if (items.length === 0) { setErrorMsg('কমপক্ষে একটি পণ্য সিলেক্ট করুন।'); return }
    setErrorMsg('')
    setShowReview(true)
  }

  const confirmSubmit = async () => {
    const items = Object.entries(cart)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

    setShowReview(false)
    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/order-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, note })
      })
      setCart({})
      setNote('')
      setSuccessMsg(
        res.has_pending_order
          ? '✅ অর্ডার পাঠানো হয়েছে। তবে আগের একটি অর্ডার এখনো pending আছে — SR শীঘ্রই আসবে। 🎉'
          : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে। 🎉'
      )
      setPhase('list')
      loadRequests()
    } catch (e) {
      setErrorMsg(e.message || 'অর্ডার পাঠাতে সমস্যা হয়েছে।')
    } finally { setSubmitting(false) }
  }

  // ═══════════════════════════════════════════════════════════
  // CATALOG VIEW
  // ═══════════════════════════════════════════════════════════
  if (phase === 'catalog') return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase('list'); setProducts([]); setCatalogSearch(''); setSelectedProduct(null) }}
          className="w-9 h-9 bg-cp-bg-alt hover:bg-cp-border rounded-xl flex items-center justify-center text-cp-text-secondary flex-shrink-0 transition-colors"
        >
          <FiChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold font-cp-head text-cp-text-primary">পণ্য ক্যাটালগ</h3>
          <p className="text-[11px] text-cp-text-muted">{catalogTotal > 0 ? `${catalogTotal}টি পণ্য` : 'সব পণ্য দেখুন'} — কার্টে যোগ করুন</p>
        </div>
      </div>

      {/* Product Detail Bottom Sheet */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/55 z-[300] flex items-end justify-center"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-cp-bg-surface rounded-t-3xl w-full max-w-[480px] max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {selectedProduct.image_url && (
              <div className="h-[220px] bg-cp-bg-alt rounded-t-3xl overflow-hidden">
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 pb-8">
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <h3 className="text-[17px] font-bold font-cp-head text-cp-text-primary flex-1">{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)}
                  className="bg-cp-bg-alt rounded-lg px-2.5 py-1 text-cp-text-secondary flex-shrink-0">
                  <FiX className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[22px] font-extrabold font-cp-head text-cp-trust-700 mb-0.5">
                ৳{parseFloat(selectedProduct.final_price || selectedProduct.base_price || 0).toFixed(2)}
                <span className="text-[12px] font-normal text-cp-text-muted ml-1.5">/ {selectedProduct.unit || 'পিস'}</span>
              </p>
              {selectedProduct.has_extra && (
                <p className="text-[11px] text-cp-text-secondary mb-2">
                  বেস মূল্য ৳{parseFloat(selectedProduct.base_price).toFixed(2)}
                  {selectedProduct.vat_amount > 0 && ` + VAT ৳${selectedProduct.vat_amount.toFixed(2)}`}
                  {selectedProduct.tax_amount > 0 && ` + Tax ৳${selectedProduct.tax_amount.toFixed(2)}`}
                </p>
              )}
              <p className={`text-[12px] font-semibold mb-3 ${selectedProduct.available_stock > 0 ? 'text-cp-success' : 'text-cp-error'}`}>
                {selectedProduct.available_stock > 0 ? `✅ স্টক: ${selectedProduct.available_stock} ${selectedProduct.unit || 'পিস'}` : '❌ স্টক নেই'}
              </p>
              {selectedProduct.description && (
                <p className="text-[13px] text-cp-text-secondary leading-relaxed mb-4">{selectedProduct.description}</p>
              )}
              {selectedProduct.available_stock > 0 && (
                <div className="flex gap-2.5 items-center">
                  <div className="flex items-center border-2 border-cp-trust-100 rounded-xl overflow-hidden bg-cp-trust-100/40">
                    <button
                      onClick={() => setCart(prev => {
                        const q = Math.max(0, (prev[selectedProduct.id] || 0) - 1)
                        if (q === 0) { const n = { ...prev }; delete n[selectedProduct.id]; return n }
                        return { ...prev, [selectedProduct.id]: q }
                      })}
                      className="w-10 h-11 flex items-center justify-center text-cp-trust-700"
                    >
                      <FiMinus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[36px] text-center font-extrabold text-[16px] text-cp-text-primary">
                      {cart[selectedProduct.id] || 0}
                    </span>
                    <button
                      onClick={() => setCart(prev => ({ ...prev, [selectedProduct.id]: (prev[selectedProduct.id] || 0) + 1 }))}
                      className="w-10 h-11 flex items-center justify-center text-cp-trust-700"
                    >
                      <FiPlus className="w-4 h-4" />
                    </button>
                  </div>
                  <CpButton
                    variant="primary"
                    icon={FiShoppingCart}
                    className="flex-1"
                    onClick={() => { setCart(prev => ({ ...prev, [selectedProduct.id]: Math.max(1, prev[selectedProduct.id] || 1) })); setSelectedProduct(null) }}
                  >
                    কার্টে যোগ করুন
                  </CpButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cp-text-muted w-4 h-4 pointer-events-none" />
          <input
            type="text"
            value={catalogSearch}
            onChange={e => setCatalogSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setProducts([]); loadProducts(catalogSearch, 1) } }}
            placeholder="পণ্য খুঁজুন..."
            className="w-full h-11 rounded-xl border border-cp-border bg-white pl-10 pr-4 text-[13px] font-cp-body focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500"
          />
        </div>
        <CpButton variant="primary" size="md" onClick={() => { setProducts([]); loadProducts(catalogSearch, 1) }}>
          খুঁজুন
        </CpButton>
      </div>

      {/* Cart summary */}
      {Object.keys(cart).length > 0 && (
        <CpCard variant="surface" padding="none" className="bg-cp-confidence-600 border-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-white font-bold text-[13px]">
                🛒 {Object.keys(cart).length}টি পণ্য — {Object.values(cart).reduce((a,b)=>a+b,0)}টি আইটেম
              </p>
              <p className="text-cp-confidence-100 text-[11px] mt-0.5">অর্ডার করতে নিচে যান</p>
            </div>
            <button onClick={() => setPhase('new')}
              className="bg-white text-cp-confidence-600 rounded-lg px-3.5 py-2 font-extrabold text-[12px] flex-shrink-0">
              অর্ডার করুন →
            </button>
          </div>
        </CpCard>
      )}

      {/* Product Grid */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-cp-bg-alt rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <FiPackage className="w-9 h-9 text-cp-text-muted mx-auto mb-3" />
          <p className="text-cp-text-muted text-[13px]">কোনো পণ্য পাওয়া যায়নি।</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {products.map(prod => {
              const inCart = cart[prod.id] > 0
              return (
                <div
                  key={prod.id}
                  onClick={() => setSelectedProduct(prod)}
                  className={`bg-white rounded-2xl overflow-hidden border-2 cursor-pointer relative transition-colors ${inCart ? 'border-cp-trust-500' : 'border-cp-border'}`}
                >
                  <div className="h-[110px] bg-cp-bg-alt flex items-center justify-center overflow-hidden">
                    {prod.image_url
                      ? <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                      : <span className="text-4xl">📦</span>
                    }
                  </div>
                  {inCart && (
                    <div className="absolute top-2 right-2 bg-cp-trust-500 text-white rounded-full w-[22px] h-[22px] flex items-center justify-center text-[11px] font-extrabold">
                      {cart[prod.id]}
                    </div>
                  )}
                  <div className="p-2.5 pb-3">
                    <p className="text-[12px] font-bold text-cp-text-primary leading-tight line-clamp-2">
                      {prod.name}
                    </p>
                    <p className="text-[13px] font-extrabold text-cp-trust-700 mt-1">
                      ৳{parseFloat(prod.final_price || prod.base_price || 0).toFixed(0)}
                      <span className="text-[9px] font-normal text-cp-text-muted">/{prod.unit || 'পিস'}</span>
                    </p>
                    <p className={`text-[10px] mt-0.5 ${prod.available_stock > 0 ? 'text-cp-success' : 'text-cp-error'}`}>
                      {prod.available_stock > 0 ? `✅ ${prod.available_stock} ${prod.unit}` : '❌ স্টক নেই'}
                    </p>
                    <button
                      onClick={e => { e.stopPropagation(); setCart(prev => ({ ...prev, [prod.id]: (prev[prod.id] || 0) + 1 })) }}
                      disabled={prod.available_stock === 0}
                      className={`mt-2 w-full rounded-lg py-1.5 text-[11px] font-bold transition-colors ${
                        prod.available_stock === 0
                          ? 'bg-cp-bg-alt text-cp-text-muted cursor-not-allowed'
                          : inCart ? 'bg-cp-trust-100 text-cp-trust-700' : 'bg-cp-trust-500 text-white'
                      }`}
                    >
                      {inCart ? `✓ ${cart[prod.id]}টি — আরো যোগ` : '+ কার্টে যোগ'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {catalogHasNext && (
            <CpButton
              variant="secondary"
              fullWidth
              loading={loading}
              onClick={() => loadProducts(catalogSearch, catalogPage + 1, true)}
            >
              {loading ? 'লোড হচ্ছে...' : `আরো পণ্য দেখুন (${products.length}/${catalogTotal})`}
            </CpButton>
          )}
        </>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════════════════
  if (phase === 'list') return (
    <div className="flex flex-col gap-4">
      {deliveredToast && (
        <CpCard variant="surface" padding="none" className="bg-cp-confidence-600 border-0 overflow-hidden">
          <div className="flex gap-3 items-center px-4 py-3.5">
            <span className="text-[28px] flex-shrink-0">📦</span>
            <div className="flex-1">
              <p className="text-white font-bold text-[14px]">অর্ডার ডেলিভারি সম্পন্ন!</p>
              <p className="text-cp-confidence-100 text-[12px] mt-0.5">
                আপনার অর্ডার ({(deliveredToast.items || []).length}টি পণ্য) সফলভাবে পৌঁছে গেছে।
              </p>
            </div>
            <button onClick={() => setDeliveredToast(null)} className="text-white/70 flex-shrink-0">
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </CpCard>
      )}

      <OrderTrackingModal orderId={trackingId} jwt={portalJWT} onClose={() => setTrackingId(null)} />

      {successMsg && (
        <CpCard variant="alt" padding="md" className="border-cp-success/20 bg-cp-success/5 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="flex-1 text-cp-success font-semibold text-[13px]">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="text-cp-success/60">
            <FiX className="w-4 h-4" />
          </button>
        </CpCard>
      )}

      {errorMsg && (
        <CpCard variant="alt" padding="sm" className="border-cp-error/20 bg-cp-error/5">
          <p className="text-[12px] text-cp-error text-center">{errorMsg}</p>
        </CpCard>
      )}

      <CpButton
        variant="action"
        size="lg"
        fullWidth
        icon={FiShoppingCart}
        onClick={() => { setPhase('new'); setErrorMsg('') }}
      >
        নতুন অর্ডার রিকোয়েস্ট
      </CpButton>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 bg-cp-bg-alt rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10">
          <FiPackage className="w-9 h-9 text-cp-text-muted mx-auto mb-3" />
          <p className="text-cp-text-muted text-[13px]">এখনও কোনো অর্ডার রিকোয়েস্ট নেই।</p>
          <p className="text-cp-text-muted/70 text-[11px] mt-1">উপরের বাটনে ক্লিক করে প্রথম অর্ডার দিন।</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {requests.map(req => {
            const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
            const status = STATUS_LABEL[req.status] || STATUS_LABEL.pending
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-cp-border overflow-hidden">
                <div className="px-4 py-3">
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <p className="text-[11px] text-cp-text-muted">
                        {new Date(req.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-[13px] font-semibold text-cp-text-primary mt-0.5">{items.length}টি পণ্য</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${status.cls}`}>
                      {status.text}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 mb-2.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[13px] text-cp-text-secondary">
                        <span>{item.product_name}</span>
                        <span className="font-medium text-cp-text-primary">× {item.qty}</span>
                      </div>
                    ))}
                  </div>
                  {req.assigned_sr_name && (
                    <div className="bg-cp-trust-100 rounded-xl px-3 py-2 text-[12px] text-cp-trust-700 mb-1.5">
                      🚶 SR: {req.assigned_sr_name}
                    </div>
                  )}
                  {req.admin_note && (
                    <div className="bg-cp-bg-alt rounded-xl px-3 py-2 text-[12px] text-cp-text-secondary mb-1.5">
                      📝 {req.admin_note}
                    </div>
                  )}
                  {req.note && (
                    <div className="bg-cp-info/5 rounded-xl px-3 py-2 text-[12px] text-cp-info">
                      💬 আপনার নোট: {req.note}
                    </div>
                  )}
                  {['confirmed','assigned','delivered'].includes(req.status) && (
                    <button
                      onClick={() => setTrackingId(req.id)}
                      className="mt-2.5 w-full py-2 bg-cp-trust-100 hover:bg-cp-trust-100/70 text-cp-trust-700 rounded-xl text-[12px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FiMapPin className="w-3.5 h-3.5" /> ট্র্যাকিং দেখুন
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // NEW ORDER VIEW
  // ═══════════════════════════════════════════════════════════
  const pendingOrders = requests.filter(r => r.status === 'pending')
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartProductCount = Object.keys(cart).length

  return (
    <div className="flex flex-col gap-4">
      {/* Review bottom sheet */}
      {showReview && (() => {
        const reviewItems = Object.entries(cart)
          .filter(([, qty]) => parseInt(qty) > 0)
          .map(([product_id, qty]) => {
            const prod = products.find(p => p.id === product_id)
            return { product_id, qty: parseInt(qty), name: prod?.name || product_id, unit: prod?.unit || '' }
          })

        return (
          <div className="fixed inset-0 bg-black/55 z-[9999] flex items-end justify-center">
            <div className="bg-cp-bg-surface rounded-t-3xl w-full max-w-[480px] p-6 pb-8">
              <div className="w-10 h-1 bg-cp-border rounded-full mx-auto mb-5" />
              <p className="font-cp-head font-extrabold text-[16px] text-cp-text-primary mb-4">📋 অর্ডার নিশ্চিত করুন</p>

              <div className="bg-cp-bg-alt rounded-2xl px-3.5 py-3 mb-3.5">
                {reviewItems.map((item, i) => (
                  <div
                    key={item.product_id}
                    className={`flex justify-between items-center ${i < reviewItems.length - 1 ? 'pb-2.5 mb-2.5 border-b border-cp-border' : ''}`}
                  >
                    <span className="text-[13px] font-semibold text-cp-text-primary flex-1">{item.name}</span>
                    <span className="text-[13px] font-extrabold text-cp-trust-700 bg-cp-trust-100 rounded-lg px-2.5 py-0.5">
                      × {item.qty} {item.unit}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between mb-1.5">
                <span className="text-[12px] text-cp-text-secondary">মোট পণ্যের ধরন</span>
                <span className="text-[13px] font-bold text-cp-text-primary">{reviewItems.length}টি</span>
              </div>

              {note && (
                <div className="bg-cp-warmth-100 border border-cp-warmth-300/60 rounded-xl px-3 py-2 mb-3.5 mt-2">
                  <p className="text-[11px] text-cp-warmth-600 font-semibold">📝 নির্দেশনা: {note}</p>
                </div>
              )}

              <p className="text-[12px] text-cp-text-muted text-center mb-4">
                একবার পাঠালে SR আসার আগে বাতিল করা যাবে না।
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <CpButton variant="secondary" onClick={() => setShowReview(false)}>
                  ← ফিরে যান
                </CpButton>
                <CpButton variant="confirm" icon={FiCheck} onClick={confirmSubmit}>
                  নিশ্চিত করুন
                </CpButton>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase('list'); setCart({}); setNote(''); setErrorMsg('') }}
          className="w-9 h-9 bg-cp-bg-alt hover:bg-cp-border rounded-xl flex items-center justify-center text-cp-text-secondary flex-shrink-0 transition-colors"
        >
          <FiChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold font-cp-head text-cp-text-primary">নতুন অর্ডার রিকোয়েস্ট</h3>
          <p className="text-[11px] text-cp-text-muted">
            {cartProductCount > 0
              ? `${cartProductCount}টি পণ্য — ${cartItemCount}টি আইটেম বেছেছেন`
              : 'পণ্য বেছে পরিমাণ দিন'}
          </p>
        </div>
        <button
          onClick={() => { setPhase('catalog'); loadProducts('', 1) }}
          className="bg-cp-trust-100 rounded-lg px-3 py-1.5 text-[11px] font-bold text-cp-trust-700 flex items-center gap-1 flex-shrink-0"
        >
          <FiGrid className="w-3.5 h-3.5" /> ক্যাটালগ
        </button>
      </div>

      {pendingOrders.length > 0 && (
        <CpCard variant="alt" padding="sm" className="bg-cp-warmth-100 border-cp-warmth-300/60 flex gap-2.5 items-start">
          <span className="text-[20px] flex-shrink-0">⚠️</span>
          <div>
            <p className="text-[13px] font-bold text-cp-warmth-600">
              {pendingOrders.length}টি pending অর্ডার আছে
            </p>
            <p className="text-[11px] text-cp-warmth-600/80 mt-0.5 leading-relaxed">
              আপনি আরো অর্ডার দিতে পারবেন — একসাথে একাধিক অর্ডার রাখা যায়। SR আসলে সব একসাথে ডেলিভারি পাবেন।
            </p>
          </div>
        </CpCard>
      )}

      {errorMsg && (
        <CpCard variant="alt" padding="sm" className="border-cp-error/20 bg-cp-error/5">
          <p className="text-[12px] text-cp-error text-center">{errorMsg}</p>
        </CpCard>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-cp-trust-300 border-t-cp-trust-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map(prod => {
            const qty = cart[prod.id] || 0
            return (
              <div
                key={prod.id}
                className={`bg-white rounded-2xl border overflow-hidden transition-colors ${qty > 0 ? 'border-cp-trust-500' : 'border-cp-border'}`}
              >
                <div className={`relative w-full bg-cp-bg-alt flex items-center justify-center border-b ${qty > 0 ? 'border-cp-trust-100' : 'border-cp-border'}`} style={{ height: 160 }}>
                  {prod.image_url ? (
                    <img src={prod.image_url} alt={prod.name}
                      className="w-full h-full object-contain p-2" style={{ maxHeight: 160 }}
                      onError={e => {
                        e.target.style.display = 'none'
                        e.target.parentNode.querySelector('.img-fallback').style.display = 'flex'
                      }} />
                  ) : null}
                  <div className={`img-fallback w-full h-full items-center justify-center text-5xl ${prod.image_url ? 'hidden' : 'flex'}`}>📦</div>
                  {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-cp-trust-500 text-white text-[11px] px-2.5 py-1 rounded-full font-bold">
                      × {qty}
                    </div>
                  )}
                </div>
                <div className={`p-3 ${qty > 0 ? 'bg-cp-trust-100/40' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-cp-text-primary text-[13px] leading-tight">{prod.name}</p>
                      <p className="text-[14px] font-bold text-cp-trust-700 mt-0.5">
                        ৳{parseFloat(prod.final_price ?? prod.price).toLocaleString('bn-BD')}
                        <span className="text-[11px] font-normal text-cp-text-muted ml-1">/ {prod.unit || 'পিস'}</span>
                      </p>
                      {prod.has_extra && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prod.vat_amount > 0 && (
                            <span className="text-[10px] bg-cp-warmth-100 text-cp-warmth-600 px-1.5 py-0.5 rounded-full">
                              VAT ৳{parseFloat(prod.vat_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                          {prod.tax_amount > 0 && (
                            <span className="text-[10px] bg-cp-error/10 text-cp-error px-1.5 py-0.5 rounded-full">
                              Tax ৳{parseFloat(prod.tax_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                        </div>
                      )}
                      {prod.description && (
                        <p className="text-[11px] text-cp-text-muted mt-1 line-clamp-2">{prod.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQty(prod.id, qty - 1)} disabled={qty === 0}
                      className="w-9 h-9 bg-cp-bg-alt hover:bg-cp-border disabled:opacity-30 rounded-xl font-bold text-cp-text-secondary flex items-center justify-center transition-colors"
                    >
                      <FiMinus className="w-4 h-4" />
                    </button>
                    <input
                      type="number" value={qty || ''} onChange={e => setQty(prod.id, e.target.value)}
                      placeholder="০" min="0"
                      className="flex-1 text-center border border-cp-border rounded-xl py-2 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500"
                    />
                    <button
                      onClick={() => setQty(prod.id, qty + 1)}
                      className="w-9 h-9 bg-cp-trust-100 hover:bg-cp-trust-100/70 rounded-xl font-bold text-cp-trust-700 flex items-center justify-center transition-colors"
                    >
                      <FiPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cartCount > 0 && (
        <div>
          <label className="text-[11px] font-semibold text-cp-text-secondary mb-1.5 block">অতিরিক্ত নির্দেশনা (ঐচ্ছিক)</label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="যেমন: দ্রুত দরকার, বিকেলে আসুন..." rows={2}
            className="w-full border border-cp-border rounded-2xl px-4 py-3 text-[13px] font-cp-body focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500 resize-none"
          />
        </div>
      )}

      <CpButton
        variant="action"
        size="lg"
        fullWidth
        icon={FiSend}
        loading={submitting}
        disabled={cartCount === 0}
        onClick={handleSubmit}
      >
        {submitting ? 'পাঠানো হচ্ছে...' : (
          <>
            অর্ডার রিকোয়েস্ট পাঠান
            {cartCount > 0 && (
              <span className="bg-white/25 text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-2">{cartCount}টি পণ্য</span>
            )}
          </>
        )}
      </CpButton>
    </div>
  )
}
