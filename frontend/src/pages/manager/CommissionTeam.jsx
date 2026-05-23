// frontend/src/pages/manager/CommissionTeam.jsx
// Manager: টিমের কমিশন overview — /manager/commission/team

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiDollarSign, FiTrendingUp, FiGift, FiChevronLeft,
  FiChevronRight, FiUser, FiSearch, FiAward, FiHash
} from 'react-icons/fi'

const MONTHS_BN = ['', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে',
  'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

const taka = n => '৳' + parseInt(n || 0).toLocaleString('en-IN')
const fmt  = n => parseInt(n || 0).toLocaleString('bn-BD')

// ── Worker Commission Card ────────────────────────────────────
function WorkerCommCard({ worker, rank }) {
  const sales      = parseFloat(worker.total_sales   || 0)
  const commission = parseFloat(worker.commission     || 0)
  const bonus      = parseFloat(worker.bonus          || 0)
  const total      = commission + bonus

  const rankColor =
    rank === 1 ? 'bg-yellow-400 text-white' :
    rank === 2 ? 'bg-gray-300  text-white' :
    rank === 3 ? 'bg-orange-400 text-white' :
                 'bg-gray-100  text-gray-500'

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
      {/* হেডার */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rankColor}`}>
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 truncate">{worker.name_bn}</p>
          <p className="text-xs text-gray-400">{worker.employee_code}</p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-400">মোট কমিশন</p>
            <p className="text-sm font-bold text-primary">{taka(total)}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-xl p-2 text-center">
          <div className="flex justify-center mb-1">
            <FiTrendingUp className="text-blue-500 text-xs" />
          </div>
          <p className="text-xs text-blue-400">বিক্রয়</p>
          <p className="text-xs font-bold text-blue-700">{taka(sales)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-2 text-center">
          <div className="flex justify-center mb-1">
            <FiDollarSign className="text-purple-500 text-xs" />
          </div>
          <p className="text-xs text-purple-400">কমিশন</p>
          <p className="text-xs font-bold text-purple-700">{taka(commission)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-2 text-center">
          <div className="flex justify-center mb-1">
            <FiGift className="text-green-500 text-xs" />
          </div>
          <p className="text-xs text-green-400">বোনাস</p>
          <p className="text-xs font-bold text-green-700">{taka(bonus)}</p>
        </div>
      </div>

      {/* Progress bar (sales contribution) */}
      {sales > 0 && (
        <div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function CommissionTeam() {
  const now = new Date()
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [year,    setYear]    = useState(now.getFullYear())
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/commission/team?month=${month}&year=${year}`)
      setData(res.data.data || [])
    } catch {
      toast.error('কমিশন তথ্য আনতে সমস্যা হয়েছে।')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  // মাস নেভিগেশন
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear()
    if (isCurrent) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear()

  // Summary totals
  const totalSales      = data.reduce((s, w) => s + parseFloat(w.total_sales  || 0), 0)
  const totalCommission = data.reduce((s, w) => s + parseFloat(w.commission   || 0), 0)
  const totalBonus      = data.reduce((s, w) => s + parseFloat(w.bonus        || 0), 0)
  const totalPayout     = totalCommission + totalBonus

  const filtered = data.filter(w =>
    w.name_bn?.includes(search) ||
    w.employee_code?.includes(search)
  )

  return (
    <div className="space-y-4 pb-6">
      {/* হেডার */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">টিম কমিশন</h1>
        <p className="text-xs text-gray-400 mt-0.5">SR-দের মাসিক কমিশন ও বোনাস বিবরণী</p>
      </div>

      {/* মাস নেভিগেটর */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
        <button onClick={prevMonth} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
          <FiChevronLeft />
        </button>
        <span className="font-bold text-gray-800">{MONTHS_BN[month]} {year}</span>
        <button
          onClick={nextMonth}
          disabled={isCurrent}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiChevronRight />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'মোট বিক্রয়',   value: taka(totalSales),      icon: FiTrendingUp,  accent: '#1d4ed8', bg: '#eff6ff' },
          { label: 'কমিশন পেআউট', value: taka(totalPayout),     icon: FiDollarSign,  accent: '#7c3aed', bg: '#f5f3ff' },
          { label: 'বিক্রয় কমিশন', value: taka(totalCommission), icon: FiHash,        accent: '#b45309', bg: '#fffbeb' },
          { label: 'উপস্থিতি বোনাস', value: taka(totalBonus),    icon: FiGift,        accent: '#15803d', bg: '#f0fdf4' },
        ].map(({ label, value, icon: Icon, accent, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg" style={{ background: bg, color: accent }}>
                <Icon size={14} />
              </span>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="text-lg font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* SR Count Badge */}
      {!loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FiUser size={13} />
          <span>{data.length} জন SR এই মাসে কমিশন পেয়েছেন</span>
        </div>
      )}

      {/* সার্চ */}
      <div className="relative">
        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SR নাম বা কোড দিয়ে খুঁজুন..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <FiAward className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {search ? 'কোনো SR পাওয়া যায়নি।' : 'এই মাসে কোনো কমিশন ডেটা নেই।'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((worker, idx) => (
            <WorkerCommCard
              key={worker.id}
              worker={worker}
              rank={idx + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
