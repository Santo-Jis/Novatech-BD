// PriceLists.jsx — মাল্টিপল প্রাইস লিস্ট ব্যবস্থাপনা (Step ৫)
// পাইকারি/খুচরা/এলাকাভিত্তিক + চ্যানেল (ভ্যান বিক্রয় / in-app ই-কমার্স / পাবলিক ই-কমার্স)
import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import PriceListManageModal from '../../components/PriceListManageModal'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit, FiTrash2, FiTag, FiSettings, FiSlash, FiCheckCircle } from 'react-icons/fi'

const PRICE_TYPE_OPTIONS = [
  { value: 'wholesale', label: 'পাইকারি' },
  { value: 'retail',    label: 'খুচরা' },
  { value: 'area',      label: 'এলাকাভিত্তিক' },
  { value: 'custom',    label: 'কাস্টম' },
]
const CHANNEL_OPTIONS = [
  { value: 'all',              label: 'সব চ্যানেল' },
  { value: 'van_sales',        label: 'SR / ভ্যান বিক্রয়' },
  { value: 'app_ecommerce',    label: 'In-app ই-কমার্স (কাস্টমার পোর্টাল)' },
  { value: 'public_ecommerce', label: 'পাবলিক ই-কমার্স (শীঘ্রই আসছে)' },
]
const PRICE_TYPE_BADGE = { wholesale: 'primary', retail: 'secondary', area: 'info', custom: 'gray' }
const CHANNEL_LABEL = Object.fromEntries(CHANNEL_OPTIONS.map(c => [c.value, c.label]))
const CHANNEL_BADGE = { all: 'gray', van_sales: 'info', app_ecommerce: 'active', public_ecommerce: 'warning' }

const EMPTY_FORM = { name: '', name_bn: '', price_type: 'custom', channel: 'all', is_default: false, notes: '' }

export default function AdminPriceLists() {
  const [lists,   setLists]   = useState([])
  const [loading, setLoading] = useState(true)
  const [channelFilter, setChannelFilter] = useState('')

  const [modal,    setModal]    = useState(null) // 'add' | 'edit'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)

  const [manageId, setManageId] = useState(null)

  const fetchLists = async () => {
    setLoading(true)
    try {
      const params = channelFilter ? { channel: channelFilter } : {}
      const res = await api.get('/price-lists', { params })
      setLists(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLists() }, [channelFilter])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add') }
  const openEdit = (pl) => {
    setSelected(pl)
    setForm({
      name: pl.name || '', name_bn: pl.name_bn || '', price_type: pl.price_type,
      channel: pl.channel, is_default: pl.is_default, notes: pl.notes || ''
    })
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('মূল্য তালিকার নাম আবশ্যক।'); return }
    setSaving(true)
    try {
      if (modal === 'add') {
        await api.post('/price-lists', form)
        toast.success('মূল্য তালিকা তৈরি হয়েছে।')
      } else {
        await api.put(`/price-lists/${selected.id}`, form)
        toast.success('আপডেট সফল।')
      }
      setModal(null)
      fetchLists()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const toggleActive = async (pl) => {
    try {
      await api.put(`/price-lists/${pl.id}`, { is_active: !pl.is_active })
      toast.success(pl.is_active ? 'নিষ্ক্রিয় করা হয়েছে।' : 'সক্রিয় করা হয়েছে।')
      fetchLists()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const handleDelete = async (pl) => {
    if (!window.confirm(`"${pl.name}" ডিলিট করতে চান? এর সব প্রোডাক্ট দাম/এলাকা/কাস্টমার অ্যাসাইনমেন্টও মুছে যাবে।`)) return
    try {
      await api.delete(`/price-lists/${pl.id}`)
      toast.success('মূল্য তালিকা মুছে ফেলা হয়েছে।')
      fetchLists()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const columns = [
    {
      title: 'মূল্য তালিকা',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiTag className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.name_bn || row.name}</p>
            {row.name_bn && <p className="text-xs text-gray-400">{row.name}</p>}
          </div>
        </div>
      )
    },
    { title: 'ধরন',    render: (_, row) => <Badge variant={PRICE_TYPE_BADGE[row.price_type] || 'gray'} label={PRICE_TYPE_OPTIONS.find(t => t.value === row.price_type)?.label} size="xs" /> },
    { title: 'চ্যানেল', render: (_, row) => <Badge variant={CHANNEL_BADGE[row.channel] || 'gray'} label={CHANNEL_LABEL[row.channel]} size="xs" /> },
    {
      title: 'অ্যাসাইনমেন্ট',
      render: (_, row) => (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {row.item_count} প্রোডাক্ট · {row.area_count} এলাকা · {row.customer_count} কাস্টমার
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
          <button onClick={() => setManageId(row.id)} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="দাম/এলাকা/কাস্টমার ম্যানেজ">
            <FiSettings size={15} />
          </button>
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
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">মূল্য তালিকা</h1>
        <Button icon={<FiPlus />} onClick={openAdd}>নতুন মূল্য তালিকা</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setChannelFilter('')}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${!channelFilter ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
        >
          সব
        </button>
        {CHANNEL_OPTIONS.map(c => (
          <button
            key={c.value}
            onClick={() => setChannelFilter(c.value)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${channelFilter === c.value ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Table columns={columns} data={lists} loading={loading} emptyText="কোনো মূল্য তালিকা তৈরি হয়নি।" />

      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? '➕ নতুন মূল্য তালিকা' : `✏️ সম্পাদনা — ${selected?.name}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="নাম (ইংরেজি) *" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Wholesale — Dhaka" />
            <Input label="নাম (বাংলা)" value={form.name_bn} onChange={e => setField('name_bn', e.target.value)} placeholder="পাইকারি — ঢাকা" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="ধরন" options={PRICE_TYPE_OPTIONS} value={form.price_type} onChange={e => setField('price_type', e.target.value)} />
            <Select label="চ্যানেল" options={CHANNEL_OPTIONS} value={form.channel} onChange={e => setField('channel', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_default} onChange={e => setField('is_default', e.target.checked)} className="rounded border-gray-300" />
            এই চ্যানেলের ডিফল্ট তালিকা (কোনো নির্দিষ্ট কাস্টমার/এলাকা না মিললে এটাই ব্যবহার হবে)
          </label>
          <Textarea label="নোট" value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
          <Button onClick={handleSave} loading={saving}>সেভ করুন</Button>
        </div>
      </Modal>

      <PriceListManageModal
        isOpen={!!manageId}
        onClose={() => setManageId(null)}
        priceListId={manageId}
        onChanged={fetchLists}
      />
    </div>
  )
}
