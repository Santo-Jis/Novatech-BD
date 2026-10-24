import { useMemo, useState } from 'react'
import { FiSearch, FiX } from 'react-icons/fi'

// ─── পণ্য ফিল্টার hook ─────────────────────────────────────
// products থেকেই ক্যাটাগরি ও কোম্পানি (brand) বের করা হয় — আলাদা API call লাগে না,
// তাই offline cache থেকে পণ্য লোড হলেও ফিল্টার কাজ করে।
export function useProductFilter(products) {
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('')   // category_id
  const [brand,    setBrand]    = useState('')   // কোম্পানি / brand

  const categories = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      if (!p.category_id) return
      const name = p.category_name_bn || p.category_name || 'অন্যান্য'
      const prev = map.get(p.category_id)
      map.set(p.category_id, { id: p.category_id, name, count: (prev?.count || 0) + 1 })
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const brands = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      const b = (p.brand || '').trim()
      if (!b) return
      map.set(b, (map.get(b) || 0) + 1)
    })
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (category && String(p.category_id) !== String(category)) return false
      if (brand && (p.brand || '').trim() !== brand) return false
      if (q) {
        const hay = `${p.name || ''} ${p.sku || ''} ${p.brand || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [products, search, category, brand])

  const hasActiveFilter = !!(search || category || brand)
  const clear = () => { setSearch(''); setCategory(''); setBrand('') }

  return {
    search, setSearch, category, setCategory, brand, setBrand,
    categories, brands, filtered, hasActiveFilter, clear,
  }
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-gray-600 border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

// ─── ফিল্টার বার UI ────────────────────────────────────────
export default function ProductFilterBar({ filter, total }) {
  const {
    search, setSearch, category, setCategory, brand, setBrand,
    categories, brands, filtered, hasActiveFilter, clear,
  } = filter

  const [showBrands, setShowBrands] = useState(false)

  return (
    <div className="space-y-2">
      {/* সার্চ */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="পণ্যের নাম / SKU / কোম্পানি খুঁজুন"
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-primary"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <FiX size={15} />
          </button>
        )}
      </div>

      {/* ক্যাটাগরি */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <Chip active={!category} onClick={() => setCategory('')}>সব ক্যাটাগরি</Chip>
          {categories.map(c => (
            <Chip key={c.id} active={String(category) === String(c.id)}
              onClick={() => setCategory(String(category) === String(c.id) ? '' : c.id)}>
              {c.name} ({c.count})
            </Chip>
          ))}
        </div>
      )}

      {/* কোম্পানি */}
      {brands.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowBrands(s => !s)}
            className="text-xs text-primary font-medium mb-1">
            🏢 কোম্পানি {brand ? `: ${brand}` : ''} {showBrands ? '▲' : '▼'}
          </button>
          {(showBrands || brand) && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              <Chip active={!brand} onClick={() => setBrand('')}>সব কোম্পানি</Chip>
              {brands.map(b => (
                <Chip key={b.name} active={brand === b.name}
                  onClick={() => setBrand(brand === b.name ? '' : b.name)}>
                  {b.name} ({b.count})
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ফলাফল সংখ্যা */}
      {hasActiveFilter && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{filtered.length} / {total} টি পণ্য দেখানো হচ্ছে</span>
          <button type="button" onClick={clear} className="text-red-500 font-medium">
            ফিল্টার মুছুন
          </button>
        </div>
      )}
    </div>
  )
}
