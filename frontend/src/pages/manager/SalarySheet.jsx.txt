// frontend/src/pages/manager/SalarySheet.jsx
// Manager: টিমের বেতন শীট — শুধু দেখার জন্য, pay করার ক্ষমতা নেই

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiDollarSign, FiArrowLeft, FiUser, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

const taka = n => '৳' + Number(n || 0).toLocaleString('en-IN')
const fmt  = n => Number(n || 0).toLocaleString('bn-BD')

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2024, i, 1).toLocaleString('bn-BD', { month: 'long' })
}))
const YEARS = [2024, 2025, 2026].map(y => ({ value: String(y), label: String(y) }))

function WorkerSalaryCard({ row }) {
  const [expanded, setExpanded] = useState(false)

  const net = parseFloat(row.net_payable || 0)
  const isPaid = row.payment_status === 'paid'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Summary Row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <FiUser className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{row.name_bn}</p>
            <p className="text-xs text-gray-400">{row.employee_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold text-gray-800">{taka(net)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isPaid ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              {isPaid ? '✅ পরিশোধ' : '⏳ বাকি'}
            </span>
          </div>
          {expanded ? <FiChevronUp className="text-gray-400" /> : <FiChevronDown className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-2">
          {[
            { label: 'মূল বেতন',         value: taka(row.basic_salary),         plus: true  },
            { label: 'বিক্রয় কমিশন',    value: taka(row.sales_commission),      plus: true  },
            { label: 'উপস্থিতি বোনাস',   value: taka(row.attendance_bonus),      plus: true  },
            { label: 'উপস্থিতি কর্তন',   value: taka(row.attendance_deduction),  plus: false },
            { label: 'বকেয়া কর্তন',      value: taka(row.outstanding_dues_deducted || row.outstanding_dues), plus: false },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className={`text-xs font-semibold ${item.plus ? 'text-green-600' : 'text-red-500'}`}>
                {item.plus ? '+' : '-'} {item.value}
              </p>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
            <p className="text-sm font-bold text-gray-700">নেট বেতন</p>
            <p className="text-sm font-bold text-primary">{taka(net)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-white rounded-lg p-2">
              <p className="text-xs text-green-600 font-bold">{fmt(row.present_days)}</p>
              <p className="text-xs text-gray-400">উপস্থিত</p>
            </div>
            <div className="bg-white rounded-lg p-2">
              <p className="text-xs text-amber-500 font-bold">{fmt(row.late_days)}</p>
              <p className="text-xs text-gray-400">দেরি</p>
            </div>
            <div className="bg-white rounded-lg p-2">
              <p className="text-xs text-red-500 font-bold">{fmt(row.absent_days)}</p>
              <p className="text-xs text-gray-400">অনুপস্থিত</p>
            </div>
          </div>
          {isPaid && row.paid_at && (
            <p className="text-xs text-gray-400 text-center">
              পরিশোধ: {new Date(row.paid_at).toLocaleDateString('bn-BD')}
              {row.approved_by_name && ` • ${row.approved_by_name}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ManagerSalarySheet() {
  const navigate = useNavigate()
  const today = new Date()
  const [month,   setMonth]   = useState(String(today.getMonth() + 1))
  const [year,    setYear]    = useState(String(today.getFullYear()))
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)

  const fetchSheet = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/salary/sheet?month=${month}&year=${year}`)
      const rows = res.data.data?.workers || res.data.data || []
      setData(rows)

      // Summary calculate
      const totalNet   = rows.reduce((s, r) => s + parseFloat(r.net_payable || 0), 0)
      const totalPaid  = rows.filter(r => r.payment_status === 'paid').length
      const totalUnpaid = rows.length - totalPaid
      setSummary({ totalNet, totalPaid, totalUnpaid, total: rows.length })
    } catch {
      toast.error('বেতন শীট আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSheet() }, [month, year])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <FiArrowLeft className="text-xl" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">💵 বেতন শীট</h1>
          <p className="text-xs text-gray-400">আপনার টিমের মাসিক বেতন — দেখার জন্য মাত্র</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select label="মাস" options={MONTHS} value={month}
          onChange={e => setMonth(e.target.value)} className="flex-1" />
        <Select label="বছর" options={YEARS}  value={year}
          onChange={e => setYear(e.target.value)} className="w-28" />
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center py-3">
            <p className="text-xs text-gray-400">মোট নেট বেতন</p>
            <p className="text-base font-bold text-primary">{taka(summary.totalNet)}</p>
          </Card>
          <Card className="text-center py-3">
            <p className="text-xs text-gray-400">SR সংখ্যা</p>
            <p className="text-base font-bold text-gray-800">{summary.total}</p>
          </Card>
          <Card className="text-center py-3 bg-green-50">
            <p className="text-xs text-green-500">পরিশোধ হয়েছে</p>
            <p className="text-base font-bold text-green-600">{summary.totalPaid}</p>
          </Card>
          <Card className="text-center py-3 bg-amber-50">
            <p className="text-xs text-amber-500">বাকি আছে</p>
            <p className="text-base font-bold text-amber-600">{summary.totalUnpaid}</p>
          </Card>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FiDollarSign className="text-4xl mx-auto mb-3 opacity-30" />
          <p className="text-sm">এই মাসে কোনো তথ্য নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(row => <WorkerSalaryCard key={row.worker_id} row={row} />)}
        </div>
      )}
    </div>
  )
}
