// MonthlyLedger.jsx
// SR মাসিক লেজার — সম্পূর্ণ পেজ (৫টা বিভাগ একসাথে)
// বিভাগ ১: সারসংক্ষেপ কার্ড (টার্গেট প্রগ্রেস + টপ ১০ পণ্য)
// বিভাগ ২: দৈনিক লেজার — এক্সপ্যান্ডেবল (দোকান/পণ্য/ভিজিট/খরচ/উপস্থিতি সহ)
// বিভাগ ৩: উপস্থিতি ক্যালেন্ডার (রঙিন ডট)
// বিভাগ ৪: বেতন স্লিপ + পরিশোধ স্ট্যাটাস
// বিভাগ ৫: বাকি লেজার (আমার বকেয়া + গ্রাহকের বাকি)
//
// রাউট: /worker/monthly-ledger

import { useNavigate } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'

import MonthlyLedgerSummaryCard from '../../components/MonthlyLedgerSummaryCard'
import DailyLedgerList          from '../../components/DailyLedgerList'
import AttendanceCalendar       from '../../components/AttendanceCalendar'
import SalarySlipCard           from '../../components/SalarySlipCard'
import DuesLedgerCard           from '../../components/DuesLedgerCard'

export default function MonthlyLedger() {
  const navigate = useNavigate()

  return (
    <div className="p-4 space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400"
        >
          <FiArrowLeft size={16} />
        </button>
        <div>
          <h2 className="font-bold text-gray-800 dark:text-gray-100 text-base">মাসিক লেজার</h2>
          <p className="text-xs text-gray-400">বিক্রয়, বেতন, উপস্থিতি ও বাকির সম্পূর্ণ হিসাব</p>
        </div>
      </div>

      {/* বিভাগ ১ — সারসংক্ষেপ কার্ড */}
      <MonthlyLedgerSummaryCard />

      {/* বিভাগ ২ — দৈনিক লেজার (এক্সপ্যান্ডেবল) */}
      <DailyLedgerList />

      {/* বিভাগ ৩ — উপস্থিতি ক্যালেন্ডার */}
      <AttendanceCalendar />

      {/* বিভাগ ৪ — বেতন স্লিপ + পরিশোধ স্ট্যাটাস */}
      <SalarySlipCard />

      {/* বিভাগ ৫ — বাকি লেজার (২ ট্যাব) */}
      <DuesLedgerCard />

    </div>
  )
}
