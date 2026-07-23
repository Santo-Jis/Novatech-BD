import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiPlus, FiX, FiLoader, FiArrowUpCircle, FiSearch, FiPaperclip, FiImage } from 'react-icons/fi'
import platformApi from './api/platformApi'
import StatusBadge from './components/StatusBadge'
import { LoadingState, ErrorState, EmptyState } from './components/PanelStates'

const FILTERS = [
  { value: 'mine', label: 'আমার বরাদ্দ' },
  { value: 'unassigned', label: 'অবরাদ্দকৃত' },
  { value: '', label: 'সব' },
]

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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pf-primary-700 text-white text-sm font-semibold hover:brightness-110"
        >
          <FiPlus /> নতুন টিকেট
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-pf-text-muted text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="subject বা টেন্যান্ট নাম দিয়ে খুঁজুন"
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
                  <p className="text-sm font-medium text-pf-text-primary truncate">{t.subject}</p>
                  <p className="text-xs text-pf-text-muted truncate">{t.company_name || 'কোনো টেন্যান্ট যুক্ত নেই'}</p>
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
            setSelected(updated)
          }}
        />
      )}

      {showCreate && (
        <CreateTicketModal
          defaultTenantId={searchParams.get('tenant_id') || ''}
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
  const [note, setNote] = useState(ticket.resolution_note || '')
  const [saving, setSaving] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const attachments = Array.isArray(ticket.attachment_urls) ? ticket.attachment_urls : []

  const save = async () => {
    setSaving(true)
    try {
      const res = await platformApi.patch(`/support/tickets/${ticket.id}`, {
        status,
        resolution_note: note,
      })
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-pf-bg-surface w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 py-4 border-b border-pf-border">
          <div>
            <h2 className="font-pf-head font-semibold text-pf-primary-700">{ticket.subject}</h2>
            <p className="text-xs text-pf-text-muted mt-0.5">{ticket.company_name || 'কোনো টেন্যান্ট যুক্ত নেই'}</p>
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

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">স্ট্যাটাস</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">নোট (append-only timeline)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm resize-none"
              placeholder="কী করা হলো লিখুন..."
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
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
        </div>
      </div>
    </div>
  )
}

function CreateTicketModal({ defaultTenantId, onClose, onCreated }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [tenantId, setTenantId] = useState(defaultTenantId)
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
            <label className="block text-xs font-semibold text-pf-text-secondary mb-1.5">Tenant ID (ঐচ্ছিক)</label>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-pf-border bg-pf-bg-surface text-sm font-pf-mono"
              placeholder="টেন্যান্ট পেজ থেকে এলে অটো-ফিল থাকবে"
            />
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
