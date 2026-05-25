import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiTrendingUp, FiGift, FiDollarSign, FiCalendar, FiChevronLeft, FiChevronRight, FiCheckCircle, FiClock, FiUser, FiHash, FiInfo, FiAward, FiStar } from 'react-icons/fi'

// ─── বাংলা মাসের নাম ───────────────────────────────
const MONTHS_BN = ['', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

// ─── সংখ্যাকে বাংলা টাকা ফরম্যাট ──────────────────
const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

// ─── তারিখ ফরম্যাট ──────────────────────────────────
const formatDate = (dateStr) => {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_BN[d.getMonth() + 1]}`
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const date = `${d.getDate()} ${MONTHS_BN[d.getMonth() + 1]} ${d.getFullYear()}`
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${date}, ${h}:${m}`
}

// ─── Row Type ব্যাজ ──────────────────────────────────
function TypeBadge({ type }) {
  const map = {
    daily:            { label: 'বিক্রয়', cls: 'bg-blue-50 text-blue-700' },
    attendance_bonus: { label: 'বোনাস',  cls: 'bg-green-50 text-green-700' },
  }
  const s = map[type] || { label: type, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default function Commission() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedRow,  setExpandedRow]  = useState(null)
  const [bonusStatus,  setBonusStatus]  = useState(null)
  const [bonusLoading, setBonusLoading] = useState(true)
  const [showBonus,    setShowBonus]    = useState(false)

  const fetchData = () => {
    setLoading(true)
    api.get(`/commission/my?month=${month}&year=${year}`)
      .then(res => setData(res.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const fetchBonusStatus = () => {
    setBonusLoading(true)
    api.get('/commission/bonus-status')
      .then(res => setBonusStatus(res.data.data))
      .catch(() => setBonusStatus(null))
      .finally(() => setBonusLoading(false))
  }

  useEffect(() => { fetchData() }, [month, year])
  useEffect(() => { fetchBonusStatus() }, [])

  // মাস নেভিগেশন
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
    if (isCurrentMonth) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  const summary  = data?.summary  || {}
  const daily    = data?.daily    || []
  const preview  = data?.salary_preview || {}

  return (
    <div className="px-4 pb-20 bg-slate-50 min-h-screen">

      {/* ─── হেডার ─── */}
      <h2 className="font-bold text-lg text-slate-800 mb-3 pt-4">
        কমিশন বিবরণী
      </h2>

      {/* ─── মাস নেভিগেটর ─── */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-2.5 shadow-sm mb-3.5">
        <button onClick={prevMonth} className="p-1 text-slate-500 hover:text-slate-800 transition-colors">
          <FiChevronLeft size={20} />
        </button>
        <span className="font-semibold text-slate-800 text-[15px]">
          {MONTHS_BN[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className={`p-1 transition-colors ${isCurrentMonth ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <FiChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          তথ্য পাওয়া যায়নি
        </div>
      ) : (
        <>
          {/* ─── সারসংক্ষেপ কার্ড ৪টি ─── */}
          <div className="grid grid-cols-2 gap-2.5 mb-3.5">
            {[
              { label: 'মোট বিক্রয়',    value: taka(summary.total_sales),       icon: <FiTrendingUp size={16} />, iconCls: 'bg-blue-50 text-blue-700' },
              { label: 'বিক্রয় কমিশন', value: taka(summary.daily_commission),  icon: <FiDollarSign size={16} />, iconCls: 'bg-violet-50 text-violet-700' },
              { label: 'উপস্থিতি বোনাস',value: taka(summary.bonus),             icon: <FiGift size={16} />,       iconCls: 'bg-green-50 text-green-700' },
              { label: 'মোট কমিশন',     value: taka(summary.total_commission),  icon: <FiCalendar size={16} />,   iconCls: 'bg-amber-50 text-amber-700' },
            ].map(({ label, value, icon, iconCls }) => (
              <div key={label} className="bg-white rounded-2xl px-3.5 py-3 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`p-1.5 rounded-lg flex ${iconCls}`}>{icon}</span>
                  <span className="text-[11px] text-slate-500">{label}</span>
                </div>
                <p className="font-bold text-base text-slate-800 m-0">{value}</p>
              </div>
            ))}
          </div>

          {/* ─── বেতন প্রিভিউ ─── */}
          {preview.net_payable > 0 && (
            <div className="bg-gradient-to-br from-blue-900 to-blue-600 rounded-2xl px-4 py-3.5 mb-3.5 text-white">
              <p className="text-xs opacity-80 mb-2">এই মাসের অনুমানিত পাওনা</p>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm opacity-85">মূল বেতন</span>
                <span className="text-sm font-semibold">{taka(preview.basic_salary)}</span>
              </div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm opacity-85">মোট কমিশন</span>
                <span className="text-sm font-semibold text-blue-300">+ {taka(preview.total_commission)}</span>
              </div>
              {preview.outstanding_dues > 0 && (
                <>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm opacity-85">বকেয়া কর্তন</span>
                    <span className="text-sm font-semibold text-red-300">− {taka(preview.outstanding_dues)}</span>
                  </div>
                  {preview.product_dues > 0 && (
                    <div className="flex justify-between pl-2.5">
                      <span className="text-xs opacity-65">↳ পণ্য ঘাটতি</span>
                      <span className="text-xs text-red-300 opacity-85">৳{parseInt(preview.product_dues).toLocaleString()}</span>
                    </div>
                  )}
                  {preview.cash_dues > 0 && (
                    <div className="flex justify-between pl-2.5 mt-0.5">
                      <span className="text-xs opacity-65">↳ নগদ ঘাটতি</span>
                      <span className="text-xs text-red-300 opacity-85">৳{parseInt(preview.cash_dues).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-white/20 mt-2 pt-2 flex justify-between">
                <span className="font-bold text-[15px]">নেট পাওনা</span>
                <span className="font-extrabold text-lg">{taka(preview.net_payable)}</span>
              </div>
            </div>
          )}

          {/* ─── বোনাস স্ট্যাটাস Accordion ─── */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3.5">
            <button
              onClick={() => setShowBonus(v => !v)}
              className="w-full px-4 py-3.5 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="bg-green-50 text-green-700 p-1.5 rounded-lg flex">
                  <FiAward size={15} />
                </span>
                <span className="font-bold text-slate-800 text-sm">উপস্থিতি বোনাস স্ট্যাটাস</span>
                {bonusStatus && bonusStatus.perfect_months > 0 && (
                  <span className="bg-yellow-100 text-amber-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {bonusStatus.perfect_months} মাস পূর্ণ
                  </span>
                )}
              </div>
              <span className={`text-gray-500 text-base transition-transform duration-200 inline-block ${showBonus ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {showBonus && (
              <div className="border-t border-slate-100 p-4">
                {bonusLoading ? (
                  <div className="flex flex-col gap-2">
                    {[1,2,3].map(i => <div key={i} className="h-11 bg-slate-50 rounded-xl" />)}
                  </div>
                ) : !bonusStatus ? (
                  <p className="text-center text-slate-400 text-sm">তথ্য পাওয়া যায়নি</p>
                ) : (
                  <>
                    {/* Top Summary */}
                    <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                      <div className="bg-green-50 rounded-xl px-3.5 py-3 text-center">
                        <p className="text-[22px] font-extrabold text-green-700 m-0">{bonusStatus.perfect_months}</p>
                        <p className="text-[11px] text-green-700 mt-1 m-0">পূর্ণ উপস্থিতি মাস</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl px-3.5 py-3 text-center">
                        <p className="text-[22px] font-extrabold text-amber-700 m-0">
                          ৳{parseInt(bonusStatus.pending_bonus || 0).toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-amber-700 mt-1 m-0">অপরিশোধিত বোনাস</p>
                      </div>
                    </div>

                    {/* 8-month progress bar */}
                    <div className="bg-slate-50 rounded-xl px-3.5 py-3 mb-3.5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">
                          🏆 ৮ মাসের মধ্যে পূর্ণ উপস্থিতি
                        </span>
                        <span className="text-xs font-bold text-green-700">
                          {bonusStatus.perfect_months}/{bonusStatus.total_8_months}
                        </span>
                      </div>
                      <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (bonusStatus.perfect_months / bonusStatus.total_8_months) * 100)}%` }}
                        />
                      </div>
                      {bonusStatus.next_bonus_in > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                          আরো <strong>{bonusStatus.next_bonus_in}</strong> মাস পূর্ণ উপস্থিতি হলে বোনাস সাইকেল সম্পন্ন
                        </p>
                      )}
                    </div>

                    {/* Month-by-month rows */}
                    {bonusStatus.months && bonusStatus.months.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {bonusStatus.months.map((m, i) => {
                          const MONTHS_BN_SHORT = ['','জানু','ফেব্রু','মার্চ','এপ্রি','মে','জুন','জুলা','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে']
                          const pct = m.working_days > 0 ? Math.min(100, Math.round((m.present_days / m.working_days) * 100)) : 0
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border ${
                                m.is_perfect
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-slate-50 border-slate-100'
                              }`}
                            >
                              {/* Month label */}
                              <div className="w-11 shrink-0">
                                <p className="text-[11px] font-bold text-gray-700 m-0">{MONTHS_BN_SHORT[m.month]}</p>
                                <p className="text-[10px] text-slate-400 m-0">{m.year}</p>
                              </div>

                              {/* Progress bar */}
                              <div className="flex-1">
                                <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${m.is_perfect ? 'bg-green-500' : 'bg-slate-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 m-0">
                                  {m.present_days}/{m.working_days} দিন
                                </p>
                              </div>

                              {/* Status */}
                              <div className="shrink-0 text-right">
                                {m.is_perfect ? (
                                  <>
                                    <div className="flex items-center gap-1">
                                      <FiStar size={11} color="#f59e0b" fill="#f59e0b" />
                                      <span className="text-[11px] font-bold text-green-700">পূর্ণ</span>
                                    </div>
                                    <p className={`text-[10px] mt-0.5 m-0 font-semibold ${m.bonus_paid ? 'text-slate-400' : 'text-amber-700'}`}>
                                      {m.bonus_paid ? '✅ পরিশোধিত' : `৳${parseInt(m.bonus_amount || 0).toLocaleString()}`}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ─── দৈনিক ইতিহাস ─── */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 m-0">
                দিনভিত্তিক বিবরণ
                <span className="text-xs font-normal text-slate-400 ml-1.5">
                  ({daily.length}টি এন্ট্রি)
                </span>
              </h3>
            </div>

            {daily.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                এই মাসে কোনো কমিশন তথ্য নেই
              </div>
            ) : (
              <div>
                {daily.map((row, i) => {
                  const isExpanded = expandedRow === i
                  const isPaid = row.paid

                  return (
                    <div key={i} className={i < daily.length - 1 ? 'border-b border-slate-100' : ''}>
                      {/* ─── মূল রো ─── */}
                      <div
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-sky-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                        }`}
                      >
                        {/* বাম: তারিখ + ধরন */}
                        <div className="flex flex-col gap-0.5 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[13px] text-slate-800">
                              {formatDate(row.date)}
                            </span>
                            <TypeBadge type={row.type} />
                          </div>
                          {row.sales_amount > 0 && (
                            <span className="text-[11px] text-slate-400">
                              বিক্রয়: {taka(row.sales_amount)}
                              {row.commission_rate > 0 && ` · ${row.commission_rate}%`}
                            </span>
                          )}
                        </div>

                        {/* ডান: কমিশন + পেমেন্ট স্ট্যাটাস */}
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-bold text-sm text-slate-800">
                            {taka(row.commission_amount)}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className={`flex items-center gap-0.5 text-[10px] ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                              {isPaid
                                ? <><FiCheckCircle size={10} /> পরিশোধিত</>
                                : <><FiClock size={10} /> বাকি</>
                              }
                            </span>
                            {isPaid && (
                              <FiInfo size={11} color={isExpanded ? '#1d4ed8' : '#94a3b8'} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ─── পেমেন্ট বিস্তারিত (expanded) ─── */}
                      {isExpanded && (
                        <div className="bg-sky-50 border-t border-dashed border-sky-200 px-4 pt-2.5 pb-3">
                          {isPaid ? (
                            <div className="flex flex-col gap-1.5">
                              {/* পরিশোধের তারিখ */}
                              {row.paid_at && (
                                <div className="flex items-start gap-2">
                                  <span className="bg-blue-100 text-blue-700 rounded-md p-1 flex shrink-0">
                                    <FiCalendar size={11} />
                                  </span>
                                  <div>
                                    <p className="text-[10px] text-slate-500 m-0 mb-0.5">পরিশোধের তারিখ ও সময়</p>
                                    <p className="text-xs font-semibold text-slate-800 m-0">{formatDateTime(row.paid_at)}</p>
                                  </div>
                                </div>
                              )}

                              {/* অনুমোদনকারী */}
                              {row.approved_by_name && (
                                <div className="flex items-start gap-2">
                                  <span className="bg-green-100 text-green-700 rounded-md p-1 flex shrink-0">
                                    <FiUser size={11} />
                                  </span>
                                  <div>
                                    <p className="text-[10px] text-slate-500 m-0 mb-0.5">অনুমোদন করেছেন</p>
                                    <p className="text-xs font-semibold text-slate-800 m-0">{row.approved_by_name}</p>
                                  </div>
                                </div>
                              )}

                              {/* পেমেন্ট রেফারেন্স */}
                              {row.payment_reference && (
                                <div className="flex items-start gap-2">
                                  <span className="bg-yellow-100 text-amber-700 rounded-md p-1 flex shrink-0">
                                    <FiHash size={11} />
                                  </span>
                                  <div>
                                    <p className="text-[10px] text-slate-500 m-0 mb-0.5">পেমেন্ট রেফারেন্স</p>
                                    <p className="text-xs font-semibold text-slate-800 m-0 font-mono">{row.payment_reference}</p>
                                  </div>
                                </div>
                              )}

                              {/* কোনো তথ্য না থাকলে */}
                              {!row.paid_at && !row.approved_by_name && !row.payment_reference && (
                                <p className="text-xs text-slate-400 m-0 text-center">
                                  পেমেন্টের বিস্তারিত তথ্য পাওয়া যায়নি
                                </p>
                              )}
                            </div>
                          ) : (
                            /* বাকি থাকলে */
                            <div className="flex items-center gap-2">
                              <FiClock size={13} className="text-amber-600" />
                              <p className="text-xs text-amber-800 m-0">
                                এখনো পরিশোধ হয়নি — পেমেন্টের পর বিস্তারিত দেখা যাবে
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── মোট footer ─── */}
          {daily.length > 0 && (
            <div className="flex justify-between items-center bg-white rounded-xl px-4 py-3 mt-2.5 shadow-sm">
              <span className="text-sm text-slate-500">
                {daily.length}টি দিনের মোট কমিশন
              </span>
              <span className="font-extrabold text-base text-slate-800">
                {taka(summary.total_commission)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
