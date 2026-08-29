// chat/ai/AIResultModal.jsx
//
// summary আর risk-check দুটোরই ফলাফল দেখানোর জন্য একটাই ছোট মডাল — mode
// দিয়ে কনটেন্ট বদলায়। risk-check-এ ঝুঁকি পাওয়া গেলে সরাসরি "ফ্ল্যাগ করুন"
// বাটন থাকে যেটা বিদ্যমান flagMessage() (Phase 3) কল করে — নতুন কিছু না,
// AI শুধু সাজেস্ট করে, ফ্ল্যাগ করাটা এখনো staff-এর সিদ্ধান্ত+ক্লিক।

import { FiX, FiFileText, FiAlertTriangle, FiCheckCircle, FiFlag } from 'react-icons/fi'

export default function AIResultModal({ mode, summary, risk, error, onFlag, flagging, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-cp-border bg-purple-50">
          {mode === 'summary' ? <FiFileText size={15} className="text-purple-700" /> : <FiAlertTriangle size={15} className="text-purple-700" />}
          <p className="font-cp-head font-semibold text-[13.5px] text-purple-900 flex-1">{mode === 'summary' ? 'AI সারাংশ' : 'AI রিস্ক-চেক'}</p>
          <button onClick={onClose} type="button" aria-label="বন্ধ করুন" className="p-1.5 rounded-full hover:bg-purple-100 text-purple-700">
            <FiX size={18} />
          </button>
        </div>

        <div className="px-4 py-4">
          {error ? (
            <p className="text-[13px] text-cp-error">{error}</p>
          ) : mode === 'summary' ? (
            <p className="text-[13.5px] text-cp-text-primary leading-relaxed whitespace-pre-wrap">{summary}</p>
          ) : risk?.detected ? (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FiAlertTriangle size={14} className="text-amber-500" />
                <p className="text-[13px] font-semibold text-cp-text-primary">
                  {risk.flagType === 'credit_risk' ? 'সম্ভাব্য ক্রেডিট-রিস্ক শনাক্ত' : 'সম্ভাব্য অভিযোগ শনাক্ত'}
                </p>
              </div>
              <p className="text-[13px] text-cp-text-secondary mb-3">{risk.reason}</p>
              <button
                onClick={onFlag}
                disabled={flagging}
                type="button"
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full bg-cp-trust-500 text-white text-[13px] font-medium disabled:opacity-50"
              >
                <FiFlag size={12} /> {flagging ? 'ফ্ল্যাগ করা হচ্ছে...' : 'এই মেসেজ ফ্ল্যাগ করুন'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-cp-success">
              <FiCheckCircle size={16} />
              <p className="text-[13px]">কোনো ঝুঁকি বা অভিযোগের ইঙ্গিত পাওয়া যায়নি।</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
