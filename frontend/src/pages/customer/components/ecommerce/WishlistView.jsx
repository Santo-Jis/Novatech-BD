// ============================================================
// components/ecommerce/WishlistView.jsx
// ✅ NEW (ফেজ ৩ — উইশলিস্ট/সেভড আইটেম)
// ============================================================
// "সেভড" সাব-ট্যাবের কনটেন্ট — ShopView-এর গ্রিড আর OrderHistoryView-এর
// empty-state প্যাটার্ন দুটোই মিলিয়ে বানানো, যাতে বাকি অ্যাপের সাথে
// ভিজ্যুয়ালি সামঞ্জস্যপূর্ণ থাকে।
// ============================================================
import { FiHeart, FiAlertTriangle } from 'react-icons/fi'
import ProductCard from './ProductCard'
import CpButton from '../ui/CpButton'

export default function WishlistView({
  items = [],
  loading = false,
  cart = {},
  onOpenDetail,
  onAdd,
  onInc,
  onDec,
  onSetQty,
  connectedCompanyIds = null,
  wishlistIds,
  onToggleWishlist,
  onGoShop,
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 190 }} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
        <FiHeart className="w-9 h-9 text-cp-text-muted" />
        <p className="text-[13px] text-cp-text-secondary font-cp-body">এখনও কিছু সেভ করেননি</p>
        <p className="text-[11px] text-cp-text-muted max-w-[220px] font-cp-body">
          প্রোডাক্ট কার্ডে ❤️ আইকনে ট্যাপ করে পরে কেনার জন্য সেভ করে রাখুন
        </p>
        <CpButton variant="primary" size="sm" onClick={onGoShop} className="mt-1">
          শপে যান
        </CpButton>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          qty={cart[product.id] || 0}
          onOpen={onOpenDetail}
          onAdd={onAdd}
          onInc={onInc}
          onDec={onDec}
          onSetQty={onSetQty}
          isConnected={connectedCompanyIds === null ? true : connectedCompanyIds.has(product.tenant_id)}
          isWishlisted={wishlistIds ? wishlistIds.has(product.id) : true}
          onToggleWishlist={onToggleWishlist}
        />
      ))}
    </div>
  )
}
