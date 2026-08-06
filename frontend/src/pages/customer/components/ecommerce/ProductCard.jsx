// ============================================================
// components/ecommerce/ProductCard.jsx
// ============================================================
// শপ গ্রিডে একটা প্রোডাক্ট কার্ড।
//
//  - ছবি/নামে ট্যাপ করলে → ডিটেইল শিট খোলে (onOpen)
//  - কার্টে না থাকলে → "+ কার্টে যোগ" বাটন
//  - কার্টে থাকলে → বাটনের জায়গায় ইনলাইন -/qty/+ স্টেপার (কার্ড না
//    খুলেই qty বাড়ানো/কমানো যায়), কার্ডের বর্ডার হাইলাইট হয়ে যায়,
//    আর ছবির কোণায় qty ব্যাজ বসে — কার্টে কী কী আছে এক নজরে বোঝা যায়।
//  - স্টক কম (≤৫) থাকলে সতর্কতা ব্যাজ; নইলে কোনো ব্যাজ দেখাই না
//    (ডিজাইন সিস্টেমের নিয়ম: green/success শুধু "ভেরিফায়েড/পরিশোধিত"
//    টাইপ অবস্থার জন্য, স্টক-ইন-হ্যান্ড সাজানোর জন্য সবুজ ব্যাজ বসানো
//    ঠিক না — তাই স্বাভাবিক স্টকে কার্ড নিরিবিলি থাকে)।
// ============================================================
import { useState } from 'react'
import clsx from 'clsx'
import { FiPlus, FiPackage } from 'react-icons/fi'
import CpBadge from '../ui/CpBadge'
import QtyStepper from './QtyStepper'
import CompanyTag from '../CompanyTag'
import { LOW_STOCK_THRESHOLD } from './constants'

// ✅ REDESIGNED (পার্ট ৩ — Shop কোম্পানি ফিল্টার + ব্যাজ): seller_name
// টেক্সট লাইনের বদলে CompanyTag (পার্ট ২-এর সাথে সামঞ্জস্যপূর্ণ), আর
// isConnected=false হলে "নতুন কোম্পানি" ব্যাজ — অর্ডারের আগেই কাস্টমার
// বুঝুক এটা তার চেনা ডিস্ট্রিবিউটর কিনা।
export default function ProductCard({ product, qty = 0, onOpen, onAdd, onInc, onDec, onSetQty, isConnected = true }) {
  const [imgError, setImgError]   = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const stock    = Number(product.available_stock) || 0
  const inCart   = qty > 0
  const lowStock = stock > 0 && stock <= LOW_STOCK_THRESHOLD
  const price    = Number(product.final_price ?? product.base_price) || 0

  return (
    <div
      onClick={() => onOpen(product)}
      className={clsx(
        'bg-white rounded-2xl border overflow-hidden cursor-pointer transition-colors',
        inCart ? 'border-cp-trust-500 border-2' : 'border-cp-border'
      )}
    >
      {/* ছবি */}
      <div className="aspect-square bg-cp-bg-alt relative">
        {product.image_url && !imgError ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FiPackage className="w-7 h-7 text-cp-text-muted" />
          </div>
        )}
        {inCart && (
          <span className="absolute top-1.5 right-1.5 min-w-[20px] h-5 px-1 bg-cp-trust-900 text-white text-[10px] font-cp-head font-bold rounded-full flex items-center justify-center shadow-sm">
            {qty}
          </span>
        )}
      </div>

      {/* তথ্য */}
      <div className="p-2.5 flex flex-col gap-1.5">
        <p className="font-cp-body font-semibold text-[12.5px] text-cp-text-primary leading-snug line-clamp-2 min-h-[32px]">
          {product.name}
        </p>

        {(product.seller_name_bn || product.seller_name || product.company_name_bn || product.company_name) && (
          <div className="-mt-1">
            <CompanyTag
              name={product.company_name_bn || product.company_name || product.seller_name_bn || product.seller_name}
              logoUrl={product.logo_url}
              colorKey={product.tenant_id}
            />
          </div>
        )}

        {!isConnected && (
          <CpBadge variant="info" className="self-start">নতুন কোম্পানি</CpBadge>
        )}

        <div className="flex items-baseline gap-1">
          <span className="font-cp-head font-bold text-[15px] text-cp-trust-700">
            ৳{price.toFixed(0)}
          </span>
          {product.unit && (
            <span className="text-[10px] text-cp-text-muted">/{product.unit}</span>
          )}
        </div>

        {lowStock && (
          <CpBadge variant="warning" className="self-start">
            মাত্র {stock}টি বাকি
          </CpBadge>
        )}

        {/* অ্যাকশন */}
        {inCart ? (
          <QtyStepper
            qty={qty}
            stock={stock}
            onInc={() => onInc(product.id)}
            onDec={() => onDec(product.id)}
            onSetQty={q => onSetQty(product.id, q)}
            size="md"
          />
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onAdd(product) }}
            className="w-full h-9 rounded-xl bg-cp-trust-500 active:bg-cp-trust-900 text-white text-[12px] font-cp-head font-bold flex items-center justify-center gap-1 mt-0.5"
          >
            <FiPlus className="w-3.5 h-3.5" /> কার্টে যোগ
          </button>
        )}
      </div>
    </div>
  )
}
