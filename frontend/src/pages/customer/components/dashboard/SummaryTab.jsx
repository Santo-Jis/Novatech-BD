// components/dashboard/SummaryTab.jsx
// ড্যাশবোর্ডের "সারসংক্ষেপ" ট্যাব
//
// ✅ REDESIGNED (আর্কিটেকচার ফিক্স, পার্ট ১) — InvoicesTab/PaymentsTab/
// CreditTab/ComplaintsTab/ReturnsTab-এর মতোই এখন self-contained +
// aggregate + company-ট্যাগ প্যাটার্নে (01-Requirements-Spec.md ধারা ৩.১)।
//
// আগে: DashboardView.jsx থেকে prop হিসেবে single-company session-scoped
// dashboard.customer / monthly_summary / total_summary নিতো — অর্থাৎ
// ঠিক পাশের Invoices/Credit সাব-ট্যাব সব কোম্পানি একসাথে ট্যাগসহ দেখাতো,
// আর এই ডিফল্ট সাব-ট্যাবটাই শুধু এক কোম্পানির সংখ্যা কোনো ট্যাগ ছাড়া
// দেখাতো — সবচেয়ে বেশি চোখে পড়া জায়গাতেই এই অসামঞ্জস্যতা ছিল।
//
// এখন: নিজেই all-summary কল করে, সব connected কোম্পানির SR/মাসিক/
// সর্বমোট/ক্রেডিট তথ্য company-ট্যাগসহ আনে, আর "সব মিলিয়ে" গ্র্যান্ড-
// টোটাল ফ্রন্টএন্ডেই যোগ করে নেয় (আলাদা কুয়েরির দরকার নেই)। এক কোম্পানি
// থাকলে UI আগের মতোই মিনিমাল থাকে — company ট্যাগ/ব্রেকডাউন তখন দেখায় না।
//
// ব্যবহৃত এন্ডপয়েন্ট:
//  - GET /portal/connections/all-summary        (নতুন, এই পার্টে বানানো)
//  - GET /portal/connections/all-monthly-trend   (নতুন — MonthlyTrendChart
//    এখন এটা কল করে, আগে সেশন-স্কোপড /portal/monthly-summary কল করতো)

import { useState, useEffect, useCallback } from 'react'
import { portalFetch } from '../../utils/api'
import { fmt } from '../../utils/helpers'
import MonthlyTrendChart from '../MonthlyTrendChart'
import SectionLabel from './SectionLabel'
import StatCard from './StatCard'
import CpCard from '../ui/CpCard'
import CompanyTag from '../CompanyTag'

const companyName = (co) => co.company_name_bn || co.company_name

const EMPTY_TOTALS = {
  monthly_total_purchase: 0, monthly_total_invoices: 0, monthly_total_cash: 0, monthly_total_credit: 0,
  overall_total_purchase: 0, overall_total_invoices: 0, overall_total_cash: 0, overall_total_credit: 0,
}

export default function SummaryTab({ portalJWT }) {
  const [companies, setCompanies] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [errorMsg,  setErrorMsg]  = useState('')

  const authHeader = { headers: { Authorization: `Bearer ${portalJWT}` } }

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await portalFetch('/portal/connections/all-summary', authHeader)
      setCompanies(res.data || [])
    } catch (err) {
      setErrorMsg(err?.message || 'সারসংক্ষেপ আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [portalJWT])

  useEffect(() => { loadSummary() }, [loadSummary])

  // "সব মিলিয়ে" গ্র্যান্ড-টোটাল — প্রতিটা কোম্পানির সংখ্যা যোগ করে
  const grand = companies.reduce((acc, co) => ({
    monthly_total_purchase: acc.monthly_total_purchase + (Number(co.monthly_total_purchase) || 0),
    monthly_total_invoices: acc.monthly_total_invoices + (Number(co.monthly_total_invoices) || 0),
    monthly_total_cash:     acc.monthly_total_cash     + (Number(co.monthly_total_cash) || 0),
    monthly_total_credit:   acc.monthly_total_credit   + (Number(co.monthly_total_credit) || 0),
    overall_total_purchase: acc.overall_total_purchase + (Number(co.overall_total_purchase) || 0),
    overall_total_invoices: acc.overall_total_invoices + (Number(co.overall_total_invoices) || 0),
    overall_total_cash:     acc.overall_total_cash     + (Number(co.overall_total_cash) || 0),
    overall_total_credit:   acc.overall_total_credit   + (Number(co.overall_total_credit) || 0),
  }), EMPTY_TOTALS)

  const multi = companies.length > 1

  if (loading && companies.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-20 bg-white rounded-2xl border border-cp-border animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-cp-border animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-white rounded-2xl border border-cp-border animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {errorMsg && (
        <CpCard variant="alt" padding="sm" className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-cp-error">{errorMsg}</p>
          <button onClick={loadSummary} className="text-[11px] font-bold text-cp-trust-700 flex-shrink-0">
            আবার চেষ্টা
          </button>
        </CpCard>
      )}

      {companies.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🏢</p>
          <p className="text-cp-text-muted text-[13px]">কোনো কোম্পানির সাথে এখনও সংযোগ নেই।</p>
        </div>
      ) : (
        <>
          {/* SR কন্টাক্ট — প্রতিটা কানেক্টেড কোম্পানির নিজস্ব SR।
              এখানে CompanyTag ব্যবহার করা হয়নি ইচ্ছাকৃতভাবে — CompanyTag-এর
              হালকা/লাইট চিপ এই গাঢ় গ্রেডিয়েন্ট কার্ডে পড়া যাবে না;
              সাদা টেক্সট লেবেলই এখানে বেশি স্পষ্ট। */}
          <div className="flex flex-col gap-2">
            {companies.filter(co => co.assigned_sr_name).map((co) => (
              <div
                key={co.tenant_id}
                className="rounded-2xl px-4 py-3.5 flex items-center gap-3 bg-gradient-to-br from-cp-trust-700 to-cp-trust-900 shadow-lg shadow-cp-trust-900/20"
              >
                <div className="w-11 h-11 rounded-2xl bg-white/[0.18] flex items-center justify-center text-xl flex-shrink-0">🧑‍💼</div>
                <div className="flex-1 min-w-0">
                  {multi && (
                    <p className="text-[9px] text-white/70 font-bold uppercase tracking-wider truncate">{companyName(co)}</p>
                  )}
                  <p className="text-[9px] text-white/55 font-bold uppercase tracking-wider">আপনার বিক্রয় প্রতিনিধি</p>
                  <p className="text-sm text-white font-bold mt-0.5 truncate">{co.assigned_sr_name}</p>
                  {co.assigned_sr_code && <p className="text-[10px] text-white/50 mt-0.5">কোড: {co.assigned_sr_code}</p>}
                </div>
                {co.assigned_sr_phone && (
                  <a
                    href={`tel:${co.assigned_sr_phone}`}
                    className="no-underline bg-white/[0.18] rounded-xl px-3.5 py-2.5 flex flex-col items-center gap-0.5 flex-shrink-0"
                  >
                    <span className="text-xl">📞</span>
                    <span className="text-[9px] text-white font-bold">কল</span>
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* এই মাস — সব কোম্পানি মিলিয়ে */}
          <div>
            <SectionLabel label={multi ? 'এই মাস (সব কোম্পানি মিলিয়ে)' : 'এই মাস'} tone="trust" />
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="মোট কেনাকাটা"  value={`৳${fmt(grand.monthly_total_purchase)}`} tone="text" />
              <StatCard label="ইনভয়েস সংখ্যা" value={grand.monthly_total_invoices}            tone="trust" />
              <StatCard label="নগদ দিয়েছেন"   value={`৳${fmt(grand.monthly_total_cash)}`}      tone="success" />
              <StatCard label="বাকি রেখেছেন"   value={`৳${fmt(grand.monthly_total_credit)}`}    tone="danger" />
            </div>
          </div>

          {/* গত ৬ মাসের ট্রেন্ড — সব কোম্পানি মিলিয়ে (MonthlyTrendChart নিজেই all-monthly-trend কল করে) */}
          <div>
            <SectionLabel label={multi ? 'গত ৬ মাসের ট্রেন্ড (সব কোম্পানি মিলিয়ে)' : 'গত ৬ মাসের ট্রেন্ড'} tone="warmth" />
            <MonthlyTrendChart portalJWT={portalJWT} />
          </div>

          {/* সর্বমোট — সব কোম্পানি মিলিয়ে */}
          <div>
            <SectionLabel label={multi ? 'সর্বমোট (সব কোম্পানি মিলিয়ে)' : 'সর্বমোট'} tone="success" />
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="মোট কেনাকাটা" value={`৳${fmt(grand.overall_total_purchase)}`} tone="text" />
              <StatCard label="মোট ইনভয়েস"  value={grand.overall_total_invoices}             tone="trust" />
              <StatCard label="মোট নগদ"      value={`৳${fmt(grand.overall_total_cash)}`}      tone="success" />
              <StatCard label="মোট বাকি"     value={`৳${fmt(grand.overall_total_credit)}`}    tone="danger" />
            </div>
          </div>

          {/* কোম্পানি-ভিত্তিক ব্রেকডাউন — শুধু ১-এর বেশি কোম্পানি কানেক্টেড থাকলে;
              ১টা হলে উপরের গ্র্যান্ড-টোটালই যথেষ্ট, ডুপ্লিকেট দেখানোর দরকার নেই */}
          {multi && (
            <div>
              <SectionLabel label="কোম্পানি-ভিত্তিক ব্রেকডাউন" tone="trust" />
              <div className="flex flex-col gap-3">
                {companies.map((co) => {
                  const limit     = Number(co.credit_limit) || 0
                  const used      = Number(co.current_credit) || 0
                  const remaining = Math.max(limit - used, 0)
                  const pct       = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
                  return (
                    <CpCard key={co.tenant_id} padding="md" className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <CompanyTag name={companyName(co)} logoUrl={co.logo_url} colorKey={co.tenant_id} />
                        {co.is_verified && (
                          <span className="text-[9px] font-bold text-cp-confidence-600">✓ ভেরিফায়েড</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-cp-text-muted">এই মাসের কেনাকাটা</p>
                          <p className="text-[15px] font-bold text-cp-text-primary font-cp-mono">৳{fmt(co.monthly_total_purchase)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-cp-text-muted">সর্বমোট কেনাকাটা</p>
                          <p className="text-[15px] font-bold text-cp-text-primary font-cp-mono">৳{fmt(co.overall_total_purchase)}</p>
                        </div>
                      </div>
                      {limit > 0 && (
                        <>
                          <div className="h-2 w-full bg-cp-bg-alt rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct >= 90 ? 'bg-cp-error' : pct >= 60 ? 'bg-cp-warning' : 'bg-cp-success'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-cp-text-secondary">বাকি ৳{fmt(used)} • অবশিষ্ট সীমা ৳{fmt(remaining)}</p>
                        </>
                      )}
                    </CpCard>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
