import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiPlus, FiX, FiLoader, FiArrowUpCircle, FiSearch, FiPaperclip, FiImage, FiSend, FiBookOpen, FiDownload } from 'react-icons/fi'
import platformApi from './api/platformApi'
import StatusBadge from './components/StatusBadge'
import PriorityBadge, { PRIORITY_OPTIONS } from './components/PriorityBadge'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const FILTERS = [
  { value: 'mine', label: 'আমার বরাদ্দ' },
  { value: 'unassigned', label: 'অবরাদ্দকৃত' },
  { value: '', label: 'সব' },
]

// সাধারণ CSV export helper — কোনো ব্যাকএন্ড কল লাগে না, বর্তমানে
// লোড হওয়া (ফিল্টার করা) ডেটা থেকেই সরাসরি ডাউনলোড হয়ে যায়।
function downloadCSV(rows, columns, filename) {
  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => c.label).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(c.get(row))).join(','))
  const csv = '\uFEFF' + [header, ...lines].join('\n') // BOM যোগ — Excel-এ বাংলা ঠিকভাবে দেখাবে
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState('mine')
  const [search, setSearch] = useState('')
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filter === 'mine') params.mine = true
      if (search.trim()) params.search = search.trim()
      // 'unassigned' filtering হয় client-side, backend-এ explicit flag নেই
      const res = await platformApi.get('/support/tickets', { params })
      let rows = res.data.data
      if (filter === 'unassigned') rows = rows.filter((t) => !t.assigned_to)
      setTickets(rows)
    } catch (err) {
      if (!err._toastShown) setError('টিকেট তালিকা লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    load()
  }, [load])

  // Deep link from Dashboard: ?ticket=<id>
  useEffect(() => {
    const ticketId = searchParams.get('ticket')
    if (ticketId && tickets) {
      const t = tickets.find((x) => x.id === ticketId)
      if (t) setSelected(t)
    }
  }, [searchParams, tickets])

  const closeCreate = () => {
    setShowCreate(false)
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">সাপোর্ট টিকেট</h1>
          <p className="text-pf-text-secondary text-sm mt-1">কাস্টমার/টেন্যান্ট সংক্রান্ত সাপোর্ট টিকেট পরিচালনা</p>
        </div>
        <div className="flex items-center gap-2">
          {tickets && tickets.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  tickets,
                  [
                    { label: 'Subject', get: (t) => t.subject },
                    { label: 'Tenant/Customer', get: (t) => t.customer_shop_name || t.company_name || '' },
                    { label: 'Status', get: (t) => t.status },
                    { label: 'Priority', get: (t) => t.priority },
                    { label: 'Created At', get: (t) => new Date(t.created_at).toISOString() },
                  ],
                  `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-pf-border text-pf-text-primary text-sm font-semibold hover:border-pf-primary-500"
            >
              <FiDownload /> CSV
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
          >
            <FiPlus /> নতুন টিকেট
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="subject, টেন্যান্ট বা কাস্টমার নাম দিয়ে খুঁজুন"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm
              focus:outline-none focus:ring-2 focus:ring-pf-primary-700/20 focus:border-pf-primary-700"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                filter === f.value
                  ? 'bg-pf-primary-700 text-white'
                  : 'bg-pf-bg-surface border border-pf-border text-pf-text-secondary hover:border-pf-primary-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingState label="টিকেট লোড হচ্ছে..." />}
      {!loading && error && <ErrorState description={error} onRetry={load} />}

      {!loading && !error && tickets && tickets.length === 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl">
          <EmptyState title="কোনো টিকেট নেই" description="এই ফিল্টারে কোনো টিকেট পাওয়া যায়নি।" />
        </div>
      )}

      {!loading && !error && tickets && tickets.length > 0 && (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl divide-y divide-pf-border overflow-hidden">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-pf-bg-alt transition-colors text-left"
            >
              <div className="min-w-0 flex items-center gap-2">
                {Array.isArray(t.attachment_urls) && t.attachment_urls.length > 0 && (
                  <FiPaperclip className="text-pf-text-muted flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-pf-text-primary truncate">{t.subject}</p>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <p className="text-xs text-pf-text-muted truncate">
                    {t.customer_shop_name || t.company_name || 'কোনো টেন্যান্ট/কাস্টমার যুক্ত নেই'}
                  </p>
                </div>
              </div>
              <StatusBadge status={t.status} />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <TicketDetailModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
            setSelected((prev) => ({ ...prev, ...updated }))
          }}
        />
      )}

      {showCreate && (
        <CreateTicketModal
          defaultTenantId={searchParams.get('tenant_id') || ''}
          defaultCustomerId={searchParams.get('customer_id') || ''}
          onClose={closeCreate}
          onCreated={(t) => {
            closeCreate()
            setTickets((prev) => (prev ? [t, ...prev] : [t]))
            toast.success('টিকেট তৈরি হয়েছে।')
          }}
        />
      )}
    </div>
  )
}

const STATUS_OPTIONS = ['open', 'in_progress', 'escalated', 'closed']

function TicketDetailModal({ ticket, onClose, onUpdated }) {
  const [status, setStatus] = useState(ticket.status)
  const [priority, setPriority] = useState(ticket.priority || 'normal')
  const [saving, setSaving] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState(null)
  const [notesLoading, setNotesLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [canned, setCanned] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const attachments = Array.isArray(ticket.attachment_urls) ? ticket.attachment_urls : []

  useEffect(() => {
    const loadNotes = async () => {
      setNotesLoading(true)
      try {
        const res = await platformApi.get(`/support/tickets/${ticket.id}/notes`)
        setNotes(res.data.data)
      } catch {
        setNotes([])
      } finally {
        setNotesLoading(false)
      }
    }
    loadNotes()

    platformApi.get('/support/canned-responses').then(
      (res) => setCanned(res.data.data),
      () => setCanned([])
    )
  }, [ticket.id])

  const addNewTemplate = async () => {
    const title = window.prompt('টেমপ্লেটের নাম (যেমন: "পাসওয়ার্ড রিসেট নির্দেশনা")')
    if (!title?.trim()) return
    const body = window.prompt('টেমপ্লেটের লেখা:')
    if (!body?.trim()) return
    try {
      const res = await platformApi.post('/support/canned-responses', { title: title.trim(), body: body.trim() })
      setCanned((prev) => [...(prev || []), res.data.data])
      toast.success('টেমপ্লেট যোগ হয়েছে।')
    } catch {
      toast.error('টেমপ্লেট যোগ করা যায়নি।')
    }
  }

  const deleteSelectedTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error('আগে ড্রপডাউন থেকে একটা টেমপ্লেট বেছে নিন।')
      return
    }
    const tpl = canned?.find((c) => c.id === selectedTemplateId)
    if (!window.confirm(`"${tpl?.title}" টেমপ্লেটটা মুছে ফেলতে চান?`)) return
    try {
      await platformApi.delete(`/support/canned-responses/${selectedTemplateId}`)
      setCanned((prev) => prev.filter((c) => c.id !== selectedTemplateId))
      setSelectedTemplateId('')
      toast.success('টেমপ্লেট মুছে ফেলা হয়েছে।')
    } catch {
      toast.error('মুছে ফেলা যায়নি।')
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await platformApi.patch(`/support/tickets/${ticket.id}`, { status, priority })
      onUpdated(res.data.data)
      toast.success('আপডেট হয়েছে।')
    } catch (err) {
      if (!err._toastShown) toast.error('আপডেট করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  const escalate = async () => {
    setEscalating(true)
    try {
      const res = await platformApi.patch(`/support/tickets/${ticket.id}`, {
        status: 'escalated',
        assigned_to: null,
      })
      onUpdated(res.data.data)
      setStatus('escalated')
      toast.success('Full scope-এ escalate করা হয়েছে।')
    } catch (err) {
      if (!err._toastShown) toast.error('Escalate করা যায়নি।')
    } finally {
      setEscalating(false)
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('attachment', file)
      const res = await platformApi.post(`/support/tickets/${ticket.id}/attachment`, formData, {
        headers: { 'Content-Type': undefined },
      })
      onUpdated(res.data.data)
      toast.success('স্ক্রিনশট যোগ হয়েছে।')
    } catch (err) {
      if (!err._toastShown) toast.error('আপলোড করা যায়নি।')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const submitNote = async (e) => {
    e.preventDefault()
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const res = await platformApi.post(`/support/tickets/${ticket.id}/notes`, { note: newNote.trim() })
      setNotes((prev) => [...(prev || []), res.data.data])
      setNewNote('')
    } catch (err) {
      if (!err._toastShown) toast.error('নোট যোগ করা যায়নি।')
    } finally {
      setAddingNote(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-pf-bg-surface w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 py-4 border-b border-pf-border">
          <div>
            <h2 className="font-pf-head font-semibold text-pf-primary-700">{ticket.subject}</h2>
            <p className="text-xs text-pf-text-muted mt-0.5">
              {ticket.customer_shop_name || ticket.company_name || 'কোনো টেন্যান্ট/কাস্টমার যুক্ত নেই'}
            </p>
          </div>
          <button onClick={onClose} className="text-pf-text-muted hover:text-pf-text-primary p-1">
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {ticket.description && (
            <p className="text-sm text-pf-text-secondary bg-pf-bg-alt rounded-lg p-3">{ticket.description}</p>
          )}

          {attachments.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">স্ক্রিনশট/সংযুক্তি</label>
              <div className="flex flex-wrap gap-2">
                {attachments.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`attachment-${i}`} className="w-16 h-16 object-cover rounded-lg border border-pf-border" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-pf-primary-700 cursor-pointer w-fit">
              {uploading ? <FiLoader className="animate-spin" /> : <FiImage />}
              স্ক্রিনশট যোগ করুন
              <input type="file" accept="image/*" onChange={handleFileSelect} disabled={uploading} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">স্ট্যাটাস</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">অগ্রাধিকার</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold
                hover:brightness-110 disabled:opacity-60"
            >
              {saving && <FiLoader className="animate-spin" />}
              সংরক্ষণ করুন
            </button>
            <button
              onClick={escalate}
              disabled={escalating || status === 'escalated'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-pf-warning text-pf-warning text-sm font-semibold
                hover:bg-pf-warning-bg disabled:opacity-40"
            >
              {escalating ? <FiLoader className="animate-spin" /> : <FiArrowUpCircle />}
              Escalate to Full
            </button>
          </div>

          {/* ── Notes timeline (append-only) ── */}
          <div className="pt-2 border-t border-pf-border">
            <label className="block text-xs font-semibold text-pf-text-secondary mb-2">
              কাজের নোট (timeline — কখনো মুছে যায় না)
            </label>

            {notesLoading && <p className="text-xs text-pf-text-muted">লোড হচ্ছে...</p>}

            {!notesLoading && notes && notes.length === 0 && (
              <p className="text-xs text-pf-text-muted">এখনো কোনো নোট নেই।</p>
            )}

            {!notesLoading && notes && notes.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {notes.map((n) => (
                  <div key={n.id} className="bg-pf-bg-alt rounded-lg px-3 py-2">
                    <p className="text-sm text-pf-text-primary whitespace-pre-wrap">{n.note}</p>
                    <p className="text-[11px] text-pf-text-muted mt-1">
                      {n.staff_name || 'Staff'} · {new Date(n.created_at).toLocaleString('bn-BD')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={submitNote} className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value)
                    const tpl = canned?.find((c) => c.id === e.target.value)
                    if (tpl) setNewNote((prev) => (prev ? `${prev}\n${tpl.body}` : tpl.body))
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-pf-border bg-pf-bg-surface text-xs"
                >
                  <option value="">টেমপ্লেট বেছে নিন...</option>
                  {(canned || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addNewTemplate}
                  title="নতুন টেমপ্লেট যোগ করুন"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-pf-border text-xs text-pf-text-secondary hover:border-pf-primary-500 flex-shrink-0"
                >
                  <FiBookOpen /> +
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedTemplate}
                  disabled={!selectedTemplateId}
                  title="বেছে নেওয়া টেমপ্লেট মুছুন"
                  className="flex items-center px-2.5 py-1.5 rounded-lg border border-pf-border text-xs text-pf-error hover:border-pf-error disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <FiX />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="নতুন নোট লিখুন..."
                  className="flex-1 px-3 py-2 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
                />
                <button
                  type="submit"
                  disabled={addingNote || !newNote.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold
                    hover:brightness-110 disabled:opacity-50"
                >
                  {addingNote ? <FiLoader className="animate-spin" /> : <FiSend />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateTicketModal({ defaultTenantId, defaultCustomerId, onClose, onCreated }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [tenantId, setTenantId] = useState(defaultTenantId)
  const [customerId, setCustomerId] = useState(defaultCustomerId)
  const [priority, setPriority] = useState('normal')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!subject.trim()) {
      setError('subject আবশ্যক')
      return
    }
    setSaving(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('subject', subject.trim())
      if (description.trim()) formData.append('description', description.trim())
      if (tenantId) formData.append('tenant_id', tenantId)
      if (customerId) formData.append('customer_id', customerId)
      formData.append('priority', priority)
      if (file) formData.append('attachment', file)

      const res = await platformApi.post('/support/tickets', formData, {
        headers: { 'Content-Type': undefined },
      })
      onCreated(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'টিকেট তৈরি করা যায়নি।')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={submit}
        className="bg-pf-bg-surface w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-pf-border">
          <h2 className="font-pf-head font-semibold text-pf-primary-700">নতুন টিকেট তৈরি করুন</h2>
          <button type="button" onClick={onClose} className="text-pf-text-muted hover:text-pf-text-primary p-1">
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-pf-error-bg text-pf-error text-sm rounded-lg px-3.5 py-2.5">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
              placeholder="সংক্ষেপে সমস্যাটি লিখুন"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">বিবরণ (ঐচ্ছিক)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">অগ্রাধিকার</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Tenant ID (ঐচ্ছিক)</label>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm font-pf-mono"
                placeholder="টেন্যান্ট পেজ থেকে এলে অটো-ফিল"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Customer ID (ঐচ্ছিক)</label>
              <input
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm font-pf-mono"
                placeholder="User Lookup থেকে এলে অটো-ফিল"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-pf-primary-700 cursor-pointer w-fit">
              <FiImage />
              {file ? file.name : 'স্ক্রিনশট যোগ করুন (ঐচ্ছিক)'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white
              text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {saving && <FiLoader className="animate-spin" />}
            তৈরি করুন
          </button>
        </div>
      </form>
    </div>
  )
}
