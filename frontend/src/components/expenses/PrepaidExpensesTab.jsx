import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table from '../ui/Table'
import Button from '../ui/Button'
import Input, { Select, Textarea } from '../ui/Input'
import Modal from '../ui/Modal'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import { PAYMENT_METHODS, fmtMoney, fmtDate, todayBD } from './expenseConstants'

const emptyForm = () => ({
  category_id: '', total_amount: '', months: '12', start_month: todayBD().slice(0, 7),
  paid_date: todayBD(), payment_method: '', paid_to: '', note: '',
})

// অগ্রিম খরচ: একবারে দেওয়া টাকা কয়েক মাসে সমান ভাগ হয়ে প্রতি মাসের ১ তারিখে খরচে ধরা পড়ে
export default function PrepaidExpensesTab({ categories, onGenerated }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows((await api.get('/expense/company/prepaid')).data.data) }
    catch (e) { toast.error(e.response?.data?.message || 'তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const perMonth = (parseFloat(form.total_amount) > 0 && parseInt(form.months) >= 2)
    ? parseFloat(form.total_amount) / parseInt(form.months) : null

  const save = async () => {
    if (!form.category_id) return toast.error('ক্যাটাগরি বেছে নিন।')
    if (!(parseFloat(form.total_amount) > 0)) return toast.error('মোট পরিমাণ দিন।')
    const m = parseInt(form.months, 10)
    if (!(m >= 2 && m <= 60)) return toast.error('মাসের সংখ্যা ২ থেকে ৬০-এর মধ্যে দিন।')
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
      if (file) fd.append('receipt', file)
      const { data } = await api.post('/expense/company/prepaid', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(data.message)
      setOpen(false); setFile(null)
      await load()
      if (data.generated > 0) onGenerated?.()
    } catch (e) { toast.error(e.response?.data?.message || 'সংরক্ষণ করা যায়নি।') }
    finally { setSaving(false) }
  }

  const remove = async (removePosted) => {
    try {
      const { data } = await api.delete(`/expense/company/prepaid/${deleting.id}`, { params: { remove_posted: removePosted } })
      toast.success(data.message)
      if (removePosted) onGenerated?.()
    } catch (e) { toast.error(e.response?.data?.message || 'মুছা যায়নি।') }
    setDeleting(null); load()
  }

  const columns = [
    { title: 'খরচ', dataIndex: 'expense_type', render: (v, r) => (
      <div><div className="font-medium">{v}</div>{r.paid_to && <div className="text-xs text-gray-400">→ {r.paid_to}</div>}</div>
    ) },
    { title: 'মোট', dataIndex: 'total_amount', render: (v) => <span className="font-semibold text-red-600 dark:text-red-400">{fmtMoney(v)}</span> },
    { title: 'ভাগ', dataIndex: 'months', render: (v, r) => `${Number(v).toLocaleString('bn-BD')} মাস × ${fmtMoney(r.total_amount / v)}` },
    { title: 'শুরু', dataIndex: 'start_month', render: fmtDate },
    { title: 'পরিশোধ', dataIndex: 'paid_date', render: fmtDate },
    { title: 'ধরা হয়েছে', dataIndex: 'posted_count', render: (v, r) => (
      <div className="min-w-[110px]">
        <div className="text-xs mb-1">{Number(v).toLocaleString('bn-BD')}/{Number(r.months).toLocaleString('bn-BD')} কিস্তি · {fmtMoney(r.posted_amount)}</div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-red-400" style={{ width: `${(v / r.months) * 100}%` }} /></div>
      </div>
    ) },
    { title: '', dataIndex: 'id', render: (_, r) => (
      <button onClick={() => setDeleting(r)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="বাতিল/মুছুন"><FiTrash2 /></button>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          বছরের বিমা বা অগ্রিম ভাড়ার মতো একবারে দেওয়া টাকা এখানে দিন। পুরোটা এক মাসের খরচ না হয়ে সমান কিস্তিতে প্রতি মাসের
          ১ তারিখে মুনাফার হিসাবে ধরা পড়বে, তাই কোনো মাসের লাভ হঠাৎ কমে বা বাড়ে না।
        </p>
        <Button icon={<FiPlus />} onClick={() => { setForm(emptyForm()); setFile(null); setOpen(true) }}>নতুন অগ্রিম খরচ</Button>
      </div>

      <Table columns={columns} data={rows} loading={loading} emptyText="কোনো অগ্রিম খরচ নেই।" />

      <Modal isOpen={open} onClose={() => setOpen(false)} title="📅 নতুন অগ্রিম খরচ"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button><Button loading={saving} onClick={save}>সংরক্ষণ</Button></>}>
        <div className="space-y-4">
          <Select label="ক্যাটাগরি *" value={form.category_id} onChange={set('category_id')}
            options={categories.filter(c => c.is_active).map(c => ({ value: c.id, label: c.name }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="মোট পরিমাণ (৳) *" type="number" min="0" step="0.01" value={form.total_amount} onChange={set('total_amount')} />
            <Input label="কত মাসে ভাগ *" type="number" min="2" max="60" value={form.months} onChange={set('months')}
              hint={perMonth ? `প্রতি মাসে প্রায় ${fmtMoney(perMonth)}` : '২–৬০ মাস'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="কোন মাস থেকে ধরা শুরু *" type="month" value={form.start_month} onChange={set('start_month')} />
            <Input label="টাকা দেওয়ার তারিখ *" type="date" max={todayBD()} value={form.paid_date} onChange={set('paid_date')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="পেমেন্ট পদ্ধতি" value={form.payment_method} onChange={set('payment_method')} options={PAYMENT_METHODS} placeholder="— জানি না —" />
            <Input label="কাকে দেওয়া হলো" value={form.paid_to} maxLength={150} onChange={set('paid_to')} placeholder="যেমন: বিমা কোম্পানি" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">রসিদের ছবি</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)}
              className="text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-slate-700 file:px-3 file:py-2 file:text-sm" />
          </div>
          <Textarea label="নোট" rows={2} value={form.note} onChange={set('note')} />
        </div>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="অগ্রিম খরচ বাতিল"
        footer={<>
          <Button variant="outline" onClick={() => setDeleting(null)}>ফিরে যান</Button>
          <Button variant="outline" onClick={() => remove(false)}>বাকি কিস্তি বাতিল</Button>
          <Button onClick={() => remove(true)}>সব মুছুন</Button>
        </>}>
        {deleting && (
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p><b>{deleting.expense_type}</b> — {fmtMoney(deleting.total_amount)}, {deleting.posted_count}/{deleting.months} কিস্তি ধরা হয়েছে।</p>
            <p><b>বাকি কিস্তি বাতিল:</b> আগে ধরা কিস্তি হিসাবে থাকবে, ভবিষ্যতেরগুলো আর আসবে না।</p>
            <p><b>সব মুছুন:</b> ভুল এন্ট্রি হলে — আগে ধরা কিস্তিগুলোও খরচ থেকে মুছে যাবে।</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
