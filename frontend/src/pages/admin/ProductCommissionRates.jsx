import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiSave, FiSearch } from 'react-icons/fi'

// ============================================================
// SR × প্রডাক্ট ভিত্তিক কমিশন রেট (Admin → সেটিংস)
// একই প্রডাক্টে আলাদা SR আলাদা % পেতে পারে (যেমন X প্রডাক্টে Y SR ২%, Z SR ১.৩%)।
// ঘর খালি = ওই প্রডাক্টে SR-এর নির্দিষ্ট রেট, তা-ও না থাকলে কোম্পানির স্ল্যাব।
// ============================================================

const toDraft = (rate) => (rate === null || rate === undefined ? '' : String(rate))

export default function ProductCommissionRates() {
  const [srList,     setSrList]     = useState([])
  const [workerId,   setWorkerId]   = useState('')
  const [products,   setProducts]   = useState([])   // সার্ভারের মান: { id, name, rate, ... }
  const [drafts,     setDrafts]     = useState({})   // { [productId]: 'ইনপুটের লেখা' }
  const [fallback,   setFallback]   = useState(null) // SR-এর নির্দিষ্ট রেট (null = স্ল্যাব)
  const [search,     setSearch]     = useState('')
  const [bulkRate,   setBulkRate]   = useState('')
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)

  // SR তালিকা
  useEffect(() => {
    api.get('/commission/worker-rates')
      .then(res => setSrList(res.data.data || []))
      .catch(() => { /* শুধু admin/accountant দেখতে পায় */ })
  }, [])

  const loadProducts = useCallback(async (id) => {
    if (!id) { setProducts([]); setDrafts({}); return }
    setLoading(true)
    try {
      const res = await api.get('/commission/product-rates', { params: { worker_id: id } })
      const list = res.data.data.products || []
      setProducts(list)
      setFallback(res.data.data.fallback_rate)
      setDrafts(Object.fromEntries(list.map(p => [p.id, toDraft(p.rate)])))
    } catch (err) {
      toast.error(err?.response?.data?.message || 'প্রডাক্ট তালিকা আনা যায়নি।')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { setSearch(''); setBulkRate(''); loadProducts(workerId) }, [workerId, loadProducts])

  const parse = (v) => (v === '' ? null : Number(v))
  const isInvalid = (v) => { const n = parse(v); return n !== null && (!Number.isFinite(n) || n < 0 || n > 100) }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }, [products, search])

  const changed = useMemo(
    () => products.filter(p => (drafts[p.id] ?? '') !== toDraft(p.rate)),
    [products, drafts]
  )
  const anyInvalid = changed.some(p => isInvalid(drafts[p.id]))
  const setCount   = products.filter(p => p.rate !== null).length

  const applyBulk = () => {
    if (bulkRate === '' || isInvalid(bulkRate)) return toast.error('০–১০০ এর মধ্যে একটি % দিন।')
    setDrafts(prev => {
      const next = { ...prev }
      visible.forEach(p => { next[p.id] = String(Number(bulkRate)) })
      return next
    })
    toast.success(`${visible.length}টি প্রডাক্টে বসানো হয়েছে — "সেভ" চাপলে কার্যকর হবে।`)
  }

  const save = async () => {
    if (changed.length === 0 || anyInvalid) return
    setSaving(true)
    try {
      const rates = changed.map(p => ({ product_id: p.id, rate: parse(drafts[p.id]) }))
      const res = await api.put(`/commission/product-rates/${workerId}`, { rates })
      toast.success(res.data.message || 'সেভ হয়েছে। ✅')
      await loadProducts(workerId)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const placeholder = fallback === null ? 'স্ল্যাব' : `${fallback}`

  return (
    <Card title="প্রডাক্ট ভিত্তিক কমিশন রেট">
      <div className="space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          প্রতিটি SR-এর জন্য প্রতিটি প্রডাক্টে আলাদা % দিতে পারবেন — যেমন একই প্রডাক্টে এক SR ২%, আরেক SR ১.৩%।
          SR ওই প্রডাক্ট বিক্রি করে নগদ পেলে (অথবা ওই প্রডাক্টের বাকি আদায় করলে) এই হারে কমিশন পাবে।
          ঘর খালি থাকলে ওই প্রডাক্টে SR-এর নির্দিষ্ট রেট (থাকলে), না থাকলে কোম্পানির স্ল্যাব প্রযোজ্য।
          নতুন রেট পরের বিক্রয়/আদায় থেকে কার্যকর; পরিশোধ হয়ে যাওয়া দিনের কমিশন বদলায় না।
        </p>

        <select
          value={workerId}
          onChange={e => setWorkerId(e.target.value)}
          aria-label="SR বেছে নিন"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">— SR বেছে নিন —</option>
          {srList.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.employee_code ? ` · ${s.employee_code}` : ''}{s.status !== 'active' ? ' (নিষ্ক্রিয়)' : ''}
            </option>
          ))}
        </select>

        {workerId && (
          loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">কোনো active প্রডাক্ট পাওয়া যায়নি।</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>মোট {products.length}টি প্রডাক্ট</span>
                <span>·</span>
                <span>{setCount}টিতে আলাদা রেট সেট</span>
              </div>

              <div className="relative">
                <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="প্রডাক্টের নাম / SKU খুঁজুন"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* দেখানো সবগুলোতে একসাথে বসানো */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50">
                <div className="relative w-24 flex-shrink-0">
                  <input
                    type="number" inputMode="decimal" min="0" max="100" step="0.1"
                    value={bulkRate} onChange={e => setBulkRate(e.target.value)}
                    placeholder="%"
                    aria-label="দেখানো সব প্রডাক্টে একই রেট"
                    className="w-full border border-gray-200 rounded-lg pl-3 pr-6 py-1.5 text-sm bg-white focus:outline-none focus:border-primary"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                <button type="button" onClick={applyBulk}
                  className="text-xs font-semibold text-primary px-2 py-2">
                  দেখানো {visible.length}টিতে একসাথে বসান
                </button>
              </div>

              <div className="space-y-2">
                {visible.map(p => {
                  const d       = drafts[p.id] ?? ''
                  const invalid = isInvalid(d)
                  const dirty   = d !== toDraft(p.rate)
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border bg-white ${dirty ? 'border-primary/40' : 'border-gray-200'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {p.rate === null ? 'ডিফল্ট রেট' : `নির্দিষ্ট ${p.rate}%`}
                          {p.sku ? ` · ${p.sku}` : ''}
                          {p.category_name ? ` · ${p.category_name}` : ''}
                        </p>
                      </div>
                      <div className="relative w-24 flex-shrink-0">
                        <input
                          type="number" inputMode="decimal" min="0" max="100" step="0.1"
                          aria-label={`${p.name} এর কমিশন রেট`}
                          placeholder={placeholder}
                          value={d}
                          onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className={`w-full border rounded-xl pl-3 pr-7 py-2 text-sm focus:outline-none focus:border-primary ${invalid ? 'border-red-400' : 'border-gray-200'}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                      </div>
                    </div>
                  )
                })}
                {visible.length === 0 && (
                  <p className="text-sm text-gray-400 py-3 text-center">কোনো প্রডাক্ট মেলেনি।</p>
                )}
              </div>

              <div className="sticky bottom-2">
                <button
                  type="button" onClick={save}
                  disabled={changed.length === 0 || anyInvalid || saving}
                  className="w-full h-11 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg"
                >
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <FiSave size={14} />}
                  {changed.length > 0 ? `${changed.length}টি পরিবর্তন সেভ করুন` : 'সেভ করুন'}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </Card>
  )
}
