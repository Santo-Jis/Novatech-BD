// components/worker/CustomerCard.jsx
//
// ⬇️ নতুন — Phase 1 অংশ ২ (CustomerList.jsx ভাঙা)। আগে এই পুরো JSX ব্লকটা
// filtered.map()-এর ভেতরে ইনলাইন ছিল। বিজুয়াল/লজিক হুবহু অপরিবর্তিত —
// শুধু IIFE-দিয়ে-করা ক্রেডিট-বার হিসাবটা এখন component-এর top-level const
// (এখন এটা নিজেই একটা component, তাই IIFE হ্যাকের আর দরকার নেই)।
import { FiNavigation, FiEdit2, FiMail } from 'react-icons/fi';
import { formatDistance } from '../../hooks/useNextStop';

export default function CustomerCard({
  customer: c,
  isNextStop,
  nextStopDistanceMeters,
  distanceMeters,
  isActive,
  currentUserId,
  sendingWhatsApp,
  onVisit,
  onNavigate,
  onSendWhatsApp,
  onEdit,
  innerRef,
}) {
  // ── ক্রেডিট লিমিট বার হিসাব ──
  const limit  = parseFloat(c.credit_limit || 0);
  const used   = parseFloat(c.current_credit || 0);
  const pct    = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isFull = limit > 0 && used >= limit;
  const isHigh = pct >= 80 && !isFull;
  const showCreditBlock = !(limit === 0 && used === 0);

  const dueDays = c.credit_since && used > 0
    ? Math.floor((Date.now() - new Date(c.credit_since)) / 86400000)
    : null;
  const dueDaysCls = dueDays === null
    ? ''
    : dueDays >= 15 ? 'text-red-600' : dueDays >= 7 ? 'text-amber-600' : 'text-gray-400';

  return (
    <div
      ref={innerRef}
      className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all
        ${c.visited_today ? 'border-green-400'
          : isNextStop ? 'border-blue-500'
          : 'border-gray-200'}
        ${isActive ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
    >
      {/* Next Stop label */}
      {isNextStop && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
            ⭐ Next Stop — সবচেয়ে কাছে ({formatDistance(nextStopDistanceMeters)})
          </span>
        </div>
      )}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0" onClick={onVisit}>
          <div className="flex items-center gap-2 flex-wrap">
            {c.visit_order != null && (
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary
                               text-xs font-bold flex items-center justify-center flex-shrink-0">
                {c.visit_order}
              </span>
            )}
            <h3 className="font-semibold text-gray-800">{c.shop_name}</h3>
            {c.has_pending_edit && (
              <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">⏳ pending</span>
            )}
            {!c.is_verified && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🆕 Unverified</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {c.owner_name}
            {c.primary_worker_id && c.primary_worker_id !== currentUserId && (
              <span className="text-gray-400"> · প্রাইমারি: {c.primary_worker_name}</span>
            )}
          </p>
          {c.last_visited_at && (
            <p className="text-xs text-gray-400 mt-0.5">
              সর্বশেষ ভিজিট: {new Date(c.last_visited_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })} · {c.last_visited_by_name}
            </p>
          )}
          {!c.latitude && (
            <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
              📍 GPS বসানো হয়নি — এডিট থেকে যোগ করুন
            </p>
          )}

          {(c.whatsapp || c.sms_phone) && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              📞 {c.whatsapp || c.sms_phone}
            </p>
          )}
          {c.route_name && (
            <p className="text-xs text-gray-400 mt-0.5">🗺 {c.route_name}</p>
          )}
          {c.email && (
            <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
              <FiMail size={10} /> {c.email}
            </p>
          )}
          {formatDistance(distanceMeters) && (
            <p className="text-xs text-blue-500 font-medium mt-0.5 flex items-center gap-1">
              <FiNavigation size={10} /> {formatDistance(distanceMeters)} দূরে
            </p>
          )}

          {/* Credit limit bar */}
          {showCreditBlock && (
            <div className="mt-2 space-y-1">
              {limit > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[10px] text-gray-400">বাকির লিমিট</span>
                    <span className={`text-[10px] font-bold ${isFull ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-gray-500'}`}>
                      {pct}% ব্যবহার
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-gray-400">বাকি: <span className={`font-semibold ${isFull ? 'text-red-500' : 'text-gray-600'}`}>৳{parseInt(used).toLocaleString()}</span></span>
                    <span className="text-[10px] text-gray-400">লিমিট: ৳{parseInt(limit).toLocaleString()}</span>
                  </div>
                  {dueDays !== null && (
                    <p className={`text-[10px] mt-0.5 ${dueDaysCls}`}>
                      {dueDays === 0 ? 'আজকের বাকি' : `${dueDays} দিন ধরে বাকি`}
                    </p>
                  )}
                </div>
              )}
              {isFull && (
                <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                  <span className="text-[11px]">🚫</span>
                  <span className="text-[11px] text-red-700 font-bold">লিমিট শেষ — আর বাকি দেওয়া যাবে না</span>
                </div>
              )}
              {isHigh && (
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  <span className="text-[11px]">⚠️</span>
                  <span className="text-[11px] text-amber-700 font-semibold">লিমিটের কাছাকাছি</span>
                </div>
              )}
              {!isFull && !isHigh && used > 0 && (
                <p className="text-[10px] text-gray-400">আরো দিতে পারবেন: <span className="text-emerald-600 font-semibold">৳{parseInt(limit - used).toLocaleString()}</span></p>
              )}
            </div>
          )}
        </div>

        {/* Right side action buttons */}
        <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
          {c.visited_today
            ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ ভিজিট</span>
            : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">বাকি</span>
          }

          {/* Google Maps Navigate বাটন */}
          {c.latitude && c.longitude && (
            <button
              onClick={onNavigate}
              title="Google Maps-এ Navigate করুন"
              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 active:scale-90 transition-transform"
            >
              <FiNavigation size={14} />
            </button>
          )}

          {/* WhatsApp Portal Link */}
          {c.whatsapp && (
            <button
              onClick={e => { e.stopPropagation(); onSendWhatsApp(); }}
              disabled={sendingWhatsApp}
              title="WhatsApp-এ Portal Link পাঠান"
              className="p-1.5 rounded-lg bg-green-50 text-green-600 active:scale-90 transition-transform disabled:opacity-50"
            >
              {sendingWhatsApp
                ? <span style={{ fontSize: 12 }}>...</span>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              }
            </button>
          )}

          {!c.has_pending_edit && (
            <button onClick={e => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 rounded-lg bg-gray-50 text-gray-500 active:scale-90 transition-transform">
              <FiEdit2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
