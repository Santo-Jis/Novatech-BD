// components/ReturnsTab.jsx
// ✅ NEW (Session 19) — Returns ট্যাব redesign
//
// InvoicesTab.jsx/PaymentsTab.jsx/CreditTab.jsx/ComplaintsTab.jsx-এর মতোই
// প্যাটার্ন: self-contained, aggregate + company-ট্যাগ (01-Requirements-
// Spec.md ধারা ৩.১), সেশন সুইচ করার দরকার নেই।
//
// দুইটা ডেটা সোর্স (পুরনো single-company UX-এর মতোই দুইটা সাব-ট্যাব):
//  - "আমার অনুরোধ": কাস্টমারের নিজের জমা দেওয়া ফেরত/রিপ্লেসমেন্ট অনুরোধ
//    (customer_return_requests টেবিল) — GET /all-return-requests,
//    POST /return-request
//  - "SR রেকর্ড": বিক্রির সময় SR কর্তৃক প্রসেস করা রিপ্লেসমেন্ট (sales_
//    transactions.replacement_value > 0) — GET /all-sr-returns (শুধু পড়া)

import { useState, useEffect, useCallback } from 'react'
import { FiSend, FiPlus, FiX, FiPackage } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import CpInput from './ui/CpInput'
import { fmt, fmtDate } from '../utils/helpers'

const STATUS_LABEL = {
  pending:   { text: '● অপেক্ষমাণ', cls: 'bg-cp-warning/10 text-cp-warning' },
  approved:  { text: '● অনুমোদিত',  cls: 'bg-cp-trust-500/10 text-cp-trust-700' },
  rejected:  { text: '● প্রত্যাখ্যাত', cls: 'bg-cp-error/10 text-cp-error' },
  completed: { text: '● সম্পন্ন',    cls: 'bg-cp-success/10 text-cp-success' },
}
const STATUS_FILTERS = [
  { v: 'all',       l: 'সব' },
  { v: 'pending',   l: '⏳ অপেক্ষমাণ' },
  { v: 'approved',  l: '✅ অনুমোদিত' },
  { v: 'rejected',  l: '❌ বাতিল' },
  { v: 'completed', l: '✔ সম্পন্ন' },
]
const TYPE_OPTS = [
  { v: 'return',      l: '↩️ পণ্য ফেরত' },
  { v: 'replacement', l: '🔄 রিপ্লেসমেন্ট' },
]

const emptyItem = () => ({ product_name: '', qty: 1, reason: '' })

export default function ReturnsTab({ portalJWT }) {
  const [subTab, setSubTab] = useState('requests') // 'requests' | 'sr_records'

  const [companies, setCompanies] = useState([])
  const [requests,  setRequests]  = useState([])
  const [srRecords, setSrRecords] = useState([])

  const [reqLoading, setReqLoading] = useState(true)
  const [srLoading,  setSrLoading]  = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [errorMsg, setErrorMsg] = useState('')

  // ── ফর্ম state ──────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [type, setType] = useState('return')
  const [items, setItems] = useState([emptyItem()])
  const [note, setNote] = useState('')
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

  const loadRequests = useCallback(async (status = statusFilter) => {
    setReqLoading(true)
    try {
      const qs = status && status !== 'all' ? `?status=${status}` : ''
      const res = await portalFetch(`/portal/connections/all-return-requests${qs}`, authHeader)
      setRequests(res.data || [])
    } catch {
      setErrorMsg('ফেরত অনুরোধের তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setReqLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const loadSrRecords = useCallback(async () => {
    setSrLoading(true)
    try {
      const res = await portalFetch('/portal/connections/all-sr-returns', authHeader)
      setSrRecords(res.data || [])
    } catch {
      setErrorMsg('SR রেকর্ড আনতে সমস্যা হয়েছে।')
    } finally {
      setSrLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadCompanies()
    loadRequests('all')
    loadSrRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const companyName = (co) => co.company_name_bn || co.company_name

  const resetForm = () => {
    setInvoiceNumber('')
    setType('return')
    setItems([emptyItem()])
    setNote('')
    setSubmitError('')
  }

  const updateItem = (idx, key, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess('')

    if (!selectedConnectionId) {
      setSubmitError('কোন কোম্পানির জন্য অনুরোধ করছেন, তা বেছে নিন।')
      return
    }
    if (!invoiceNumber.trim()) {
      setSubmitError('ইনভয়েস নম্বর দিন।')
      return
    }
    for (const item of items) {
      if (!item.product_name.trim() || !item.qty || parseInt(item.qty) <= 0) {
        setSubmitError('প্রতিটি পণ্যের নাম ও সঠিক পরিমাণ দিন।')
        return
      }
      if (!item.reason.trim()) {
        setSubmitError('প্রতিটি পণ্যের ফেরতের কারণ দিন।')
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/connections/return-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          invoice_number: invoiceNumber.trim(),
          type,
          items: items.map((it) => ({ ...it, qty: parseInt(it.qty) })),
          note: note.trim() || undefined,
        }),
      })
      setSubmitSuccess(res.message || 'অনুরোধ পাঠানো হয়েছে।')
      resetForm()
      setFormOpen(false)
      loadRequests(statusFilter)
    } catch (err) {
      setSubmitError(err?.message || 'অনুরোধ পাঠাতে সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── সাব-ট্যাব টগল ── */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-cp-bg-alt rounded-2xl p-1 flex-1">
          {[{ id: 'requests', l: '📋 আমার অনুরোধ' }, { id: 'sr_records', l: '📦 SR রেকর্ড' }].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setSubTab(st.id)}
              className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                subTab === st.id ? 'bg-white text-cp-trust-700 shadow-sm' : 'text-cp-text-muted'
              }`}
            >
              {st.l}
            </button>
          ))}
        </div>
        {subTab === 'requests' && !formOpen && (
          <button
            type="button"
            onClick={() => { setFormOpen(true); setSubmitSuccess('') }}
            className="flex items-center gap-1 bg-cp-trust-500 text-white rounded-xl px-3.5 py-2 text-[12px] font-bold flex-shrink-0"
          >
            <FiPlus className="w-3.5 h-3.5" /> নতুন
          </button>
        )}
      </div>

      {errorMsg && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
        </CpCard>
      )}

      {subTab === 'requests' && (
        <>
          {formOpen && (
            <CpCard variant="alt" padding="md" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-cp-text-primary">↩️ পণ্য ফেরত / রিপ্লেসমেন্ট অনুরোধ</h3>
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
                <CpInput
                  label="ইনভয়েস নম্বর"
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="যেমন: INV-2026-001"
                />

                <div>
                  <label className="block text-[11px] font-semibold text-cp-text-secondary mb-1.5">ধরন</label>
                  <div className="flex gap-2">
                    {TYPE_OPTS.map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        onClick={() => setType(t.v)}
                        className={`flex-1 py-2 rounded-xl text-[12px] font-bold border-2 transition-colors ${
                          type === t.v
                            ? 'bg-cp-trust-500/10 text-cp-trust-700 border-cp-trust-500'
                            : 'bg-white text-cp-text-secondary border-cp-border'
                        }`}
                      >
                        {t.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-semibold text-cp-text-secondary">পণ্য তালিকা</label>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => [...prev, emptyItem()])}
                      className="text-[11px] font-bold text-cp-trust-700 bg-cp-trust-500/10 rounded-lg px-2.5 py-1"
                    >
                      + পণ্য যোগ
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-white border border-cp-border rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-cp-text-muted">পণ্য #{idx + 1}</p>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-[10px] font-bold text-cp-error bg-cp-error/10 rounded-md px-2 py-0.5"
                            >
                              বাদ
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="পণ্যের নাম"
                          value={item.product_name}
                          onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                          className="w-full rounded-lg border border-cp-border px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40"
                        />
                        <input
                          type="number"
                          min="1"
                          placeholder="পরিমাণ"
                          value={item.qty}
                          onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                          className="w-full rounded-lg border border-cp-border px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40"
                        />
                        <input
                          type="text"
                          placeholder="ফেরতের কারণ"
                          value={item.reason}
                          onChange={(e) => updateItem(idx, 'reason', e.target.value)}
                          className="w-full rounded-lg border border-cp-border px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-cp-text-secondary mb-1.5">অতিরিক্ত নোট (ঐচ্ছিক)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="বিস্তারিত লিখুন..."
                    className="w-full rounded-xl border border-cp-border bg-white px-3 py-2 text-[13px] text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500 resize-none"
                  />
                </div>

                {submitError && <p className="text-[12px] text-cp-error">{submitError}</p>}

                <CpButton type="submit" variant="action" fullWidth icon={FiSend} loading={submitting}>
                  অনুরোধ পাঠান
                </CpButton>
              </form>
            </CpCard>
          )}

          {submitSuccess && (
            <CpCard variant="alt" padding="sm">
              <p className="text-[12px] text-cp-success">{submitSuccess}</p>
            </CpCard>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => { setStatusFilter(f.v); loadRequests(f.v) }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${
                  statusFilter === f.v ? 'bg-cp-trust-500 text-white' : 'bg-cp-bg-alt text-cp-text-secondary'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {reqLoading ? (
              [...Array(2)].map((_, i) => (
                <div key={i} className="h-28 bg-white rounded-2xl border border-cp-border animate-pulse" />
              ))
            ) : requests.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">↩️</p>
                <p className="text-cp-text-muted text-[13px]">কোনো ফেরত অনুরোধ নেই।</p>
              </div>
            ) : (
              requests.map((r) => {
                const status = STATUS_LABEL[r.status] || STATUS_LABEL.pending
                let pi = []
                try { pi = Array.isArray(r.items) ? r.items : JSON.parse(r.items || '[]') } catch { /* noop */ }
                return (
                  <div key={r.id} className="bg-white rounded-2xl border border-cp-border overflow-hidden">
                    <div className="bg-cp-bg-alt px-4 py-2.5 border-b border-cp-border flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        {companies.length > 1 && (
                          <span className="inline-block text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5 mb-1">
                            {r.company_name_bn || r.company_name}
                          </span>
                        )}
                        <p className="text-[13px] font-extrabold text-cp-text-primary">INV: {r.invoice_number}</p>
                        <p className="text-[10px] text-cp-text-muted mt-0.5">{r.type_bn || r.type} • {fmtDate(r.created_at)}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}>
                        {status.text}
                      </span>
                    </div>
                    <div className="px-4 py-2.5">
                      {pi.slice(0, 3).map((item, j) => (
                        <div key={j} className="pb-1.5 mb-1.5 border-b border-cp-bg-alt last:border-0 last:pb-0 last:mb-0">
                          <p className="text-[12px] font-bold text-cp-text-primary">{item.product_name}</p>
                          <p className="text-[11px] text-cp-text-muted">পরিমাণ: {item.qty} • {item.reason}</p>
                        </div>
                      ))}
                      {pi.length > 3 && <p className="text-[11px] text-cp-text-muted">+{pi.length - 3}টি আরো</p>}
                      {r.total_return_value > 0 && (
                        <p className="text-[12px] font-bold text-cp-trust-700 mt-1.5">আনুমানিক: ৳{fmt(r.total_return_value)}</p>
                      )}
                    </div>
                    {r.admin_note && (
                      <div className={`mx-3 mb-3 rounded-lg px-3 py-2 ${r.status === 'rejected' ? 'bg-cp-error/5' : 'bg-cp-success/5'}`}>
                        <p className={`text-[11px] font-medium ${r.status === 'rejected' ? 'text-cp-error' : 'text-cp-success'}`}>
                          💬 কর্তৃপক্ষ: {r.admin_note}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {subTab === 'sr_records' && (
        <div className="flex flex-col gap-2">
          {srLoading ? (
            [...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-cp-border animate-pulse" />
            ))
          ) : srRecords.length === 0 ? (
            <div className="text-center py-8">
              <FiPackage className="w-8 h-8 text-cp-text-muted mx-auto mb-2" />
              <p className="text-cp-text-muted text-[13px]">কোনো SR রেকর্ড নেই।</p>
            </div>
          ) : (
            <>
              <div className="bg-cp-warning/5 border border-cp-warning/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-[20px]">ℹ️</span>
                <p className="text-[12px] text-cp-warning leading-relaxed">
                  SR কর্তৃক বিক্রির সময় প্রদত্ত পণ্য বদল/রিপ্লেসমেন্টের রেকর্ড। মোট <strong>{srRecords.length}টি</strong> এন্ট্রি।
                </p>
              </div>
              {srRecords.map((r, i) => {
                const srItems = Array.isArray(r.replacement_items) ? r.replacement_items : []
                return (
                  <div key={i} className="bg-white rounded-2xl border border-cp-border overflow-hidden">
                    <div className="bg-cp-warning/5 px-4 py-2.5 border-b border-cp-warning/10 flex justify-between items-center">
                      <div className="min-w-0">
                        {companies.length > 1 && (
                          <span className="inline-block text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5 mb-1">
                            {r.company_name_bn || r.company_name}
                          </span>
                        )}
                        <p className="text-[12px] font-extrabold text-cp-warning">INV: {r.invoice_number}</p>
                        <p className="text-[10px] text-cp-warning/80 mt-0.5">{r.sr_name || '—'} • {fmtDate(r.created_at)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[14px] font-extrabold text-cp-warning">৳{fmt(r.replacement_value)}</p>
                        <p className="text-[10px] text-cp-warning/80">পণ্যের মূল্য</p>
                      </div>
                    </div>
                    {srItems.length > 0 && (
                      <div className="px-4 py-2">
                        {srItems.map((item, j) => (
                          <div key={j} className="flex justify-between items-center py-1.5 border-b border-cp-bg-alt last:border-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-cp-text-primary">{item.product_name}</p>
                              <p className="text-[11px] text-cp-text-muted">
                                {item.qty} × ৳{fmt(item.unit_price)}
                                {item.vat_rate > 0 ? ` (+${(item.vat_rate * 100).toFixed(0)}% VAT)` : ''}
                              </p>
                            </div>
                            <p className="text-[12px] font-bold text-cp-text-primary ml-2">৳{fmt(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {parseFloat(r.credit_balance_added || 0) > 0 && (
                      <div className="mx-3 mb-3 bg-cp-success/5 border border-cp-success/20 rounded-lg px-3 py-2 flex justify-between">
                        <p className="text-[11px] font-semibold text-cp-success">💰 ক্রেডিট ব্যালেন্সে যোগ</p>
                        <p className="text-[11px] font-extrabold text-cp-success">+৳{fmt(r.credit_balance_added)}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
