// ============================================================
// components/ecommerce/CartBar.jsx
// ============================================================
// শপ ভিউয়ের নিচে fixed থাকা persistent কার্ট বার — কার্টে ≥১টা
// আইটেম থাকলেই দেখা যায়, স্ক্রল করলেও হারায় না। এইটাই স্ক্রিনের
// একমাত্র 'action' (কমলা) বাটন — ডিজাইন সিস্টেমের নিয়ম অনুযায়ী
// (একটা স্ক্রিনে সর্বোচ্চ ১টা action বাটন থাকা উচিত), তাই গ্রিডের
// "+ কার্টে যোগ" বাটনগুলো ইচ্ছাকৃতভাবে ট্রাস্ট-ব্লু রাখা হয়েছে,
// এই বারটাই একমাত্র কমলা — চোখ সরাসরি এখানে যাবে।
//
// BottomNav (fixed, ~৬০px) এর উপরে বসে — bottom অফসেট হিসাব করা
// আছে যাতে নেভিগেশন বারের সাথে না মিশে যায়।
// ============================================================
import { FiShoppingCart, FiChevronRight } from 'react-icons/fi'

export default function CartBar({ cartCount = 0, itemCount = 0, totalAmount = 0, onCheckout }) {
  if (cartCount === 0) return null

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4 animate-slide-up pointer-events-none"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <button
        onClick={onCheckout}
        className="w-full max-w-[448px] bg-cp-warmth-600 hover:brightness-95 active:brightness-90 shadow-lg shadow-cp-warmth-600/30 rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto transition-[filter]"
      >
        <div className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <FiShoppingCart className="w-[18px] h-[18px] text-white" />
          <span className="absolute -top-1.5 -right-1.5 bg-white text-cp-warmth-700 text-[10px] font-cp-head font-extrabold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
            {itemCount}
          </span>
        </div>

        <div className="flex-1 text-left min-w-0">
          <p className="text-white font-cp-head font-extrabold text-[15px] leading-tight">
            ৳{Number(totalAmount).toFixed(0)}
          </p>
          <p className="text-white/85 text-[11px] leading-tight font-cp-body">
            {cartCount}টি পণ্য কার্টে
          </p>
        </div>

        <span className="text-white font-cp-head font-bold text-[13px] flex items-center gap-1 flex-shrink-0">
          চেকআউট <FiChevronRight className="w-4 h-4" />
        </span>
      </button>
    </div>
  )
}
