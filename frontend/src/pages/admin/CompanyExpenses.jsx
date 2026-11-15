import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table, { Pagination } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal, { ConfirmModal } from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiTrash2, FiPaperclip } from 'react-icons/fi'
import ExpenseCategoriesTab from '../../components/expenses/ExpenseCategoriesTab'
import RecurringExpensesTab from '../../components/expenses/RecurringExpensesTab'
import PrepaidExpensesTab from '../../components/expenses/PrepaidExpensesTab'
import BudgetTab from '../../components/expenses/BudgetTab'
import { PAYMENT_METHODS, paymentLabel, fmtMoney, fmtDate, todayBD } from '../../components/expenses/expenseConstants'

const SOURCE_CFG = {
  manual:         { variant: 'info',    label: 'ম্যানুয়াল' },
  sr_report:      { variant: 'gray',    label: 'SR রিপোর্ট' },
  batch_writeoff: { variant: 'warning', label: 'ব্যাচ রাইট-অফ' },
  recurring:      { variant: 'active',  label: 'নিয়মিত (স্বয়ংক্রিয়)' },
  prepaid:        { variant: 'primary', label: 'অগ্রিম কিস্তি' },
}
const SOURCE_FILTER = [
  { value: 'manual', label: 'ম্যানুয়াল' },
  { value: 'sr_report', label: 'SR রিপোর্ট' },
  { value: 'batch_writeoff', label: 'ব্যাচ রাইট-অফ' },
  { value: 'recurring', label: 'নিয়মিত (স্বয়ংক্রিয়)' },
  { value: 'prepaid', label: 'অগ্রিম কিস্তি' },
]

const today = todayBD
const monthStart = () => today().slice(0, 8) + '01'
const EMPTY = { category_id: '', amount: '', date: today(), payment_method: '', paid_to: '', note: '' }
const EDITABLE = ['manual', 'recurring', 'prepaid']

export default function AdminCompanyExpenses() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ total_amount: 0, by_type: [], by_source: [] })
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [tab, setTab] = useState('expenses')
  const [categories, setCategories] = useState([])
  const [receiptFile, setReceiptFile] = useState(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)

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

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/expense/company/categories')
      setCategories(data.data)
    } catch (e) {
      toast.error(e.response?.data?.message || 'ক্যাটাগরির তালিকা আনতে সমস্যা হয়েছে।')
    }
  }, [])

  useEffect(() => { fetchData(1) }, [fetchData])
  useEffect(() => { fetchCategories() }, [fetchCategories])

  const activeCategories = categories.filter(c => c.is_active)

  const openCreate = () => {
    setEditing(null); setForm({ ...EMPTY, date: today() }); setReceiptFile(null); setRemoveReceipt(false); setFormOpen(true)
  }
  const openEdit = (r) => {
    setEditing(r)
    // category_id না থাকলে (পুরনো খরচ) নাম মিলিয়ে ক্যাটাগরি খুঁজি
    const cid = r.category_id || categories.find(c => c.name === r.expense_type)?.id || ''
    setForm({
      category_id: cid, amount: String(r.amount), date: String(r.date).slice(0, 10),
      payment_method: r.payment_method || '', paid_to: r.paid_to || '', note: r.note || '',
    })
    setReceiptFile(null); setRemoveReceipt(false)
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.category_id) return toast.error('খরচের ধরন বেছে নিন।')
    if (!(parseFloat(form.amount) > 0)) return toast.error('সঠিক পরিমাণ দিন।')
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
      if (receiptFile) fd.append('receipt', receiptFile)
      if (removeReceipt) fd.append('remove_receipt', 'true')
      const cfg = { headers: { 'Content-Type': 'multipart/form-data' } }
      const { data } = editing
        ? await api.put(`/expense/company/${editing.id}`, fd, cfg)
        : await api.post('/expense/company', fd, cfg)
      toast.success(data.message || (editing ? 'খরচ আপডেট হয়েছে।' : 'খরচ যোগ হয়েছে।'))
      setFormOpen(false)
      fetchData(editing ? pagination.page : 1)
      fetchCategories()
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

  // ধরন filter: সক্রিয় ক্যাটাগরি + ডেটায় থাকা বাকি ধরন (যেমন SR খরচ, ব্যাচ রাইট-অফ)
  const typeFilterOptions = [
    ...categories.map(c => ({ value: c.name, label: c.name })),
    ...summary.by_type.filter(t => !categories.some(c => c.name === t.expense_type))
      .map(t => ({ value: t.expense_type, label: t.expense_type })),
  ]

  const columns = [
    { title: 'তারিখ', dataIndex: 'date', render: fmtDate },
    { title: 'ধরন', dataIndex: 'expense_type', render: (v, r) => (
      <div>
        <div className="font-medium">{v}</div>
        {r.worker_name && r.source === 'sr_report' && <div className="text-xs text-gray-400">{r.worker_name}</div>}
        {r.paid_to && <div className="text-xs text-gray-400">→ {r.paid_to}</div>}
      </div>
    ) },
    { title: 'পরিমাণ', dataIndex: 'amount', render: (v) => <span className="font-semibold text-red-600 dark:text-red-400">{fmtMoney(v)}</span> },
    { title: 'পেমেন্ট', dataIndex: 'payment_method', render: (v) => <span className="text-xs text-gray-500">{paymentLabel(v)}</span> },
    { title: 'উৎস', dataIndex: 'source', render: (v) => <Badge variant={(SOURCE_CFG[v] || SOURCE_CFG.manual).variant}>{(SOURCE_CFG[v] || SOURCE_CFG.manual).label}</Badge> },
    { title: 'নোট', dataIndex: 'note', render: (v) => <span className="text-xs text-gray-500 line-clamp-2 max-w-[260px] inline-block">{v || '—'}</span> },
    { title: 'রসিদ', dataIndex: 'receipt_url', render: (v) => v ? (
      <a href={v} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><FiPaperclip />দেখুন</a>
    ) : <span className="text-gray-300">—</span> },
    { title: '', dataIndex: 'id', render: (_, r) => EDITABLE.includes(r.source) ? (
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
        {tab === 'expenses' && <Button icon={<FiPlus />} onClick={openCreate}>নতুন খরচ</Button>}
      </div>

      <div className="flex gap-1 border-b border-gray-100 dark:border-slate-700">
        {[['expenses', 'খরচের তালিকা'], ['recurring', '🔁 নিয়মিত মাসিক খরচ'], ['prepaid', '📅 অগ্রিম খরচ'], ['budget', '🎯 বাজেট'], ['categories', 'ক্যাটাগরি']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${tab === k
              ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'recurring' && <RecurringExpensesTab categories={categories} onGenerated={() => fetchData(1)} />}
      {tab === 'prepaid' && <PrepaidExpensesTab categories={categories} onGenerated={() => fetchData(1)} />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'categories' && <ExpenseCategoriesTab categories={categories} onChanged={() => { fetchCategories(); fetchData(pagination.page) }} />}

      {tab === 'expenses' && <>

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
      </>}

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
          <Select label="খরচের ধরন *" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
            options={[
              ...activeCategories,
              ...categories.filter(c => !c.is_active && c.id === form.category_id),
            ].map(c => ({ value: c.id, label: c.name }))}
            hint="তালিকায় নেই? উপরের ক্যাটাগরি ট্যাবে নতুন যোগ করুন।" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="পরিমাণ (৳) *" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <Input label="তারিখ *" type="date" max={today()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="পেমেন্ট পদ্ধতি" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
              options={PAYMENT_METHODS} placeholder="— জানি না —" />
            <Input label="কাকে দেওয়া হলো" value={form.paid_to} maxLength={150} onChange={e => setForm(f => ({ ...f, paid_to: e.target.value }))} placeholder="যেমন: বাড়িওয়ালা, DESCO" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">রসিদের ছবি</label>
            {editing?.receipt_url && !removeReceipt && !receiptFile && (
              <div className="flex items-center gap-3 text-xs">
                <a href={editing.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">বর্তমান রসিদ দেখুন</a>
                <button type="button" onClick={() => setRemoveReceipt(true)} className="text-red-500 hover:underline">সরিয়ে ফেলুন</button>
              </div>
            )}
            {removeReceipt && <div className="text-xs text-amber-600">সংরক্ষণ করলে রসিদটি সরে যাবে। <button type="button" onClick={() => setRemoveReceipt(false)} className="underline">ফিরিয়ে আনুন</button></div>}
            <input type="file" accept="image/*" capture="environment"
              onChange={e => { setReceiptFile(e.target.files?.[0] || null); setRemoveReceipt(false) }}
              className="text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-slate-700 file:px-3 file:py-2 file:text-sm" />
            <p className="text-xs text-gray-400">ঐচ্ছিক। ছবি আপলোড ব্যর্থ হলেও খরচ সংরক্ষিত হবে।</p>
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
