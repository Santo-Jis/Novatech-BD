// Warehouses.jsx — গুদাম ব্যবস্থাপনা (মাল্টি-ওয়্যারহাউজ ধাপ ৪ + ধাপ ৫)
// প্রতিটা tenant-এ অন্তত একটা গুদাম সবসময় থাকবে (Step ১ মাইগ্রেশনে গ্যারান্টিড)।
// একটাই ডিফল্ট গুদাম থাকতে পারবে — ডিফল্ট/একমাত্র সক্রিয় গুদাম ডিলিট বা নিষ্ক্রিয়
// করা আটকানো আছে ব্যাকএন্ডে (warehouse.controller.js)।
// ধাপ ৫: প্রতিটা গুদামে কোন পণ্যের কত স্টক আছে তা দেখার মোডাল (warehouse_stock টেবিল)।

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit, FiTrash2, FiHome, FiSlash, FiCheckCircle, FiStar, FiArchive, FiBox, FiSearch } from 'react-icons/fi'

const EMPTY_FORM = { name: '', code: '', address: '', is_default: false }

export default function AdminWarehouses() {
  const [warehouses, setWarehouses] = useState([])
  const [loading,    setLoading]    = useState(true)

  const [modal,    setModal]    = useState(null) // 'add' | 'edit'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)

  // ✅ ধাপ ৫: স্টক ব্রেকডাউন মোডাল
  const [stockWarehouse, setStockWarehouse] = useState(null) // যে গুদামের স্টক দেখা হচ্ছে
  const [stockData,      setStockData]      = useState(null)
  const [stockLoading,   setStockLoading]   = useState(false)
  const [stockSearch,    setStockSearch]    = useState('')

  const fetchWarehouses = async () => {
    setLoading(true)
    try {
      const res = await api.get('/warehouses')
      setWarehouses(res.data.data)
    } catch { toast.error('গুদামের তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchWarehouses() }, [])

  // ✅ ধাপ ৫: স্টক ব্রেকডাউন
  const openStockView = async (w) => {
    setStockWarehouse(w)
    setStockSearch('')
    setStockLoading(true)
    try {
      const res = await api.get(`/warehouses/${w.id}/stock`)
      setStockData(res.data.data)
    } catch { toast.error('স্টক তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setStockLoading(false) }
  }

  useEffect(() => {
    if (!stockWarehouse) return
    const t = setTimeout(async () => {
      try {
        const params = stockSearch.trim() ? `?search=${encodeURIComponent(stockSearch.trim())}` : ''
        const res = await api.get(`/warehouses/${stockWarehouse.id}/stock${params}`)
        setStockData(res.data.data)
      } catch { /* সাইলেন্ট — আগের ডেটা দেখা থাকবে */ }
    }, 250)
    return () => clearTimeout(t)
  }, [stockSearch])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add') }
  const openEdit = (w) => {
    setSelected(w)
    setForm({ name: w.name || '', code: w.code || '', address: w.address || '', is_default: w.is_default })
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('গুদামের নাম আবশ্যক।'); return }
    setSaving(true)
    try {
      if (modal === 'add') {
        await api.post('/warehouses', form)
        toast.success('গুদাম যোগ হয়েছে।')
      } else {
        await api.patch(`/warehouses/${selected.id}`, form)
        toast.success('আপডেট সফল।')
      }
      setModal(null)
      fetchWarehouses()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const toggleActive = async (w) => {
    try {
      await api.patch(`/warehouses/${w.id}`, { is_active: !w.is_active })
      toast.success(w.is_active ? 'নিষ্ক্রিয় করা হয়েছে।' : 'সক্রিয় করা হয়েছে।')
      fetchWarehouses()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const makeDefault = async (w) => {
    try {
      await api.patch(`/warehouses/${w.id}`, { is_default: true })
      toast.success(`"${w.name}" এখন ডিফল্ট গুদাম।`)
      fetchWarehouses()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const handleDelete = async (w) => {
    if (!window.confirm(`"${w.name}" ডিলিট করতে চান?`)) return
    try {
      await api.delete(`/warehouses/${w.id}`)
      toast.success('গুদাম মুছে ফেলা হয়েছে।')
      fetchWarehouses()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const columns = [
    {
      title: 'গুদাম',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiHome className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.name}</p>
            {row.code && <p className="text-xs text-gray-400 font-mono">{row.code}</p>}
          </div>
        </div>
      )
    },
    {
      title: 'ঠিকানা',
      render: (_, row) => row.address
        ? <span className="text-sm text-gray-600 dark:text-gray-300">{row.address}</span>
        : <span className="text-xs text-gray-300">—</span>
    },
    {
      title: 'স্টক',
      render: (_, row) => (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {row.active_batch_count} ব্যাচ · {row.po_count} PO
        </p>
      )
    },
    {
      title: 'অবস্থা',
      render: (_, row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.is_default && <Badge variant="primary" label="ডিফল্ট" size="xs" />}
          <Badge variant={row.is_active ? 'active' : 'archived'} label={row.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} size="xs" />
        </div>
      )
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => openStockView(row)} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="স্টক দেখুন">
            <FiBox size={15} />
          </button>
          {!row.is_default && (
            <button onClick={() => makeDefault(row)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500" title="ডিফল্ট বানান">
              <FiStar size={15} />
            </button>
          )}
          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="সম্পাদনা">
            <FiEdit size={15} />
          </button>
          <button
            onClick={() => toggleActive(row)}
            className={`p-1.5 rounded-lg ${row.is_active ? 'hover:bg-amber-50 text-amber-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
            title={row.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
          >
            {row.is_active ? <FiSlash size={15} /> : <FiCheckCircle size={15} />}
          </button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="ডিলিট">
            <FiTrash2 size={15} />
          </button>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">গুদাম</h1>
        <Button icon={<FiPlus />} onClick={openAdd}>নতুন গুদাম</Button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <FiArchive className="text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          প্রতিটা গুদামের পণ্য-ভিত্তিক স্টক এখন সমান্তরালভাবে ট্র্যাক হয় (নিচে "স্টক" বাটনে দেখুন) —
          তবে Products পেইজ, POS ও লো-স্টক অ্যালার্ট এখনো সামগ্রিক (সব গুদাম মিলিয়ে মোট) স্টক দেখায়,
          আলাদা গুদাম বেছে ফিল্টার করার সুবিধা এখনো নেই।
        </p>
      </div>

      <Table columns={columns} data={warehouses} loading={loading} emptyText="কোনো গুদাম তৈরি হয়নি।" />

      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? '➕ নতুন গুদাম' : `✏️ সম্পাদনা — ${selected?.name}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="নাম *" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="যেমন: উত্তরা গুদাম" />
            <Input label="কোড" value={form.code} onChange={e => setField('code', e.target.value)} placeholder="যেমন: UTR" />
          </div>
          <Textarea label="ঠিকানা" value={form.address} onChange={e => setField('address', e.target.value)} rows={2} />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_default} onChange={e => setField('is_default', e.target.checked)} className="rounded border-gray-300" />
            এটাই ডিফল্ট গুদাম বানান (নতুন PO/ব্যাচ যেখানে অটোমেটিক অ্যাসাইন হবে)
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
          <Button onClick={handleSave} loading={saving}>সেভ করুন</Button>
        </div>
      </Modal>

      {/* ✅ ধাপ ৫: গুদাম-ভিত্তিক স্টক ব্রেকডাউন */}
      <Modal
        isOpen={!!stockWarehouse}
        onClose={() => { setStockWarehouse(null); setStockData(null) }}
        title={stockWarehouse ? `স্টক — ${stockWarehouse.name}` : ''}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            icon={<FiSearch />}
            placeholder="পণ্য বা SKU খুঁজুন"
            value={stockSearch}
            onChange={e => setStockSearch(e.target.value)}
          />

          {stockLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
            </div>
          ) : stockData ? (
            <>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-gray-500 dark:text-gray-400">এই গুদামে ট্র্যাক করা মোট ইউনিট</span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">{stockData.total_quantity}</span>
              </div>

              {stockData.items.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">এই গুদামে কোনো ট্র্যাক করা স্টক নেই।</p>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {stockData.items.map(item => (
                    <div key={item.product_id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-slate-700/40">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{item.quantity} {item.unit}</p>
                        {parseInt(item.total_stock, 10) !== parseInt(item.quantity, 10) && (
                          <p className="text-[11px] text-gray-400">মোট (সব গুদাম): {item.total_stock}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">তথ্য পাওয়া যায়নি।</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
