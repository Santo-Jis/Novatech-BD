// components/ComplaintsTab.jsx
// ✅ NEW (Session 18) — Complaints ট্যাব redesign
//
// InvoicesTab.jsx/PaymentsTab.jsx/CreditTab.jsx-এর মতোই প্যাটার্ন: self-contained,
// aggregate + company-ট্যাগ (01-Requirements-Spec.md ধারা ৩.১), সেশন
// সুইচ করার দরকার নেই।
//
// ব্যবহৃত এন্ডপয়েন্ট:
//  - GET  /portal/connections/all-complaints  (Session 18)
//  - POST /portal/connections/complaint       (Session 18, body:
//    { connection_id, type, subject, description } — session-switch ছাড়াই
//    connection_id দিয়ে টার্গেট কোম্পানি বেছে নেওয়া হয়)

import { useState, useEffect, useCallback } from 'react'
import { FiSend, FiClock, FiPlus, FiX } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import CpInput from './ui/CpInput'
import { fmtDate } from '../utils/helpers'

const TYPE_OPTS = [
  { v: 'complaint',      l: '⚠️ অভিযোগ' },
  { v: 'feedback',       l: '💬 ফিডব্যাক' },
  { v: 'delivery_issue', l: '🚚 ডেলিভারি সমস্যা' },
  { v: 'product_issue',  l: '📦 পণ্য সমস্যা' },
  { v: 'payment_issue',  l: '💳 পেমেন্ট সমস্যা' },
  { v: 'other',          l: '📌 অন্যান্য' },
]

const STATUS_LABEL = {
  open:        { text: '● খোলা',          cls: 'bg-cp-error/10 text-cp-error' },
  in_progress: { text: '● প্রক্রিয়াধীন', cls: 'bg-cp-trust-500/10 text-cp-trust-700' },
  resolved:    { text: '● সমাধান হয়েছে',  cls: 'bg-cp-success/10 text-cp-success' },
}

export default function ComplaintsTab({ portalJWT }) {
  const [companies,  setCompanies]  = useState([])
  const [complaints, setComplaints] = useState([])

  const [listLoading, setListLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // ── ফর্ম state ──────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [type, setType] = useState('complaint')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  const authHeader = { headers: { Authorization: `Bearer ${portalJWT}` } }

  const loadCompanies = useCallback(async () => {
    try {
      const res = await portalFetch('/portal/connections/my-companies', authHeader)
      const rows = res.data || []
      setCompanies(rows)
      if (rows.length === 1) setSelectedConnectionId(String(rows[0].connection_id))
    } catch {
      setCompanies([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadComplaints = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await portalFetch('/portal/connections/all-complaints', authHeader)
      setComplaints(res.data || [])
    } catch {
      setErrorMsg('অভিযোগের তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setListLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadCompanies()
    loadComplaints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const companyName = (co) => co.company_name_bn || co.company_name

  const resetForm = () => {
    setType('complaint')
    setSubject('')
    setDescription('')
    setSubmitError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess('')

    if (!selectedConnectionId) {
      setSubmitError('কোন কোম্পানির জন্য অভিযোগ করছেন, তা বেছে নিন।')
      return
    }
    if (!subject.trim() || !description.trim()) {
      setSubmitError('বিষয় ও বিস্তারিত বিবরণ দিন।')
      return
    }

    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/connections/complaint', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          type,
          subject: subject.trim(),
          description: description.trim(),
        }),
      })
      setSubmitSuccess(res.message || 'অভিযোগ/ফিডব্যাক সফলভাবে জমা হয়েছে।')
      resetForm()
      setFormOpen(false)
      loadComplaints()
    } catch (err) {
      setSubmitError(err?.message || 'অভিযোগ জমা দিতে সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── নতুন অভিযোগ ফর্ম টগল ── */}
      {!formOpen ? (
        <button
          type="button"
          onClick={() => { setFormOpen(true); setSubmitSuccess('') }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cp-error/30 bg-white py-3.5 text-[13px] font-bold text-cp-error"
        >
          <FiPlus className="w-4 h-4" /> নতুন অভিযোগ / ফিডব্যাক দিন
        </button>
      ) : (
        <CpCard variant="alt" padding="md" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-cp-text-primary">📣 অভিযোগ / ফিডব্যাক</h3>
            <button type="button" onClick={() => { setFormOpen(false); resetForm() }} className="text-cp-text-muted">
              <FiX className="w-4 h-4" />
            </button>
          </div>

          {companies.length > 1 && (
            <div>
              <p className="text-[11px] font-semibold text-cp-text-secondary mb-2">কোন কোম্পানির জন্য</p>
              <div className="flex flex-wrap gap-1.5">
                {companies.map((co) => (
                  <button
                    key={co.connection_id}
                    type="button"
                    onClick={() => setSelectedConnectionId(String(co.connection_id))}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors truncate max-w-[140px] ${
                      selectedConnectionId === String(co.connection_id)
                        ? 'bg-cp-trust-500 text-white border-cp-trust-500'
                        : 'bg-white text-cp-text-secondary border-cp-border'
                    }`}
                  >
                    {companyName(co)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-cp-text-secondary mb-1.5">ধরন</label>
              <div className="flex flex-wrap gap-1.5">
                {TYPE_OPTS.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setType(t.v)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                      type === t.v
                        ? 'bg-cp-error/10 text-cp-error border-cp-error/40'
                        : 'bg-white text-cp-text-secondary border-cp-border'
                    }`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
            </div>

            <CpInput
              label="বিষয়"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="সংক্ষেপে বিষয়টি লিখুন..."
            />

            <div>
              <label className="block text-[11px] font-semibold text-cp-text-secondary mb-1.5">বিস্তারিত</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="সমস্যাটি বিস্তারিত লিখুন..."
                className="w-full rounded-xl border border-cp-border bg-white px-3 py-2 text-[13px] text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500 resize-none"
              />
            </div>

            {submitError && <p className="text-[12px] text-cp-error">{submitError}</p>}

            <div className="grid grid-cols-2 gap-2.5">
              <CpButton type="button" variant="secondary" onClick={() => { setFormOpen(false); resetForm() }}>
                বাতিল
              </CpButton>
              <CpButton type="submit" variant="danger" icon={FiSend} loading={submitting}>
                জমা দিন
              </CpButton>
            </div>
          </form>
        </CpCard>
      )}

      {submitSuccess && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-success">{submitSuccess}</p>
        </CpCard>
      )}

      {errorMsg && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
        </CpCard>
      )}

      {/* ── অভিযোগের ইতিহাস ── */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold text-cp-text-primary flex items-center gap-1.5">
          <FiClock className="w-3.5 h-3.5" /> অভিযোগের ইতিহাস
        </h3>

        {listLoading ? (
          [...Array(2)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-cp-border animate-pulse" />
          ))
        ) : complaints.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-cp-text-muted text-[13px]">কোনো অভিযোগ নেই।</p>
          </div>
        ) : (
          complaints.map((c) => {
            const status = STATUS_LABEL[c.status] || STATUS_LABEL.open
            const t = TYPE_OPTS.find((o) => o.v === c.type)
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-cp-border px-4 py-3 flex flex-col gap-1.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {companies.length > 1 && (
                      <span className="inline-block text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5 mb-1">
                        {c.company_name_bn || c.company_name}
                      </span>
                    )}
                    <p className="text-[13px] font-bold text-cp-text-primary">{c.subject}</p>
                    <p className="text-[10px] text-cp-text-muted mt-0.5">{t?.l || c.type} • {fmtDate(c.created_at)}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
                <p className="text-[12px] text-cp-text-secondary leading-relaxed">{c.description}</p>
                {c.admin_reply && (
                  <div className="bg-cp-success/5 border-l-2 border-cp-success rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold text-cp-success mb-0.5">📋 কর্তৃপক্ষের উত্তর:</p>
                    <p className="text-[12px] text-cp-success leading-relaxed">{c.admin_reply}</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
