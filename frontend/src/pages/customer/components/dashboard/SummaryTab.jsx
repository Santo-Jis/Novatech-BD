// components/dashboard/SummaryTab.jsx
// ড্যাশবোর্ডের "সারসংক্ষেপ" ট্যাব — SR কন্টাক্ট কার্ড, এই মাস/সর্বমোট পরিসংখ্যান, ট্রেন্ড চার্ট
// DashboardView.jsx থেকে আলাদা করা হলো + cp- ডিজাইন টোকেন প্রয়োগ

import { fmt } from '../../utils/helpers'
import MonthlyTrendChart from '../MonthlyTrendChart'
import SectionLabel from './SectionLabel'
import StatCard from './StatCard'

export default function SummaryTab({ customer, monthly_summary = {}, total_summary = {}, portalJWT }) {
  return (
    <div className="flex flex-col gap-5">

      {/* SR কন্টাক্ট কার্ড */}
      {customer?.assigned_sr_name && (
        <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 bg-gradient-to-br from-cp-trust-700 to-cp-trust-900 shadow-lg shadow-cp-trust-900/20">
          <div className="w-11 h-11 rounded-2xl bg-white/[0.18] flex items-center justify-center text-xl flex-shrink-0">🧑‍💼</div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-white/55 font-bold uppercase tracking-wider">আপনার বিক্রয় প্রতিনিধি</p>
            <p className="text-sm text-white font-bold mt-0.5 truncate">{customer.assigned_sr_name}</p>
            {customer.assigned_sr_code && <p className="text-[10px] text-white/50 mt-0.5">কোড: {customer.assigned_sr_code}</p>}
          </div>
          {customer?.assigned_sr_phone && (
            <a
              href={`tel:${customer.assigned_sr_phone}`}
              className="no-underline bg-white/[0.18] rounded-xl px-3.5 py-2.5 flex flex-col items-center gap-0.5 flex-shrink-0"
            >
              <span className="text-xl">📞</span>
              <span className="text-[9px] text-white font-bold">কল</span>
            </a>
          )}
        </div>
      )}

      {/* এই মাস */}
      <div>
        <SectionLabel label="এই মাস" tone="trust" />
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="মোট কেনাকাটা"  value={`৳${fmt(monthly_summary?.total_purchase)}`} tone="text" />
          <StatCard label="ইনভয়েস সংখ্যা" value={monthly_summary?.total_invoices ?? 0}        tone="trust" />
          <StatCard label="নগদ দিয়েছেন"   value={`৳${fmt(monthly_summary?.total_cash)}`}      tone="success" />
          <StatCard label="বাকি রেখেছেন"   value={`৳${fmt(monthly_summary?.total_credit)}`}    tone="danger" />
        </div>
      </div>

      {/* গত ৬ মাসের ট্রেন্ড */}
      <div>
        <SectionLabel label="গত ৬ মাসের ট্রেন্ড" tone="warmth" />
        <MonthlyTrendChart portalJWT={portalJWT} />
      </div>

      {/* সর্বমোট */}
      <div>
        <SectionLabel label="সর্বমোট" tone="success" />
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="মোট কেনাকাটা" value={`৳${fmt(total_summary?.total_purchase)}`} tone="text" />
          <StatCard label="মোট ইনভয়েস"  value={total_summary?.total_invoices ?? 0}        tone="trust" />
          <StatCard label="মোট নগদ"      value={`৳${fmt(total_summary?.total_cash)}`}      tone="success" />
          <StatCard label="মোট বাকি"     value={`৳${fmt(total_summary?.total_credit)}`}    tone="danger" />
        </div>
      </div>
    </div>
  )
}
