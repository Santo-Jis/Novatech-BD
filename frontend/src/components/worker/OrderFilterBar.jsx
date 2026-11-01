import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FiSearch, FiX, FiChevronDown } from 'react-icons/fi'

// ─── অর্ডার পেজের ফিল্টার বার ──────────────────────────────
// useProductFilter (ProductFilterBar.jsx) এর hook-ই ব্যবহার হয় — লজিক একই।
// ProductFilterBar নিজে SalesForm-এও ব্যবহার হয়, তাই সেটা বদলানো হয়নি।
//
// স্ক্রল করলেও সার্চ ও ক্যাটাগরি যেন ওপরে থাকে — এজন্য বারটি fixed।
// (WorkerLayout-এর <main> overflow-auto, তাই `sticky` এখানে আটকায় না।)
// top = লেআউটের header-এর উচ্চতা (মেপে নেওয়া), আর নিচে একটা spacer
// বসে যাতে তালিকা বারের নিচে ঢেকে না যায়।

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 h-10 px-4 rounded-full text-sm border transition-colors active:scale-95 ${
        active
          ? 'bg-primary text-white border-primary font-semibold'
          : 'bg-white text-gray-700 border-gray-300 font-medium'
      }`}
    >
      {children}
    </button>
  )
}

export default function OrderFilterBar({ filter, total }) {
  const {
    search, setSearch, category, setCategory, brand, setBrand,
    categories, brands, filtered, hasActiveFilter, clear,
  } = filter

  const [showBrands, setShowBrands] = useState(false)
  const [top, setTop]               = useState(0)
  const [barH, setBarH]             = useState(0)
  const barRef = useRef(null)

  // লেআউটের sticky header-এর ঠিক নিচে বসানোর জন্য তার উচ্চতা মাপো
  useLayoutEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const measure = () => setTop(header.offsetHeight)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // কোম্পানি সারি খুললে/বন্ধ করলে বারের উচ্চতা বদলায় — spacer মিলিয়ে নাও
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    setBarH(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <>
      <div style={{ height: barH }} aria-hidden="true" />
      <div
        ref={barRef}
        style={{ top }}
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-30 bg-white border-b border-gray-200 px-4 pt-3 pb-2 space-y-2"
      >
        {/* সার্চ */}
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="পণ্য খুঁজুন"
            placeholder="পণ্যের নাম / SKU / কোম্পানি খুঁজুন"
            className="w-full h-12 pl-10 pr-11 bg-gray-50 border-[1.5px] border-gray-300 rounded-xl text-base outline-none focus:border-primary focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="সার্চ মুছুন"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-500"
            >
              <FiX size={18} />
            </button>
          )}
        </div>

        {/* ক্যাটাগরি + কোম্পানি বাটন (এক সারিতে) */}
        {(categories.length > 0 || brands.length > 0) && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            {brands.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBrands(s => !s)}
                aria-expanded={showBrands}
                className={`flex-shrink-0 h-10 px-3 rounded-full text-sm font-medium border flex items-center gap-1 transition-colors active:scale-95 ${
                  brand
                    ? 'bg-secondary text-white border-secondary'
                    : 'bg-white text-primary border-primary/40'
                }`}
              >
                {brand || 'কোম্পানি'}
                <FiChevronDown size={15} className={`transition-transform ${showBrands ? 'rotate-180' : ''}`} />
              </button>
            )}
            {categories.length > 0 && (
              <>
                <Chip active={!category} onClick={() => setCategory('')}>সব ({total})</Chip>
                {categories.map(c => (
                  <Chip
                    key={c.id}
                    active={String(category) === String(c.id)}
                    onClick={() => setCategory(String(category) === String(c.id) ? '' : c.id)}
                  >
                    {c.name} ({c.count})
                  </Chip>
                ))}
              </>
            )}
          </div>
        )}

        {/* কোম্পানির তালিকা — বাটনে চাপলে খোলে */}
        {brands.length > 0 && (showBrands || brand) && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            <Chip active={!brand} onClick={() => setBrand('')}>সব কোম্পানি</Chip>
            {brands.map(b => (
              <Chip
                key={b.name}
                active={brand === b.name}
                onClick={() => setBrand(brand === b.name ? '' : b.name)}
              >
                {b.name} ({b.count})
              </Chip>
            ))}
          </div>
        )}

        {/* ফলাফল */}
        <div className="flex items-center justify-between text-sm text-gray-600 min-h-[24px]">
          <span>
            {hasActiveFilter ? `${filtered.length} / ${total} টি পণ্য` : `${total} টি পণ্য`}
          </span>
          {hasActiveFilter && (
            <button type="button" onClick={clear} className="text-danger font-semibold h-8 px-1">
              ফিল্টার মুছুন
            </button>
          )}
        </div>
      </div>
    </>
  )
}
