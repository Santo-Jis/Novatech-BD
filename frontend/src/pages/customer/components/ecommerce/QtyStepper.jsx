// ============================================================
// components/ecommerce/QtyStepper.jsx
// ============================================================
// −/সংখ্যা/+ — কিন্তু সংখ্যাটা এখন ট্যাপ করে সরাসরি টাইপ করা যায়।
//
// ✅ কেন যোগ হলো: শুধু ট্যাপ-ভিত্তিক +/- দিয়ে ৫০ পিস অর্ডার করতে
// ৫০ বার ট্যাপ লাগত — হোলসেল/বাল্ক অর্ডারের জন্য এটা অব্যবহারিক।
// এখন সংখ্যায় ট্যাপ করলেই কীবোর্ড আসবে (numeric), সরাসরি "৫০" টাইপ
// করে Enter/ট্যাপ-আউট করলেই কমিট হয়ে যায়। স্টকের বেশি লিখলে
// available stock-এ ক্ল্যাম্প হয়ে যায়।
//
// ProductCard/ProductDetailSheet/CheckoutSheet — তিন জায়গাতেই এই
// একই কম্পোনেন্ট ব্যবহৃত হয়, যাতে আচরণ সব জায়গায় হুবহু এক থাকে।
// ============================================================
import { useState, useEffect } from 'react'
import { FiMinus, FiPlus } from 'react-icons/fi'

const SIZE = {
  sm: { wrap: 'h-7',  btn: 'w-6 h-6', icon: 'w-3 h-3',   text: 'text-[12px]', input: 'w-5' },
  md: { wrap: 'h-9',  btn: 'w-7 h-7', icon: 'w-3.5 h-3.5', text: 'text-[13px]', input: 'w-7' },
  lg: { wrap: 'h-12', btn: 'w-9 h-9', icon: 'w-4 h-4',   text: 'text-[16px]', input: 'w-9' },
}

export default function QtyStepper({
  qty = 0,
  stock = Infinity,
  onInc,
  onDec,
  onSetQty,     // (newQty: number) => void — সরাসরি টাইপ করে কমিট করলে
  size = 'md',
  disabled = false,
}) {
  const s = SIZE[size] || SIZE.md
  const [draft, setDraft]     = useState(String(qty))
  const [editing, setEditing] = useState(false)

  // বাইরে থেকে qty বদলালে (স্টেপার বাটনে) draft-ও সিঙ্কে থাকবে,
  // কিন্তু ইউজার যখন নিজে টাইপ করছে তখন মাঝপথে ওভাররাইট হবে না
  useEffect(() => {
    if (!editing) setDraft(String(qty))
  }, [qty, editing])

  const commit = () => {
    setEditing(false)
    const n = parseInt(draft, 10)
    if (Number.isNaN(n)) { setDraft(String(qty)); return }
    const clamped = Math.max(0, Math.min(n, stock))
    setDraft(String(clamped))
    if (clamped !== qty) onSetQty(clamped)
  }

  return (
    <div className={`flex items-center justify-between bg-cp-trust-100 rounded-lg px-1 ${s.wrap}`} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={onDec}
        disabled={disabled}
        className={`${s.btn} rounded-md bg-white text-cp-trust-700 flex items-center justify-center active:bg-cp-trust-100 disabled:opacity-40 disabled:pointer-events-none`}
      >
        <FiMinus className={s.icon} />
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        disabled={disabled}
        onFocus={e => { setEditing(true); e.target.select() }}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        className={`${s.input} text-center bg-transparent font-cp-head font-bold ${s.text} text-cp-trust-900 focus:outline-none disabled:opacity-60`}
      />

      <button
        type="button"
        onClick={onInc}
        disabled={disabled || qty >= stock}
        className={`${s.btn} rounded-md bg-white text-cp-trust-700 flex items-center justify-center active:bg-cp-trust-100 disabled:opacity-40 disabled:pointer-events-none`}
      >
        <FiPlus className={s.icon} />
      </button>
    </div>
  )
}
