// components/company/CompanySwitcher.jsx
// ✅ NEW (Session 11 — SaaS multi-company foundation)
//
// এটাই সেই "একটা জায়গা" যেখান থেকে রহিম তার সব কানেক্টেড কোম্পানির মধ্যে
// সুইচ করবে। ড্যাশবোর্ড header-এ শপ-নাম যেখানে ছিল, সেটাই এখন এই সুইচারের
// ট্রিগার — ট্যাপ করলে dropdown-এ সব কোম্পানি দেখাবে, একটাতে ট্যাপ করলেই
// পুরো ড্যাশবোর্ড সেই কোম্পানির স্কোপে রিলোড হবে (portalJWT বদলে যায়)।
//
// ভবিষ্যতে নতুন যেকোনো ট্যাব (Invoices/Payments/...) redesign করার সময়
// এই কম্পোনেন্টটা reuse হবে না — কিন্তু এটার পেছনের switchCompany() ফাংশন
// এবং my-companies API-টাই মাল্টি-কোম্পানি আর্কিটেকচারের ভিত্তি।

import { useEffect, useRef, useState } from 'react'
import { portalFetch } from '../../utils/api'

export default function CompanySwitcher({ customer, portalJWT, switchCompany, toast }) {
  const [open, setOpen] = useState(false)
  const [companies, setCompanies] = useState(null) // null = না-লোড, [] = লোড হয়ে খালি
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(null) // connection_id যেটা switch হচ্ছে
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open || companies !== null) return
    setLoading(true)
    portalFetch('/portal/connections/my-companies')
      .then(res => setCompanies(res.data || []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('touchstart', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('touchstart', onClickOutside)
    }
  }, [open])

  const handleSwitch = async (connectionId, companyName) => {
    if (switching) return
    setSwitching(connectionId)
    try {
      await switchCompany(connectionId)
      setOpen(false)
      toast?.(`${companyName}-এ সুইচ করা হয়েছে ✅`, 'success')
    } catch (err) {
      toast?.(err.message || 'কোম্পানি পরিবর্তন করা যায়নি।', 'error')
    } finally {
      setSwitching(null)
    }
  }

  // একটাই কোম্পানি connected থাকলে সুইচার দরকার নেই — শুধু নাম দেখাও
  const onlyOneKnown = companies !== null && companies.length <= 1

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 min-w-0 text-left group"
      >
        <h1 className="text-xl font-bold text-white leading-tight font-cp-head truncate">
          {customer.shop_name}
        </h1>
        {!onlyOneKnown && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`flex-shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-2 w-[260px] bg-cp-bg-surface rounded-2xl shadow-xl border border-cp-border overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[10px] font-bold text-cp-text-muted uppercase tracking-[1.5px]">
            আপনার কোম্পানিসমূহ
          </p>
          <div className="max-h-[280px] overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-[12px] text-cp-text-muted">লোড হচ্ছে...</div>
            )}
            {!loading && companies?.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-cp-text-muted">কোনো কোম্পানি পাওয়া যায়নি।</div>
            )}
            {!loading && companies?.map(co => {
              const isCurrent = co.customer_code === customer.customer_code
              return (
                <button
                  key={co.connection_id}
                  onClick={() => !isCurrent && handleSwitch(co.connection_id, co.company_name_bn || co.company_name)}
                  disabled={switching === co.connection_id}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t border-cp-border first:border-t-0 transition-colors ${
                    isCurrent ? 'bg-cp-trust-500/10' : 'active:bg-cp-bg-alt'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-cp-trust-500/15 flex items-center justify-center text-[13px] font-bold text-cp-trust-700 flex-shrink-0 overflow-hidden">
                    {co.logo_url
                      ? <img src={co.logo_url} alt="" className="w-full h-full object-cover" />
                      : (co.company_name_bn || co.company_name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-cp-text-primary truncate">
                      {co.company_name_bn || co.company_name}
                    </p>
                    <p className="text-[10.5px] text-cp-text-muted truncate">{co.customer_code}</p>
                  </div>
                  {isCurrent && (
                    <span className="text-[9.5px] font-bold text-cp-trust-700 bg-cp-trust-500/15 px-2 py-0.5 rounded-full flex-shrink-0">বর্তমান</span>
                  )}
                  {switching === co.connection_id && (
                    <span className="text-[11px] text-cp-text-muted flex-shrink-0">⏳</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
