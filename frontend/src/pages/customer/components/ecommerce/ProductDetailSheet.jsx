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
import { FiX, FiMinus, FiPlus, FiPackage } from 'react-icons/fi'
import CpBadge from '../ui/CpBadge'
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

export default function ProductDetailSheet({ product, qty = 0, onClose, onAdd, onInc, onDec }) {
  if (!product) return null

  const stock      = Number(product.available_stock) || 0
  const price      = Number(product.final_price ?? product.base_price) || 0
  const base       = Number(product.base_price) || 0
  const vat        = Number(product.vat_amount) || 0
  const tax        = Number(product.tax_amount) || 0
  const inCart     = qty > 0
  const outOfStock = stock <= 0
  const lowStock   = !outOfStock && stock <= LOW_STOCK_THRESHOLD

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

        {/* ছবি */}
        <div className="h-[200px] bg-cp-bg-alt overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
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

          {/* দাম */}
          <p className="text-[24px] font-extrabold font-cp-head text-cp-trust-700 mb-2.5 leading-none">
            ৳{price.toFixed(2)}
            <span className="text-[12px] font-normal text-cp-text-muted ml-1.5">/ {product.unit || 'পিস'}</span>
          </p>

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

          {/* কার্ট কন্ট্রোল */}
          {!outOfStock && (
            inCart ? (
              <div className="flex items-center justify-between bg-cp-trust-100 rounded-xl h-12 px-1.5">
                <button
                  onClick={() => onDec(product.id)}
                  className="w-9 h-9 rounded-lg bg-white text-cp-trust-700 flex items-center justify-center active:bg-cp-trust-100"
                >
                  <FiMinus className="w-4 h-4" />
                </button>
                <span className="font-cp-head font-extrabold text-[16px] text-cp-trust-900">{qty}</span>
                <button
                  onClick={() => onInc(product.id)}
                  disabled={qty >= stock}
                  className="w-9 h-9 rounded-lg bg-white text-cp-trust-700 flex items-center justify-center active:bg-cp-trust-100 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <FiPlus className="w-4 h-4" />
                </button>
              </div>
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
