// components/CreditTab.jsx
// ✅ NEW (Session 16) — Credit ট্যাব redesign
//
// InvoicesTab.jsx/PaymentsTab.jsx-এর মতোই প্যাটার্ন: self-contained,
// aggregate + company-ট্যাগ (01-Requirements-Spec.md ধারা ৩.১), সেশন
// সুইচ করার দরকার নেই।
//
// ব্যবহৃত এন্ডপয়েন্ট:
//  - GET  /portal/connections/all-credit-summary  (Session 13-এ বানানো)
//  - GET  /portal/connections/all-limit-requests   (Session 16)
//  - POST /portal/connections/limit-request        (Session 16, body:
//    { connection_id, requested_amount, reason } — session-switch ছাড়াই
//    connection_id দিয়ে টার্গেট কোম্পানি বেছে নেওয়া হয়)

import { useState, useEffect, useCallback } from 'react'
import { FiSend, FiClock } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import CpInput from './ui/CpInput'
import { fmt, fmtDate } from '../utils/helpers'

const STATUS_LABEL = {
  pending:  { text: '● প্রক্রিয়াধীন', cls: 'bg-cp-warning/10 text-cp-warning' },
  approved: { text: '● অনুমোদিত',    cls: 'bg-cp-success/10 text-cp-success' },
  rejected: { text: '● বাতিল',       cls: 'bg-cp-error/10 text-cp-error' },
}

export default function CreditTab({ portalJWT }) {
  const [companies,     setCompanies]     = useState([])
  const [creditSummary, setCreditSummary] = useState([])
  const [requests,      setRequests]      = useState([])

  const [summaryLoading, setSummaryLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // ── ফর্ম state ──────────────────────────────────────────────
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
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

  const loadCreditSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await portalFetch('/portal/connections/all-credit-summary', authHeader)
      setCreditSummary(res.data || [])
    } catch {
      setErrorMsg('ক্রেডিট সারাংশ আনতে সমস্যা হয়েছে।')
    } finally {
      setSummaryLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    try {
      const res = await portalFetch('/portal/connections/all-limit-requests', authHeader)
      setRequests(res.data || [])
    } catch {
      // সারাংশ ভেঙে না দিয়ে চুপচাপ খালি রাখা হচ্ছে, উপরে errorMsg থাকলে সেটাই যথেষ্ট
    } finally {
      setRequestsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadCompanies()
    loadCreditSummary()
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const companyName = (co) => co.company_name_bn || co.company_name

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess('')

    if (!selectedConnectionId) {
      setSubmitError('কোন কোম্পানির জন্য আবেদন করছেন, তা বেছে নিন।')
      return
    }
    const numericAmount = parseFloat(amount)
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      setSubmitError('সঠিক পরিমাণ দিন।')
      return
    }

    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/connections/limit-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          requested_amount: numericAmount,
          reason: reason.trim() || undefined,
        }),
      })
      setSubmitSuccess(res.message || 'আবেদন সফলভাবে জমা হয়েছে।')
      setAmount('')
      setReason('')
      loadRequests()
    } catch (err) {
      setSubmitError(err?.message || 'আবেদন জমা দিতে সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── ১. প্রতিটা কোম্পানির ক্রেডিট কার্ড ── */}
      <div className="flex flex-col gap-3">
        {summaryLoading ? (
          [...Array(2)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-cp-border animate-pulse" />
          ))
        ) : creditSummary.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">💳</p>
            <p className="text-cp-text-muted text-[13px]">কোনো ক্রেডিট তথ্য পাওয়া যায়নি।</p>
          </div>
        ) : (
          creditSummary.map((cs) => {
            const limit = Number(cs.credit_limit) || 0
            const used = Number(cs.current_credit) || 0
            const remaining = Math.max(limit - used, 0)
            const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
            return (
              <CpCard key={cs.customer_id} padding="md" className="flex flex-col gap-2">
                {creditSummary.length > 1 && (
                  <span className="inline-block self-start text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5">
                    {cs.company_name_bn || cs.company_name}
                  </span>
                )}
                <div className="flex justify-between items-baseline">
                  <p className="text-[11px] text-cp-text-muted">বর্তমান বকেয়া</p>
                  <p className="text-[11px] text-cp-text-muted">সীমা ৳{fmt(limit)}</p>
                </div>
                <p className="text-[22px] font-extrabold text-cp-text-primary font-cp-mono">৳{fmt(used)}</p>
                <div className="h-2 w-full bg-cp-bg-alt rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 90 ? 'bg-cp-error' : pct >= 60 ? 'bg-cp-warning' : 'bg-cp-success'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-cp-text-secondary">অবশিষ্ট সীমা: ৳{fmt(remaining)}</p>
              </CpCard>
            )
          })
        )}
      </div>

      {errorMsg && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
        </CpCard>
      )}

      {/* ── ২. নতুন আবেদন ফর্ম ── */}
      <CpCard variant="alt" padding="md" className="flex flex-col gap-3">
        <h3 className="text-[13px] font-bold text-cp-text-primary">নতুন ক্রেডিট লিমিট আবেদন</h3>

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
            label="আবেদনকৃত পরিমাণ (৳)"
            type="number"
            min="1000"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="যেমন: ৫০০০"
          />
          <div>
            <label className="block text-[11px] font-semibold text-cp-text-secondary mb-1.5">কারণ (ঐচ্ছিক)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="কেন সীমা বাড়ানো দরকার, সংক্ষেপে লিখুন…"
              className="w-full rounded-xl border border-cp-border bg-white px-3 py-2 text-[13px] text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500 resize-none"
            />
          </div>

          {submitError && <p className="text-[12px] text-cp-error">{submitError}</p>}
          {submitSuccess && <p className="text-[12px] text-cp-success">{submitSuccess}</p>}

          <CpButton type="submit" variant="action" fullWidth icon={FiSend} loading={submitting}>
            আবেদন জমা দিন
          </CpButton>
        </form>
      </CpCard>

      {/* ── ৩. আবেদনের ইতিহাস ── */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold text-cp-text-primary flex items-center gap-1.5">
          <FiClock className="w-3.5 h-3.5" /> আবেদনের ইতিহাস
        </h3>

        {requestsLoading ? (
          [...Array(2)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl border border-cp-border animate-pulse" />
          ))
        ) : requests.length === 0 ? (
          <p className="text-cp-text-muted text-[13px] text-center py-4">এখনো কোনো আবেদন করা হয়নি।</p>
        ) : (
          requests.map((r) => {
            const status = STATUS_LABEL[r.status] || STATUS_LABEL.pending
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-cp-border px-4 py-3 flex flex-col gap-1.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    {companies.length > 1 && (
                      <span className="inline-block text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5 mb-1">
                        {r.company_name_bn || r.company_name}
                      </span>
                    )}
                    <p className="text-[15px] font-extrabold text-cp-text-primary font-cp-mono">৳{fmt(r.requested_amount)}</p>
                    <p className="text-[10px] text-cp-text-muted mt-0.5">বর্তমান সীমা ছিল ৳{fmt(r.current_limit)}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
                {r.reason && <p className="text-[11px] text-cp-text-secondary">{r.reason}</p>}
                {r.admin_note && (
                  <p className="text-[11px] text-cp-text-secondary bg-cp-bg-alt rounded-lg px-2 py-1.5">
                    মন্তব্য: {r.admin_note}
                  </p>
                )}
                <p className="text-[10px] text-cp-text-muted">{fmtDate(r.created_at)}</p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
