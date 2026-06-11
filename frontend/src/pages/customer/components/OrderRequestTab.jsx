// components/OrderRequestTab.jsx
// অর্ডার রিকোয়েস্ট tab — list / new order / catalog তিনটি phase

import { useState, useEffect, useRef } from 'react'
import { portalFetch } from '../utils/api'
import { StatusBadge } from './Badges'
import OrderTrackingModal from './OrderTrackingModal'

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

  // ── Delivered Notification Polling (প্রতি ৩০ সেকেন্ড) ────────
  // BUG FIX: prevStatuses useRef দিয়ে রাখা হয়েছে।
  // আগে closure-এ stale prevStatuses ছিল — interval-এর মধ্যে
  // setRequests(updated) হলেও পরের poll-এ পুরোনো statuses দেখত।
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
  }, [phase, portalJWT])  // ← requests dependency সরানো হয়েছে

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

  // ── CATALOG VIEW ──────────────────────────────────────────────
  if (phase === 'catalog') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setPhase('list'); setProducts([]); setCatalogSearch(''); setSelectedProduct(null) }}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 font-bold transition-colors">
          ←
        </button>
        <div>
          <h3 className="font-bold text-gray-800">পণ্য ক্যাটালগ</h3>
          <p className="text-xs text-gray-400">{catalogTotal > 0 ? `${catalogTotal}টি পণ্য` : 'সব পণ্য দেখুন'} — কার্টে যোগ করুন</p>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSelectedProduct(null)}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: 0 }}
            onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div style={{ height: 220, background: '#f3f4f6', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ padding: '20px 20px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e1e1e', flex: 1, paddingRight: 8 }}>{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)}
                  style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 16, color: '#555', flexShrink: 0 }}>✕</button>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#4f46e5' }}>
                ৳{parseFloat(selectedProduct.final_price || selectedProduct.base_price || 0).toFixed(2)}
                <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>/ {selectedProduct.unit || 'পিস'}</span>
              </p>
              {selectedProduct.has_extra && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b7280' }}>
                  বেস মূল্য ৳{parseFloat(selectedProduct.base_price).toFixed(2)}
                  {selectedProduct.vat_amount > 0 && ` + VAT ৳${selectedProduct.vat_amount.toFixed(2)}`}
                  {selectedProduct.tax_amount > 0 && ` + Tax ৳${selectedProduct.tax_amount.toFixed(2)}`}
                </p>
              )}
              <p style={{ margin: '0 0 12px', fontSize: 12, color: selectedProduct.available_stock > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {selectedProduct.available_stock > 0 ? `✅ স্টক: ${selectedProduct.available_stock} ${selectedProduct.unit || 'পিস'}` : '❌ স্টক নেই'}
              </p>
              {selectedProduct.description && (
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555', lineHeight: 1.6 }}>{selectedProduct.description}</p>
              )}
              {selectedProduct.available_stock > 0 && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e0e7ff', borderRadius: 12, overflow: 'hidden', background: '#f5f7ff' }}>
                    <button onClick={() => setCart(prev => {
                      const q = Math.max(0, (prev[selectedProduct.id] || 0) - 1)
                      if (q === 0) { const n = { ...prev }; delete n[selectedProduct.id]; return n }
                      return { ...prev, [selectedProduct.id]: q }
                    })} style={{ width: 40, height: 44, border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>
                      {cart[selectedProduct.id] || 0}
                    </span>
                    <button onClick={() => setCart(prev => ({ ...prev, [selectedProduct.id]: (prev[selectedProduct.id] || 0) + 1 }))}
                      style={{ width: 40, height: 44, border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>+</button>
                  </div>
                  <button onClick={() => { setCart(prev => ({ ...prev, [selectedProduct.id]: Math.max(1, prev[selectedProduct.id] || 1) })); setSelectedProduct(null) }}
                    style={{ flex: 1, height: 44, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    🛒 কার্টে যোগ করুন
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input type="text" value={catalogSearch}
          onChange={e => setCatalogSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setProducts([]); loadProducts(catalogSearch, 1) } }}
          placeholder="পণ্য খুঁজুন..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
        <button onClick={() => { setProducts([]); loadProducts(catalogSearch, 1) }}
          className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
          খুঁজুন
        </button>
      </div>

      {/* Cart Badge */}
      {Object.keys(cart).length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#065f46,#047857)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 13 }}>
              🛒 {Object.keys(cart).length}টি পণ্য — {Object.values(cart).reduce((a,b)=>a+b,0)}টি আইটেম
            </p>
            <p style={{ margin: '2px 0 0', color: '#a7f3d0', fontSize: 11 }}>অর্ডার করতে নিচে যান</p>
          </div>
          <button onClick={() => setPhase('new')}
            style={{ background: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#065f46', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            অর্ডার করুন →
          </button>
        </div>
      )}

      {/* Product Grid */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400 text-sm">কোনো পণ্য পাওয়া যায়নি।</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {products.map(prod => (
              <div key={prod.id} onClick={() => setSelectedProduct(prod)}
                style={{ background: 'white', borderRadius: 16, overflow: 'hidden', border: '1.5px solid #f0f0f0', cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', transition: 'transform 0.15s', position: 'relative' }}>
                <div style={{ height: 110, background: 'linear-gradient(135deg,#f5f3ff,#eff6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {prod.image_url
                    ? <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 36 }}>📦</span>
                  }
                </div>
                {cart[prod.id] > 0 && (
                  <div style={{ position: 'absolute', top: 8, right: 8, background: '#4f46e5', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                    {cart[prod.id]}
                  </div>
                )}
                <div style={{ padding: '10px 10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e1e1e', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {prod.name}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 800, color: '#4f46e5' }}>
                    ৳{parseFloat(prod.final_price || prod.base_price || 0).toFixed(0)}
                    <span style={{ fontSize: 9, fontWeight: 400, color: '#9ca3af' }}>/{prod.unit || 'পিস'}</span>
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: prod.available_stock > 0 ? '#16a34a' : '#dc2626' }}>
                    {prod.available_stock > 0 ? `✅ ${prod.available_stock} ${prod.unit}` : '❌ স্টক নেই'}
                  </p>
                  <button onClick={e => { e.stopPropagation(); setCart(prev => ({ ...prev, [prod.id]: (prev[prod.id] || 0) + 1 })) }}
                    disabled={prod.available_stock === 0}
                    style={{ marginTop: 8, width: '100%', background: cart[prod.id] > 0 ? '#e0e7ff' : '#4f46e5', color: cart[prod.id] > 0 ? '#4f46e5' : 'white', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: prod.available_stock === 0 ? 'not-allowed' : 'pointer', opacity: prod.available_stock === 0 ? 0.5 : 1 }}>
                    {cart[prod.id] > 0 ? `✓ ${cart[prod.id]}টি — আরো যোগ` : '+ কার্টে যোগ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {catalogHasNext && (
            <button onClick={() => loadProducts(catalogSearch, catalogPage + 1, true)}
              disabled={loading}
              className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50">
              {loading ? '⏳ লোড হচ্ছে...' : `আরো পণ্য দেখুন (${products.length}/${catalogTotal})`}
            </button>
          )}
        </>
      )}
    </div>
  )

  // ── LIST VIEW ─────────────────────────────────────────────────
  if (phase === 'list') return (
    <div className="space-y-4">
      {deliveredToast && (
        <div style={{ background: 'linear-gradient(135deg, #065f46, #047857)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 4px 20px rgba(4,120,87,0.4)' }}>
          <span style={{ fontSize: 28 }}>📦</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 14 }}>অর্ডার ডেলিভারি সম্পন্ন!</p>
            <p style={{ margin: '3px 0 0', color: '#a7f3d0', fontSize: 12 }}>
              আপনার অর্ডার ({(deliveredToast.items || []).length}টি পণ্য) সফলভাবে পৌঁছে গেছে।
            </p>
          </div>
          <button onClick={() => setDeliveredToast(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      <OrderTrackingModal orderId={trackingId} jwt={portalJWT} onClose={() => setTrackingId(null)} />

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="flex-1 text-green-800 font-semibold text-sm">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="text-green-400 text-lg font-bold">✕</button>
        </div>
      )}

      <button onClick={() => { setPhase('new'); setErrorMsg('') }}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
        <span className="text-xl">🛒</span>
        নতুন অর্ডার রিকোয়েস্ট
      </button>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400 text-sm">এখনও কোনো অর্ডার রিকোয়েস্ট নেই।</p>
          <p className="text-gray-300 text-xs mt-1">উপরের বাটনে ক্লিক করে প্রথম অর্ডার দিন।</p>
        </div>
      ) : (
        requests.map(req => {
          const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
          return (
            <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{items.length}টি পণ্য</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
              <div className="space-y-1 mb-3">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-600">
                    <span>{item.product_name}</span>
                    <span className="font-medium">× {item.qty}</span>
                  </div>
                ))}
              </div>
              {req.assigned_sr_name && (
                <div className="bg-purple-50 rounded-xl px-3 py-2 text-xs text-purple-700">
                  🚶 SR: {req.assigned_sr_name}
                </div>
              )}
              {req.admin_note && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 mt-2">
                  📝 {req.admin_note}
                </div>
              )}
              {req.note && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-600 mt-2">
                  💬 আপনার নোট: {req.note}
                </div>
              )}
              {['confirmed','assigned','delivered'].includes(req.status) && (
                <button onClick={() => setTrackingId(req.id)}
                  className="mt-3 w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                  📍 ট্র্যাকিং দেখুন
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  // ── NEW ORDER VIEW ────────────────────────────────────────────
  const pendingOrders = requests.filter(r => r.status === 'pending')
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartProductCount = Object.keys(cart).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setPhase('list'); setCart({}); setNote(''); setErrorMsg('') }}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 font-bold transition-colors">
          ←
        </button>
        <div>
          <h3 className="font-bold text-gray-800">নতুন অর্ডার রিকোয়েস্ট</h3>
          <p className="text-xs text-gray-400">
            {cartProductCount > 0
              ? `${cartProductCount}টি পণ্য — ${cartItemCount}টি আইটেম বেছেছেন`
              : 'পণ্য বেছে পরিমাণ দিন'}
          </p>
        </div>
        <button onClick={() => { setPhase('catalog'); loadProducts('', 1) }}
          style={{ marginLeft: 'auto', background: '#ede9fe', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#5b21b6', cursor: 'pointer' }}>
          🗂️ ক্যাটালগ
        </button>
      </div>

      {pendingOrders.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#fefce8,#fef9c3)', border: '1.5px solid #fde047', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#854d0e' }}>
              {pendingOrders.length}টি pending অর্ডার আছে
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
              আপনি আরো অর্ডার দিতে পারবেন — একসাথে একাধিক অর্ডার রাখা যায়। SR আসলে সব একসাথে ডেলিভারি পাবেন।
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 text-center">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(prod => {
            const qty = cart[prod.id] || 0
            return (
              <div key={prod.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${qty > 0 ? 'border-indigo-300' : 'border-gray-100'}`}>
                <div className={`relative w-full bg-gray-50 flex items-center justify-center border-b ${qty > 0 ? 'border-indigo-100' : 'border-gray-100'}`}
                  style={{ height: '160px' }}>
                  {prod.image_url ? (
                    <img src={prod.image_url} alt={prod.name}
                      className="w-full h-full object-contain p-2" style={{ maxHeight: '160px' }}
                      onError={e => {
                        e.target.style.display = 'none'
                        e.target.parentNode.querySelector('.img-fallback').style.display = 'flex'
                      }} />
                  ) : null}
                  <div className={`img-fallback w-full h-full items-center justify-center text-5xl ${prod.image_url ? 'hidden' : 'flex'}`}>📦</div>
                  {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-md">
                      × {qty}
                    </div>
                  )}
                </div>
                <div className={`p-3 ${qty > 0 ? 'bg-indigo-50' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{prod.name}</p>
                      <p className="text-sm font-bold text-indigo-700 mt-0.5">
                        ৳{parseFloat(prod.final_price ?? prod.price).toLocaleString('bn-BD')}
                        <span className="text-xs font-normal text-gray-400 ml-1">/ {prod.unit || 'পিস'}</span>
                      </p>
                      {prod.has_extra && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prod.vat_amount > 0 && (
                            <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">
                              VAT ৳{parseFloat(prod.vat_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                          {prod.tax_amount > 0 && (
                            <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">
                              Tax ৳{parseFloat(prod.tax_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                        </div>
                      )}
                      {prod.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prod.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQty(prod.id, qty - 1)} disabled={qty === 0}
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 rounded-xl font-bold text-gray-700 text-lg flex items-center justify-center transition-colors">−</button>
                    <input type="number" value={qty || ''} onChange={e => setQty(prod.id, e.target.value)}
                      placeholder="০" min="0"
                      className="flex-1 text-center border border-gray-200 rounded-xl py-2 text-sm font-semibold focus:outline-none focus:border-indigo-400" />
                    <button onClick={() => setQty(prod.id, qty + 1)}
                      className="w-9 h-9 bg-indigo-100 hover:bg-indigo-200 rounded-xl font-bold text-indigo-700 text-lg flex items-center justify-center transition-colors">+</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cartCount > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">অতিরিক্ত নির্দেশনা (ঐচ্ছিক)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="যেমন: দ্রুত দরকার, বিকেলে আসুন..." rows={2}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
      )}

      <button onClick={handleSubmit} disabled={cartCount === 0 || submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
        {submitting ? (
          <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> পাঠানো হচ্ছে...</>
        ) : (
          <>🛒 অর্ডার রিকোয়েস্ট পাঠান
            {cartCount > 0 && (
              <span className="bg-white text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}টি পণ্য</span>
            )}
          </>
        )}
      </button>
    </div>
  )

  // ── ORDER REVIEW MODAL ────────────────────────────────────────
  if (showReview) {
    const reviewItems = Object.entries(cart)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([product_id, qty]) => {
        const prod = products.find(p => p.id === product_id)
        return { product_id, qty: parseInt(qty), name: prod?.name || product_id, unit: prod?.unit || '' }
      })

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.18s ease' }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 32px', animation: 'slideUp 0.22s ease' }}>
          {/* Handle */}
          <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />

          <p style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>📋 অর্ডার নিশ্চিত করুন</p>

          {/* Item list */}
          <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
            {reviewItems.map((item, i) => (
              <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: i < reviewItems.length - 1 ? 10 : 0, marginBottom: i < reviewItems.length - 1 ? 10 : 0, borderBottom: i < reviewItems.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: 13, color: '#4f46e5', fontWeight: 800, background: '#eef2ff', borderRadius: 8, padding: '2px 10px' }}>× {item.qty} {item.unit}</span>
              </div>
            ))}
          </div>

          {/* Total count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>মোট পণ্যের ধরন</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e1e1e' }}>{reviewItems.length}টি</span>
          </div>

          {note && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#92400e', fontWeight: 600 }}>📝 নির্দেশনা: {note}</p>
            </div>
          )}

          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            একবার পাঠালে SR আসার আগে বাতিল করা যাবে না।
          </p>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setShowReview(false)}
              style={{ padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              ← ফিরে যান
            </button>
            <button onClick={confirmSubmit}
              style={{ padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#4338ca)', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
              ✅ নিশ্চিত করুন
            </button>
          </div>
        </div>
      </div>
    )
  }
}
