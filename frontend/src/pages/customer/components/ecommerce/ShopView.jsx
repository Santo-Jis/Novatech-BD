// ============================================================
// components/ecommerce/ShopView.jsx
// ============================================================
// কাস্টমার E-commerce ট্যাবে ঢুকলে এটাই প্রথমে দেখে — সরাসরি
// প্রোডাক্ট, কোনো বাড়তি ক্লিক ছাড়াই।
//
// সার্চ ইচ্ছাকৃতভাবে debounce/live না — Enter বা "খুঁজুন" বাটনে
// ট্রিগার হয়। কারণ: এই অ্যাপের ব্যবহারকারীরা প্রায়ই স্লো/অস্থির
// মোবাইল নেটওয়ার্কে থাকেন (screenshot-এ 2–45 KB/s পর্যন্ত দেখা
// গেছে) — প্রতি কি-স্ট্রোকে API কল করলে সেটা ডেটা/সময় দুটোই অপচয়
// করবে। সর্ট সম্পূর্ণ ক্লায়েন্ট-সাইডে (যা লোড হয়ে আছে তার উপর) —
// এতে ব্যাকএন্ডে কোনো পরিবর্তন লাগে না।
// ============================================================
import { FiSearch, FiX, FiPackage, FiAlertTriangle, FiChevronDown, FiTrendingUp, FiZap, FiClock } from 'react-icons/fi'
import ProductCard from './ProductCard'
import CpButton from '../ui/CpButton'
import { getCompanyColor } from '../../utils/companyColor'

const SORT_OPTIONS = [
  { key: 'name',       label: 'নাম' },
  { key: 'price_asc',  label: 'কম দাম আগে' },
  { key: 'price_desc', label: 'বেশি দাম আগে' },
]

// ✅ NEW (ফেজ ১ — আইটেম ৩) — হরাইজন্টাল-স্ক্রল রো, ProductCard-ই
// রিইউজ করে (একই ব্যাজ/বিশেষ-মূল্য/অ্যাড-টু-কার্ট/উইশলিস্ট লজিক, আলাদা
// কার্ড কম্পোনেন্ট বানানো লাগেনি) — শুধু একটা fixed-width র‍্যাপারে বসানো
function HorizontalProductRow({
  title, icon: Icon, tone = 'trust', products, cart, onOpenDetail, onAdd, onInc, onDec, onSetQty,
  connectedCompanyIds, wishlistIds, onToggleWishlist,   // ✅ NEW (ফেজ ৩)
}) {
  if (!products.length) return null
  const iconColor = tone === 'warmth' ? 'text-cp-warmth-600' : 'text-cp-trust-500'
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <p className="text-[12px] font-bold text-cp-text-primary font-cp-head">{title}</p>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {products.map(p => (
          <div key={p.id} className="w-[148px] flex-shrink-0">
            <ProductCard
              product={p}
              qty={cart[p.id] || 0}
              onOpen={onOpenDetail}
              onAdd={onAdd}
              onInc={onInc}
              onDec={onDec}
              onSetQty={onSetQty}
              isConnected={connectedCompanyIds === null ? true : connectedCompanyIds.has(p.tenant_id)}
              isWishlisted={wishlistIds ? wishlistIds.has(p.id) : false}
              onToggleWishlist={onToggleWishlist}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-cp-border overflow-hidden animate-pulse">
      <div className="aspect-square bg-cp-bg-alt" />
      <div className="p-2.5 flex flex-col gap-2">
        <div className="h-3 bg-cp-bg-alt rounded w-full" />
        <div className="h-3 bg-cp-bg-alt rounded w-2/3" />
        <div className="h-4 bg-cp-bg-alt rounded w-1/2 mt-1" />
        <div className="h-9 bg-cp-bg-alt rounded-xl mt-1" />
      </div>
    </div>
  )
}

export default function ShopView({
  products = [],
  initialLoading = false,
  loadingMore = false,
  error = null,
  search = '',
  onSearchChange,
  onSearchSubmit,
  committedSearch = '',
  sort = 'name',
  onSortChange,
  cart = {},
  onOpenDetail,
  onAdd,
  onInc,
  onDec,
  onSetQty,
  hasNext = false,
  onLoadMore,
  total = 0,
  onRetry,
  categories = [],
  selectedCategory = '',
  onSelectCategory,
  sellers = [],
  selectedSeller = '',
  onSelectSeller,
  connectedCompanyIds = null,
  bestsellers = [],   // ✅ NEW (ফেজ ১ — আইটেম ৩)
  newArrivals = [],   // ✅ NEW (ফেজ ১ — আইটেম ৩)
  recentlyViewed = [],           // ✅ NEW (ফেজ ৩ — সম্প্রতি দেখা)
  wishlistIds,                   // ✅ NEW (ফেজ ৩ — উইশলিস্ট)
  onToggleWishlist,               // ✅ NEW (ফেজ ৩ — উইশলিস্ট)
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* সার্চ */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cp-text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSearchSubmit() }}
            placeholder="পণ্য খুঁজুন..."
            className="w-full h-12 pl-9 pr-8 rounded-xl border border-cp-border bg-white text-[13px] font-cp-body text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:border-cp-trust-500"
          />
          {search && (
            <button
              onClick={() => { onSearchChange(''); onSearchSubmit('') }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cp-bg-alt flex items-center justify-center"
            >
              <FiX className="w-3 h-3 text-cp-text-secondary" />
            </button>
          )}
        </div>
        <CpButton variant="primary" size="md" onClick={() => onSearchSubmit()}>
          খুঁজুন
        </CpButton>
      </div>

      {/* ক্যাটাগরি চিপ — শুধু ক্যাটাগরি থাকলেই দেখা যাবে (না থাকলে
          আগের মতোই স্বাভাবিক, খালি রো দেখাবে না) */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => onSelectCategory('')}
            className={clsxChip(selectedCategory === '')}
          >
            সব
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={clsxChip(selectedCategory === cat.id)}
            >
              {cat.name_bn || cat.name}
            </button>
          ))}
        </div>
      )}

      {/* ✅ নতুন (পার্ট ৩) — কোম্পানি/বিক্রেতা চিপ, ক্যাটাগরির ঠিক নিচে।
          ক্যাটাগরির মতোই: বিক্রেতা না থাকলে চিপ রো-ই দেখাবে না */}
      {sellers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => onSelectSeller('')}
            className={clsxChip(selectedSeller === '')}
          >
            সব কোম্পানি
          </button>
          {sellers.map(s => (
            <button
              key={s.tenant_id}
              onClick={() => onSelectSeller(s.tenant_id)}
              className={clsxChip(selectedSeller === s.tenant_id)}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${getCompanyColor(s.tenant_id).dot}`}
              />
              {s.company_name_bn || s.company_name}
            </button>
          ))}
        </div>
      )}

      {/* ✅ NEW (ফেজ ১/৩) — সম্প্রতি দেখা → বেস্টসেলার → নতুন, এই ক্রমে।
          শুধু ডিফল্ট ভিউতে (কোনো সার্চ/ক্যাটাগরি/বিক্রেতা ফিল্টার
          একটিভ না থাকলে) — ফিল্টার করা অবস্থায় এগুলো বিভ্রান্তিকর হতো */}
      {!committedSearch && !selectedCategory && !selectedSeller && (
        <>
          <HorizontalProductRow
            title="সম্প্রতি দেখেছেন"
            icon={FiClock}
            tone="trust"
            products={recentlyViewed}
            cart={cart}
            onOpenDetail={onOpenDetail}
            onAdd={onAdd}
            onInc={onInc}
            onDec={onDec}
            onSetQty={onSetQty}
            connectedCompanyIds={connectedCompanyIds}
            wishlistIds={wishlistIds}
            onToggleWishlist={onToggleWishlist}
          />
          <HorizontalProductRow
            title="বেস্টসেলার"
            icon={FiTrendingUp}
            tone="warmth"
            products={bestsellers}
            cart={cart}
            onOpenDetail={onOpenDetail}
            onAdd={onAdd}
            onInc={onInc}
            onDec={onDec}
            onSetQty={onSetQty}
            connectedCompanyIds={connectedCompanyIds}
            wishlistIds={wishlistIds}
            onToggleWishlist={onToggleWishlist}
          />
          <HorizontalProductRow
            title="নতুন পণ্য"
            icon={FiZap}
            tone="trust"
            products={newArrivals}
            cart={cart}
            onOpenDetail={onOpenDetail}
            onAdd={onAdd}
            onInc={onInc}
            onDec={onDec}
            onSetQty={onSetQty}
            connectedCompanyIds={connectedCompanyIds}
            wishlistIds={wishlistIds}
            onToggleWishlist={onToggleWishlist}
          />
        </>
      )}

      {/* সর্ট চিপ + মোট সংখ্যা */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSortChange(opt.key)}
              className={clsxChip(sort === opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {total > 0 && (
          <span className="text-[11px] text-cp-text-muted flex-shrink-0">মোট {total}টি</span>
        )}
      </div>

      {/* গ্রিড / স্টেট */}
      {initialLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <FiAlertTriangle className="w-8 h-8 text-cp-error" />
          <p className="text-[13px] text-cp-text-secondary font-cp-body max-w-[220px]">{error}</p>
          <CpButton variant="secondary" size="sm" onClick={onRetry}>আবার চেষ্টা করুন</CpButton>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <FiPackage className="w-8 h-8 text-cp-text-muted" />
          <p className="text-[13px] text-cp-text-secondary font-cp-body max-w-[220px]">
            {committedSearch
              ? `"${committedSearch}" এর জন্য কোনো পণ্য পাওয়া যায়নি`
              : 'এখন কোনো পণ্য নেই'}
          </p>
          {committedSearch && (
            <CpButton variant="secondary" size="sm" onClick={() => { onSearchChange(''); onSearchSubmit('') }}>
              সার্চ পরিষ্কার করুন
            </CpButton>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {products.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                qty={cart[p.id] || 0}
                onOpen={onOpenDetail}
                onAdd={onAdd}
                onInc={onInc}
                onDec={onDec}
                onSetQty={onSetQty}
                isConnected={connectedCompanyIds === null ? true : connectedCompanyIds.has(p.tenant_id)}
                isWishlisted={wishlistIds ? wishlistIds.has(p.id) : false}
                onToggleWishlist={onToggleWishlist}
              />
            ))}
          </div>

          {hasNext && (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="h-10 rounded-xl border border-cp-border text-cp-trust-700 text-[12.5px] font-cp-head font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loadingMore ? 'লোড হচ্ছে...' : <>আরও দেখুন <FiChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function clsxChip(active) {
  return active
    ? 'px-3 h-7 rounded-full bg-cp-trust-500 text-white text-[11px] font-cp-head font-semibold whitespace-nowrap flex-shrink-0'
    : 'px-3 h-7 rounded-full bg-cp-bg-alt text-cp-text-secondary text-[11px] font-cp-head font-semibold whitespace-nowrap flex-shrink-0'
}
