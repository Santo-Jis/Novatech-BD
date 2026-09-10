import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiTruck } from 'react-icons/fi'

// ✅ NEW — manager-side "assign delivery" UI. এটা তৈরির আগ পর্যন্ত
// backend-এ পুরো pipeline (assign→start→arrive→complete, GPS tracking,
// worker-এর DeliveryTasks.jsx) সম্পূর্ণ তৈরি থাকলেও deliveries টেবিলে
// কখনো একটা row-ও ঢোকেনি — কারণ এই "assign" ধাপটা করার কোনো UI-ই
// ছিল না। এই পেজটাই সেই মিসিং ধাপ।

const STATUS_CFG = {
  pending:     { variant: 'gray',    label: 'বরাদ্দ হয়েছে' },
  in_transit:  { variant: 'info',    label: 'পথে আছে' },
  arrived:     { variant: 'warning', label: 'পৌঁছেছে' },
  delivered:   { variant: 'approved',label: 'ডেলিভার হয়েছে' },
  failed:      { variant: 'rejected',label: 'ব্যর্থ' },
  rescheduled: { variant: 'warning', label: 'পুনঃনির্ধারিত' },
}
const STATUS_OPTIONS = Object.entries(STATUS_CFG).map(([value, cfg]) => ({ value, label: cfg.label }))

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const EMPTY_ITEM = { product_id: '', quantity: '' }

export default function DeliveryAssign() {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const [customers, setCustomers] = useState([])
  const [workers, setWorkers] = useState([])
  const [products, setProducts] = useState([])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ customer_id: '', assigned_to: '', notes: '' })
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [saving, setSaving] = useState(false)

  const fetchDeliveries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const res = await api.get(`/deliveries?${params.toString()}`)
      setDeliveries(res.data.data)
    } catch {
      toast.error('ডেলিভারি তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const fetchLookups = async () => {
    try {
      const [custRes, workerRes, prodRes] = await Promise.all([
        api.get('/customers'),
        api.get('/employees?role=worker&status=active'),
        api.get('/products?is_active=true'),
      ])
      setCustomers(custRes.data.data)
      setWorkers(workerRes.data.data)
      setProducts(prodRes.data.data)
    } catch {
      // ফর্মের ড্রপডাউন খালি থাকবে, কিন্তু পেজ ভাঙবে না — PurchaseOrders.jsx-এর
      // একই defensive প্যাটার্ন অনুসরণ করা হলো
      toast.error('কাস্টমার/কর্মী/পণ্য তালিকা লোড করতে সমস্যা হয়েছে।')
    }
  }

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchDeliveries() }, [fetchDeliveries])

  const productPrice = (productId) => products.find(p => p.id === productId)?.price || 0
  const productName  = (productId) => products.find(p => p.id === productId)?.name || ''

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  const addItemRow    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
  const removeItemRow = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const itemsTotal = items.reduce((sum, it) => {
    const q = parseInt(it.quantity, 10) || 0
    return sum + q * productPrice(it.product_id)
  }, 0)

  const resetForm = () => {
    setForm({ customer_id: '', assigned_to: '', notes: '' })
    setItems([{ ...EMPTY_ITEM }])
  }

  const handleAssign = async () => {
    if (!form.customer_id) { toast.error('কাস্টমার বাছাই করুন।'); return }
    if (!form.assigned_to) { toast.error('কোন কর্মীকে ডেলিভারি দিচ্ছেন বাছাই করুন।'); return }
    const validItems = items.filter(it => it.product_id && it.quantity)
    if (validItems.length === 0) { toast.error('অন্তত একটি পণ্য যোগ করুন।'); return }

    setSaving(true)
    try {
      const res = await api.post('/deliveries/assign', {
        customer_id: form.customer_id,
        assigned_to: form.assigned_to,
        notes: form.notes || null,
        total_amount: itemsTotal,
        items: validItems.map(it => ({
          product_id: it.product_id,
          name: productName(it.product_id),
          quantity: parseInt(it.quantity, 10),
          price: productPrice(it.product_id),
        })),
      })
      toast.success(res.data.message || 'ডেলিভারি বরাদ্দ হয়েছে।')
      setCreateOpen(false)
      resetForm()
      fetchDeliveries()
    } catch (err) {
      toast.error(err.response?.data?.message || 'বরাদ্দ করতে সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: 'কাস্টমার',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.shop_name}</p>
          <p className="text-xs text-gray-400">{row.owner_name}</p>
        </div>
      )
    },
    {
      title: 'বরাদ্দকৃত কর্মী',
      render: (_, row) => (
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-200">{row.assigned_to_name}</p>
          <p className="text-xs text-gray-400">{row.assigned_to_phone}</p>
        </div>
      )
    },
    {
      title: 'পরিমাণ',
      render: (_, row) => <span className="font-semibold text-secondary">৳{parseFloat(row.total_amount || 0).toLocaleString()}</span>
    },
    {
      title: 'অবস্থা',
      render: (_, row) => <Badge variant={STATUS_CFG[row.status]?.variant} label={STATUS_CFG[row.status]?.label} size="xs" />
    },
    {
      title: 'বরাদ্দের সময়',
      render: (_, row) => <span className="text-xs text-gray-400">{fmtDate(row.created_at)}</span>
    },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FiTruck className="text-xl text-secondary" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">ডেলিভারি বরাদ্দ</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <FiPlus className="mr-1" /> নতুন ডেলিভারি বরাদ্দ করুন
        </Button>
      </div>

      <div className="w-48">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: '', label: 'সব অবস্থা' }, ...STATUS_OPTIONS]}
        />
      </div>

      <Table columns={columns} data={deliveries} loading={loading} emptyText="এখনো কোনো ডেলিভারি বরাদ্দ করা হয়নি।" />

      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); resetForm() }}
        title="নতুন ডেলিভারি বরাদ্দ করুন"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetForm() }}>বাতিল</Button>
            <Button onClick={handleAssign} loading={saving}>বরাদ্দ করুন</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="কাস্টমার"
            value={form.customer_id}
            onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}
            options={[{ value: '', label: 'বাছাই করুন' }, ...customers.map(c => ({ value: c.id, label: `${c.shop_name} — ${c.owner_name}` }))]}
          />
          <Select
            label="কোন কর্মী ডেলিভারি দেবে"
            value={form.assigned_to}
            onChange={(e) => setForm(f => ({ ...f, assigned_to: e.target.value }))}
            options={[{ value: '', label: 'বাছাই করুন' }, ...workers.map(w => ({ value: w.id, label: `${w.name_bn} (${w.employee_code})` }))]}
          />

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">পণ্য</p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Select
                      value={it.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                      options={[{ value: '', label: 'পণ্য বাছাই করুন' }, ...products.map(p => ({ value: p.id, label: `${p.name} (৳${p.price})` }))]}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      placeholder="পরিমাণ"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => removeItemRow(idx)}
                    className="p-2 text-gray-400 hover:text-red-500 mt-1"
                    title="সরিয়ে ফেলুন"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addItemRow} className="mt-2 text-sm text-secondary flex items-center gap-1">
              <FiPlus /> আরেকটি পণ্য যোগ করুন
            </button>
          </div>

          <div className="text-right text-sm text-gray-600 dark:text-gray-300">
            মোট: <span className="font-semibold text-secondary">৳{itemsTotal.toLocaleString()}</span>
          </div>

          <Textarea
            label="নোট (ঐচ্ছিক)"
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="ডেলিভারি সংক্রান্ত বিশেষ নির্দেশনা থাকলে লিখুন"
          />
        </div>
      </Modal>
    </div>
  )
}
