// ============================================================
// components/ecommerce/CheckoutSheet.jsx
// ============================================================
// CartBar-এ ট্যাপ করলে যে শিট খোলে — আইটেম রিভিউ (ইনলাইন qty
// এডিট + রিমুভ), দামের সম্পূর্ণ ব্রেকডাউন, পেন্ডিং-অর্ডার নোটিশ,
// নোট, সাবমিট।
//
// ✅ পুরনো ভার্সনের একটা গুরুত্বপূর্ণ বাগ ঠিক করা হয়েছে: আগে
// "নিশ্চিত করুন"-এ ট্যাপ করা মাত্র রিভিউ শিট সাথে সাথে বন্ধ হয়ে
// যেত (API রেসপন্সের অপেক্ষা না করেই), তারপর সাবমিট ফেইল করলে
// ইউজার খালি প্রোডাক্ট পেইজে একটা ছোট লাল টেক্সট দেখত — এটাই
// সম্ভবত "Error আসে" সমস্যার আসল কারণ ছিল। এখন শিট খোলা থাকে,
// বাটনে লোডিং স্পিনার দেখায়, ফেইল করলে শিটের ভেতরেই স্পষ্ট কারণ
// দেখায় আর কার্ট/নোট অক্ষত থাকে — তাই আবার ট্যাপ করলেই রিট্রাই।
//
// প্রোডাক্টের নাম/দাম product cache থেকে আসে (currently-visible
// filtered list থেকে না) — তাই সার্চ পাল্টালেও কার্টের আইটেমের
// নাম "product_id" হয়ে যাওয়ার পুরনো বাগ এখানে হয় না।
// ============================================================
import { useState } from 'react'
import { FiX, FiPlus, FiTrash2, FiPackage, FiAlertTriangle, FiAlertCircle, FiSend, FiTag } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import QtyStepper from './QtyStepper'
import CompanyTag from '../CompanyTag'

function PriceRow({ label, value, bold = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className={bold ? 'text-[14px] font-cp-head font-bold text-cp-text-primary' : 'text-[12px] text-cp-text-secondary font-cp-body'}>
        {label}
      </span>
      <span className={bold ? 'text-[17px] font-cp-head font-extrabold text-cp-trust-700' : 'text-[12px] text-cp-text-secondary font-cp-body'}>
        ৳{value.toFixed(2)}
      </span>
    </div>
  )
}

export default function CheckoutSheet({
  items = [],           // [{ product, qty }]
  note = '',
  onNoteChange,
  onInc,
  onDec,
  onSetQty,
  onRemove,
  pendingCount = 0,
  promotionInfo = null, // ✅ NEW (ফেজ ০) — { applicable_promotions, total_discount, free_items, code_matched } | null
  promoCode = '',        // ✅ NEW (ফেজ ৩ — কুপন-কোড) — সর্বশেষ "প্রয়োগ করা" কোড
  onApplyPromoCode,       // ✅ NEW (ফেজ ৩)
  paymentMethod = 'cod',         // ✅ NEW (ফেজ ৪) — 'cod' | 'bkash_manual' | 'nagad_manual'
  onPaymentMethodChange,          // ✅ NEW (ফেজ ৪)
  tenantPaymentInfo = {},         // ✅ NEW (ফেজ ৪) — { [tenantId]: { bkash_number, nagad_number } }
  trxInputs = {},                 // ✅ NEW (ফেজ ৪) — { [tenantId]: { trx_id, sender_number } }
  onTrxInputChange,                // ✅ NEW (ফেজ ৪)
  submitting = false,
  submitError = null,
  onClose,
  onConfirm,
}) {
  const [codeInput, setCodeInput] = useState(promoCode || '')

  const subtotal  = items.reduce((s, { product, qty }) => s + (Number(product.base_price) || 0) * qty, 0)
  const vatTotal  = items.reduce((s, { product, qty }) => s + (Number(product.vat_amount) || 0) * qty, 0)
  const taxTotal  = items.reduce((s, { product, qty }) => s + (Number(product.tax_amount) || 0) * qty, 0)
  const grandTotal = items.reduce((s, { product, qty }) => s + (Number(product.final_price ?? product.base_price) || 0) * qty, 0)
  const isEmpty = items.length === 0

  // ✅ মাল্টি-ভেন্ডর — কার্টে একাধিক কোম্পানির প্রোডাক্ট থাকতে পারে।
  // tenant_id দিয়ে গ্রুপ করা হচ্ছে যাতে কাস্টমার আগে থেকেই বুঝতে পারে
  // সাবমিট করলে কয়টা আলাদা অর্ডার রিকোয়েস্টে ভাগ হবে (ব্যাকএন্ডও
  // ঠিক এই একই লজিকে ভাগ করে)।
  // ✅ ফিক্স (পার্ট ৩): আগে এখানে entry.product.seller_id দিয়ে গ্রুপ করা
  // হতো, কিন্তু ব্যাকএন্ড কখনো seller_id/seller_name পাঠায়নি (আসল ফিল্ড
  // নাম tenant_id/company_name) — ফলে sid সবসময় 'unknown' হতো, মানে
  // কার্টে যত কোম্পানিরই প্রোডাক্ট থাকুক না কেন সবসময় ১টা গ্রুপ দেখাত,
  // sellerCount>1 নোটিশ আর প্রতি-গ্রুপ কোম্পানি-লেবেল কখনো দেখাই যায়নি —
  // ঠিক যে মুহূর্তে (চেকআউট, টাকার হিসাব) এটা সবচেয়ে জরুরি ছিল।
  const sellerGroups = items.reduce((acc, entry) => {
    const sid = entry.product.tenant_id || 'unknown'
    if (!acc[sid]) {
      acc[sid] = {
        sellerName: entry.product.company_name_bn || entry.product.company_name || 'বিক্রেতা',
        logoUrl:    entry.product.logo_url,
        tenantId:   entry.product.tenant_id,
        entries: [],
      }
    }
    acc[sid].entries.push(entry)
    return acc
  }, {})
  const sellerGroupList = Object.values(sellerGroups)
  const sellerCount = sellerGroupList.length

  // ✅ NEW (ফেজ ৪) — একটা method তখনই অফার করা হবে যদি cart-এর
  // প্রতিটা বিক্রেতা-গ্রুপেই সেই নম্বর configured থাকে (multi-vendor
  // চেকআউটে uniform রাখতে, জটিলতা কমাতে — নাহলে এক কোম্পানির bKash
  // নম্বর নেই এমন অবস্থায় "bKash বাছুন" দেখানো বিভ্রান্তিকর হতো)
  const bkashAvailable = sellerGroupList.length > 0 && sellerGroupList.every(g => tenantPaymentInfo[g.tenantId]?.bkash_number)
  const nagadAvailable = sellerGroupList.length > 0 && sellerGroupList.every(g => tenantPaymentInfo[g.tenantId]?.nagad_number)
  const isMobileBanking = paymentMethod === 'bkash_manual' || paymentMethod === 'nagad_manual'
  // সব গ্রুপে TrxID পূরণ হয়েছে কিনা — মোবাইল ব্যাংকিং হলে সাবমিট-এর আগে লাগবে
  const allTrxFilled = sellerGroupList.every(g => trxInputs[g.tenantId]?.trx_id?.trim())

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[9999] flex items-end justify-center animate-fade-in"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-cp-bg-surface rounded-t-3xl w-full max-w-[480px] max-h-[90vh] flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* হ্যান্ডেল + হেডার */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="w-9 h-1 rounded-full bg-cp-border" />
          </div>
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-cp-border">
            <h3 className="text-[16px] font-extrabold font-cp-head text-cp-text-primary">🧾 অর্ডার রিভিউ</h3>
            <button
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="bg-cp-bg-alt rounded-lg w-8 h-8 flex items-center justify-center text-cp-text-secondary disabled:opacity-40"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* স্ক্রলযোগ্য মাঝখান */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
              <FiPackage className="w-8 h-8 text-cp-text-muted" />
              <p className="text-[13px] text-cp-text-secondary font-cp-body">কার্ট খালি</p>
            </div>
          ) : (
            <>
              {/* একাধিক কোম্পানি থাকলে স্প্লিট নোটিশ */}
              {sellerCount > 1 && (
                <div className="bg-cp-trust-100 rounded-xl p-3 flex gap-2 items-start">
                  <FiPackage className="w-4 h-4 text-cp-trust-700 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-cp-trust-700 leading-relaxed font-cp-body">
                    এই কার্টে <strong>{sellerCount}টি ভিন্ন কোম্পানির</strong> প্রোডাক্ট আছে — সাবমিট করলে {sellerCount}টি আলাদা অর্ডার রিকোয়েস্ট তৈরি হবে, প্রতিটা কোম্পানি নিজের অংশ আলাদাভাবে পূরণ করবে।
                  </p>
                </div>
              )}

              {/* আইটেম লিস্ট — বিক্রেতা অনুযায়ী গ্রুপ করা */}
              <div className="flex flex-col gap-4">
                {sellerGroupList.map((group, gi) => (
                  <div key={gi} className="flex flex-col gap-3">
                    {sellerCount > 1 && (
                      <CompanyTag name={group.sellerName} logoUrl={group.logoUrl} colorKey={group.tenantId} />
                    )}
                    {group.entries.map(({ product, qty }) => {
                      const stock = Number(product.available_stock) || 0
                      const lineTotal = (Number(product.final_price ?? product.base_price) || 0) * qty
                      return (
                        <div key={product.id} className="flex gap-3 items-center">
                          <div className="w-12 h-12 rounded-xl bg-cp-bg-alt overflow-hidden flex-shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FiPackage className="w-4 h-4 text-cp-text-muted" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-cp-text-primary line-clamp-1 font-cp-body">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-cp-text-muted font-cp-body">
                              ৳{lineTotal.toFixed(2)}
                            </p>
                          </div>

                          <QtyStepper
                            qty={qty}
                            stock={stock}
                            disabled={submitting}
                            onInc={() => onInc(product.id)}
                            onDec={() => onDec(product.id)}
                            onSetQty={q => onSetQty(product.id, q)}
                            size="sm"
                          />

                          <button
                            onClick={() => onRemove(product.id)}
                            disabled={submitting}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-cp-error flex-shrink-0 disabled:opacity-40"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* ✅ NEW (ফেজ ৩ — কুপন-কোড) — DB-তে promo_code কলাম আগে
                  থেকেই ছিল, শুধু dormant; matching লজিকে ও এখানে UI-তে
                  এক্সপোজ করা হলো */}
              {/* ✅ NEW (ফেজ ৪) — পেমেন্ট পদ্ধতি */}
              {onPaymentMethodChange && (
                <div>
                  <p className="text-[12px] font-semibold text-cp-text-secondary mb-1.5 font-cp-body">পেমেন্ট পদ্ধতি</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onPaymentMethodChange('cod')}
                      className={paymentMethod === 'cod'
                        ? 'rounded-xl border-2 border-cp-trust-500 bg-cp-trust-100 p-2.5 text-left'
                        : 'rounded-xl border-2 border-cp-border bg-white p-2.5 text-left'}
                    >
                      <p className="text-[12.5px] font-bold text-cp-text-primary font-cp-head">🚚 ক্যাশ অন ডেলিভারি</p>
                      <p className="text-[10px] text-cp-text-muted mt-0.5 font-cp-body">ডেলিভারিতে নগদ পরিশোধ</p>
                    </button>
                    {(bkashAvailable || nagadAvailable) && (
                      <button
                        onClick={() => onPaymentMethodChange(bkashAvailable ? 'bkash_manual' : 'nagad_manual')}
                        className={isMobileBanking
                          ? 'rounded-xl border-2 border-cp-trust-500 bg-cp-trust-100 p-2.5 text-left'
                          : 'rounded-xl border-2 border-cp-border bg-white p-2.5 text-left'}
                      >
                        <p className="text-[12.5px] font-bold text-cp-text-primary font-cp-head">📱 মোবাইল ব্যাংকিং</p>
                        <p className="text-[10px] text-cp-text-muted mt-0.5 font-cp-body">এখনই bKash/Nagad-এ পে করুন</p>
                      </button>
                    )}
                  </div>

                  {/* bKash/Nagad দুটোই উপলব্ধ হলে বেছে নেওয়ার অপশন */}
                  {isMobileBanking && bkashAvailable && nagadAvailable && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => onPaymentMethodChange('bkash_manual')}
                        className={paymentMethod === 'bkash_manual'
                          ? 'flex-1 py-1.5 rounded-lg bg-cp-trust-500 text-white text-[11px] font-cp-head font-bold'
                          : 'flex-1 py-1.5 rounded-lg bg-cp-bg-alt text-cp-text-secondary text-[11px] font-cp-head font-bold'}
                      >
                        bKash
                      </button>
                      <button
                        onClick={() => onPaymentMethodChange('nagad_manual')}
                        className={paymentMethod === 'nagad_manual'
                          ? 'flex-1 py-1.5 rounded-lg bg-cp-trust-500 text-white text-[11px] font-cp-head font-bold'
                          : 'flex-1 py-1.5 rounded-lg bg-cp-bg-alt text-cp-text-secondary text-[11px] font-cp-head font-bold'}
                      >
                        Nagad
                      </button>
                    </div>
                  )}

                  {/* মোবাইল ব্যাংকিং বাছলে — প্রতিটা বিক্রেতার জন্য আলাদা
                      নম্বর + TrxID এন্ট্রি (মাল্টি-ভেন্ডর হলে একাধিকবার
                      Send Money করতে হবে, প্রতিটা কোম্পানির নম্বরে আলাদা) */}
                  {isMobileBanking && (
                    <div className="flex flex-col gap-2.5 mt-3">
                      {sellerGroupList.map(group => {
                        const info   = tenantPaymentInfo[group.tenantId] || {}
                        const number = paymentMethod === 'bkash_manual' ? info.bkash_number : info.nagad_number
                        const groupTotal = group.entries.reduce((s, { product, qty }) => s + (Number(product.final_price ?? product.base_price) || 0) * qty, 0)
                        const trx = trxInputs[group.tenantId] || { trx_id: '', sender_number: '' }
                        return (
                          <div key={group.tenantId} className="rounded-xl border border-cp-border p-3 flex flex-col gap-2">
                            {sellerCount > 1 && (
                              <p className="text-[11px] font-semibold text-cp-text-secondary font-cp-body">{group.sellerName}</p>
                            )}
                            <p className="text-[12px] text-cp-text-primary font-cp-body">
                              এই নম্বরে <span className="font-bold">৳{groupTotal.toFixed(2)}</span> Send Money করুন: <span className="font-bold text-cp-trust-700">{number || '—'}</span>
                            </p>
                            <input
                              value={trx.trx_id}
                              onChange={e => onTrxInputChange(group.tenantId, 'trx_id', e.target.value.toUpperCase())}
                              placeholder="Transaction ID (TrxID)"
                              className="w-full h-9 px-3 rounded-lg border border-cp-border bg-white text-[12px] font-cp-body focus:outline-none focus:border-cp-trust-500"
                            />
                            <input
                              value={trx.sender_number}
                              onChange={e => onTrxInputChange(group.tenantId, 'sender_number', e.target.value)}
                              placeholder="যে নম্বর থেকে পাঠিয়েছেন (সম্পূর্ণ বা শেষ ৫ সংখ্যা)"
                              className="w-full h-9 px-3 rounded-lg border border-cp-border bg-white text-[12px] font-cp-body focus:outline-none focus:border-cp-trust-500"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {onApplyPromoCode && (
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cp-text-muted pointer-events-none" />
                    <input
                      value={codeInput}
                      onChange={e => setCodeInput(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter' && codeInput) onApplyPromoCode(codeInput) }}
                      placeholder="প্রোমো কোড থাকলে দিন (ঐচ্ছিক)"
                      className="w-full h-10 pl-8 pr-3 rounded-xl border border-cp-border bg-white text-[12.5px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:border-cp-trust-500"
                    />
                  </div>
                  <button
                    onClick={() => codeInput && onApplyPromoCode(codeInput)}
                    disabled={!codeInput}
                    className="px-4 h-10 rounded-xl bg-cp-trust-500 active:bg-cp-trust-900 text-white text-[12px] font-cp-head font-bold disabled:opacity-40 flex-shrink-0"
                  >
                    প্রয়োগ
                  </button>
                </div>
              )}

              {/* ✅ NEW (ফেজ ০ — Promotions এক্সপোজার): প্রযোজ্য অফার —
                  শুধু তথ্যের জন্য, নিচের "সর্বমোট"-এ এখনো যোগ হয়নি
                  (SR অর্ডার কনফার্ম করার সময় প্রয়োগ করবেন)। কুপন-কোড
                  দেওয়া থাকলে তিন রকম ফলাফল দেখানো হয়: প্রযোজ্য অফার
                  পাওয়া গেছে, কোড ভুল, বা কোড ঠিক কিন্তু শর্ত পূরণ হয়নি। */}
              {promotionInfo?.applicable_promotions?.length > 0 ? (
                <div className="bg-cp-trust-100 rounded-xl p-3 flex flex-col gap-1.5">
                  <p className="text-[11px] font-semibold text-cp-trust-700 font-cp-body">🏷️ প্রযোজ্য অফার</p>
                  {promotionInfo.applicable_promotions.map(p => (
                    <p key={p.promotion_id} className="text-[12px] text-cp-trust-700 font-cp-body leading-relaxed">
                      {p.message}
                    </p>
                  ))}
                  <p className="text-[10.5px] text-cp-trust-600 font-cp-body">
                    অর্ডার কনফার্ম করার সময় SR এই ছাড় প্রয়োগ করবেন
                  </p>
                </div>
              ) : promoCode && promotionInfo?.code_matched === false ? (
                <p className="text-[12px] text-cp-error font-cp-body px-1">এই কোডটি সঠিক নয় বা মেয়াদ শেষ হয়ে গেছে</p>
              ) : promoCode && promotionInfo?.code_matched === true ? (
                <p className="text-[12px] text-cp-text-secondary font-cp-body px-1">কোডটি সঠিক, কিন্তু এখনো শর্ত পূরণ হয়নি (যেমন ন্যূনতম অর্ডার-মূল্য)</p>
              ) : null}

              {/* দামের ব্রেকডাউন */}
              <div className="bg-cp-bg-alt rounded-xl p-3.5 flex flex-col gap-1.5">
                <PriceRow label="সাব-টোটাল" value={subtotal} />
                {vatTotal > 0 && <PriceRow label="মোট VAT" value={vatTotal} />}
                {taxTotal > 0 && <PriceRow label="মোট Tax" value={taxTotal} />}
                <div className="h-px bg-cp-border my-0.5" />
                <PriceRow label="সর্বমোট" value={grandTotal} bold />
              </div>

              {/* পেন্ডিং অর্ডার নোটিশ */}
              {pendingCount > 0 && (
                <div className="bg-cp-warmth-100 rounded-xl p-3 flex gap-2 items-start">
                  <FiAlertTriangle className="w-4 h-4 text-cp-warmth-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-cp-warmth-700 leading-relaxed font-cp-body">
                    আপনার ইতিমধ্যে {pendingCount}টি অর্ডার রিকোয়েস্ট পেন্ডিং আছে। তারপরও চাইলে নতুন অর্ডার পাঠাতে পারবেন।
                  </p>
                </div>
              )}

              {/* নোট — ✅ NEW (ফেজ ৪ — Path A পলিশ): ডেলিভারি-নির্দিষ্ট
                  লেবেল/প্লেসহোল্ডার, আগে জেনেরিক "নোট" ছিল */}
              <div>
                <label className="text-[12px] font-semibold text-cp-text-secondary mb-1.5 block font-cp-body">
                  ডেলিভারি নোট (ঐচ্ছিক)
                </label>
                <textarea
                  value={note}
                  onChange={e => onNoteChange(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  placeholder="ডেলিভারির সময়/ঠিকানা নিয়ে বিশেষ কিছু থাকলে লিখুন..."
                  className="w-full rounded-xl border border-cp-border p-3 text-[13px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted resize-none focus:outline-none focus:border-cp-trust-500 disabled:opacity-60"
                />
                <p className="text-[10.5px] text-cp-text-muted mt-1.5 font-cp-body">
                  📦 সাধারণত ১–৩ কার্যদিবসের মধ্যে SR যোগাযোগ করে ডেলিভারি নিশ্চিত করেন
                </p>
              </div>

              {/* সাবমিট এরর — শিট বন্ধ না হয়ে এখানেই স্পষ্ট কারণ দেখাবে */}
              {submitError && (
                <div className="bg-cp-error-bg rounded-xl p-3 flex gap-2 items-start">
                  <FiAlertCircle className="w-4 h-4 text-cp-error flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-cp-error leading-relaxed font-cp-body">{submitError}</p>
                </div>
              )}

              <p className="text-[11px] text-cp-text-muted text-center leading-relaxed font-cp-body">
                একবার পাঠালে SR আপনার সাথে যোগাযোগ না করা পর্যন্ত এই অর্ডার বাতিল করা যাবে না।
              </p>
            </>
          )}
        </div>

        {/* ফুটার — স্ক্রল হয় না, সবসময় নাগালে */}
        {!isEmpty && (
          <div
            className="flex-shrink-0 border-t border-cp-border p-4 flex gap-2.5"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
          >
            <CpButton variant="secondary" size="lg" className="flex-1" disabled={submitting} onClick={onClose}>
              আরও কিনুন
            </CpButton>
            <CpButton
              variant="confirm"
              size="lg"
              className="flex-[1.4]"
              icon={FiSend}
              loading={submitting}
              disabled={submitting || (isMobileBanking && !allTrxFilled)}
              onClick={onConfirm}
            >
              {submitting ? 'পাঠানো হচ্ছে...' : 'নিশ্চিত করুন'}
            </CpButton>
          </div>
        )}
      </div>
    </div>
  )
}
