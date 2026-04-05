import { useState } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import Table from '../../components/ui/Table'
import { SalesChart } from '../../components/charts/Charts'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiDownload, FiBarChart2, FiFileText, FiBookOpen, FiArchive, FiAward } from 'react-icons/fi'

const REPORT_TABS = [
  { key: 'sales',      label: '📊 বিক্রয়' },
  { key: 'attendance', label: '📅 হাজিরা' },
  { key: 'commission', label: '💰 কমিশন' },
  { key: 'credit',     label: '💳 ক্রেডিট' },
  { key: 'pl',         label: '📈 P&L' },
  { key: 'ledger',     label: '📒 লেজার' },
  { key: 'archive',    label: '🗄️ Archive' },
  { key: 'top',        label: '🏆 শীর্ষ তালিকা' },
]

export default function AdminReports() {
  const [tab,     setTab]     = useState('sales')
  const [from,    setFrom]    = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [to,      setTo]      = useState(new Date().toISOString().split('T')[0])
  const [month,   setMonth]   = useState(String(new Date().getMonth() + 1))
  const [year,    setYear]    = useState(String(new Date().getFullYear()))
  const [groupBy, setGroupBy] = useState('day')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2024, i, 1).toLocaleString('bn-BD', { month: 'long' }) }))
  const years  = [2024, 2025, 2026].map(y => ({ value: String(y), label: String(y) }))

  const fetchReport = async () => {
    setLoading(true)
    try {
      let res
      if (tab === 'sales')      res = await api.get(`/reports/sales?from=${from}&to=${to}&group_by=${groupBy}`)
      else if (tab === 'attendance') res = await api.get(`/reports/attendance?year=${year}&month=${month}`)
      else if (tab === 'commission') res = await api.get(`/reports/commission?year=${year}&month=${month}`)
      else if (tab === 'credit')     res = await api.get('/reports/credit')
      else if (tab === 'pl')         res = await api.get(`/reports/pl?from=${from}&to=${to}`)
      else if (tab === 'ledger')     res = await api.get(`/reports/ledger?from=${from}&to=${to}`)
      else if (tab === 'archive')    res = await api.get(`/reports/archive?year=${year}&month=${month}`)
      else if (tab === 'top')        res = await Promise.all([
        api.get(`/reports/top-products?from=${from}&to=${to}`),
        api.get(`/reports/top-shops?from=${from}&to=${to}`)
      ])

      if (tab === 'top') setData({ products: res[0].data.data, shops: res[1].data.data })
      else setData(res.data.data)
    } catch { toast.error('রিপোর্ট আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const exportExcel = async () => {
    try {
      let url = ''
      if (tab === 'sales')      url = `/reports/sales?from=${from}&to=${to}&group_by=${groupBy}&export=excel`
      if (tab === 'attendance') url = `/reports/attendance?year=${year}&month=${month}&export=excel`
      if (tab === 'commission') url = `/reports/commission?year=${year}&month=${month}&export=excel`
      if (tab === 'credit')     url = '/reports/credit?export=excel'
      if (!url) { toast('এই রিপোর্টে Excel নেই।'); return }
      const res = await api.get(url, { responseType: 'blob' })
      const a   = document.createElement('a')
      a.href     = URL.createObjectURL(res.data)
      a.download = `${tab}_report.xlsx`
      a.click()
      toast.success('Excel ডাউনলোড হচ্ছে।')
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const renderFilters = () => (
    <div className="flex flex-wrap gap-3 items-end">
      {['sales','pl','ledger','top'].includes(tab) && (
        <>
          <Input label="শুরু" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
          <Input label="শেষ"  type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-40" />
        </>
      )}
      {tab === 'sales' && (
        <Select label="গ্রুপ" value={groupBy} onChange={e => setGroupBy(e.target.value)}
          options={[{ value: 'day', label: 'দিন' }, { value: 'worker', label: 'SR' }]} className="w-28" />
      )}
      {['attendance','commission','archive'].includes(tab) && (
        <>
          <Select label="মাস" options={months} value={month} onChange={e => setMonth(e.target.value)} className="w-36" />
          <Select label="বছর" options={years}  value={year}  onChange={e => setYear(e.target.value)}  className="w-28" />
        </>
      )}
      <div className="flex gap-2">
        <Button onClick={fetchReport} loading={loading} icon={<FiBarChart2 />}>দেখুন</Button>
        {data && ['sales','attendance','commission','credit'].includes(tab) && (
          <Button variant="outline" onClick={exportExcel} icon={<FiDownload />}>Excel</Button>
        )}
      </div>
    </div>
  )

  const renderPL = () => {
    if (!data) return null
    const { revenue, expenses, payroll, summary } = data
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['মোট বিক্রয়', `৳${parseInt(revenue.gross_sales).toLocaleString('bn-BD')}', 'text-primary'],
            ['নেট বিক্রয়', `৳${parseInt(revenue.net_sales).toLocaleString('bn-BD')}`, 'text-secondary'],
            ['ভ্যাট', `৳${parseInt(revenue.vat || 0).toLocaleString('bn-BD')}`, 'text-amber-600'],
            ['ডিসকাউন্ট', `৳${parseInt(revenue.discount || 0).toLocaleString('bn-BD')}`, 'text-orange-500'],
            ['মোট খরচ', `৳${parseInt(expenses.total_expenses).toLocaleString('bn-BD')}`, 'text-red-600'],
            ['বেতন+কমিশন', `৳${parseInt((payroll.total_salary || 0) + (payroll.total_commission || 0)).toLocaleString('bn-BD')}`, 'text-purple-600'],
          ].map(([label, val, cls]) => (
            <Card key={label} className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`text-xl font-bold mt-1 ${cls}`}>{val}</p>
            </Card>
          ))}
        </div>
        <Card title="মুনাফার সারসংক্ষেপ">
          <div className="space-y-3">
            {[
              ['মোট আয়', revenue.gross_sales, false],
              ['(-) ডিসকাউন্ট', revenue.discount || 0, true],
              ['(+) ভ্যাট', revenue.vat || 0, false],
              ['নেট বিক্রয়', revenue.net_sales, false, true],
              ['(-) পরিচালন খরচ', expenses.total_expenses, true],
              ['(-) বেতন ও কমিশন', (payroll.total_salary || 0) + (payroll.total_commission || 0), true],
            ].map(([label, val, neg, bold]) => (
              <div key={label} className={`flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-700 text-sm ${bold ? 'font-bold' : ''}`}>
                <span className="text-gray-600 dark:text-gray-300">{label}</span>
                <span className={neg ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}>
                  {neg ? '-' : ''}৳{parseInt(val || 0).toLocaleString('bn-BD')}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-2 text-base font-bold">
              <span className="text-gray-800 dark:text-gray-100">নেট মুনাফা</span>
              <span className={parseFloat(summary.net_profit) >= 0 ? 'text-secondary' : 'text-red-600'}>
                ৳{parseInt(summary.net_profit || 0).toLocaleString('bn-BD')}
                <span className="text-xs ml-1 font-normal">({summary.profit_margin}%)</span>
              </span>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const renderLedger = () => {
    if (!data) return null
    const { entries, summary, total } = data
    const cols = [
      { title: 'তারিখ', dataIndex: 'date', render: v => new Date(v).toLocaleDateString('bn-BD') },
      { title: 'ধরন', dataIndex: 'type', render: v => <span className="text-xs font-medium">{v}</span> },
      { title: 'পার্টি/বিবরণ', dataIndex: 'party', render: v => <span className="text-sm">{v || '—'}</span> },
      { title: 'SR', dataIndex: 'worker_name' },
      { title: 'রেফারেন্স', dataIndex: 'ref', render: v => <span className="font-mono text-xs">{v}</span> },
      { title: 'পরিমাণ', dataIndex: 'amount', render: (v, row) => (
        <span className={`font-bold text-sm ${row.entry_type === 'expense' ? 'text-red-600' : 'text-secondary'}`}>
          {row.entry_type === 'expense' ? '-' : '+'}৳{parseInt(v || 0).toLocaleString('bn-BD')}
        </span>
      )},
    ]
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[
            ['মোট আয়', summary.total_income, 'text-secondary'],
            ['মোট ব্যয়', summary.total_expense, 'text-red-500'],
            ['নেট', summary.net, parseFloat(summary.net) >= 0 ? 'text-primary' : 'text-red-600'],
          ].map(([l, v, c]) => (
            <Card key={l} className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className={`text-lg font-bold mt-1 ${c}`}>৳{parseInt(v || 0).toLocaleString('bn-BD')}</p>
            </Card>
          ))}
        </div>
        <Card title={`লেনদেন তালিকা (মোট: ${total})`}><Table columns={cols} data={entries} compact /></Card>
      </div>
    )
  }

  const renderArchive = () => {
    if (!data) return null
    const { sales, attendance, payroll, top_workers } = data
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['Invoice', sales.invoice_count, 'text-primary'],
            ['মোট বিক্রয়', `৳${parseInt(sales.gross_sales || 0).toLocaleString('bn-BD')}`, 'text-secondary'],
            ['উপস্থিত', attendance.present, 'text-emerald-600'],
            ['মোট বেতন', `৳${parseInt(payroll.total_payable || 0).toLocaleString('bn-BD')}`, 'text-purple-600'],
          ].map(([l, v, c]) => (
            <Card key={l} className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className={`text-xl font-bold mt-1 ${c}`}>{v}</p>
            </Card>
          ))}
        </div>
        <Card title="শীর্ষ ৫ SR">
          <Table columns={[
            { title: 'নাম', dataIndex: 'name_bn' },
            { title: 'কোড', dataIndex: 'employee_code' },
            { title: 'বিক্রয়', dataIndex: 'total_sales', render: v => `৳${parseInt(v || 0).toLocaleString('bn-BD')}` },
            { title: 'Invoice', dataIndex: 'invoice_count' },
          ]} data={top_workers || []} compact />
        </Card>
      </div>
    )
  }

  const renderTop = () => {
    if (!data) return null
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="🏆 শীর্ষ পণ্য">
          <Table columns={[
            { title: 'পণ্য', dataIndex: 'product_name' },
            { title: 'SKU', dataIndex: 'sku', render: v => <span className="font-mono text-xs">{v}</span> },
            { title: 'পরিমাণ', dataIndex: 'total_qty', render: v => <span className="font-bold text-primary">{parseInt(v || 0)}</span> },
            { title: 'আয়', dataIndex: 'total_revenue', render: v => `৳${parseInt(v || 0).toLocaleString('bn-BD')}` },
          ]} data={data.products || []} compact />
        </Card>
        <Card title="🏪 শীর্ষ দোকান">
          <Table columns={[
            { title: 'দোকান', dataIndex: 'shop_name' },
            { title: 'রুট', dataIndex: 'route_name' },
            { title: 'অর্ডার', dataIndex: 'order_count', render: v => <span className="font-bold text-secondary">{v}</span> },
            { title: 'মোট কেনা', dataIndex: 'total_purchase', render: v => `৳${parseInt(v || 0).toLocaleString('bn-BD')}` },
          ]} data={data.shops || []} compact />
        </Card>
      </div>
    )
  }

  const renderExisting = () => {
    if (!data) return null
    if (tab === 'sales' && data.records) {
      const cols = groupBy === 'worker' ? [
        { title: 'SR নাম', dataIndex: 'worker_name' },
        { title: 'Invoice', dataIndex: 'total_invoices' },
        { title: 'মোট বিক্রয়', dataIndex: 'total_sales', render: v => `৳${parseInt(v).toLocaleString('bn-BD')}` },
        { title: 'নগদ', dataIndex: 'cash', render: v => `৳${parseInt(v).toLocaleString('bn-BD')}` },
        { title: 'বাকি', dataIndex: 'credit', render: v => `৳${parseInt(v).toLocaleString('bn-BD')}` },
      ] : [
        { title: 'তারিখ', dataIndex: 'date', render: v => new Date(v).toLocaleDateString('bn-BD') },
        { title: 'Invoice', dataIndex: 'invoice_number' },
        { title: 'SR', dataIndex: 'worker_name' },
        { title: 'দোকান', dataIndex: 'shop_name' },
        { title: 'মোট', dataIndex: 'total_amount', render: v => `৳${parseInt(v).toLocaleString('bn-BD')}` },
        { title: 'পেমেন্ট', dataIndex: 'payment_method', render: v => <Badge variant={v} /> },
        { title: 'OTP', dataIndex: 'otp_verified', render: v => v ? '✅' : '❌' },
      ]
      return (
        <div className="space-y-4">
          {data.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['মোট বিক্রয়', `৳${parseInt(data.summary.total_sales || 0).toLocaleString('bn-BD')}`, 'text-primary'],
                ['নগদ', `৳${parseInt(data.summary.total_cash || 0).toLocaleString('bn-BD')}`, 'text-secondary'],
                ['বাকি', `৳${parseInt(data.summary.total_credit || 0).toLocaleString('bn-BD')}`, 'text-amber-600'],
                ['Invoice', data.summary.total_invoices || 0, 'text-gray-700 dark:text-gray-200'],
              ].map(([l, v, c]) => (
                <Card key={l} className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
                  <p className={`text-xl font-bold mt-1 ${c}`}>{v}</p>
                </Card>
              ))}
            </div>
          )}
          {groupBy === 'day' && data.records.length > 0 && (
            <Card title="চার্ট">
              <SalesChart data={data.records.slice(0, 14).map(s => ({
                date: new Date(s.date).toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' }),
                total: parseFloat(s.total_amount || 0)
              })).reverse()} />
            </Card>
          )}
          <Card title="বিস্তারিত"><Table columns={cols} data={data.records} compact /></Card>
        </div>
      )
    }
    if (tab === 'attendance' && data.workers) {
      return <Card title="হাজিরা রিপোর্ট"><Table columns={[
        { title: 'নাম', dataIndex: 'name_bn' },
        { title: 'উপস্থিত', dataIndex: 'present', render: v => <span className="text-emerald-600 font-semibold">{v}</span> },
        { title: 'দেরি', dataIndex: 'late', render: v => <span className="text-amber-600 font-semibold">{v}</span> },
        { title: 'অনুপস্থিত', dataIndex: 'absent', render: v => <span className="text-red-600 font-semibold">{v}</span> },
        { title: 'কর্তন', dataIndex: 'total_deduction', render: v => `৳${parseInt(v || 0)}` },
      ]} data={data.workers} compact /></Card>
    }
    if (tab === 'commission' && data.workers) {
      return <Card title="কমিশন রিপোর্ট"><Table columns={[
        { title: 'নাম', dataIndex: 'name_bn' },
        { title: 'বিক্রয়', dataIndex: 'total_sales', render: v => `৳${parseInt(v || 0).toLocaleString('bn-BD')}` },
        { title: 'কমিশন', dataIndex: 'commission', render: v => <span className="text-amber-600 font-bold">৳{parseInt(v || 0)}</span> },
        { title: 'বোনাস', dataIndex: 'bonus', render: v => `৳${parseInt(v || 0)}` },
        { title: 'নেট বেতন', dataIndex: 'net_payable', render: v => <span className="font-bold text-secondary">৳{parseInt(v || 0).toLocaleString('bn-BD')}</span> },
      ]} data={data.workers} compact /></Card>
    }
    if (tab === 'credit' && data.customers) {
      return <Card title="ক্রেডিট রিপোর্ট"><Table columns={[
        { title: 'দোকান', dataIndex: 'shop_name' },
        { title: 'রুট', dataIndex: 'route_name' },
        { title: 'লিমিট', dataIndex: 'credit_limit', render: v => `৳${parseInt(v || 0).toLocaleString('bn-BD')}` },
        { title: 'বকেয়া', dataIndex: 'current_credit', render: v => <span className="font-bold text-red-600">৳{parseInt(v || 0).toLocaleString('bn-BD')}</span> },
        { title: 'ব্যবহার', dataIndex: 'usage_pct', render: v => <span className={parseFloat(v) >= 80 ? 'text-red-600 font-bold' : 'text-gray-600'}>{v}%</span> },
      ]} data={data.customers} compact /></Card>
    }
    return null
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">রিপোর্ট</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
        {REPORT_TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setData(null) }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.key ? 'bg-white dark:bg-slate-700 text-primary dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card title="ফিল্টার">{renderFilters()}</Card>

      {/* Content */}
      {tab === 'pl'      && renderPL()}
      {tab === 'ledger'  && renderLedger()}
      {tab === 'archive' && renderArchive()}
      {tab === 'top'     && renderTop()}
      {['sales','attendance','commission','credit'].includes(tab) && renderExisting()}
    </div>
  )
}
