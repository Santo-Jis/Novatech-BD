// ============================================================
// components/ecommerce/ProductDetailSheet.jsx
// ============================================================
// প্রোডাক্ট কার্ডে ট্যাপ করলে খোলে। বড় ছবি, VAT/Tax ব্রেকডাউন,
// বিবরণ, আর কার্ট কন্ট্রোল।
//
// ✅ পুরনো ভার্সনের একটা ছোট UX খুঁত ঠিক করা হয়েছে: আগে স্টেপার
// (−/+) সরাসরি কার্টে লিখত, আবার নিচে আলাদা "কার্টে যোগ করুন"
// বাটনও ছিল যেটা আবার নিজের মতো করে qty সেট করত — দুইটা কন্ট্রোল
// একই কাজ একটু ভিন্নভাবে করছিল, বিভ্রান্তিকর। এখন ProductCard-এর
// মতোই একটাই প্যাটার্ন: qty=0 হলে "+ কার্টে যোগ করুন" বাটন, ট্যাপ
// করলেই in-place স্টেপারে বদলে যায় — শিট বন্ধ হয়ে যায় না, চাইলে
// সাথে সাথে আরও বাড়ানো যায়।
// ============================================================
import { useState } from 'react'
import { FiX, FiPlus, FiPackage, FiHeart } from 'react-icons/fi'
import CpBadge from '../ui/CpBadge'
import QtyStepper from './QtyStepper'
import CompanyTag from '../CompanyTag'
import ProductCard from './ProductCard'
import { LOW_STOCK_THRESHOLD } from './constants'

function PriceRow({ label, value, bold = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className={bold ? 'text-[13px] font-cp-head font-bold text-cp-text-primary' : 'text-[12px] text-cp-text-secondary font-cp-body'}>
        {label}
      </span>
      <span className={bold ? 'text-[13px] font-cp-head font-bold text-cp-trust-700' : 'text-[12px] text-cp-text-secondary font-cp-body'}>
        ৳{value.toFixed(2)}
      </span>
    </div>
  )
}

export default function ProductDetailSheet({
  product, qty = 0, onClose, onAdd, onInc, onDec, onSetQty, isConnected = true,
  cart = {},                    // ✅ NEW (ফেজ ২) — রিলেটেড কার্ডের নিজস্ব qty দেখানোর জন্য
  relatedProducts = [],         // ✅ NEW (ফেজ ২)
  relatedLoading = false,       // ✅ NEW (ফেজ ২)
  onOpenRelated,                // ✅ NEW (ফেজ ২)
  connectedCompanyIds = null,   // ✅ NEW (ফেজ ২) — রিলেটেড প্রোডাক্ট অন্য কোম্পানির হতে পারে
  isWishlisted = false, onToggleWishlist, wishlistIds,   // ✅ NEW (ফেজ ৩ — উইশলিস্ট)
}) {
  const [activeImg, setActiveImg] = useState(0)

  if (!product) return null

  // ✅ NEW (ফেজ ২ — মাল্টি-ইমেজ গ্যালারি): openProductDetail থেকে
  // background-এ gallery merge হওয়ার আগ পর্যন্ত শুধু cover ছবিই থাকে —
  // fallback হিসেবে সেটাই দেখানো হয়, লোডিং অবস্থায়ও ব্ল্যাংক দেখাবে না
  const images = (product.gallery && product.gallery.length > 0)
    ? product.gallery
    : [product.image_url].filter(Boolean)

  const stock           = Number(product.available_stock) || 0
  const price           = Number(product.final_price ?? product.base_price) || 0
  const base            = Number(product.base_price) || 0
  const vat             = Number(product.vat_amount) || 0
  const tax             = Number(product.tax_amount) || 0
  const inCart          = qty > 0
  const outOfStock      = stock <= 0
  const lowStock        = !outOfStock && stock <= LOW_STOCK_THRESHOLD
  // ✅ NEW (ফেজ ০ — "বিশেষ মূল্য" ব্যাজ) — ProductCard-এর মতোই
  const hasSpecialPrice = !!product.has_special_price
  const listPrice       = Number(product.list_price) || 0

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[300] flex items-end justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-cp-bg-surface rounded-t-3xl w-full max-w-[480px] max-h-[88vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* হ্যান্ডেল বার — সোয়াইপ-ডাউন-টু-ক্লোজ ইঙ্গিত */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-9 h-1 rounded-full bg-cp-border" />
        </div>

        {/* ছবি — ✅ NEW (ফেজ ২): একাধিক ছবি থাকলে swipeable carousel + ডট ইন্ডিকেটর */}
        <div className="relative h-[220px] bg-cp-bg-alt overflow-hidden">
          {images.length > 0 ? (
            <>
              <div
                className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                onScroll={e => {
                  const idx = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth)
                  setActiveImg(idx)
                }}
              >
                {images.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`${product.name} — ছবি ${i + 1}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="w-full h-full object-cover flex-shrink-0 snap-center"
                  />
                ))}
              </div>
              {images.length > 1 && (
                <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeImg ? 'bg-white' : 'bg-white/45'}`}
                    />
                  ))}
                </div>
              )}
              {/* ✅ NEW (ফেজ ৩ — উইশলিস্ট) */}
              {onToggleWishlist && (
                <button
                  onClick={() => onToggleWishlist(product)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                  title={isWishlisted ? 'সেভড থেকে সরান' : 'পরে কেনার জন্য সেভ করুন'}
                >
                  <FiHeart
                    className={isWishlisted ? 'w-4 h-4 text-cp-error' : 'w-4 h-4 text-cp-text-muted'}
                    fill={isWishlisted ? 'currentColor' : 'none'}
                  />
                </button>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FiPackage className="w-10 h-10 text-cp-text-muted" />
            </div>
          )}
        </div>

        <div className="p-5 pb-7">
          {/* নাম + ক্লোজ */}
          <div className="flex justify-between items-start gap-3 mb-1.5">
            <h3 className="text-[17px] font-bold font-cp-head text-cp-text-primary flex-1 leading-snug">
              {product.name}
            </h3>
            <button
              onClick={onClose}
              className="bg-cp-bg-alt rounded-lg w-8 h-8 flex items-center justify-center text-cp-text-secondary flex-shrink-0"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          {/* ✅ ফিক্স (পার্ট ৩): product.seller_name/seller_address কখনো
              ব্যাকএন্ড থেকে আসতোই না (কোনো এন্ডপয়েন্টেই এই ফিল্ড নেই) —
              তাই এই লাইনটা বাস্তবে কখনো দেখাই যায়নি। এখন company_name
              (যেটা আসলেই আসে) দিয়ে CompanyTag, পার্ট ২-এর সাথে সামঞ্জস্যপূর্ণ। */}
          {(product.company_name_bn || product.company_name) && (
            <div className="mb-2">
              <CompanyTag
                name={product.company_name_bn || product.company_name}
                logoUrl={product.logo_url}
                colorKey={product.tenant_id}
              />
            </div>
          )}

          {!isConnected && (
            <div className="mb-2">
              <CpBadge variant="info">নতুন কোম্পানি — আগে অর্ডার করেননি</CpBadge>
            </div>
          )}

          {/* দাম */}
          <div className="mb-2.5">
            <div className="flex items-baseline flex-wrap gap-x-2">
              <p className="text-[24px] font-extrabold font-cp-head text-cp-trust-700 leading-none">
                ৳{price.toFixed(2)}
                <span className="text-[12px] font-normal text-cp-text-muted ml-1.5">/ {product.unit || 'পিস'}</span>
              </p>
              {hasSpecialPrice && (
                <span className="text-[13px] text-cp-text-muted line-through">৳{listPrice.toFixed(2)}</span>
              )}
            </div>
            {hasSpecialPrice && (
              <div className="mt-1">
                <CpBadge variant="info">আপনার জন্য বিশেষ মূল্য</CpBadge>
              </div>
            )}
          </div>

          {/* স্টক স্ট্যাটাস */}
          <div className="mb-3">
            {outOfStock ? (
              <CpBadge variant="error">স্টক নেই</CpBadge>
            ) : lowStock ? (
              <CpBadge variant="warning">মাত্র {stock}টি বাকি</CpBadge>
            ) : (
              <span className="text-[12px] font-semibold text-cp-success">✓ স্টকে আছে ({stock} {product.unit || 'পিস'})</span>
            )}
          </div>

          {/* মূল্য ব্রেকডাউন — VAT/Tax থাকলে */}
          {product.has_extra && (
            <div className="bg-cp-bg-alt rounded-xl p-3 mb-3 flex flex-col gap-1.5">
              <PriceRow label="বেস মূল্য" value={base} />
              {vat > 0 && <PriceRow label="VAT" value={vat} />}
              {tax > 0 && <PriceRow label="Tax" value={tax} />}
              <div className="h-px bg-cp-border my-0.5" />
              <PriceRow label="মোট (VAT/Tax সহ)" value={price} bold />
            </div>
          )}

          {product.description && (
            <p className="text-[13px] text-cp-text-secondary leading-relaxed mb-4 font-cp-body">
              {product.description}
            </p>
          )}

          {/* ✅ NEW (ফেজ ২ — রিলেটেড/ক্রস-সেল প্রোডাক্ট) */}
          {(relatedLoading || relatedProducts.length > 0) && (
            <div className="mb-4">
              <p className="text-[12px] font-bold text-cp-text-primary font-cp-head mb-2">আপনার পছন্দ হতে পারে</p>
              {relatedLoading ? (
                <div className="flex gap-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-[128px] h-[168px] rounded-2xl bg-cp-bg-alt animate-pulse flex-shrink-0" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                  {relatedProducts.map(rp => (
                    <div key={rp.id} className="w-[128px] flex-shrink-0">
                      <ProductCard
                        product={rp}
                        qty={cart[rp.id] || 0}
                        onOpen={onOpenRelated}
                        onAdd={onAdd}
                        onInc={onInc}
                        onDec={onDec}
                        onSetQty={onSetQty}
                        isConnected={connectedCompanyIds === null ? true : connectedCompanyIds.has(rp.tenant_id)}
                        isWishlisted={wishlistIds ? wishlistIds.has(rp.id) : false}
                        onToggleWishlist={onToggleWishlist}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* কার্ট কন্ট্রোল */}
          {!outOfStock && (
            inCart ? (
              <QtyStepper
                qty={qty}
                stock={stock}
                onInc={() => onInc(product.id)}
                onDec={() => onDec(product.id)}
                onSetQty={q => onSetQty(product.id, q)}
                size="lg"
              />
            ) : (
              <button
                onClick={() => onAdd(product)}
                className="w-full h-12 rounded-xl bg-cp-trust-500 active:bg-cp-trust-900 text-white text-[14px] font-cp-head font-bold flex items-center justify-center gap-2"
              >
                <FiPlus className="w-4 h-4" /> কার্টে যোগ করুন
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
