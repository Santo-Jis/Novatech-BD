// ============================================================
// components/ecommerce/OrderHistoryView.jsx
// ============================================================
// "আমার অর্ডার" সাব-ট্যাব — আগের সব অর্ডার রিকোয়েস্ট, স্ট্যাটাস,
// SR অ্যাসাইনমেন্ট, ট্র্যাকিং। ডেটা/লজিক অপরিবর্তিত, শুধু:
//   - status ব্যাজ এখন CpBadge (বাকি রিডিজাইনের সাথে সামঞ্জস্যপূর্ণ)
//   - প্রপার এরর স্টেট + রিট্রাই (আগে শুধু ছোট লাল টেক্সট ছিল)
//   - এম্পটি স্টেটে "শপে যান" বাটন (আগে "উপরের বাটনে ক্লিক করুন"
//     লেখা থাকত, কিন্তু সেই বাটনটাই আর এই পেজে নেই — শপ এখন
//     ডিফল্ট ল্যান্ডিং, তাই এটা এখন আসলেই কার্যকর একটা CTA)
//   - ✅ নতুন: প্রতি অর্ডারে আনুমানিক পণ্যমূল্য দেখায় (items-এ
//     unit_price থাকে, আগে এটা কখনো যোগ করে দেখানো হতো না) —
//     স্পষ্টভাবে "VAT/Tax ছাড়া" লেখা থাকে যাতে ভুল বোঝাবুঝি না হয়,
//     কারণ চূড়ান্ত বিল SR/অ্যাডমিন কনফার্ম করার পর ঠিক হয়।
// ============================================================
import { FiPackage, FiMapPin, FiX, FiAlertTriangle } from 'react-icons/fi'
import CpCard from '../ui/CpCard'
import CpButton from '../ui/CpButton'
import CpBadge from '../ui/CpBadge'
import CompanyTag from '../CompanyTag'

const STATUS_META = {
  pending:   { text: '⏳ অপেক্ষমাণ', variant: 'pending' },
  confirmed: { text: '✅ কনফার্ম',   variant: 'info' },
  assigned:  { text: '🚶 SR আসছে',   variant: 'info' },
  delivered: { text: '📦 সম্পন্ন',   variant: 'success' },
  cancelled: { text: '❌ বাতিল',     variant: 'error' },
}

export default function OrderHistoryView({
  requests = [],
  loading = false,
  error = null,
  onRetry,
  deliveredToast,
  onDismissToast,
  successMsg,
  onDismissSuccess,
  onTrack,
  onGoShop,
}) {
  return (
    <div className="flex flex-col gap-3">
      {deliveredToast && (
        <CpCard variant="surface" padding="none" className="bg-cp-confidence-600 border-0 overflow-hidden">
          <div className="flex gap-3 items-center px-4 py-3.5">
            <span className="text-[28px] flex-shrink-0">📦</span>
            <div className="flex-1">
              <p className="text-white font-bold text-[14px] font-cp-head">অর্ডার ডেলিভারি সম্পন্ন!</p>
              <p className="text-cp-confidence-100 text-[12px] mt-0.5 font-cp-body">
                আপনার অর্ডার ({(deliveredToast.items || []).length}টি পণ্য) সফলভাবে পৌঁছে গেছে।
              </p>
            </div>
            <button onClick={onDismissToast} className="text-white/70 flex-shrink-0">
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </CpCard>
      )}

      {successMsg && (
        <CpCard variant="alt" padding="md" className="border-cp-success/20 bg-cp-success/5 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="flex-1 text-cp-success font-semibold text-[13px] font-cp-body">{successMsg}</p>
          <button onClick={onDismissSuccess} className="text-cp-success/60">
            <FiX className="w-4 h-4" />
          </button>
        </CpCard>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1].map(i => (
            <div key={i} className="h-28 bg-cp-bg-alt rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <FiAlertTriangle className="w-8 h-8 text-cp-error" />
          <p className="text-[13px] text-cp-text-secondary font-cp-body max-w-[220px]">{error}</p>
          <CpButton variant="secondary" size="sm" onClick={onRetry}>আবার চেষ্টা করুন</CpButton>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <FiPackage className="w-9 h-9 text-cp-text-muted" />
          <p className="text-[13px] text-cp-text-secondary font-cp-body">এখনও কোনো অর্ডার রিকোয়েস্ট নেই</p>
          <p className="text-[11px] text-cp-text-muted max-w-[220px] font-cp-body">
            পণ্য বেছে কার্টে যোগ করলেই এখানে অর্ডার হিস্টোরি দেখা যাবে
          </p>
          <CpButton variant="primary" size="sm" onClick={onGoShop} className="mt-1">
            শপে যান
          </CpButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {requests.map(req => {
            const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
            const meta = STATUS_META[req.status] || STATUS_META.pending
            const subtotal = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.qty) || 0), 0)

            return (
              <div key={req.id} className="bg-white rounded-2xl border border-cp-border overflow-hidden">
                <div className="px-4 py-3">
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <p className="text-[11px] text-cp-text-muted font-cp-body">
                        {new Date(req.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-[13px] font-semibold text-cp-text-primary mt-0.5 font-cp-body">
                        {items.length}টি পণ্য
                      </p>
                      {/* ✅ ফিক্স: req.seller_name কখনো ব্যাকএন্ড থেকে আসতোই
                          না (আসল ফিল্ড company_name) — এই লাইন কখনো দেখাই
                          যায়নি। এখন all-order-requests থেকে company_name/
                          logo_url/tenant_id আসে (আগের getMyOrderRequests
                          এই ডেটা দিতই না)। */}
                      {(req.company_name_bn || req.company_name) && (
                        <div className="mt-1">
                          <CompanyTag
                            name={req.company_name_bn || req.company_name}
                            logoUrl={req.logo_url}
                            colorKey={req.tenant_id}
                          />
                        </div>
                      )}
                    </div>
                    <CpBadge variant={meta.variant}>{meta.text}</CpBadge>
                  </div>

                  <div className="flex flex-col gap-1 mb-2.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[13px] text-cp-text-secondary font-cp-body">
                        <span className="line-clamp-1">{item.product_name}</span>
                        <span className="font-medium text-cp-text-primary flex-shrink-0">× {item.qty}</span>
                      </div>
                    ))}
                  </div>

                  {subtotal > 0 && (
                    <div className="flex justify-between items-center pt-2 mb-2.5 border-t border-cp-border">
                      <span className="text-[10.5px] text-cp-text-muted font-cp-body">আনুমানিক পণ্যমূল্য (VAT/Tax ছাড়া)</span>
                      <span className="text-[13px] font-cp-head font-bold text-cp-trust-700">৳{subtotal.toFixed(2)}</span>
                    </div>
                  )}

                  {req.assigned_sr_name && (
                    <div className="bg-cp-trust-100 rounded-xl px-3 py-2 text-[12px] text-cp-trust-700 mb-1.5 font-cp-body">
                      🚶 SR: {req.assigned_sr_name}
                    </div>
                  )}
                  {req.admin_note && (
                    <div className="bg-cp-bg-alt rounded-xl px-3 py-2 text-[12px] text-cp-text-secondary mb-1.5 font-cp-body">
                      📝 {req.admin_note}
                    </div>
                  )}
                  {req.note && (
                    <div className="bg-cp-info-bg rounded-xl px-3 py-2 text-[12px] text-cp-info font-cp-body">
                      💬 আপনার নোট: {req.note}
                    </div>
                  )}

                  {['confirmed', 'assigned', 'delivered'].includes(req.status) && (
                    <button
                      onClick={() => onTrack(req.id)}
                      className="mt-2.5 w-full py-2 bg-cp-trust-100 hover:bg-cp-trust-100/70 text-cp-trust-700 rounded-xl text-[12px] font-semibold font-cp-body transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FiMapPin className="w-3.5 h-3.5" /> ট্র্যাকিং দেখুন
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
