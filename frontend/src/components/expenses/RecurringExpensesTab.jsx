import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table from '../ui/Table'
import Button from '../ui/Button'
import Input, { Select, Textarea } from '../ui/Input'
import Modal, { ConfirmModal } from '../ui/Modal'
import Badge from '../ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi'
import { PAYMENT_METHODS, paymentLabel, fmtMoney, fmtDate, todayBD } from './expenseConstants'

const emptyForm = () => ({
  category_id: '', amount: '', day_of_month: '1', start_date: todayBD(), end_date: '',
  payment_method: '', paid_to: '', note: '', is_active: true,
})

// নির্দিষ্ট মাসিক খরচ (ভাড়া, ইন্টারনেট ইত্যাদি) — প্রতি মাসে নিজে খরচের তালিকায় জমা হয়
export default function RecurringExpensesTab({ categories, onGenerated }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/expense/company/recurring')
      setRows(data.data)
    } catch (e) {
      toast.error(e.response?.data?.message || 'তালিকা আনতে সমস্যা হয়েছে।')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const activeCats = categories.filter(c => c.is_active)
  const catOptions = (editing && form.category_id && !activeCats.some(c => c.id === form.category_id))
    ? [...activeCats, ...categories.filter(c => c.id === form.category_id)] : activeCats

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFormOpen(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({
      category_id: r.category_id || '', amount: String(r.amount), day_of_month: String(r.day_of_month),
      start_date: String(r.start_date).slice(0, 10), end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
      payment_method: r.payment_method || '', paid_to: r.paid_to || '', note: r.note || '', is_active: r.is_active,
    })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.category_id) return toast.error('ক্যাটাগরি বেছে নিন।')
    if (!(parseFloat(form.amount) > 0)) return toast.error('সঠিক পরিমাণ দিন।')
    const day = parseInt(form.day_of_month, 10)
    if (!(day >= 1 && day <= 28)) return toast.error('মাসের তারিখ ১ থেকে ২৮-এর মধ্যে দিন।')
    setSaving(true)
    try {
      const payload = { ...form, amount: parseFloat(form.amount), day_of_month: day, end_date: form.end_date || null }
      const { data } = editing
        ? await api.put(`/expense/company/recurring/${editing.id}`, payload)
        : await api.post('/expense/company/recurring', payload)
      toast.success(data.message || 'সংরক্ষণ হয়েছে।')
      setFormOpen(false)
      await load()
      if (data.generated > 0) onGenerated?.()
    } catch (e) {
      toast.error(e.response?.data?.message || 'সংরক্ষণ করা যায়নি।')
    } finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    try {
      const { data } = await api.delete(`/expense/company/recurring/${deleting.id}`)
      toast.success(data.message)
    } catch (e) {
      toast.error(e.response?.data?.message || 'মুছা যায়নি।')
    }
    setDeleting(null)
    load()
  }

  const columns = [
    { title: 'খরচ', dataIndex: 'expense_type', render: (v, r) => (
      <div>
        <div className="font-medium">{v}</div>
        {r.paid_to && <div className="text-xs text-gray-400">{r.paid_to}</div>}
      </div>
    ) },
    { title: 'পরিমাণ', dataIndex: 'amount', render: (v) => <span className="font-semibold text-red-600 dark:text-red-400">{fmtMoney(v)}</span> },
    { title: 'প্রতি মাসের', dataIndex: 'day_of_month', render: (v) => `${Number(v).toLocaleString('bn-BD')} তারিখ` },
    { title: 'সময়কাল', dataIndex: 'start_date', render: (v, r) => `${fmtDate(v)} → ${r.end_date ? fmtDate(r.end_date) : 'চলছে'}` },
    { title: 'পেমেন্ট', dataIndex: 'payment_method', render: paymentLabel },
    { title: 'শেষ জমা', dataIndex: 'last_generated_date', render: (v) => v ? fmtDate(v) : '—' },
    { title: 'অবস্থা', dataIndex: 'is_active', render: (v) => <Badge variant={v ? 'active' : 'gray'}>{v ? 'চালু' : 'বন্ধ'}</Badge> },
    { title: '', dataIndex: 'id', render: (_, r) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500" title="Edit"><FiEdit2 /></button>
        <button onClick={() => setDeleting(r)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Delete"><FiTrash2 /></button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          ভাড়া, ইন্টারনেট বা অন্য নির্দিষ্ট মাসিক খরচ একবার এখানে দিয়ে রাখুন। প্রতি মাসের নির্ধারিত তারিখে খরচটা নিজে নিজে
          "খরচের হিসাব"-এ যোগ হয়ে মুনাফার হিসাবে ধরা পড়বে। বিলের অঙ্ক এক মাসে আলাদা হলে (যেমন বিদ্যুৎ) ওই মাসের খরচটা
          খরচের তালিকা থেকে এডিট করুন।
        </p>
        <Button icon={<FiPlus />} onClick={openCreate}>নতুন নিয়মিত খরচ</Button>
      </div>

      <Table columns={columns} data={rows} loading={loading} emptyText="কোনো নিয়মিত খরচ সেট করা নেই।" />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '✏️ নিয়মিত খরচ সম্পাদনা' : '🔁 নতুন নিয়মিত খরচ'}
        footer={<>
          <Button variant="outline" onClick={() => setFormOpen(false)}>বাতিল</Button>
          <Button loading={saving} onClick={save}>{editing ? 'আপডেট' : 'সংরক্ষণ'}</Button>
        </>}
      >
        <div className="space-y-4">
          <Select label="ক্যাটাগরি *" value={form.category_id} onChange={set('category_id')}
                  options={catOptions.map(c => ({ value: c.id, label: c.name }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="মাসিক পরিমাণ (৳) *" type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} />
            <Input label="প্রতি মাসের কত তারিখে *" type="number" min="1" max="28" value={form.day_of_month} onChange={set('day_of_month')}
                   hint="১–২৮ (২৯-৩১ সব মাসে নেই)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="শুরুর তারিখ *" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="শেষ তারিখ" type="date" value={form.end_date} onChange={set('end_date')} hint="খালি = চলতে থাকবে" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="পেমেন্ট পদ্ধতি" value={form.payment_method} onChange={set('payment_method')} options={PAYMENT_METHODS} placeholder="— জানি না —" />
            <Input label="কাকে দেওয়া হয়" value={form.paid_to} maxLength={150} onChange={set('paid_to')} placeholder="যেমন: বাড়িওয়ালা, ISP" />
          </div>
          <Textarea label="নোট" rows={2} value={form.note} onChange={set('note')} />
          {editing && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              চালু আছে (বন্ধ করলে আর নতুন মাসে জমা হবে না)
            </label>
          )}
          {editing && <p className="text-xs text-gray-400">বদলালে আগে জমা হওয়া খরচ বদলায় না, নতুন তথ্য পরের মাস থেকে প্রযোজ্য।</p>}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="নিয়মিত খরচ মুছবেন?"
        message={deleting ? `${deleting.expense_type} — ${fmtMoney(deleting.amount)}/মাস। আগে জমা হওয়া খরচ হিসাবে থেকে যাবে, শুধু নতুন মাসে আর জমা হবে না।` : ''}
        confirmLabel="মুছে ফেলুন"
        danger
      />
    </div>
  )
}
