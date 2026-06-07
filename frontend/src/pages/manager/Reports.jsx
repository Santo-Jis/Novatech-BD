// frontend/src/pages/manager/Reports.jsx
// Manager: টিমের Reports — Sales, Attendance, Commission, Credit, Expense, Return, P&L
// সব API endpoint backend-এ manager-এর জন্য team-filtered

import { useState } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import { SalesChart } from '../../components/charts/Charts'
import toast from 'react-hot-toast'
import { FiBarChart2, FiCalendar, FiDollarSign, FiCreditCard,
         FiFileText, FiRefreshCw, FiTrendingUp, FiArrowLeft } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

const TABS = [
  { key: 'sales',      label: '📊 বিক্রয়',    icon: <FiBarChart2 /> },
  { key: 'attendance', label: '📅 হাজিরা',    icon: <FiCalendar /> },
  { key: 'commission', label: '💰 কমিশন',     icon: <FiDollarSign /> },
  { key: 'credit',     label: '💳 ক্রেডিট',   icon: <FiCreditCard /> },
  { key: 'expense',    label: '🧾 খরচ',        icon: <FiFileText /> },
  { key: 'return',     label: '↩️ রিটার্ন',   icon: <FiRefreshCw /> },
  { key: 'pl',         label: '📈 P&L',        icon: <FiTrendingUp /> },
]

const fmt  = n => Number(n || 0).toLocaleString('bn-BD')
const taka = n => '৳' + Number(n || 0).toLocaleString('en-IN')

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2024, i, 1).toLocaleString('bn-BD', { month: 'long' })
}))
const YEARS = [2024, 2025, 2026].map(y => ({ value: String(y), label: String(y) }))

export default function ManagerReports() {
  const navigate = useNavigate()
  const today    = new Date()
  const [tab,    setTab]    = useState('sales')
  const [from,   setFrom]   = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0])
  const [to,     setTo]     = useState(today.toISOString().split('T')[0])
  const [month,  setMonth]  = useState(String(today.getMonth() + 1))
  const [year,   setYear]   = useState(String(today.getFullYear()))
  const [data,   setData]   = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchReport = async () => {
    setLoading(true)
    try {
      let res
      if      (tab === 'sales')      res = await api.get(`/reports/sales?from=${from}&to=${to}&group_by=day&limit=100`)
      else if (tab === 'attendance') res = await api.get(`/reports/attendance?year=${year}&month=${month}`)
      else if (tab === 'commission') res = await api.get(`/reports/commission?year=${year}&month=${month}`)
      else if (tab === 'credit')     res = await api.get('/reports/credit')
      else if (tab === 'expense')    res = await api.get(`/reports/expense?year=${year}&month=${month}`)
      else if (tab === 'return')     res = await api.get(`/reports/return?year=${year}&month=${month}`)
      else if (tab === 'pl')         res = await api.get(`/reports/pl?from=${from}&to=${to}`)
      setData(res.data.data)
    } catch { toast.error('রিপোর্ট আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const usesDateRange = ['sales', 'pl'].includes(tab)
  const usesMonthYear = ['attendance', 'commission', 'expense', 'return'].includes(tab)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <FiArrowLeft className="text-xl" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">📊 টিম রিপোর্ট</h1>
          <p className="text-xs text-gray-400">আপনার টিমের বিশ্লেষণ</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setData(null) }}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all
              ${tab === t.key ? 'bg-primary text-white shadow' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          {usesDateRange && <>
            <Input label="শুরুর তারিখ" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
            <Input label="শেষ তারিখ"   type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36" />
          </>}
          {usesMonthYear && <>
            <Select label="মাস" options={MONTHS} value={month} onChange={e => setMonth(e.target.value)} className="w-32" />
            <Select label="বছর" options={YEARS}  value={year}  onChange={e => setYear(e.target.value)}  className="w-28" />
          </>}
          {tab === 'credit' && <p className="text-xs text-gray-400 self-end pb-2">বর্তমান বকেয়া অবস্থা</p>}
          <Button onClick={fetchReport} loading={loading} className="self-end">
            রিপোর্ট দেখুন
          </Button>
        </div>
      </Card>

      {/* Results */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Sales */}
          {tab === 'sales' && (
            <div className="space-y-4">
              {data.summary && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'মোট বিক্রয়',    value: taka(data.summary.total_sales) },
                    { label: 'মোট Invoice',     value: fmt(data.summary.total_invoices) + 'টি' },
                    { label: 'গড় Invoice',      value: taka(data.summary.avg_invoice) },
                    { label: 'মোট কাস্টমার',   value: fmt(data.summary.unique_customers) + 'টি' },
                  ].map(s => (
                    <Card key={s.label} className="text-center py-3">
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className="text-base font-bold text-gray-800">{s.value}</p>
                    </Card>
                  ))}
                </div>
              )}
              {data.records?.length > 0 && (
                <Card title="দৈনিক বিক্রয়">
                  <SalesChart data={data.records.slice(0, 14).map(r => ({
                    date:  new Date(r.date).toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' }),
                    total: parseFloat(r.total_amount || 0)
                  })).reverse()} />
                </Card>
              )}
            </div>
          )}

          {/* Attendance */}
          {tab === 'attendance' && data.records && (
            <Card title={`হাজিরা — ${MONTHS[parseInt(month)-1]?.label} ${year}`}>
              <div className="space-y-2">
                {data.records.map(r => (
                  <div key={r.worker_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.name_bn}</p>
                      <p className="text-xs text-gray-400">{r.employee_code}</p>
                    </div>
                    <div className="flex gap-3 text-center">
                      <div><p className="text-xs text-green-600 font-bold">{r.present_days}</p><p className="text-xs text-gray-400">উপস্থিত</p></div>
                      <div><p className="text-xs text-amber-500 font-bold">{r.late_days}</p><p className="text-xs text-gray-400">দেরি</p></div>
                      <div><p className="text-xs text-red-500 font-bold">{r.absent_days}</p><p className="text-xs text-gray-400">অনুপস্থিত</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Commission */}
          {tab === 'commission' && data.records && (
            <Card title="কমিশন রিপোর্ট">
              <div className="space-y-2">
                {data.records.map(r => (
                  <div key={r.worker_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.name_bn}</p>
                      <p className="text-xs text-gray-400">{r.employee_code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{taka(r.total_commission)}</p>
                      <p className="text-xs text-gray-400">বিক্রয়: {taka(r.total_sales)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Credit */}
          {tab === 'credit' && data.records && (
            <Card title="বকেয়া রিপোর্ট">
              {data.summary && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-red-400">মোট বকেয়া</p>
                    <p className="text-base font-bold text-red-600">{taka(data.summary.total_outstanding)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-amber-400">কাস্টমার সংখ্যা</p>
                    <p className="text-base font-bold text-amber-600">{data.summary.customers_with_dues}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {data.records.slice(0, 20).map(r => (
                  <div key={r.customer_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.shop_name}</p>
                      <p className="text-xs text-gray-400">{r.owner_name}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">{taka(r.outstanding_dues)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Expense */}
          {tab === 'expense' && data.records && (
            <Card title="খরচ রিপোর্ট">
              {data.summary && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-400">মোট অনুমোদিত</p>
                    <p className="text-base font-bold text-blue-600">{taka(data.summary.total_approved)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-amber-400">মোট পেন্ডিং</p>
                    <p className="text-base font-bold text-amber-600">{taka(data.summary.total_pending)}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {data.records.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.category}</p>
                      <p className="text-xs text-gray-400">{r.worker_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{taka(r.amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'approved' ? 'bg-green-100 text-green-600' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-600' :
                        'bg-amber-100 text-amber-600'}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Return */}
          {tab === 'return' && data && (
            <Card title="রিটার্ন রিপোর্ট">
              <div className="space-y-2">
                {(data.records || data).slice(0, 30).map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.shop_name || r.customer_name}</p>
                      <p className="text-xs text-gray-400">{r.worker_name} • {new Date(r.created_at).toLocaleDateString('bn-BD')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{taka(r.total_amount || r.amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'approved' ? 'bg-green-100 text-green-600' :
                        r.status === 'pending'  ? 'bg-amber-100 text-amber-600' :
                        'bg-red-100 text-red-600'}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* P&L */}
          {tab === 'pl' && (
            <Card title="লাভ-ক্ষতির হিসাব">
              <div className="space-y-3">
                {[
                  { label: 'মোট বিক্রয়',     value: data.total_revenue,  color: 'text-green-600', bg: 'bg-green-50' },
                  { label: 'মোট COGS',        value: data.total_cogs,     color: 'text-blue-600',  bg: 'bg-blue-50' },
                  { label: 'গ্রস মুনাফা',     value: data.gross_profit,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'মোট খরচ',         value: data.total_expenses, color: 'text-red-600',   bg: 'bg-red-50' },
                  { label: 'নেট মুনাফা',      value: data.net_profit,     color: parseFloat(data.net_profit) >= 0 ? 'text-emerald-700' : 'text-red-700', bg: 'bg-gray-100' },
                ].map(item => (
                  <div key={item.label} className={`flex justify-between items-center p-3 ${item.bg} rounded-xl`}>
                    <p className="text-sm text-gray-600">{item.label}</p>
                    <p className={`text-base font-bold ${item.color}`}>{taka(item.value)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="text-center py-12 text-gray-400">
          <FiBarChart2 className="text-4xl mx-auto mb-3 opacity-30" />
          <p className="text-sm">উপরের ফিল্টার বেছে "রিপোর্ট দেখুন" চাপুন</p>
        </div>
      )}
    </div>
  )
}
