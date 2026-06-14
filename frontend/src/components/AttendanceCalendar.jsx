// AttendanceCalendar.jsx
// SR মাসিক লেজার — বিভাগ ৩: উপস্থিতি ক্যালেন্ডার (ভিজ্যুয়াল)
// প্রতিদিন রঙিন ডট — ✅ উপস্থিত | ⚠️ দেরি | ❌ অনুপস্থিত | 🟣 ছুটি
// ডটে ট্যাপ করলে চেক-ইন/আউট সময় + দেরি + কর্তন দেখাবে
// ডেটা সোর্স: বিদ্যমান GET /api/attendance/my ও /api/attendance/settings (নতুন backend লাগেনি)
// Usage: <AttendanceCalendar />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock } from 'react-icons/fi'

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const toBn = (n) => String(n).replace(/[0-9]/g, d => BN_DIGITS[d])
const fmt  = (n) => Math.round(parseFloat(n || 0)).toLocaleString('bn-BD')

const WEEKDAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি']

const STATUS = {
  present: { label: 'উপস্থিত',   icon: '✅', dot: 'bg-emerald-500', cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
  late:    { label: 'দেরি',       icon: '⚠️', dot: 'bg-amber-500',   cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  absent:  { label: 'অনুপস্থিত', icon: '❌', dot: 'bg-red-500',     cls: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
  leave:   { label: 'ছুটি',       icon: '🟣', dot: 'bg-purple-400',  cls: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
}

const timeOnly = (ts) => {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
}

const pad = (n) => String(n).padStart(2, '0')

export default function AttendanceCalendar() {
  const now = new Date()
  // স্থানীয় (BD) তারিখ — toISOString() UTC দেয়, মধ্যরাতের আশেপাশে এক দিন কম দেখাতে পারে
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,     setData]     = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)

  // সেটিংস (সাপ্তাহিক ছুটি + হলিডে লিস্ট) — একবারই লোড হবে
  useEffect(() => {
    api.get('/attendance/settings')
      .then(res => setSettings(res.data.data))
      .catch(() => setSettings(null))
  }, [])

  // মাসের attendance ডেটা
  useEffect(() => {
    setLoading(true)
    setSelected(null)
    api.get(`/attendance/my?month=${month}&year=${year}`)
      .then(res => setData(res.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [month, year])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)
    if (isCurrentOrFuture) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const monthName = new Date(year, month - 1, 1).toLocaleString('bn-BD', { month: 'long', year: 'numeric' })

  // date → attendance রেকর্ড ম্যাপ
  const attMap = {}
  data?.attendance?.forEach(r => {
    const d = r.date?.split?.('T')[0] || r.date
    if (d) attMap[d] = r
  })

  // সাপ্তাহিক ছুটি / সরকারি ছুটি কিনা
  const isOffDay = (dateStr) => {
    if (!settings) return false
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    if (dow === (settings.weekly_off_day ?? 5)) return true
    const holidays = Array.isArray(settings.holidays) ? settings.holidays : []
    return holidays.some(h => h?.startsWith?.(dateStr) || h === dateStr)
  }

  // ক্যালেন্ডার গ্রিড সেল
  const firstDow = new Date(year, month - 1, 1).getDay()
  const lastDay  = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ day: d, dateStr: `${year}-${pad(month)}-${pad(d)}` })
  }

  const summary = data?.summary
  const bonus   = data?.bonus_progress

  const selRecord = selected ? attMap[selected] : null
  const selStatus = selRecord ? STATUS[selRecord.status] : null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
            <FiCalendar className="text-emerald-600" size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">উপস্থিতি ক্যালেন্ডার</h3>
            <p className="text-xs text-gray-400">{monthName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronLeft size={14} />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {[...Array(35)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* সারসংক্ষেপ চিপ */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['present', 'late', 'absent', 'leave'].map(key => (
                <div key={key} className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS[key].cls}`}>
                  <span>{STATUS[key].icon}</span>
                  <span>{STATUS[key].label} {fmt(summary?.[key])}</span>
                </div>
              ))}
            </div>

            {/* সপ্তাহের নাম */}
            <div className="grid grid-cols-7 text-center">
              {WEEKDAYS.map(w => (
                <span key={w} className="text-[10px] text-gray-400 font-medium">{w}</span>
              ))}
            </div>

            {/* ক্যালেন্ডার গ্রিড */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell) return <div key={`e${i}`} />
                const { day, dateStr } = cell
                const record  = attMap[dateStr]
                const off     = isOffDay(dateStr)
                const isFuture   = dateStr > todayStr
                const isToday    = dateStr === todayStr
                const isSelected = selected === dateStr
                const st = record ? STATUS[record.status] : null

                return (
                  <button
                    key={dateStr}
                    onClick={() => record && setSelected(isSelected ? null : dateStr)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors
                      ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : off ? 'bg-gray-50 dark:bg-slate-900/40'
                        : 'bg-gray-50/60 dark:bg-slate-700/30'}
                      ${record ? 'active:bg-gray-100 dark:active:bg-slate-700' : ''}
                      ${isToday && !isSelected ? 'ring-1 ring-blue-300' : ''}
                    `}
                  >
                    <span className={`text-[11px] ${isFuture ? 'text-gray-300 dark:text-gray-600' : 'text-gray-600 dark:text-gray-300'}`}>
                      {toBn(day)}
                    </span>
                    {st && <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />}
                  </button>
                )
              })}
            </div>

            {/* নির্বাচিত দিনের বিস্তারিত */}
            {selRecord && selStatus && (
              <div className="bg-gray-50 dark:bg-slate-900/40 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {new Date(selected + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${selStatus.cls}`}>
                    {selStatus.icon} {selStatus.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <FiClock size={12} className="text-gray-400 flex-shrink-0" />
                  {selRecord.check_in_time || selRecord.check_out_time ? (
                    <>
                      {selRecord.check_in_time  && <span>ইন: {timeOnly(selRecord.check_in_time)}</span>}
                      {selRecord.check_out_time && <span>আউট: {timeOnly(selRecord.check_out_time)}</span>}
                    </>
                  ) : (
                    <span>চেক-ইন/আউট তথ্য নেই</span>
                  )}
                </div>
                {parseFloat(selRecord.late_minutes || 0) > 0 && (
                  <p className="text-[11px] text-amber-600">দেরি {fmt(selRecord.late_minutes)} মিনিট</p>
                )}
                {parseFloat(selRecord.salary_deduction || 0) > 0 && (
                  <p className="text-[11px] text-red-500">কর্তন: ৳{fmt(selRecord.salary_deduction)}</p>
                )}
              </div>
            )}

            {/* উপস্থিতি বোনাস প্রগ্রেস */}
            {bonus && bonus.working_days != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">উপস্থিতি বোনাস প্রগ্রেস</span>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {fmt(bonus.present_days)}/{fmt(bonus.working_days)} দিন
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${bonus.is_perfect ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(bonus.percentage || 0, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
