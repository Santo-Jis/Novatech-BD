// components/PaymentsTab.jsx
// ✅ NEW (Session 15) — Payments ট্যাব redesign
//
// InvoicesTab.jsx-এর মতোই প্যাটার্ন: self-contained, aggregate + company-ট্যাগ
// (01-Requirements-Spec.md ধারা ৩.১), সেশন সুইচ করার দরকার নেই।
// নতুন endpoint: GET /portal/connections/all-payment-history

import { useState, useEffect, useCallback } from 'react'
import { FiFilter, FiX, FiSearch } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import CpInput from './ui/CpInput'
import { fmt, fmtDate } from '../utils/helpers'

export default function PaymentsTab({ portalJWT }) {
  const [payments,   setPayments]   = useState([])
  const [summary,    setSummary]    = useState(null)
  const [companies,  setCompanies]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [errorMsg,   setErrorMsg]   = useState('')

  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total,      setTotal]      = useState(0)

  const [filterOpen, setFilterOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState('') // '' | cash | credit
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [tenantId,   setTenantId]   = useState('')

  const hasActiveFilter = !!(typeFilter || dateFrom || dateTo || tenantId)

  useEffect(() => {
    portalFetch('/portal/connections/my-companies', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => setCompanies(res.data || []))
      .catch(() => setCompanies([]))
  }, [])

  const loadPayments = useCallback(async (targetPage = 1, append = false) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const params = new URLSearchParams({ page: targetPage, limit: 10 })
      if (typeFilter) params.set('type', typeFilter)
      if (dateFrom)   params.set('date_from', dateFrom)
      if (dateTo)     params.set('date_to', dateTo)
      if (tenantId)   params.set('tenant_id', tenantId)

      const res = await portalFetch(`/portal/connections/all-payment-history?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const rows = res.data || []
      setPayments(prev => append ? [...prev, ...rows] : rows)
      setSummary(res.summary || null)
      setPage(res.pagination?.page || targetPage)
      setTotalPages(res.pagination?.total_pages || 1)
      setTotal(res.pagination?.total || rows.length)
    } catch {
      setErrorMsg('পেমেন্ট হিস্ট্রি আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, dateFrom, dateTo, tenantId])

  useEffect(() => { loadPayments(1, false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => { setFilterOpen(false); loadPayments(1, false) }
  const clearFilter = () => {
    setTypeFilter(''); setDateFrom(''); setDateTo(''); setTenantId('')
    setFilterOpen(false)
  }
  useEffect(() => {
    if (!typeFilter && !dateFrom && !dateTo && !tenantId) loadPayments(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter === '' && dateFrom === '' && dateTo === '' && tenantId === ''])

  const companyName = (co) => co.company_name_bn || co.company_name

  return (
    <div className="flex flex-col gap-3">
      {/* ── ফিল্টার ট্রিগার ── */}
      <div className="flex gap-2">
        <CpButton
          variant={filterOpen || hasActiveFilter ? 'primary' : 'secondary'}
          size="sm"
          icon={FiFilter}
          onClick={() => setFilterOpen(v => !v)}
        >
          ফিল্টার {hasActiveFilter ? '●' : ''}
        </CpButton>
        {hasActiveFilter && (
          <CpButton variant="ghost" size="sm" icon={FiX} onClick={clearFilter}>
            রিসেট
          </CpButton>
        )}
      </div>

      {/* ── ফিল্টার প্যানেল ── */}
      {filterOpen && (
        <CpCard variant="alt" padding="md" className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold text-cp-text-secondary mb-2">পেমেন্টের ধরন</p>
            <div className="flex gap-1.5">
              {[['', 'সব'], ['cash', '💵 নগদ'], ['credit', '🔄 ক্রেডিট']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                    typeFilter === val ? 'bg-cp-trust-500 text-white border-cp-trust-500' : 'bg-white text-cp-text-secondary border-cp-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {companies.length > 1 && (
            <div>
              <p className="text-[11px] font-semibold text-cp-text-secondary mb-2">কোম্পানি</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTenantId('')}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                    tenantId === '' ? 'bg-cp-trust-500 text-white border-cp-trust-500' : 'bg-white text-cp-text-secondary border-cp-border'
                  }`}
                >
                  সব কোম্পানি
                </button>
                {companies.map(co => (
                  <button
                    key={co.connection_id}
                    onClick={() => setTenantId(String(co.tenant_id))}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors truncate max-w-[140px] ${
                      tenantId === String(co.tenant_id) ? 'bg-cp-trust-500 text-white border-cp-trust-500' : 'bg-white text-cp-text-secondary border-cp-border'
                    }`}
                  >
                    {companyName(co)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <CpInput label="তারিখ থেকে" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <CpInput label="তারিখ পর্যন্ত" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <CpButton variant="primary" size="sm" fullWidth icon={FiSearch} onClick={applyFilter}>
              ফিল্টার প্রয়োগ
            </CpButton>
            <CpButton variant="secondary" size="sm" onClick={clearFilter}>
              রিসেট
            </CpButton>
          </div>
        </CpCard>
      )}

      {/* ── সারাংশ ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-2">
          <CpCard variant="alt" padding="sm" className="!bg-cp-success/10 !border-cp-success/20">
            <p className="text-[10px] text-cp-success font-semibold mb-1">💵 মোট নগদ</p>
            <p className="text-[16px] font-bold text-cp-success font-cp-mono">৳{fmt(summary.total_cash_received)}</p>
          </CpCard>
          <CpCard variant="alt" padding="sm" className="!bg-cp-trust-500/10 !border-cp-trust-500/20">
            <p className="text-[10px] text-cp-trust-700 font-semibold mb-1">🔄 মোট ক্রেডিট</p>
            <p className="text-[16px] font-bold text-cp-trust-700 font-cp-mono">৳{fmt(summary.total_credit_collected)}</p>
          </CpCard>
        </div>
      )}

      {errorMsg && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
        </CpCard>
      )}

      {/* ── লিস্ট ── */}
      {loading && payments.length === 0 ? (
        [...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-2xl border border-cp-border animate-pulse" />
        ))
      ) : payments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-cp-text-muted text-[13px]">কোনো পেমেন্ট পাওয়া যায়নি।</p>
        </div>
      ) : (
        <>
          {payments.map((p, i) => (
            <div key={i} className="bg-white rounded-2xl border border-cp-border px-4 py-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[17px] flex-shrink-0 ${
                p.payment_type === 'cash' ? 'bg-cp-success/10' : 'bg-cp-trust-500/10'
              }`}>
                {p.payment_type === 'cash' ? '💵' : '🔄'}
              </div>
              <div className="flex-1 min-w-0">
                {companies.length > 1 && (
                  <span className="inline-block text-[9px] font-bold text-cp-trust-700 bg-cp-trust-500/10 border border-cp-trust-500/20 rounded-full px-2 py-0.5 mb-1">
                    {p.company_name_bn || p.company_name}
                  </span>
                )}
                <p className="text-[12px] font-semibold text-cp-text-primary truncate">{p.collected_by} আদায় করেছেন</p>
                <p className="text-[10px] text-cp-text-muted mt-0.5">{fmtDate(p.created_at)}</p>
                {p.reference && (
                  <p className="text-[10px] text-cp-text-muted truncate mt-0.5">
                    {p.payment_type === 'cash' ? `INV: ${p.reference}` : p.reference}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[16px] font-extrabold text-cp-success font-cp-mono">৳{fmt(p.amount)}</p>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  p.payment_type === 'cash' ? 'bg-cp-success/10 text-cp-success' : 'bg-cp-trust-500/10 text-cp-trust-700'
                }`}>
                  {p.payment_type === 'cash' ? '● নগদ' : '● ক্রেডিট'}
                </span>
              </div>
            </div>
          ))}
          {page < totalPages && (
            <CpButton
              variant="secondary"
              fullWidth
              loading={loading}
              onClick={() => loadPayments(page + 1, true)}
            >
              আরো দেখুন ({payments.length}/{total})
            </CpButton>
          )}
          {page >= totalPages && payments.length > 0 && (
            <p className="text-center text-[11px] text-cp-text-muted py-2">সব {total}টি পেমেন্ট দেখানো হয়েছে।</p>
          )}
        </>
      )}
    </div>
  )
}
