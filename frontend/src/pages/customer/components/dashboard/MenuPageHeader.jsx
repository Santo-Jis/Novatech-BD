// components/dashboard/MenuPageHeader.jsx
// AccountMenu → সাব-পেজগুলোর (Settings/Personalization/Privacy) শেয়ার্ড হেডার।
// TopBar.jsx-এর h-14/border-b ভিজ্যুয়াল ভাষা অনুসরণ করে, শুধু ← ব্যাক।

import { FiArrowLeft } from 'react-icons/fi'

export default function MenuPageHeader({ title, onBack }) {
  return (
    <div
      className="sticky top-0 z-10 bg-cp-bg-surface px-2 h-14 flex items-center gap-1 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--cp-border, #D9E4EF)' }}
    >
      <button
        onClick={onBack}
        aria-label="পেছনে যান"
        className="w-10 h-10 rounded-full flex items-center justify-center text-cp-text-primary hover:bg-cp-bg-alt flex-shrink-0"
      >
        <FiArrowLeft size={20} />
      </button>
      <h1 className="text-[15px] font-bold text-cp-text-primary font-cp-head truncate">
        {title}
      </h1>
    </div>
  )
}
