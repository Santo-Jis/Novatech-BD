import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { Card } from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit, FiPackage, FiTrendingUp, FiTrendingDown } from 'react-icons/fi'

export default function AdminProducts() {
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null) // 'add' | 'edit' | 'adjust'
  const [selected,   setSelected]   = useState(null)
  const [form,       setForm]       = useState({ name: '', sku: '', price: '', stock: '', unit: 'pcs' })
  const [adjustForm, setAdjustForm] = useState({ quantity: '', note: '' })
  const [saving,     setSaving]     = useState(false)

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products?is_active=true')
      setProducts(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProducts() }, [])

  const openAdd = () => {
    setForm({ name: '', sku: '', price: '', stock: '', unit: 'pcs' })
    setSelected(null)
    setModal('add')
  }

  const openEdit = (product) => {
    setForm({ name: product.name, sku: product.sku, price: product.price, stock: product.stock, unit: product.unit })
    setSelected(product)
    setModal('edit')
  }

  const openAdjust = (product) => {
    setAdjustForm({ quantity: '', note: '' })
    setSelected(product)
    setModal('adjust')
  }

  const saveProduct = async () => {
    setSaving(true)
    try {
      if (modal === 'add') {
        await api.post('/products', form)
        toast.success('পণ্য তৈরি হয়েছে।')
      } else {
        await api.put(`/products/${selected.id}`, form)
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

  const columns = [
    {
      title: 'পণ্য',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiPackage className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-800">{row.name}</p>
            <p className="text-xs text-gray-400 font-mono">{row.sku}</p>
          </div>
        </div>
      )
    },
    { title: 'মূল্য', dataIndex: 'price', render: v => <span className="font-semibold text-secondary">৳{parseFloat(v).toLocaleString('bn-BD')}</span> },
    {
      title: 'স্টক',
      render: (_, row) => (
        <div>
          <span className={`font-bold ${parseInt(row.available_stock) <= 10 ? 'text-red-600' : 'text-gray-800'}`}>
            {row.available_stock}
          </span>
          <span className="text-xs text-gray-400"> / {row.stock} {row.unit}</span>
          {parseInt(row.reserved_stock) > 0 && (
            <p className="text-xs text-amber-600">রিজার্ভ: {row.reserved_stock}</p>
          )}
        </div>
      )
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600">
            <FiEdit />
          </button>
          <button onClick={() => openAdjust(row)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="স্টক এডজাস্ট">
            <FiTrendingUp />
          </button>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">পণ্য ব্যবস্থাপনা</h1>
        <Button icon={<FiPlus />} onClick={openAdd}>নতুন পণ্য</Button>
      </div>

      <Table columns={columns} data={products} loading={loading} emptyText="কোনো পণ্য নেই।" />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? 'নতুন পণ্য' : 'পণ্য সম্পাদনা'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
            <Button onClick={saveProduct} loading={saving} icon={<FiPackage />}>সেভ করুন</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="পণ্যের নাম" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="SKU" required value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="মূল্য (৳)" type="number" required value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            <Input label="প্রারম্ভিক স্টক" type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} />
          </div>
          <Input label="একক (pcs/kg/box)" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
        </div>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal
        isOpen={modal === 'adjust'}
        onClose={() => setModal(null)}
        title={`স্টক এডজাস্ট — ${selected?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
            <Button onClick={saveAdjust} loading={saving}>আপডেট করুন</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            বর্তমান স্টক: <strong>{selected?.stock} {selected?.unit}</strong>
          </div>
          <Input
            label="পরিমাণ (+ বা - সংখ্যা)"
            type="number"
            value={adjustForm.quantity}
            onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))}
            hint="বাড়াতে ধনাত্মক, কমাতে ঋণাত্মক সংখ্যা দিন"
          />
          <Input
            label="কারণ"
            value={adjustForm.note}
            onChange={e => setAdjustForm(p => ({ ...p, note: e.target.value }))}
            placeholder="স্টক এডজাস্টমেন্টের কারণ"
          />
        </div>
      </Modal>
    </div>
  )
}
