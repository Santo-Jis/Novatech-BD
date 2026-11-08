import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table, { Pagination } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal, { ConfirmModal } from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi'

const TYPE_OPTIONS = [
  'অফিস ভাড়া', 'গুদাম ভাড়া', 'বিদ্যুৎ বিল', 'পানি/গ্যাস বিল', 'ইন্টারনেট/ফোন বিল',
  'গাড়ি/জ্বালানি', 'মেরামত ও রক্ষণাবেক্ষণ', 'অফিস সামগ্রী', 'মার্কেটিং/বিজ্ঞাপন',
  'আপ্যায়ন', 'আইনি/ট্যাক্স/লাইসেন্স ফি', 'অন্যান্য',
].map(v => ({ value: v, label: v }))

const SOURCE_CFG = {
  manual:         { variant: 'info',    label: 'ম্যানুয়াল' },
  sr_report:      { variant: 'gray',    label: 'SR রিপোর্ট' },
  batch_writeoff: { variant: 'warning', label: 'ব্যাচ রাইট-অফ' },
}
const SOURCE_FILTER = [
  { value: 'manual', label: 'ম্যানুয়াল' },
  { value: 'sr_report', label: 'SR রিপোর্ট' },
  { value: 'batch_writeoff', label: 'ব্যাচ রাইট-অফ' },
]

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => today().slice(0, 8) + '01'
const fmtMoney = (n) => '৳' + Number(n || 0).toLocaleString('bn-BD', { maximumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const EMPTY = { expense_type: '', amount: '', date: today(), note: '' }

export default function AdminCompanyExpenses() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ total_amount: 0, by_type: [], by_source: [] })
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const { data } = await api.get('/expense/company', {
        params: { from, to, expense_type: typeFilter || undefined, source: sourceFilter || undefined, page, limit: 30 },
      })
      setRows(data.data)
      setSummary(data.summary)
      setPagination(data.pagination)
    } catch (e) {
      toast.error(e.response?.data?.message || 'খরচের তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [from, to, typeFilter, sourceFilter])

  useEffect(() => { fetchData(1) }, [fetchData])

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY, date: today() }); setFormOpen(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({ expense_type: r.expense_type, amount: String(r.amount), date: String(r.date).slice(0, 10), note: r.note || '' })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.expense_type) return toast.error('খরচের ধরন বেছে নিন।')
    if (!(parseFloat(form.amount) > 0)) return toast.error('সঠিক পরিমাণ দিন।')
    setSaving(true)
    try {
      const payload = { ...form, amount: parseFloat(form.amount) }
      if (editing) await api.put(`/expense/company/${editing.id}`, payload)
      else await api.post('/expense/company', payload)
      toast.success(editing ? 'খরচ আপডেট হয়েছে।' : 'খরচ যোগ হয়েছে।')
      setFormOpen(false)
      fetchData(editing ? pagination.page : 1)
    } catch (e) {
      toast.error(e.response?.data?.message || 'সংরক্ষণ করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    try {
      await api.delete(`/expense/company/${deleting.id}`)
      toast.success('খরচ মুছে ফেলা হয়েছে।')
      setDeleting(null)
      fetchData(pagination.page)
    } catch (e) {
      toast.error(e.response?.data?.message || 'মুছা যায়নি।')
      setDeleting(null)
    }
  }

  // ধরন filter: স্ট্যান্ডার্ড তালিকা + ডেটায় থাকা বাকি ধরন (যেমন ব্যাচ রাইট-অফ)
  const typeFilterOptions = [
    ...TYPE_OPTIONS,
    ...summary.by_type.filter(t => !TYPE_OPTIONS.some(o => o.value === t.expense_type))
      .map(t => ({ value: t.expense_type, label: t.expense_type })),
  ]

  const columns = [
    { title: 'তারিখ', dataIndex: 'date', render: fmtDate },
    { title: 'ধরন', dataIndex: 'expense_type', render: (v, r) => (
      <div>
        <div className="font-medium">{v}</div>
        {r.worker_name && r.source === 'sr_report' && <div className="text-xs text-gray-400">{r.worker_name}</div>}
      </div>
    ) },
    { title: 'পরিমাণ', dataIndex: 'amount', render: (v) => <span className="font-semibold text-red-600 dark:text-red-400">{fmtMoney(v)}</span> },
    { title: 'উৎস', dataIndex: 'source', render: (v) => <Badge variant={(SOURCE_CFG[v] || SOURCE_CFG.manual).variant}>{(SOURCE_CFG[v] || SOURCE_CFG.manual).label}</Badge> },
    { title: 'নোট', dataIndex: 'note', render: (v) => <span className="text-xs text-gray-500 line-clamp-2 max-w-[260px] inline-block">{v || '—'}</span> },
    { title: '', dataIndex: 'id', render: (_, r) => r.source === 'manual' ? (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500" title="Edit"><FiEdit2 /></button>
        <button onClick={() => setDeleting(r)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Delete"><FiTrash2 /></button>
      </div>
    ) : null },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">💸 খরচের হিসাব</h1>
          <p className="text-sm text-gray-500">কোম্পানির সব খরচ — ম্যানুয়াল, SR রিপোর্ট ও ব্যাচ রাইট-অফ</p>
        </div>
        <Button icon={<FiPlus />} onClick={openCreate}>নতুন খরচ</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="text-xs text-gray-500">মোট খরচ</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtMoney(summary.total_amount)}</div>
        </div>
        {summary.by_source.map(s => (
          <div key={s.source} className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="text-xs text-gray-500">{(SOURCE_CFG[s.source] || SOURCE_CFG.manual).label}</div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{fmtMoney(s.amount)}</div>
          </div>
        ))}
      </div>

      {summary.by_type.length > 0 && (
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-200">ধরন অনুযায়ী</div>
          <div className="space-y-2">
            {summary.by_type.map(t => {
              const pct = summary.total_amount > 0 ? (t.amount / summary.total_amount) * 100 : 0
              return (
                <div key={t.expense_type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-300">{t.expense_type}</span>
                    <span className="text-gray-500">{fmtMoney(t.amount)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-red-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <Input label="থেকে" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="পর্যন্ত" type="date" value={to} onChange={e => setTo(e.target.value)} />
        <Select label="ধরন" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} options={typeFilterOptions} placeholder="সব ধরন" />
        <Select label="উৎস" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} options={SOURCE_FILTER} placeholder="সব উৎস" />
      </div>

      <Table columns={columns} data={rows} loading={loading} emptyText="এই সময়ে কোনো খরচ নেই।" />
      <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(p) => fetchData(p)} />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '✏️ খরচ সম্পাদনা' : '➕ নতুন খরচ'}
        footer={<>
          <Button variant="outline" onClick={() => setFormOpen(false)}>বাতিল</Button>
          <Button loading={saving} onClick={save}>{editing ? 'আপডেট' : 'সংরক্ষণ'}</Button>
        </>}
      >
        <div className="space-y-4">
          <Select label="খরচের ধরন *" value={form.expense_type} onChange={e => setForm(f => ({ ...f, expense_type: e.target.value }))}
            options={editing && !TYPE_OPTIONS.some(o => o.value === form.expense_type)
              ? [...TYPE_OPTIONS, { value: form.expense_type, label: form.expense_type }] : TYPE_OPTIONS} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="পরিমাণ (৳) *" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <Input label="তারিখ *" type="date" max={today()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <Textarea label="নোট" rows={3} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="যেমন: জুন মাসের অফিস ভাড়া" />
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="খরচ মুছবেন?"
        message={deleting ? `${deleting.expense_type} — ${fmtMoney(deleting.amount)} মুছে ফেলা হবে।` : ''}
        confirmLabel="মুছে ফেলুন"
        danger
      />
    </div>
  )
}
