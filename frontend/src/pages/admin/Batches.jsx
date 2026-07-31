// Batches.jsx — ব্যাচ ও মেয়াদ ব্যবস্থাপনা (Step ৪)
// Purchase Order রিসিভ করার সময় ব্যাচ/মেয়াদ দেওয়া থাকলে এখানে দেখা যাবে।
// FEFO অনুযায়ী (নিকটতম মেয়াদ আগে) সাজানো — অর্ডার অনুমোদনের সময় এই ক্রমেই স্টক বের হয়।

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Badge, { KPICard } from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiArchive, FiAlertTriangle, FiClock, FiSearch } from 'react-icons/fi'

const TABS = [
  { key: 'all',      label: 'সব ব্যাচ' },
  { key: 'expiring', label: 'মেয়াদ শেষের পথে' },
  { key: 'expired',  label: 'মেয়াদোত্তীর্ণ' },
]

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function AdminBatches() {
  const [batches,  setBatches]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('all')
  const [search,   setSearch]   = useState('')

  const fetchBatches = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: tab })
      if (search.trim()) params.set('search', search.trim())
      const res = await api.get(`/batches?${params.toString()}`)
      setBatches(res.data.data)
    } catch { toast.error('ব্যাচের তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const fetchSummary = async () => {
    try {
      const res = await api.get('/batches/summary')
      setSummary(res.data.data)
    } catch { /* সাইলেন্ট — সামারি ফেইল করলে মূল লিস্ট এখনো দেখা যাবে */ }
  }

  useEffect(() => { fetchSummary() }, [])
  useEffect(() => {
    const t = setTimeout(fetchBatches, 250) // সার্চ ডিবাউন্স
    return () => clearTimeout(t)
  }, [tab, search])

  const expiryBadge = (days) => {
    if (days === null || days === undefined) return <span className="text-xs text-gray-300">মেয়াদহীন</span>
    if (days < 0)  return <Badge variant="critical" label={`${Math.abs(days)} দিন আগে শেষ`} size="xs" />
    if (days <= 7) return <Badge variant="critical" label={`${days} দিনে শেষ`} size="xs" />
    if (days <= 30) return <Badge variant="warning" label={`${days} দিনে শেষ`} size="xs" />
    return <Badge variant="active" label={`${days} দিন বাকি`} size="xs" />
  }

  const columns = [
    {
      title: 'পণ্য',
      render: (_, row) => (
        <div>
          <p className="font-medium text-sm text-gray-700 dark:text-gray-200">{row.product_name}</p>
          <p className="text-[11px] text-gray-400 font-mono">{row.sku}</p>
        </div>
      )
    },
    {
      title: 'ব্যাচ নং',
      render: (_, row) => row.batch_number
        ? <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{row.batch_number}</span>
        : <span className="text-xs text-gray-300">—</span>
    },
    { title: 'পরিমাণ', render: (_, row) => <span className="font-semibold">{row.quantity} {row.unit}</span> },
    { title: 'উৎপাদন তারিখ', render: (_, row) => fmtDate(row.manufacture_date) },
    { title: 'মেয়াদ উত্তীর্ণ', render: (_, row) => fmtDate(row.expiry_date) },
    { title: 'অবস্থা', render: (_, row) => expiryBadge(row.days_to_expiry !== null ? parseInt(row.days_to_expiry, 10) : null) },
    { title: 'গৃহীত', render: (_, row) => fmtDate(row.received_at) },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">ব্যাচ ও মেয়াদ</h1>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard title="মেয়াদোত্তীর্ণ ব্যাচ" value={summary.expired_count} subtitle={`মোট ${summary.expired_qty} ইউনিট`} icon={<FiAlertTriangle />} color="danger" />
          <KPICard title="৩০ দিনে মেয়াদ শেষ" value={summary.expiring_soon_count} subtitle={`মোট ${summary.expiring_soon_qty} ইউনিট`} icon={<FiClock />} color="accent" />
          <KPICard title="ট্র্যাক করা ব্যাচ" value={batches.length} subtitle={TABS.find(t => t.key === tab)?.label} icon={<FiArchive />} color="primary" />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          icon={<FiSearch />}
          placeholder="পণ্য, SKU বা ব্যাচ নং খুঁজুন"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      <Table
        columns={columns}
        data={batches}
        loading={loading}
        emptyText={tab === 'expired' ? 'কোনো মেয়াদোত্তীর্ণ ব্যাচ নেই।' : tab === 'expiring' ? 'শীঘ্রই মেয়াদ শেষ হবে এমন ব্যাচ নেই।' : 'কোনো ব্যাচ ট্র্যাক করা হয়নি — Purchase Order রিসিভ করার সময় ব্যাচ নং/মেয়াদ দিন।'}
      />
    </div>
  )
}
