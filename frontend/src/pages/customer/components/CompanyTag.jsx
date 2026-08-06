// components/CompanyTag.jsx
// ✅ NEW (পার্ট ২ — কোম্পানি ভিজ্যুয়াল ট্যাগ সিস্টেম)
//
// পুরো কাস্টমার পোর্টাল জুড়ে যেখানেই "এটা কোন কোম্পানির" বোঝাতে হতো,
// আগে শুধু একটা প্লেইন টেক্সট পিল ছিল (InvoiceCard, CreditTab,
// PaymentsTab, ComplaintsTab, ReturnsTab, SummaryTab — সবখানে একটু
// একটু আলাদা স্টাইলে)। এখন সবখানে এই একটাই কম্পোনেন্ট: লোগো থাকলে
// লোগো, না থাকলে কোম্পানির নামের প্রথম অক্ষর দিয়ে রঙিন সার্কেল —
// আর রঙটা প্রতি কোম্পানির জন্য deterministic (companyColor.js),
// তাই টেক্সট না পড়েও চোখে চেনা যায়। ধীরগতির নেটওয়ার্ক/কম-সাক্ষরতার
// দোকানদার ইউজারদের জন্য এটাই সবচেয়ে বেশি কাজ করে।
//
// ব্যবহার:
//   <CompanyTag name={companyName(co)} logoUrl={co.logo_url} colorKey={co.tenant_id} />
//
// colorKey না দিলে name দিয়েই রঙ ঠিক হয় — কিন্তু যেখানেই tenant_id
// পাওয়া যায়, সেটা দেওয়াই ভালো (কোম্পানির নাম বদলালেও রঙ বদলাবে না)।

import { useState } from 'react'
import { getCompanyColor } from '../utils/companyColor'

export default function CompanyTag({ name, logoUrl, colorKey }) {
  const [imgError, setImgError] = useState(false)
  const c = getCompanyColor(colorKey ?? name)
  const showLogo = Boolean(logoUrl) && !imgError
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold ${c.text} ${c.bg} border ${c.border} rounded-full pl-1 pr-2.5 py-0.5 max-w-full`}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt=""
          onError={() => setImgError(true)}
          className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 bg-white"
        />
      ) : (
        <span
          className={`w-3.5 h-3.5 rounded-full ${c.dot} text-white flex items-center justify-center flex-shrink-0 text-[7px] leading-none`}
        >
          {initial}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  )
}
