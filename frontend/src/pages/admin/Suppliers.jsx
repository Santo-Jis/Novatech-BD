import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit, FiTrash2, FiTruck, FiPhone, FiMail, FiSlash, FiCheckCircle } from 'react-icons/fi'

const EMPTY_FORM = {
  name: '', contact_person: '', phone: '', email: '', address: '', notes: ''
}

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [modal,    setModal]    = useState(null) // 'add' | 'edit'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/suppliers?is_active=${!showInactive}`)
      setSuppliers(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSuppliers() }, [showInactive])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add') }
  const openEdit = (s) => {
    setSelected(s)
    setForm({
      name: s.name || '', contact_person: s.contact_person || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', notes: s.notes || ''
    })
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('সাপ্লায়ারের নাম আবশ্যক।'); return }
    setSaving(true)
    try {
      if (modal === 'add') {
        await api.post('/suppliers', form)
        toast.success('সাপ্লায়ার যোগ হয়েছে।')
      } else {
        await api.put(`/suppliers/${selected.id}`, form)
        toast.success('আপডেট সফল।')
      }
      setModal(null)
      fetchSuppliers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const toggleActive = async (s) => {
    try {
      await api.put(`/suppliers/${s.id}`, { is_active: !s.is_active })
      toast.success(s.is_active ? 'নিষ্ক্রিয় করা হয়েছে।' : 'সক্রিয় করা হয়েছে।')
      fetchSuppliers()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`"${s.name}" ডিলিট করতে চান?`)) return
    try {
      await api.delete(`/suppliers/${s.id}`)
      toast.success('সাপ্লায়ার মুছে ফেলা হয়েছে।')
      fetchSuppliers()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const columns = [
    {
      title: 'সাপ্লায়ার',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiTruck className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.name}</p>
            {row.contact_person && <p className="text-xs text-gray-400">{row.contact_person}</p>}
          </div>
        </div>
      )
    },
    {
      title: 'যোগাযোগ',
      render: (_, row) => (
        <div className="space-y-0.5">
          {row.phone && <p className="text-xs flex items-center gap-1 text-gray-600 dark:text-gray-300"><FiPhone size={11} />{row.phone}</p>}
          {row.email && <p className="text-xs flex items-center gap-1 text-gray-400"><FiMail size={11} />{row.email}</p>}
          {!row.phone && !row.email && <span className="text-xs text-gray-300">—</span>}
        </div>
      )
    },
    {
      title: 'ক্রয় ইতিহাস',
      render: (_, row) => (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{row.po_count} PO</p>
          <p className="text-xs text-secondary">৳{parseFloat(row.total_purchased || 0).toLocaleString()}</p>
        </div>
      )
    },
    {
      title: 'অবস্থা',
      render: (_, row) => <Badge variant={row.is_active ? 'active' : 'archived'} label={row.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} size="xs" />
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-1">
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
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">সাপ্লায়ার ব্যবস্থাপনা</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            {showInactive ? 'সক্রিয় দেখুন' : 'নিষ্ক্রিয় দেখুন'}
          </button>
          <Button icon={<FiPlus />} onClick={openAdd}>নতুন সাপ্লায়ার</Button>
        </div>
      </div>

      <Table columns={columns} data={suppliers} loading={loading} emptyText="কোনো সাপ্লায়ার নেই।" />

      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? '➕ নতুন সাপ্লায়ার' : `✏️ সম্পাদনা — ${selected?.name}`}
      >
        <div className="space-y-4">
          <Input label="সাপ্লায়ারের নাম *" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="যেমন: ABC ট্রেডার্স" />
          <Input label="যোগাযোগকারী ব্যক্তি" value={form.contact_person} onChange={e => setField('contact_person', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ফোন" value={form.phone} onChange={e => setField('phone', e.target.value)} />
            <Input label="ইমেইল" value={form.email} onChange={e => setField('email', e.target.value)} />
          </div>
          <Textarea label="ঠিকানা" value={form.address} onChange={e => setField('address', e.target.value)} rows={2} />
          <Textarea label="নোট" value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
          <Button onClick={handleSave} loading={saving}>সেভ করুন</Button>
        </div>
      </Modal>
    </div>
  )
}
