import { useState, useEffect } from 'react'
import api from '../../api/axios'
import {
  FiChevronLeft, FiChevronRight, FiTrendingUp, FiDollarSign,
  FiAlertTriangle, FiCheckCircle, FiClock, FiChevronDown, FiChevronUp
} from 'react-icons/fi'

const MONTHS_BN = ['','জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
  'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

const taka = n => '৳' + parseInt(n || 0).toLocaleString('en-IN')

function StatRow({ label, value, valueClass = 'text-gray-800', border = true }) {
  return (
    <div className={`flex justify-between items-center py-2 ${border ? 'border-b border-gray-50' : ''}`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-bold ${valueClass}`}>{value}</span>
    </div>
  )
}

function MonthCard({ data }) {
  const [open, setOpen] = useState(false)
  const { year, month, settlement, commission, salary, dues } = data

  const hasSettlement = !!settlement
  const hasCommission = !!commission
  const hasSalary     = !!salary
  const hasDues       = !!dues && (dues.dues_added > 0 || dues.dues_cleared > 0)

  const salaryStatus = hasSalary
    ? (salary.status === 'paid'    ? { label: 'পরিশোধিত',  cls: 'bg-emerald-100 text-emerald-700' }
      : salary.status === 'pending' ? { label: 'অপেক্ষমান', cls: 'bg-amber-100 text-amber-700' }
      : { label: salary.status,     cls: 'bg-gray-100 text-gray-600' })
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

      {/* ─── Header ─── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3.5 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-xl w-10 h-10 flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] text-primary font-bold leading-none">{MONTHS_BN[month].slice(0,3)}</span>
            <span className="text-[10px] text-primary/70 leading-none">{year}</span>
          </div>
          <div className="text-left">
            <p className="font-bold text-gray-800 text-sm">{MONTHS_BN[month]} {year}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {hasSettlement && (
                <span className="text-[10px] text-gray-500">{settlement.approved_days}দিন কাজ</span>
              )}
              {hasSalary && salaryStatus && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${salaryStatus.cls}`}>
                  {salaryStatus.label}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasSalary && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400">নেট পাওনা</p>
              <p className="text-sm font-extrabold text-gray-800">{taka(salary.net_payable)}</p>
            </div>
          )}
          {open
            ? <FiChevronUp className="text-gray-400 shrink-0" size={18} />
            : <FiChevronDown className="text-gray-400 shrink-0" size={18} />
          }
        </div>
      </button>

      {/* ─── বিস্তারিত ─── */}
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">

          {/* বিক্রয় ও settlement */}
          {hasSettlement && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">বিক্রয় ও হিসাব</p>
              <StatRow label="মোট বিক্রয়"      value={taka(settlement.total_sales)}         valueClass="text-secondary" />
              <StatRow label="নগদ সংগ্রহ"       value={taka(settlement.total_cash_collected)} valueClass="text-primary" />
              <StatRow label="বাকি দেওয়া"        value={taka(settlement.total_credit_given)}   valueClass="text-amber-600" />
              {settlement.total_replacement_value > 0 && (
                <StatRow label="রিপ্লেসমেন্ট"    value={taka(settlement.total_replacement_value)} valueClass="text-purple-600" />
              )}
              {settlement.total_old_credit_collected > 0 && (
                <StatRow label="পুরনো বাকি আদায়" value={taka(settlement.total_old_credit_collected)} valueClass="text-teal-600" />
              )}
              {settlement.total_shortage_value > 0 && (
                <StatRow label="পণ্য ঘাটতি"      value={taka(settlement.total_shortage_value)}  valueClass="text-red-600" />
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {settlement.approved_days > 0 && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                    ✅ {settlement.approved_days} অনুমোদিত
                  </span>
                )}
                {settlement.disputed_days > 0 && (
                  <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
                    ⚠️ {settlement.disputed_days} বিতর্কিত
                  </span>
                )}
                {settlement.pending_days > 0 && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                    ⏳ {settlement.pending_days} অপেক্ষমান
                  </span>
                )}
              </div>
            </div>
          )}

          {/* কমিশন */}
          {hasCommission && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">কমিশন</p>
              <StatRow label="বিক্রয় ভিত্তিক বিক্রয়" value={taka(commission.total_sales)}      valueClass="text-gray-700" />
              <StatRow label="মোট কমিশন"               value={taka(commission.total_commission)} valueClass="text-violet-700" />
              <div className="flex gap-2 mt-2">
                {commission.paid_days > 0 && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                    ✅ {commission.paid_days}দিন পরিশোধিত
                  </span>
                )}
                {commission.unpaid_days > 0 && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                    ⏳ {commission.unpaid_days}দিন বাকি
                  </span>
                )}
              </div>
            </div>
          )}

          {/* বেতন */}
          {hasSalary && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-600 rounded-xl p-3 text-white">
              <p className="text-[10px] opacity-70 mb-2 uppercase tracking-wide">বেতন বিবরণ</p>
              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="text-xs opacity-80">মূল বেতন</span><span className="text-xs font-semibold">{taka(salary.basic_salary)}</span></div>
                <div className="flex justify-between"><span className="text-xs opacity-80">কমিশন</span><span className="text-xs font-semibold text-blue-300">+ {taka(salary.total_commission)}</span></div>
                {salary.attendance_deduction > 0 && (
                  <div className="flex justify-between"><span className="text-xs opacity-80">অনুপস্থিতি কর্তন</span><span className="text-xs text-red-300">− {taka(salary.attendance_deduction)}</span></div>
                )}
                {salary.dues_deducted > 0 && (
                  <div className="flex justify-between"><span className="text-xs opacity-80">বকেয়া কর্তন</span><span className="text-xs text-red-300">− {taka(salary.dues_deducted)}</span></div>
                )}
                <div className="border-t border-white/20 pt-1.5 flex justify-between">
                  <span className="text-sm font-bold">নেট পাওনা</span>
                  <span className="text-sm font-extrabold">{taka(salary.net_payable)}</span>
                </div>
              </div>
              {salary.paid_at && (
                <p className="text-[10px] opacity-60 mt-2">
                  পরিশোধ: {new Date(salary.paid_at).toLocaleDateString('bn-BD')}
                  {salary.approved_by ? ` · ${salary.approved_by}` : ''}
                </p>
              )}
            </div>
          )}

          {/* বকেয়া ইতিহাস */}
          {hasDues && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">বকেয়া পরিবর্তন</p>
              {dues.dues_added > 0 && (
                <StatRow label="নতুন বকেয়া যোগ"   value={`+ ${taka(dues.dues_added)}`}   valueClass="text-red-600" />
              )}
              {dues.dues_cleared > 0 && (
                <StatRow label="বকেয়া কাটা গেছে" value={`− ${taka(dues.dues_cleared)}`} valueClass="text-emerald-600" border={false} />
              )}
              {dues.breakdown?.map((b, i) => (
                <div key={i} className="flex gap-1 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    b.type === 'product_shortage' ? 'bg-red-50 text-red-600'
                    : b.type === 'cash_mismatch'  ? 'bg-amber-50 text-amber-600'
                    : 'bg-gray-100 text-gray-500'}`}>
                    {b.type === 'product_shortage' ? '📦 পণ্য ঘাটতি'
                     : b.type === 'cash_mismatch' ? '💵 নগদ ঘাটতি'
                     : b.type}
                    {b.added > 0 ? ` +${taka(b.added)}` : ''}
                    {b.cleared > 0 ? ` −${taka(b.cleared)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* কোনো ডেটা নেই */}
          {!hasSettlement && !hasCommission && !hasSalary && (
            <p className="text-xs text-gray-400 text-center py-2">এই মাসে কোনো তথ্য নেই</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyStatement() {
  const now = new Date()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [toYear,  setToYear]  = useState(now.getFullYear())
  const [toMonth, setToMonth] = useState(now.getMonth() + 1)

  const fetchData = async (ty, tm) => {
    setLoading(true)
    try {
      const res = await api.get(`/settlements/my/statement?to_year=${ty}&to_month=${tm}`)
      setData(res.data)
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData(toYear, toMonth) }, [toYear, toMonth])

  const prevRange = () => {
    if (toMonth === 1) { setToMonth(12); setToYear(y => y - 1) }
    else setToMonth(m => m - 1)
  }
  const nextRange = () => {
    const isCurrent = toMonth === now.getMonth() + 1 && toYear === now.getFullYear()
    if (isCurrent) return
    if (toMonth === 12) { setToMonth(1); setToYear(y => y + 1) }
    else setToMonth(m => m + 1)
  }
  const isCurrent = toMonth === now.getMonth() + 1 && toYear === now.getFullYear()

  const range    = data?.range
  const worker   = data?.worker
  const months   = data?.months || []

  const fromLabel = range ? `${MONTHS_BN[range.from_month]} ${range.from_year}` : ''
  const toLabel   = range ? `${MONTHS_BN[range.to_month]} ${range.to_year}`     : ''

  return (
    <div className="px-4 pb-20 bg-slate-50 min-h-screen">

      <h2 className="font-bold text-lg text-slate-800 pt-4 mb-3">মাসিক স্টেটমেন্ট</h2>

      {/* ─── বর্তমান বকেয়া ─── */}
      {worker && worker.outstanding_dues > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="text-red-500" size={18} />
            <div>
              <p className="text-sm font-bold text-red-700">বর্তমান বকেয়া</p>
              <p className="text-xs text-red-500">বেতনের সময় কাটা যাবে</p>
            </div>
          </div>
          <p className="text-lg font-extrabold text-red-700">{taka(worker.outstanding_dues)}</p>
        </div>
      )}
      {worker && worker.outstanding_dues === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-4 flex items-center gap-2">
          <FiCheckCircle className="text-emerald-500" size={16} />
          <p className="text-sm text-emerald-700 font-medium">কোনো বকেয়া নেই ✅</p>
        </div>
      )}

      {/* ─── Range Navigator ─── */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-4 flex items-center justify-between">
        <button onClick={prevRange} className="p-1.5 text-slate-500 hover:text-slate-800 transition-colors">
          <FiChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800 text-sm">
            {fromLabel} — {toLabel}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">৬ মাসের বিবরণ</p>
        </div>
        <button onClick={nextRange} disabled={isCurrent}
          className={`p-1.5 transition-colors ${isCurrent ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800'}`}>
          <FiChevronRight size={20} />
        </button>
      </div>

      {/* ─── Content ─── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : months.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FiTrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">এই সময়ে কোনো তথ্য নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {months.map(m => (
            <MonthCard key={`${m.year}-${m.month}`} data={m} />
          ))}
        </div>
      )}
    </div>
  )
}
