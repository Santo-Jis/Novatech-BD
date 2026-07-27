// pages/customer/ComingSoonView.jsx
// ✅ NEW — IA স্কেলেটন ধাপ ১: ভবিষ্যতের Phase 3 (Social/Messaging) নেভিগেশন
// স্লটের জন্য জেনেরিক প্লেসহোল্ডার পেজ। এখনো এই ফিচারের কোনো ব্যাকএন্ড/স্পেক
// চূড়ান্ত হয়নি — শুধু নেভিগেশন-এন্ট্রি পয়েন্টটা রিজার্ভ করে রাখা হলো, যাতে
// Phase 3 শুরু হলে পুরো ড্রয়ার/রুট স্ট্রাকচার আবার সাজাতে না হয়।
//
// ব্যবহার: <Route path="messages" element={<ComingSoonView icon={FiMessageCircle} title="মেসেজ" ... />} />

import { useNavigate } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'

export default function ComingSoonView({
  icon: Icon,
  title = 'শীঘ্রই আসছে',
  description = 'এই ফিচারটা এখনো তৈরি হচ্ছে। কাজ শেষ হলে এখানেই দেখতে পাবেন।',
}) {
  const navigate = useNavigate()

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-8 text-center gap-4">
      <div
        style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'rgba(96,165,250,0.1)',
          border: '1px solid rgba(96,165,250,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#60a5fa', fontSize: 30,
        }}
      >
        {Icon ? <Icon /> : '🚧'}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>{title}</p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{description}</p>
      </div>
      <button
        onClick={() => navigate('/customer/dashboard')}
        style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 999,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <FiArrowLeft /> ড্যাশবোর্ডে ফিরুন
      </button>
    </div>
  )
}
