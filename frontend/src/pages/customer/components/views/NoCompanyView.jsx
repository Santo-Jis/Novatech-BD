// components/views/NoCompanyView.jsx
//
// এখনো কোনো কোম্পানির সাথে connection নেই এমন person-এর জন্য।
// ✅ আপডেট: ConnectionsTab (search/request/QR/connected-list — যেটা
// আগে শুধু Dashboard-এর ভেতরের একটা ট্যাব ছিল) এখন এখানেও সরাসরি
// embed করা হলো, switchCompany prop সহ — তাই company-বিহীন কেউ এখান
// থেকেই কোম্পানি খুঁজে সংযোগের অনুরোধ পাঠাতে পারবে, আর সংযোগ accept
// হয়ে গেলে কার্ডে "প্রবেশ করুন" চেপে সরাসরি সেই কোম্পানির dashboard-এ
// ঢুকতে পারবে (switchCompany সফল হলে usePortalAuth নিজেই phase বদলে
// dashboard দেখাবে)।

import { FiUsers } from 'react-icons/fi'
import CpButton from '../ui/CpButton'
import ConnectionsTab from '../ConnectionsTab'

export default function NoCompanyView({ personProfile, portalJWT, switchCompany, onLogout }) {
  return (
    <div className="min-h-screen bg-cp-bg-base flex flex-col font-cp-body">
      <div className="flex-1 flex flex-col items-center px-4 pt-8 pb-6">
        <div className="w-full max-w-[420px] flex flex-col items-center">

          <div className="w-16 h-16 rounded-2xl bg-cp-trust-900 flex items-center justify-center mb-4 shadow-lg shadow-cp-trust-900/20">
            <FiUsers className="text-cp-trust-300" size={28} />
          </div>

          <h1 className="text-xl font-semibold text-cp-trust-700 font-cp-head mb-1 text-center">
            {personProfile?.shop_name ? `🏪 ${personProfile.shop_name}` : 'স্বাগতম'}
          </h1>
          {personProfile?.full_name && (
            <p className="text-cp-text-secondary text-[13px] mb-5">{personProfile.full_name}</p>
          )}
          <p className="text-cp-text-secondary text-[13px] leading-relaxed text-center mb-6">
            আপনার প্রোফাইল প্রস্তুত। এখন নিচ থেকে কোম্পানি খুঁজে সংযোগের অনুরোধ পাঠান,
            অথবা আপনার QR কোড SR-কে দেখান।
          </p>

          <div className="w-full">
            <ConnectionsTab portalJWT={portalJWT} switchCompany={switchCompany} />
          </div>

          <CpButton variant="secondary" size="lg" fullWidth onClick={onLogout} className="mt-6">
            লগআউট
          </CpButton>
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
