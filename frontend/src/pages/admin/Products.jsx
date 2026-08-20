import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Textarea, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import StockMovementsModal from '../../components/StockMovementsModal'
import ProductGalleryModal from '../../components/ProductGalleryModal'
import ProductImportModal from '../../components/ProductImportModal'
import toast from 'react-hot-toast'
import {
  FiPlus, FiEdit, FiPackage, FiTrendingUp,
  FiImage, FiPercent, FiTag, FiInfo, FiDollarSign, FiX, FiPlusCircle, FiList, FiUpload, FiTruck
} from 'react-icons/fi'

// ─── ছবি আপলোড প্রিভিউ কম্পোনেন্ট ──────────────────────────
function ImageUpload({ value, onChange }) {
  const inputRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('শুধু ছবি ফাইল আপলোড করুন।')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => onChange(reader.result) // base64 preview
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        পণ্যের ছবি
      </label>

      {value ? (
        <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-600 bg-gray-50">
          <img src={value} alt="preview" className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
          >
            <FiX size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current.click()}
          className="w-full h-32 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <FiImage className="text-gray-400 mb-2" size={24} />
          <p className="text-sm text-gray-400">ক্লিক করে ছবি বেছে নিন</p>
          <p className="text-xs text-gray-300 mt-1">JPG, PNG, WEBP</p>
        </div>
      )}

      {/* URL দিয়েও ছবি দেওয়া যাবে */}
      <Input
        placeholder="অথবা ছবির URL দিন (https://...)"
        value={value && value.startsWith('http') ? value : ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1"
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ─── মূল্য সারাংশ কম্পোনেন্ট ──────────────────────────────
function PriceSummary({ price, discount, discountType, vat, tax }) {
  const p    = parseFloat(price)   || 0
  const disc = parseFloat(discount) || 0
  const v    = parseFloat(vat)     || 0
  const t    = parseFloat(tax)     || 0

  const discountAmt = discountType === 'percent' ? (p * disc) / 100 : disc
  const afterDisc   = Math.max(0, p - discountAmt)
  const vatAmt      = (afterDisc * v) / 100
  const taxAmt      = (afterDisc * t) / 100
  const finalPrice  = afterDisc + vatAmt + taxAmt

  if (!p) return null

  return (
    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs space-y-1 border border-blue-100 dark:border-blue-800">
      <p className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">মূল্য সারাংশ</p>
      <div className="flex justify-between text-gray-600 dark:text-gray-300">
        <span>মূল মূল্য</span>
        <span>৳{p.toLocaleString()}</span>
      </div>
      {discountAmt > 0 && (
        <div className="flex justify-between text-green-600">
          <span>ছাড় {discountType === 'percent' ? `(${disc}%)` : ''}</span>
          <span>- ৳{discountAmt.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
        </div>
      )}
      {vatAmt > 0 && (
        <div className="flex justify-between text-orange-600">
          <span>VAT ({v}%)</span>
          <span>+ ৳{vatAmt.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
        </div>
      )}
      {taxAmt > 0 && (
        <div className="flex justify-between text-red-600">
          <span>Tax ({t}%)</span>
          <span>+ ৳{taxAmt.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-gray-800 dark:text-gray-100 pt-1 border-t border-blue-200 dark:border-blue-700">
        <span>চূড়ান্ত মূল্য</span>
        <span className="text-primary">৳{finalPrice.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

// ─── EMPTY FORM ────────────────────────────────────────────
const EMPTY_FORM = {
  name: '', sku: '', price: '', stock: '', unit: 'pcs',
  image_url: '',
  description: '',
  discount: '', discount_type: 'flat',
  vat: '', tax: '',
  cost_price: '', category_id: '', brand: '', reorder_point: ''
}

// ─── মার্জিন সারাংশ (শুধু admin/manager cost_price দেখতে পাবে) ──
function MarginSummary({ price, costPrice }) {
  const p = parseFloat(price)     || 0
  const c = parseFloat(costPrice) || 0
  if (!p || !c) return null

  const margin    = p - c
  const marginPct = (margin / p) * 100

  return (
    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-xs space-y-1 border border-purple-100 dark:border-purple-800">
      <p className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-1">মার্জিন সারাংশ (শুধু আপনি দেখছেন)</p>
      <div className="flex justify-between text-gray-600 dark:text-gray-300">
        <span>ক্রয়মূল্য</span><span>৳{c.toLocaleString()}</span>
      </div>
      <div className="flex justify-between font-bold text-gray-800 dark:text-gray-100 pt-1 border-t border-purple-200 dark:border-purple-700">
        <span>লাভ / ইউনিট</span>
        <span className={margin >= 0 ? 'text-green-600' : 'text-red-600'}>
          ৳{margin.toLocaleString('en', { maximumFractionDigits: 2 })} ({marginPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function AdminProducts() {
  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null) // 'add' | 'edit' | 'adjust' | 'view'
  const [selected,   setSelected]   = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [adjustForm, setAdjustForm] = useState({ quantity: '', note: '' })
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState('basic') // 'basic' | 'pricing' | 'image'
  const [movOpen,    setMovOpen]    = useState(false)
  const [movProduct, setMovProduct] = useState(null)
  // ✅ NEW (ফেজ ২ — মাল্টি-ইমেজ গ্যালারি)
  const [galleryOpen,    setGalleryOpen]    = useState(false)
  const [galleryProduct, setGalleryProduct] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [productSuppliers,        setProductSuppliers]        = useState([])
  const [loadingProductSuppliers, setLoadingProductSuppliers] = useState(false)

  // ✅ Products/POS গুদাম-ফিল্টার
  const [warehouses,      setWarehouses]      = useState([])
  const [warehouseFilter, setWarehouseFilter] = useState('')

  const fetchProducts = async () => {
    try {
      const params = new URLSearchParams({ is_active: 'true' })
      if (warehouseFilter) params.set('warehouse_id', warehouseFilter)
      const res = await api.get(`/products?${params.toString()}`)
      setProducts(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories')
      setCategories(res.data.data)
    } catch { /* ক্যাটাগরি লোড না হলেও প্রডাক্ট পেজ কাজ করবে */ }
  }

  // ✅ Products/POS গুদাম-ফিল্টার
  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/warehouses?is_active=true')
      setWarehouses(res.data.data)
    } catch { /* ফিল্টার ড্রপডাউন খালি থাকবে, বাকি পেইজ কাজ করবে */ }
  }

  useEffect(() => { fetchCategories(); fetchWarehouses() }, [])
  useEffect(() => { fetchProducts() }, [warehouseFilter])

  const quickAddCategory = async () => {
    const name = window.prompt('নতুন ক্যাটাগরির নাম লিখুন:')
    if (!name?.trim()) return
    try {
      const res = await api.post('/categories', { name: name.trim() })
      toast.success('ক্যাটাগরি যোগ হয়েছে।')
      setCategories(prev => [...prev, res.data.data])
      setField('category_id', res.data.data.id)
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setSelected(null)
    setTab('basic')
    setModal('add')
  }

  const openEdit = (product) => {
    setForm({
      name:          product.name         || '',
      sku:           product.sku          || '',
      price:         product.price        || '',
      stock:         product.stock        || '',
      unit:          product.unit         || 'pcs',
      image_url:     product.image_url    || '',
      description:   product.description  || '',
      discount:      product.discount     || '',
      discount_type: product.discount_type || 'flat',
      vat:           product.vat          || '',
      tax:           product.tax          || '',
      cost_price:    product.cost_price    || '',
      category_id:   product.category_id  || '',
      brand:         product.brand        || '',
      reorder_point: product.reorder_point ?? '',
    })
    setSelected(product)
    setTab('basic')
    setModal('edit')
  }

  const openAdjust = (product) => {
    setAdjustForm({ quantity: '', note: '' })
    setSelected(product)
    setModal('adjust')
  }

  const openView = (product) => {
    setSelected(product)
    setModal('view')
    // ভিউ মোডাল খোলার সাথেই সাপ্লায়ার তুলনা লোড
    setProductSuppliers([])
    setLoadingProductSuppliers(true)
    api.get(`/products/${product.id}/suppliers`)
      .then(res => setProductSuppliers(res.data.data))
      .catch(() => { /* silent — বাকি ভিউ ঠিক থাকবে */ })
      .finally(() => setLoadingProductSuppliers(false))
  }

  const saveProduct = async () => {
    if (!form.name || !form.sku || !form.price) {
      toast.error('নাম, SKU এবং মূল্য আবশ্যক।')
      setTab('basic')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        price:         parseFloat(form.price)    || 0,
        stock:         parseInt(form.stock)      || 0,
        discount:      parseFloat(form.discount) || 0,
        vat:           parseFloat(form.vat)      || 0,
        tax:           parseFloat(form.tax)      || 0,
        cost_price:    parseFloat(form.cost_price)    || 0,
        reorder_point: parseInt(form.reorder_point)   || 0,
        category_id:   form.category_id || null,
      }
      if (modal === 'add') {
        await api.post('/products', payload)
        toast.success('পণ্য তৈরি হয়েছে।')
      } else {
        await api.put(`/products/${selected.id}`, payload)
        toast.success('পণ্য আপডেট হয়েছে।')
      }
      setModal(null)
      fetchProducts()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const saveAdjust = async () => {
    setSaving(true)
    try {
      await api.post(`/products/${selected.id}/adjust-stock`, adjustForm)
      toast.success('স্টক আপডেট হয়েছে।')
      setModal(null)
      fetchProducts()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  // চূড়ান্ত মূল্য গণনা
  const calcFinal = (row) => {
    const p    = parseFloat(row.price)    || 0
    const disc = parseFloat(row.discount) || 0
    const v    = parseFloat(row.vat)      || 0
    const t    = parseFloat(row.tax)      || 0
    const discAmt = row.discount_type === 'percent' ? (p * disc) / 100 : disc
    const after   = Math.max(0, p - discAmt)
    return after + (after * v / 100) + (after * t / 100)
  }

  // ─── TABLE COLUMNS ─────────────────────────────────────────
  const columns = [
    {
      title: 'পণ্য',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt={row.name}
              className="w-10 h-10 rounded-xl object-cover border border-gray-100 flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <FiPackage className="text-primary" />
            </div>
          )}
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.name}</p>
            <p className="text-xs text-gray-400 font-mono">{row.sku}</p>
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {row.brand && (
                <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                  {row.brand}
                </span>
              )}
              {row.category_name_bn || row.category_name ? (
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
                  {row.category_name_bn || row.category_name}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'মূল্য',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-secondary">৳{parseFloat(row.price).toLocaleString()}</p>
          {parseFloat(row.cost_price) > 0 && (
            <p className="text-[10px] text-purple-600">
              মার্জিন: {(((row.price - row.cost_price) / row.price) * 100).toFixed(0)}%
            </p>
          )}
          {(parseFloat(row.discount) > 0 || parseFloat(row.vat) > 0 || parseFloat(row.tax) > 0) && (
            <p className="text-xs text-primary font-medium">
              চূড়ান্ত: ৳{calcFinal(row).toLocaleString('en', { maximumFractionDigits: 2 })}
            </p>
          )}
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {parseFloat(row.discount) > 0 && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                ছাড় {row.discount_type === 'percent' ? `${row.discount}%` : `৳${row.discount}`}
              </span>
            )}
            {parseFloat(row.vat) > 0 && (
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                VAT {row.vat}%
              </span>
            )}
            {parseFloat(row.tax) > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                Tax {row.tax}%
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      title: 'স্টক',
      render: (_, row) => (
        <div>
          {warehouseFilter ? (
            // ✅ গুদাম ফিল্টার সক্রিয় থাকলে সেই নির্দিষ্ট গুদামের পরিমাণ দেখাও
            <>
              <span className="font-bold text-gray-800 dark:text-gray-100">{row.warehouse_stock_qty}</span>
              <span className="text-xs text-gray-400"> {row.unit}</span>
              <p className="text-[11px] text-gray-400">সব গুদাম মিলিয়ে: {row.stock}</p>
            </>
          ) : (
            <>
              <span className={`font-bold ${row.is_low_stock ? 'text-red-600' : 'text-gray-800 dark:text-gray-100'}`}>
                {row.available_stock}
              </span>
              <span className="text-xs text-gray-400"> / {row.stock} {row.unit}</span>
              {parseInt(row.reserved_stock) > 0 && (
                <p className="text-xs text-amber-600">রিজার্ভ: {row.reserved_stock}</p>
              )}
              {row.is_low_stock && (
                <p className="text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 inline-block px-1.5 py-0.5 rounded-full mt-0.5">
                  ⚠️ Low Stock
                </p>
              )}
            </>
          )}
        </div>
      )
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-1">
          <button
            onClick={() => openView(row)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
            title="বিস্তারিত"
          >
            <FiInfo size={15} />
          </button>
          <button
            onClick={() => openEdit(row)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
            title="সম্পাদনা"
          >
            <FiEdit size={15} />
          </button>
          <button
            onClick={() => openAdjust(row)}
            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
            title="স্টক এডজাস্ট"
          >
            <FiTrendingUp size={15} />
          </button>
          <button
            onClick={() => { setMovProduct(row); setMovOpen(true) }}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
            title="স্টক মুভমেন্ট ইতিহাস"
          >
            <FiList size={15} />
          </button>
          <button
            onClick={() => { setGalleryProduct(row); setGalleryOpen(true) }}
            className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-500"
            title="ছবির গ্যালারি"
          >
            <FiImage size={15} />
          </button>
        </div>
      )
    }
  ]

  // ─── TAB BUTTON ────────────────────────────────────────────
  const TabBtn = ({ id, label, icon: Icon }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg font-medium transition-colors
        ${tab === id
          ? 'bg-primary text-white'
          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
    >
      <Icon size={14} /> {label}
    </button>
  )

  // ─── RENDER ─────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">পণ্য ব্যবস্থাপনা</h1>
        <div className="flex items-center gap-2">
          <Select
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="w-44"
          />
          <Button variant="outline" icon={<FiUpload />} onClick={() => setImportOpen(true)}>বাল্ক ইম্পোর্ট</Button>
          <Button icon={<FiPlus />} onClick={openAdd}>নতুন পণ্য</Button>
        </div>
      </div>

      <Table columns={columns} data={products} loading={loading} emptyText="কোনো পণ্য নেই।" />

      {/* ══════════════════════════════════════════
          ADD / EDIT MODAL
      ══════════════════════════════════════════ */}
      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? '➕ নতুন পণ্য যোগ করুন' : `✏️ পণ্য সম্পাদনা — ${selected?.name}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
            <Button onClick={saveProduct} loading={saving} icon={<FiPackage />}>
              {modal === 'add' ? 'পণ্য তৈরি করুন' : 'আপডেট করুন'}
            </Button>
          </>
        }
      >
        {/* Tab Navigation */}
        <div className="flex gap-1 mb-5 p-1 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <TabBtn id="basic"   label="মূল তথ্য"    icon={FiPackage}  />
          <TabBtn id="pricing" label="মূল্য ও ছাড়" icon={FiTag}      />
          <TabBtn id="image"   label="ছবি ও বিবরণ" icon={FiImage}    />
        </div>

        {/* ── TAB: মূল তথ্য ── */}
        {tab === 'basic' && (
          <div className="space-y-3">
            <Input
              label="পণ্যের নাম *"
              required
              placeholder="যেমন: iPhone 15 Pro Max"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
            />
            <Input
              label="SKU (পণ্য কোড) *"
              required
              placeholder="যেমন: IPH-15-PRO-MAX"
              value={form.sku}
              onChange={e => setField('sku', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="মূল মূল্য (৳) *"
                type="number"
                min="0"
                required
                placeholder="0.00"
                value={form.price}
                onChange={e => setField('price', e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">একক</label>
                <select
                  value={form.unit}
                  onChange={e => setField('unit', e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="pcs">pcs (পিস)</option>
                  <option value="kg">kg (কেজি)</option>
                  <option value="g">g (গ্রাম)</option>
                  <option value="box">box (বাক্স)</option>
                  <option value="ltr">ltr (লিটার)</option>
                  <option value="set">set (সেট)</option>
                  <option value="pair">pair (জোড়া)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="ব্র্যান্ড"
                placeholder="যেমন: Nestle"
                value={form.brand}
                onChange={e => setField('brand', e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">ক্যাটাগরি</label>
                <div className="flex gap-1.5">
                  <select
                    value={form.category_id}
                    onChange={e => setField('category_id', e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">— বাছাই করুন —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name_bn || c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={quickAddCategory}
                    title="নতুন ক্যাটাগরি যোগ করুন"
                    className="px-3 rounded-xl border border-dashed border-primary/40 text-primary hover:bg-primary/5 flex-shrink-0"
                  >
                    <FiPlus size={16} />
                  </button>
                </div>
              </div>
            </div>

            {modal === 'add' && (
              <Input
                label="প্রারম্ভিক স্টক"
                type="number"
                min="0"
                placeholder="0"
                value={form.stock}
                onChange={e => setField('stock', e.target.value)}
                hint="পণ্য তৈরির সময় কতটি স্টকে থাকবে"
              />
            )}

            <Input
              label="রি-অর্ডার পয়েন্ট (Low Stock Alert)"
              type="number"
              min="0"
              placeholder="0"
              value={form.reorder_point}
              onChange={e => setField('reorder_point', e.target.value)}
              hint="স্টক এই সংখ্যার নিচে নামলে 'Low Stock' হিসেবে দেখাবে"
            />

            {modal === 'edit' && selected && (
              <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-xl space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <FiPackage className="text-primary" /> স্টক তথ্য
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">মোট স্টক</p>
                    <p className="font-bold text-gray-800 dark:text-gray-100">{selected.stock}</p>
                  </div>
                  <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">রিজার্ভ</p>
                    <p className="font-bold text-amber-600">{selected.reserved_stock || 0}</p>
                  </div>
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">উপলব্ধ</p>
                    <p className="font-bold text-green-600">{selected.available_stock}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModal(null)
                    setTimeout(() => {
                      setAdjustForm({ quantity: '', note: '' })
                      setModal('adjust')
                    }, 150)
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                >
                  <FiPlusCircle size={16} />
                  স্টক যোগ / এডজাস্ট করুন
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: মূল্য ও ছাড় ── */}
        {tab === 'pricing' && (
          <div className="space-y-4">
            {/* Cost Price */}
            <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FiDollarSign className="text-purple-500" /> ক্রয়মূল্য (Cost Price)
              </p>
              <Input
                type="number"
                min="0"
                placeholder="0.00"
                value={form.cost_price}
                onChange={e => setField('cost_price', e.target.value)}
                hint="এটা শুধু Admin/Manager দেখতে পাবে — worker বা customer দেখবে না"
              />
              <MarginSummary price={form.price} costPrice={form.cost_price} />
            </div>

            {/* Discount */}
            <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FiTag className="text-green-500" /> ডিসকাউন্ট
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="ছাড়ের পরিমাণ"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.discount}
                  onChange={e => setField('discount', e.target.value)}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">ছাড়ের ধরন</label>
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <button
                      type="button"
                      onClick={() => setField('discount_type', 'flat')}
                      className={`px-3 py-2.5 rounded-xl text-sm border font-medium transition-colors
                        ${form.discount_type === 'flat'
                          ? 'bg-green-500 text-white border-green-500'
                          : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >
                      <FiDollarSign className="inline mr-1" size={12} />৳ টাকা
                    </button>
                    <button
                      type="button"
                      onClick={() => setField('discount_type', 'percent')}
                      className={`px-3 py-2.5 rounded-xl text-sm border font-medium transition-colors
                        ${form.discount_type === 'percent'
                          ? 'bg-green-500 text-white border-green-500'
                          : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >
                      <FiPercent className="inline mr-1" size={12} />শতাংশ
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* VAT & Tax */}
            <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FiPercent className="text-orange-500" /> VAT ও Tax (শতাংশে)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="VAT (%)"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={form.vat}
                  onChange={e => setField('vat', e.target.value)}
                  hint="যেমন: ১৫ মানে ১৫%"
                />
                <Input
                  label="Tax (%)"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={form.tax}
                  onChange={e => setField('tax', e.target.value)}
                  hint="যেমন: ৫ মানে ৫%"
                />
              </div>
            </div>

            {/* Live Price Summary */}
            <PriceSummary
              price={form.price}
              discount={form.discount}
              discountType={form.discount_type}
              vat={form.vat}
              tax={form.tax}
            />
          </div>
        )}

        {/* ── TAB: ছবি ও বিবরণ ── */}
        {tab === 'image' && (
          <div className="space-y-4">
            <ImageUpload
              value={form.image_url}
              onChange={val => setField('image_url', val)}
            />
            <Textarea
              label="পণ্যের বিবরণ (Description)"
              rows={5}
              placeholder="পণ্যের বিস্তারিত বিবরণ লিখুন — বৈশিষ্ট্য, ব্যবহার পদ্ধতি, ইত্যাদি..."
              value={form.description}
              onChange={e => setField('description', e.target.value)}
            />
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════
          ADJUST STOCK MODAL
      ══════════════════════════════════════════ */}
      <Modal
        isOpen={modal === 'adjust'}
        onClose={() => setModal(null)}
        title={`📦 স্টক এডজাস্ট — ${selected?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
            <Button onClick={saveAdjust} loading={saving} icon={<FiTrendingUp />}>স্টক আপডেট করুন</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* বর্তমান স্টক সারাংশ */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-xs text-gray-400 mb-0.5">মোট স্টক</p>
              <p className="font-bold text-lg text-gray-800 dark:text-gray-100">{selected?.stock}</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <p className="text-xs text-gray-400 mb-0.5">রিজার্ভ</p>
              <p className="font-bold text-lg text-amber-600">{selected?.reserved_stock || 0}</p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-xs text-gray-400 mb-0.5">উপলব্ধ</p>
              <p className="font-bold text-lg text-green-600">{selected?.available_stock}</p>
            </div>
          </div>

          {/* দ্রুত যোগ বাটন */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">দ্রুত যোগ করুন</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 5, 10, 25, 50, 100].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAdjustForm(p => ({ ...p, quantity: String((parseInt(p.quantity) || 0) + n) }))}
                  className="px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-semibold border border-green-200 dark:border-green-800 hover:bg-green-100 transition-colors"
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="পরিমাণ (+ বা - সংখ্যা)"
            type="number"
            value={adjustForm.quantity}
            onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))}
            hint="বাড়াতে ধনাত্মক (+), কমাতে ঋণাত্মক (-) সংখ্যা দিন"
          />

          {/* নতুন স্টক প্রিভিউ */}
          {adjustForm.quantity !== '' && !isNaN(parseInt(adjustForm.quantity)) && (
            <div className="p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl text-sm flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-300">আপডেটের পর স্টক হবে:</span>
              <span className="font-bold text-primary text-base">
                {Math.max(0, (parseInt(selected?.stock) || 0) + (parseInt(adjustForm.quantity) || 0))} {selected?.unit}
              </span>
            </div>
          )}

          <Input
            label="কারণ / নোট"
            value={adjustForm.note}
            onChange={e => setAdjustForm(p => ({ ...p, note: e.target.value }))}
            placeholder="যেমন: নতুন মাল আসা, ক্ষতিগ্রস্ত পণ্য বাদ দেওয়া..."
          />
        </div>
      </Modal>

      {/* ══════════════════════════════════════════
          VIEW DETAIL MODAL
      ══════════════════════════════════════════ */}
      <Modal
        isOpen={modal === 'view'}
        onClose={() => setModal(null)}
        title={`📦 ${selected?.name}`}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setModal(null)}>বন্ধ করুন</Button>
        }
      >
        {selected && (
          <div className="space-y-4">
            {/* ছবি */}
            {selected.image_url && (
              <div className="w-full h-52 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                <img src={selected.image_url} alt={selected.name} className="w-full h-full object-contain" />
              </div>
            )}

            {/* মূল তথ্য */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-gray-400 text-xs">SKU</p>
                <p className="font-mono font-semibold">{selected.sku}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-gray-400 text-xs">একক</p>
                <p className="font-semibold">{selected.unit}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-gray-400 text-xs">স্টক</p>
                <p className="font-semibold">{selected.available_stock} / {selected.stock}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-gray-400 text-xs">মূল মূল্য</p>
                <p className="font-semibold text-secondary">৳{parseFloat(selected.price).toLocaleString()}</p>
              </div>
              {(selected.brand || selected.category_name_bn || selected.category_name) && (
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl col-span-2">
                  <p className="text-gray-400 text-xs">ব্র্যান্ড / ক্যাটাগরি</p>
                  <p className="font-semibold">
                    {[selected.brand, selected.category_name_bn || selected.category_name].filter(Boolean).join(' • ') || '—'}
                  </p>
                </div>
              )}
            </div>

            {/* মূল্য সারাংশ */}
            <PriceSummary
              price={selected.price}
              discount={selected.discount}
              discountType={selected.discount_type}
              vat={selected.vat}
              tax={selected.tax}
            />

            {/* মার্জিন সারাংশ */}
            <MarginSummary price={selected.price} costPrice={selected.cost_price} />

            {/* সাপ্লায়ার তুলনা */}
            <div className="pt-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FiTruck size={12} /> সরবরাহকারী সাপ্লায়ার
              </p>
              {loadingProductSuppliers ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
                </div>
              ) : productSuppliers.length === 0 ? (
                <div className="py-3 text-center text-xs text-gray-400 border border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                  কোনো সাপ্লায়ার ম্যাপ করা নেই — সাপ্লায়ার ডিটেইল ভিউ থেকে যোগ করুন
                </div>
              ) : (
                <div className="space-y-2">
                  {productSuppliers.map((sp, idx) => {
                    const isCheapest = idx === 0 && productSuppliers.length > 1
                    const fmtDate = d => d ? new Date(d).toLocaleDateString('bn-BD', { day:'2-digit', month:'short', year:'numeric' }) : null
                    const PAYMENT_LABELS = { cod:'COD', net_15:'নেট ১৫', net_30:'নেট ৩০', net_45:'নেট ৪৫', net_60:'নেট ৬০' }
                    return (
                      <div key={sp.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${isCheapest ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30' : 'border-gray-100 dark:border-slate-700'}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{sp.supplier_name}</p>
                            {isCheapest && <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold px-1.5 py-0.5 rounded-full">সেরা দাম</span>}
                            {!sp.supplier_active && <span className="text-[10px] text-red-500">নিষ্ক্রিয়</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[
                              sp.contact_person,
                              sp.payment_terms && PAYMENT_LABELS[sp.payment_terms],
                              sp.lead_time_days != null && `লিড টাইম ${sp.lead_time_days} দিন`,
                              sp.last_po_date && `সর্বশেষ PO: ${fmtDate(sp.last_po_date)}`
                            ].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <p className={`text-base font-bold flex-shrink-0 ${isCheapest ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>
                          ৳{parseFloat(sp.unit_price).toLocaleString()}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* বিবরণ */}
            {selected.description && (
              <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-gray-400 mb-1 font-medium">বিবরণ</p>
                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{selected.description}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Stock Movements Modal */}
      <StockMovementsModal
        isOpen={movOpen}
        onClose={() => { setMovOpen(false); setMovProduct(null) }}
        productId={movProduct?.id}
        productName={movProduct?.name}
      />

      {/* ✅ NEW (ফেজ ২) — ছবির গ্যালারি Modal */}
      <ProductGalleryModal
        isOpen={galleryOpen}
        onClose={() => { setGalleryOpen(false); setGalleryProduct(null) }}
        productId={galleryProduct?.id}
        productName={galleryProduct?.name}
        coverUrl={galleryProduct?.image_url}
      />

      {/* বাল্ক CSV ইম্পোর্ট Modal */}
      <ProductImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { fetchProducts(); fetchCategories() }}
      />
    </div>
  )
}
