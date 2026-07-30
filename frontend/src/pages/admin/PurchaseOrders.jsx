import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table, { Pagination } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import PurchaseOrderDetailModal from '../../components/PurchaseOrderDetailModal'
import toast from 'react-hot-toast'
import { FiPlus, FiEye, FiTrash2, FiPackage, FiX } from 'react-icons/fi'

const STATUS_CFG = {
  draft:     { variant: 'gray',     label: 'ড্রাফট' },
  ordered:   { variant: 'info',     label: 'অর্ডার করা হয়েছে' },
  partial:   { variant: 'warning',  label: 'আংশিক গ্রহণ' },
  received:  { variant: 'approved', label: 'সম্পূর্ণ গ্রহণ' },
  cancelled: { variant: 'rejected', label: 'বাতিল' },
}

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'ড্রাফট' },
  { value: 'ordered',   label: 'অর্ডার করা হয়েছে' },
  { value: 'partial',   label: 'আংশিক গ্রহণ' },
  { value: 'received',  label: 'সম্পূর্ণ গ্রহণ' },
  { value: 'cancelled', label: 'বাতিল' },
]

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const EMPTY_ITEM = { product_id: '', quantity_ordered: '', unit_cost: '' }

export default function AdminPurchaseOrders() {
  const [pos,        setPos]        = useState([])
  const [loading,    setLoading]    = useState(true)
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0 })
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [search, setSearch] = useState('')

  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ supplier_id: '', order_date: '', expected_date: '', notes: '' })
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [saving, setSaving] = useState(false)

  const [detailId, setDetailId] = useState(null)

  const fetchPOs = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: pagination.limit })
      if (statusFilter)   params.set('status', statusFilter)
      if (supplierFilter) params.set('supplier_id', supplierFilter)
      if (search)         params.set('search', search)
      const res = await api.get(`/purchase-orders?${params.toString()}`)
      setPos(res.data.data)
      setPagination(res.data.pagination)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }, [statusFilter, supplierFilter, search, pagination.limit])

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers?is_active=true')
      setSuppliers(res.data.data)
    } catch { /* ফিল্টার/ফর্ম কাজ করবে না, কিন্তু পেজ ভাঙবে না */ }
  }

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products?is_active=true')
      setProducts(res.data.data)
    } catch { /* একইভাবে সামলানো */ }
  }

  useEffect(() => { fetchSuppliers(); fetchProducts() }, [])
  useEffect(() => { fetchPOs(1) }, [statusFilter, supplierFilter, search])

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const productOptions  = products.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))

  // ── Create Modal হ্যান্ডলার ──
  const openCreate = () => {
    setForm({ supplier_id: '', order_date: '', expected_date: '', notes: '' })
    setItems([{ ...EMPTY_ITEM }])
    setCreateOpen(true)
  }

  const setItemField = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [key]: value }
      // পণ্য বাছাই করলে সেই পণ্যের cost_price দিয়ে unit_cost প্রি-ফিল করো (থাকলে)
      if (key === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod && prod.cost_price !== undefined && !it.unit_cost) {
          updated.unit_cost = prod.cost_price || ''
        }
      }
      return updated
    }))
  }

  const addItemRow    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
  const removeItemRow = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const itemsTotal = items.reduce((sum, it) => {
    const q = parseFloat(it.quantity_ordered) || 0
    const c = parseFloat(it.unit_cost) || 0
    return sum + (q * c)
  }, 0)

  const handleCreate = async () => {
    if (!form.supplier_id) { toast.error('সাপ্লায়ার বাছাই করুন।'); return }
    const validItems = items.filter(it => it.product_id && it.quantity_ordered)
    if (validItems.length === 0) { toast.error('অন্তত একটি পণ্য যোগ করুন।'); return }

    setSaving(true)
    try {
      const res = await api.post('/purchase-orders', {
        ...form,
        items: validItems.map(it => ({
          product_id: it.product_id,
          quantity_ordered: parseInt(it.quantity_ordered, 10),
          unit_cost: parseFloat(it.unit_cost) || 0
        }))
      })
      toast.success(res.data.message)
      setCreateOpen(false)
      fetchPOs(1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'তৈরি করতে সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const handleDeleteDraft = async (po) => {
    if (!window.confirm(`ড্রাফট PO "${po.po_number}" মুছে ফেলতে চান?`)) return
    try {
      await api.delete(`/purchase-orders/${po.id}`)
      toast.success('মুছে ফেলা হয়েছে।')
      fetchPOs(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const columns = [
    {
      title: 'PO নাম্বার',
      render: (_, row) => (
        <div>
          <p className="font-mono font-semibold text-sm text-gray-800 dark:text-gray-100">{row.po_number}</p>
          <p className="text-xs text-gray-400">{fmtDate(row.order_date)}</p>
        </div>
      )
    },
    { title: 'সাপ্লায়ার', render: (_, row) => <span className="text-sm text-gray-700 dark:text-gray-200">{row.supplier_name}</span> },
    {
      title: 'মূল্য / আইটেম',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-secondary">৳{parseFloat(row.total_amount).toLocaleString()}</p>
          <p className="text-xs text-gray-400">{row.item_count} আইটেম</p>
        </div>
      )
    },
    {
      title: 'অবস্থা',
      render: (_, row) => <Badge variant={STATUS_CFG[row.status]?.variant} label={STATUS_CFG[row.status]?.label} size="xs" />
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500" title="বিস্তারিত">
            <FiEye size={15} />
          </button>
          {row.status === 'draft' && (
            <button onClick={() => handleDeleteDraft(row)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="ডিলিট">
              <FiTrash2 size={15} />
            </button>
          )}
        </div>
      )
    }
  ]

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">ক্রয় অর্ডার (Purchase Order)</h1>
        <Button icon={<FiPlus />} onClick={openCreate}>নতুন PO</Button>
      </div>

      {/* ফিল্টার */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="PO নম্বর বা সাপ্লায়ার খুঁজুন..." value={search} onChange={e => setSearch(e.target.value)} className="min-w-[200px] flex-1" />
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="w-48"
        />
        <Select
          options={supplierOptions}
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="w-56"
        />
      </div>

      <Table columns={columns} data={pos} loading={loading} emptyText="কোনো Purchase Order নেই।" />
      <Pagination page={pagination.page} totalPages={totalPages} onChange={(p) => fetchPOs(p)} />

      {/* ══════ CREATE MODAL ══════ */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="➕ নতুন Purchase Order" size="lg">
        <div className="space-y-4">
          <Select
            label="সাপ্লায়ার *"
            options={supplierOptions}
            value={form.supplier_id}
            onChange={e => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="অর্ডার তারিখ" type="date" value={form.order_date} onChange={e => setForm(prev => ({ ...prev, order_date: e.target.value }))} />
            <Input label="প্রত্যাশিত ডেলিভারি" type="date" value={form.expected_date} onChange={e => setForm(prev => ({ ...prev, expected_date: e.target.value }))} />
          </div>

          <Textarea label="নোট" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">পণ্য তালিকা</label>
              <button type="button" onClick={addItemRow} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                <FiPlus size={12} /> আরেকটি পণ্য যোগ করুন
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-2.5">
                  <div className="flex-1">
                    <Select
                      options={productOptions}
                      value={item.product_id}
                      onChange={e => setItemField(idx, 'product_id', e.target.value)}
                    />
                  </div>
                  <input
                    type="number" min="1" placeholder="পরিমাণ"
                    value={item.quantity_ordered}
                    onChange={e => setItemField(idx, 'quantity_ordered', e.target.value)}
                    className="w-24 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="ইউনিট দর"
                    value={item.unit_cost}
                    onChange={e => setItemField(idx, 'unit_cost', e.target.value)}
                    className="w-28 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
                  />
                  <button
                    type="button" onClick={() => removeItemRow(idx)}
                    className="p-2.5 rounded-xl hover:bg-red-50 text-red-400 flex-shrink-0"
                  >
                    <FiX size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-2 text-sm">
              <p className="text-gray-500 dark:text-gray-400">মোট: <span className="font-bold text-secondary">৳{itemsTotal.toLocaleString()}</span></p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>বাতিল</Button>
          <Button icon={<FiPackage />} onClick={handleCreate} loading={saving}>ড্রাফট হিসেবে সেভ করুন</Button>
        </div>
      </Modal>

      {/* ══════ DETAIL / RECEIVE MODAL ══════ */}
      <PurchaseOrderDetailModal
        poId={detailId}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => fetchPOs(pagination.page)}
      />
    </div>
  )
}
