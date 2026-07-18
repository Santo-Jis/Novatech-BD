// components/InvoicesTab.jsx
// ✅ NEW (Session 14) — Invoices ট্যাব redesign
//
// আর্কিটেকচার (01-Requirements-Spec.md ধারা ৩.১ অনুযায়ী সঠিক প্যাটার্ন):
// ডাটা merge হয় না ব্যাকএন্ডে — সব কানেক্টেড কোম্পানির ইনভয়েস
// GET /portal/connections/all-invoices দিয়ে এক লিস্টে আনা হয়, প্রতিটার
// পাশে কোম্পানির নাম-ট্যাগ (InvoiceCard-এর নতুন companyTag prop দিয়ে)।
// সেশন সুইচ করার দরকার নেই (Session 11/12-এর ভুল, Session 13-এ সংশোধিত)।
//
// OrderRequestTab.jsx-এর মতোই self-contained: নিজের state/fetch নিজেই
// সামলায়, শুধু portalJWT prop নেয়।

import { useState, useEffect, useCallback } from 'react'
import { FiFilter, FiX, FiSearch } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import InvoiceCard from './InvoiceCard'
import CpButton from './ui/CpButton'
import CpCard from './ui/CpCard'
import CpInput from './ui/CpInput'

export default function InvoicesTab({ portalJWT }) {
  const [invoices,    setInvoices]    = useState([])
  const [companies,   setCompanies]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')

  const [page,        setPage]        = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [total,       setTotal]       = useState(0)

  const [filterOpen,  setFilterOpen]  = useState(false)
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [tenantId,    setTenantId]    = useState('') // '' = সব কোম্পানি

  const hasActiveFilter = !!(dateFrom || dateTo || tenantId)

  // ── কানেক্টেড কোম্পানির লিস্ট (ফিল্টার চিপের জন্য) ──────────
  useEffect(() => {
    portalFetch('/portal/connections/my-companies', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => setCompanies(res.data || []))
      .catch(() => setCompanies([]))
  }, [])

  // ── ইনভয়েস লোড ──────────────────────────────────────────────
  const loadInvoices = useCallback(async (targetPage = 1, append = false) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const params = new URLSearchParams({ page: targetPage, limit: 10 })
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to', dateTo)
      if (tenantId) params.set('tenant_id', tenantId)

      const res = await portalFetch(`/portal/connections/all-invoices?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const rows = res.data || []
      setInvoices(prev => append ? [...prev, ...rows] : rows)
      setPage(res.pagination?.page || targetPage)
      setTotalPages(res.pagination?.total_pages || 1)
      setTotal(res.pagination?.total || rows.length)
    } catch {
      setErrorMsg('ইনভয়েস তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, tenantId])

  useEffect(() => { loadInvoices(1, false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => { setFilterOpen(false); loadInvoices(1, false) }
  const clearFilter = () => {
    setDateFrom(''); setDateTo(''); setTenantId('')
    setFilterOpen(false)
  }
  // clearFilter-এর পর নতুন state দিয়ে auto reload (dependency effect)
  useEffect(() => {
    if (!dateFrom && !dateTo && !tenantId) loadInvoices(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom === '' && dateTo === '' && tenantId === ''])

  const companyName = (co) => co.company_name_bn || co.company_name

  return (
    <div className="flex flex-col gap-3">
      {/* ── ফিল্টার ট্রিগার ── */}
      {companies.length > 1 && (
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
      )}

      {/* ── ফিল্টার প্যানেল ── */}
      {filterOpen && (
        <CpCard variant="alt" padding="md" className="flex flex-col gap-3">
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

      {hasActiveFilter && !filterOpen && (
        <p className="text-[11px] text-cp-text-muted px-1">— {total}টি পাওয়া গেছে</p>
      )}

      {errorMsg && (
        <CpCard variant="alt" padding="sm">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
        </CpCard>
      )}

      {/* ── লিস্ট ── */}
      {loading && invoices.length === 0 ? (
        [...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-2xl border border-cp-border animate-pulse" />
        ))
      ) : invoices.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-cp-text-muted text-[13px]">কোনো ইনভয়েস পাওয়া যায়নি।</p>
        </div>
      ) : (
        <>
          {invoices.map(sale => (
            <InvoiceCard
              key={`${sale.tenant_id}-${sale.invoice_number}`}
              sale={sale}
              companyTag={companies.length > 1 ? (sale.company_name_bn || sale.company_name) : null}
            />
          ))}
          {page < totalPages && (
            <CpButton
              variant="secondary"
              fullWidth
              loading={loading}
              onClick={() => loadInvoices(page + 1, true)}
            >
              আরো দেখুন ({invoices.length}/{total})
            </CpButton>
          )}
          {page >= totalPages && invoices.length > 0 && (
            <p className="text-center text-[11px] text-cp-text-muted py-2">সব {total}টি ইনভয়েস দেখানো হয়েছে।</p>
          )}
        </>
      )}
    </div>
  )
}
