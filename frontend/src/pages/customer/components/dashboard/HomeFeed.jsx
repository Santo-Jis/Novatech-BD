// components/dashboard/HomeFeed.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ২ — হোম ফিড (Facebook-স্টাইল সোশ্যাল ফিড)
//
// এখন যা আছে (real data):
//   • সাম্প্রতিক ইনভয়েসগুলো "পোস্ট"-এর মতো কার্ড আকারে (InvoiceCard পুনঃব্যবহার)
// এখন যা এখনো ব্যাকএন্ডে কোড হয়নি (placeholder — স্পষ্টভাবে "শীঘ্রই আসছে" দেখানো হচ্ছে,
// যাতে ব্যবহারকারী ভুল না বোঝেন যে ফিচারটা ভাঙা):
//   • কোম্পানি কর্তৃক পোস্ট
//   • মার্কেটিং অফার
//   • কাস্টমার কর্তৃক পোস্ট
//
// এই ফাইল self-contained — নিজের ইনভয়েস fetch নিজেই করে, শুধু portalJWT prop নেয়
// (InvoicesTab.jsx / OrderRequestTab.jsx-এর একই প্যাটার্ন অনুসরণ করে)।
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { FiFileText, FiVolume2, FiTag, FiUsers } from 'react-icons/fi'
import { portalFetch } from '../../utils/api'
import { fmtDate } from '../../utils/helpers'
import InvoiceCard from '../InvoiceCard'
import SectionLabel from './SectionLabel'

function ComingSoonCard({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-dashed border-cp-border-strong bg-cp-bg-alt/60 px-4 py-5 flex flex-col items-center text-center gap-1.5">
      <div className="w-11 h-11 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center">
        <Icon size={19} />
      </div>
      <p className="text-[12.5px] font-bold text-cp-text-primary font-cp-head">{title}</p>
      <p className="text-[11px] text-cp-text-muted leading-relaxed max-w-[240px]">{desc}</p>
      <span className="mt-1 text-[9.5px] font-bold text-cp-warmth-600 bg-cp-warmth-100 px-2.5 py-1 rounded-full">শীঘ্রই আসছে</span>
    </div>
  )
}

function PostHeader({ icon: Icon, tone = 'trust', title, subtitle }) {
  const toneMap = {
    trust:      { bg: 'bg-cp-trust-100',      text: 'text-cp-trust-500' },
    confidence: { bg: 'bg-cp-confidence-100',  text: 'text-cp-confidence-600' },
  }
  const t = toneMap[tone] || toneMap.trust
  return (
    <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
      <div className={`w-8 h-8 rounded-full ${t.bg} ${t.text} flex items-center justify-center flex-shrink-0`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-cp-text-primary font-cp-head leading-tight truncate">{title}</p>
        <p className="text-[10px] text-cp-text-muted leading-tight">{subtitle}</p>
      </div>
    </div>
  )
}

export default function HomeFeed({ portalJWT, customer }) {
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    portalFetch(`/portal/connections/all-invoices?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => { if (!cancelled) setInvoices(res.data || []) })
      .catch(() => { if (!cancelled) setErrorMsg('ফিড লোড করতে সমস্যা হয়েছে।') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [portalJWT])

  return (
    <div className="flex flex-col gap-3.5">

      {/* ── SR পরিচিতি (pinned widget, FB-এর "intro card"-এর মতো) ── */}
      {customer?.assigned_sr_name && (
        <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 bg-gradient-to-br from-cp-trust-700 to-cp-trust-900 shadow-lg shadow-cp-trust-900/20">
          <div className="w-11 h-11 rounded-2xl bg-white/[0.18] flex items-center justify-center text-xl flex-shrink-0">🧑‍💼</div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-white/55 font-bold uppercase tracking-wider">আপনার বিক্রয় প্রতিনিধি</p>
            <p className="text-sm text-white font-bold mt-0.5 truncate">{customer.assigned_sr_name}</p>
            {customer.assigned_sr_code && <p className="text-[10px] text-white/50 mt-0.5">কোড: {customer.assigned_sr_code}</p>}
          </div>
          {customer?.assigned_sr_phone && (
            <a href={`tel:${customer.assigned_sr_phone}`} className="no-underline bg-white/[0.18] rounded-xl px-3.5 py-2.5 flex flex-col items-center gap-0.5 flex-shrink-0">
              <span className="text-xl">📞</span>
              <span className="text-[9px] text-white font-bold">কল</span>
            </a>
          )}
        </div>
      )}

      {/* ── কোম্পানির পোস্ট (placeholder) ── */}
      <div>
        <SectionLabel label="কোম্পানির পোস্ট" tone="trust" />
        <ComingSoonCard icon={FiVolume2} title="কোম্পানির পোস্ট এখানে দেখা যাবে" desc="আপনার কানেক্টেড কোম্পানিগুলো নতুন পণ্য, আপডেট বা ঘোষণা পোস্ট করলে এখানে দেখতে পাবেন।" />
      </div>

      {/* ── মার্কেটিং অফার (placeholder) ── */}
      <div>
        <SectionLabel label="মার্কেটিং অফার" tone="warmth" />
        <ComingSoonCard icon={FiTag} title="চলমান অফার এখানে দেখা যাবে" desc="বিশেষ ছাড় ও প্রমোশনাল অফার এলে এই জায়গায় কার্ড আকারে দেখানো হবে।" />
      </div>

      {/* ── সাম্প্রতিক ইনভয়েস (real feed) ── */}
      <div>
        <SectionLabel label="সাম্প্রতিক ইনভয়েস" tone="success" />

        {loading && (
          <div className="flex flex-col gap-2.5">
            {[0, 1].map(i => (
              <div key={i} className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 76 }} />
            ))}
          </div>
        )}

        {!loading && errorMsg && (
          <p className="text-[12px] text-cp-error text-center py-4">{errorMsg}</p>
        )}

        {!loading && !errorMsg && invoices.length === 0 && (
          <ComingSoonCard icon={FiFileText} title="এখনো কোনো ইনভয়েস নেই" desc="নতুন কেনাকাটা হলে সেটার ইনভয়েস এখানে পোস্টের মতো দেখা যাবে।" />
        )}

        {!loading && !errorMsg && invoices.length > 0 && (
          <div className="flex flex-col gap-3">
            {invoices.map(sale => (
              <div key={sale.id} className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
                <PostHeader
                  icon={FiFileText}
                  tone="trust"
                  title="নতুন ইনভয়েস তৈরি হয়েছে"
                  subtitle={`${sale.company_name || 'কোম্পানি'} • ${fmtDate(sale.created_at)}`}
                />
                <InvoiceCard sale={sale} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── কাস্টমার পোস্ট (placeholder) ── */}
      <div>
        <SectionLabel label="কাস্টমার পোস্ট" tone="trust" />
        <ComingSoonCard icon={FiUsers} title="কাস্টমারদের পোস্ট এখানে দেখা যাবে" desc="আপনার নেটওয়ার্কের অন্য কাস্টমাররা কিছু শেয়ার করলে এখানে দেখতে পাবেন।" />
      </div>
    </div>
  )
}
