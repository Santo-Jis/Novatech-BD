// Batches.jsx — ব্যাচ ও মেয়াদ ব্যবস্থাপনা (Step ৪ + Phase ১ + Phase ২ + Phase ৩ + মাল্টি-ওয়্যারহাউজ ধাপ ৫)
// Purchase Order রিসিভ করার সময় ব্যাচ/মেয়াদ দেওয়া থাকলে এখানে দেখা যাবে।
// FEFO অনুযায়ী (নিকটতম মেয়াদ আগে, শুধু active ব্যাচ) সাজানো।
//
// Phase ১: স্টক মূল্য কলাম, ৪+ KPI কার্ড, ডিটেইল ড্রয়ার (movement history), Excel এক্সপোর্ট
// Phase ২: ব্যাচ লাইফসাইকেল — কোয়ারেন্টাইন/ক্ষতিগ্রস্ত/রাইট-অফ/সাপ্লায়ারে ফেরত,
//          সাপ্লায়ার+PO লিংক, রাইট-অফ হলে products.stock কমে + expenses-এ লস এন্ট্রি,
//          অ্যাডজাস্টমেন্ট অডিট হিস্ট্রি
// Phase ৩: রিকল রিপোর্ট (ব্যাচ → SR বিতরণ, order-level), লস ট্রেন্ড চার্ট,
//          ব্যাচ-ট্র্যাকিং কভারেজ % (honest FEFO-compliance proxy)
// মাল্টি-ওয়্যারহাউজ ধাপ ৫: গুদাম কলাম, গুদাম ফিল্টার ড্রপডাউন, ড্রয়ারে গুদামের নাম

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import Table from '../../components/ui/Table'
import Badge, { KPICard } from '../../components/ui/Badge'
import Input, { Textarea, Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiArchive, FiAlertTriangle, FiClock, FiSearch, FiDownload, FiEye,
  FiArrowDown, FiArrowUp, FiRotateCcw, FiDollarSign, FiPauseCircle,
  FiAlertOctagon, FiTrash2, FiCornerUpLeft, FiRefreshCw, FiTruck,
  FiUsers, FiTrendingUp, FiShield, FiBox
} from 'react-icons/fi'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip
} from 'recharts'

const TABS = [
  { key: 'all',      label: 'সব ব্যাচ' },
  { key: 'expiring', label: 'মেয়াদ শেষের পথে' },
  { key: 'expired',  label: 'মেয়াদোত্তীর্ণ' },
  { key: 'issues',   label: 'সমস্যাযুক্ত' }, // ✅ Phase ২: quarantine + damaged
]

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtBDT = (v) => `৳${Number(v || 0).toLocaleString('bn-BD', { maximumFractionDigits: 0 })}`

const MOVEMENT_LABELS = {
  in:       { label: 'ইন (স্টক যোগ)',    icon: <FiArrowDown className="text-emerald-500" /> },
  out:      { label: 'আউট (স্টক বিয়োগ)', icon: <FiArrowUp className="text-red-500" /> },
  returned: { label: 'ফেরত',             icon: <FiRotateCcw className="text-blue-500" /> },
}

const REFERENCE_LABELS = {
  purchase:   'ক্রয় (PO) রিসিভ',
  order:      'বিক্রয় অর্ডার',
  sale:       'বিক্রয়',
  manual:     'ম্যানুয়াল',
  adjustment: 'অ্যাডজাস্টমেন্ট',
}

// ✅ Phase ২: ব্যাচ লাইফসাইকেল স্ট্যাটাস ব্যাজ
const STATUS_BADGE = {
  active:                { variant: 'active',    label: 'সক্রিয়' },
  quarantine:            { variant: 'pending',   label: 'কোয়ারেন্টাইন' },
  damaged:                { variant: 'critical',  label: 'ক্ষতিগ্রস্ত' },
  written_off:            { variant: 'archived',  label: 'রাইট-অফ' },
  returned_to_supplier:  { variant: 'secondary', label: 'সাপ্লায়ারে ফেরত' },
}

// ✅ Phase ২: বর্তমান স্ট্যাটাস অনুযায়ী কোন অ্যাকশনগুলো সম্ভব
const ACTIONS_BY_STATUS = {
  active: [
    { action: 'quarantine',            label: 'কোয়ারেন্টাইনে পাঠান',        icon: <FiPauseCircle />,   danger: false },
    { action: 'damaged',                label: 'ক্ষতিগ্রস্ত চিহ্নিত করুন',     icon: <FiAlertOctagon />,  danger: false },
    { action: 'written_off',            label: 'রাইট-অফ করুন',               icon: <FiTrash2 />,        danger: true },
    { action: 'returned_to_supplier',  label: 'সাপ্লায়ারে ফেরত পাঠান',      icon: <FiCornerUpLeft />,  danger: true },
  ],
  quarantine: [
    { action: 'reactivated',            label: 'পুনরায় সক্রিয় করুন',         icon: <FiRefreshCw />,     danger: false },
    { action: 'written_off',            label: 'রাইট-অফ করুন',               icon: <FiTrash2 />,        danger: true },
    { action: 'returned_to_supplier',  label: 'সাপ্লায়ারে ফেরত পাঠান',      icon: <FiCornerUpLeft />,  danger: true },
  ],
  damaged: [
    { action: 'reactivated',            label: 'পুনরায় সক্রিয় করুন',         icon: <FiRefreshCw />,     danger: false },
    { action: 'written_off',            label: 'রাইট-অফ করুন',               icon: <FiTrash2 />,        danger: true },
    { action: 'returned_to_supplier',  label: 'সাপ্লায়ারে ফেরত পাঠান',      icon: <FiCornerUpLeft />,  danger: true },
  ],
  written_off:            [],
  returned_to_supplier:  [],
}

const ACTION_CONFIRM_COPY = {
  quarantine:            { title: 'কোয়ারেন্টাইনে পাঠাবেন?', body: 'এই ব্যাচ থেকে আর বিক্রয়/অর্ডারে স্টক বের হবে না, যতক্ষণ না আবার সক্রিয় করা হয়। ফিজিক্যাল স্টক সংখ্যা অপরিবর্তিত থাকবে।' },
  damaged:                { title: 'ক্ষতিগ্রস্ত চিহ্নিত করবেন?', body: 'এই ব্যাচ থেকে আর বিক্রয়/অর্ডারে স্টক বের হবে না। ফিজিক্যাল স্টক সংখ্যা অপরিবর্তিত থাকবে।' },
  written_off:            { title: 'রাইট-অফ নিশ্চিত করুন', body: 'এই ব্যাচের পুরো পরিমাণ স্টক থেকে বাদ যাবে (products.stock থেকেও বিয়োগ হবে) এবং টাকার অঙ্কে ক্ষতি হিসেবে Expense/P&L রিপোর্টে যোগ হবে। এই কাজ ফেরানো যাবে না।' },
  returned_to_supplier:  { title: 'সাপ্লায়ারে ফেরত নিশ্চিত করুন', body: 'এই ব্যাচের পুরো পরিমাণ স্টক থেকে বাদ যাবে (products.stock থেকেও বিয়োগ হবে)। এটা লস হিসেবে গণ্য হবে না — সাপ্লায়ার ক্রেডিট/রিপ্লেসমেন্ট দেবে ধরে নেওয়া হয়। এই কাজ ফেরানো যাবে না।' },
  reactivated:            { title: 'পুনরায় সক্রিয় করবেন?', body: 'এই ব্যাচ আবার FEFO বিক্রয়ে বিবেচিত হবে।' },
}

// অ্যাকশন → স্ট্যাটাস ম্যাপিং (ব্যাকএন্ডের ACTION_TO_STATUS-এর সাথে সামঞ্জস্যপূর্ণ) —
// অ্যাডজাস্টমেন্ট হিস্ট্রিতে action থেকে সঠিক ব্যাজ বের করতে ব্যবহৃত
const ACTION_TO_STATUS_LOOKUP = {
  quarantine:            'quarantine',
  damaged:                'damaged',
  written_off:            'written_off',
  returned_to_supplier:  'returned_to_supplier',
  reactivated:            'active'
}

export default function AdminBatches() {
  const [batches,  setBatches]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('all')
  const [search,   setSearch]   = useState('')
  const [exporting, setExporting] = useState(false)

  // ✅ মাল্টি-ওয়্যারহাউজ ধাপ ৫
  const [warehouses,     setWarehouses]     = useState([])
  const [warehouseFilter, setWarehouseFilter] = useState('')

  // ব্যাচ ডিটেইল ড্রয়ার
  const [drawerBatch, setDrawerBatch] = useState(null) // list থেকে নির্বাচিত row (তাৎক্ষণিক প্রিভিউর জন্য)
  const [drawerData,  setDrawerData]  = useState(null) // API থেকে { batch, movements, adjustments }
  const [drawerLoading, setDrawerLoading] = useState(false)

  // ✅ Phase ২: স্ট্যাটাস-অ্যাকশন কনফার্ম মোডাল
  const [pendingAction, setPendingAction] = useState(null) // { action, label, danger }
  const [reasonText,    setReasonText]    = useState('')
  const [submitting,    setSubmitting]    = useState(false)

  // ✅ Phase ৩: রিকল রিপোর্ট (ব্যাচ → SR বিতরণ)
  const [recallOpen,    setRecallOpen]    = useState(false)
  const [recallData,    setRecallData]    = useState(null)
  const [recallLoading, setRecallLoading] = useState(false)

  // ✅ Phase ৩: লস ট্রেন্ড + ব্যাচ-ট্র্যাকিং কভারেজ অ্যানালিটিক্স
  const [analyticsOpen,    setAnalyticsOpen]    = useState(false)
  const [analyticsData,    setAnalyticsData]    = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsMonths,  setAnalyticsMonths]  = useState(6)

  const buildListParams = (extra = {}) => {
    const params = new URLSearchParams({ status: tab === 'issues' ? 'all' : tab, ...extra })
    if (tab === 'issues') params.set('batch_status', 'quarantine,damaged')
    if (search.trim()) params.set('search', search.trim())
    if (warehouseFilter) params.set('warehouse_id', warehouseFilter)
    return params
  }

  const fetchBatches = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/batches?${buildListParams().toString()}`)
      setBatches(res.data.data)
    } catch { toast.error('ব্যাচের তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const fetchSummary = async () => {
    try {
      const params = warehouseFilter ? `?warehouse_id=${warehouseFilter}` : ''
      const res = await api.get(`/batches/summary${params}`)
      setSummary(res.data.data)
    } catch { /* সাইলেন্ট — সামারি ফেইল করলে মূল লিস্ট এখনো দেখা যাবে */ }
  }

  // ✅ মাল্টি-ওয়্যারহাউজ ধাপ ৫
  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/warehouses')
      setWarehouses(res.data.data)
    } catch { /* ফিল্টার ড্রপডাউন খালি থাকবে, বাকি পেইজ কাজ করবে */ }
  }

  useEffect(() => { fetchWarehouses() }, [])
  useEffect(() => { fetchSummary() }, [warehouseFilter])
  useEffect(() => {
    const t = setTimeout(fetchBatches, 250) // সার্চ ডিবাউন্স
    return () => clearTimeout(t)
  }, [tab, search, warehouseFilter])

  const openDrawer = async (row) => {
    setDrawerBatch(row)
    setDrawerLoading(true)
    try {
      const res = await api.get(`/batches/${row.id}/movements`)
      setDrawerData(res.data.data)
    } catch {
      toast.error('ব্যাচের বিস্তারিত আনতে সমস্যা হয়েছে।')
    } finally {
      setDrawerLoading(false)
    }
  }

  const closeDrawer = () => { setDrawerBatch(null); setDrawerData(null) }

  // ✅ Phase ৩: রিকল রিপোর্ট খোলা
  const openRecall = async () => {
    if (!drawerData?.batch?.id) return
    setRecallOpen(true)
    setRecallLoading(true)
    try {
      const res = await api.get(`/batches/${drawerData.batch.id}/recall`)
      setRecallData(res.data.data)
    } catch {
      toast.error('রিকল রিপোর্ট আনতে সমস্যা হয়েছে।')
    } finally {
      setRecallLoading(false)
    }
  }

  // ✅ Phase ৩: লস ট্রেন্ড + কভারেজ অ্যানালিটিক্স আনা
  const fetchAnalytics = async (months = analyticsMonths) => {
    setAnalyticsLoading(true)
    try {
      const res = await api.get(`/batches/analytics?months=${months}`)
      setAnalyticsData(res.data.data)
    } catch {
      toast.error('অ্যানালিটিক্স আনতে সমস্যা হয়েছে।')
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const openAnalytics = () => {
    setAnalyticsOpen(true)
    fetchAnalytics(analyticsMonths)
  }

  const changeAnalyticsMonths = (m) => {
    setAnalyticsMonths(m)
    fetchAnalytics(m)
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await api.get(`/batches?${buildListParams({ export: 'excel' }).toString()}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `batches_${tab}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel ডাউনলোড হচ্ছে।')
    } catch { toast.error('এক্সপোর্ট করতে সমস্যা হয়েছে।') }
    finally { setExporting(false) }
  }

  // ✅ Phase ২: স্ট্যাটাস-অ্যাকশন সাবমিট
  const submitAction = async () => {
    if (!reasonText.trim()) { toast.error('কারণ লিখুন।'); return }
    setSubmitting(true)
    try {
      await api.patch(`/batches/${drawerData.batch.id}/status`, {
        action: pendingAction.action,
        reason: reasonText.trim()
      })
      toast.success('ব্যাচের অবস্থা আপডেট হয়েছে।')
      setPendingAction(null)
      setReasonText('')
      await openDrawer(drawerBatch)  // ড্রয়ার রিফ্রেশ
      fetchBatches()
      fetchSummary()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSubmitting(false)
    }
  }

  const expiryBadge = (days) => {
    if (days === null || days === undefined) return <span className="text-xs text-gray-300">মেয়াদহীন</span>
    if (days < 0)  return <Badge variant="critical" label={`${Math.abs(days)} দিন আগে শেষ`} size="xs" />
    if (days <= 7) return <Badge variant="critical" label={`${days} দিনে শেষ`} size="xs" />
    if (days <= 30) return <Badge variant="warning" label={`${days} দিনে শেষ`} size="xs" />
    return <Badge variant="active" label={`${days} দিন বাকি`} size="xs" />
  }

  const statusBadge = (status) => {
    const s = STATUS_BADGE[status] || STATUS_BADGE.active
    return <Badge variant={s.variant} label={s.label} size="xs" />
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
    { title: 'স্ট্যাটাস', render: (_, row) => statusBadge(row.status) },
    {
      title: 'সাপ্লায়ার',
      render: (_, row) => row.supplier_name
        ? <span className="text-sm text-gray-600 dark:text-gray-300">{row.supplier_name}</span>
        : <span className="text-xs text-gray-300">—</span>
    },
    {
      title: 'গুদাম',
      render: (_, row) => row.warehouse_name
        ? <span className="text-sm text-gray-600 dark:text-gray-300">{row.warehouse_name}</span>
        : <span className="text-xs text-gray-300">—</span>
    },
    { title: 'পরিমাণ', render: (_, row) => <span className="font-semibold">{row.quantity} {row.unit}</span> },
    {
      title: 'স্টক মূল্য',
      render: (_, row) => <span className="font-medium text-gray-700 dark:text-gray-200">{fmtBDT(row.stock_value)}</span>
    },
    { title: 'মেয়াদ উত্তীর্ণ', render: (_, row) => fmtDate(row.expiry_date) },
    { title: 'মেয়াদ', render: (_, row) => expiryBadge(row.days_to_expiry !== null ? parseInt(row.days_to_expiry, 10) : null) },
    {
      title: '',
      render: (_, row) => (
        <button
          onClick={() => openDrawer(row)}
          className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          title="বিস্তারিত দেখুন"
        >
          <FiEye />
        </button>
      )
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">ব্যাচ ও মেয়াদ</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={openAnalytics}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            <FiTrendingUp /> লস ও কভারেজ ট্রেন্ড
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <FiDownload /> {exporting ? 'এক্সপোর্ট হচ্ছে...' : 'Excel এক্সপোর্ট'}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="মেয়াদোত্তীর্ণ ব্যাচ"
            value={summary.expired_count}
            subtitle={`${summary.expired_qty} ইউনিট • ${fmtBDT(summary.expired_value)}`}
            icon={<FiAlertTriangle />} color="danger"
          />
          <KPICard
            title="৩০ দিনে মেয়াদ শেষ"
            value={summary.expiring_soon_count}
            subtitle={`${summary.expiring_soon_qty} ইউনিট • ${fmtBDT(summary.expiring_soon_value)}`}
            icon={<FiClock />} color="accent"
          />
          <KPICard
            title="সমস্যাযুক্ত ব্যাচ"
            value={summary.issues_count}
            subtitle={`কোয়ারেন্টাইন/ক্ষতিগ্রস্ত • ${fmtBDT(summary.issues_value)}`}
            icon={<FiAlertOctagon />} color="secondary"
          />
          <KPICard title="ট্র্যাক করা ব্যাচ" value={batches.length} subtitle={TABS.find(t => t.key === tab)?.label} icon={<FiArchive />} color="primary" />
          <KPICard
            title="মোট স্টক মূল্য"
            value={fmtBDT(summary.total_batch_value)}
            subtitle="সব ট্র্যাক করা ব্যাচ মিলিয়ে"
            icon={<FiDollarSign />} color="success"
          />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
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
        <div className="flex items-center gap-2">
          <Select
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="w-44"
          />
          <Input
            icon={<FiSearch />}
            placeholder="পণ্য, SKU বা ব্যাচ নং খুঁজুন"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={batches}
        loading={loading}
        emptyText={
          tab === 'expired' ? 'কোনো মেয়াদোত্তীর্ণ ব্যাচ নেই।' :
          tab === 'expiring' ? 'শীঘ্রই মেয়াদ শেষ হবে এমন ব্যাচ নেই।' :
          tab === 'issues' ? 'কোয়ারেন্টাইন/ক্ষতিগ্রস্ত কোনো ব্যাচ নেই।' :
          'কোনো ব্যাচ ট্র্যাক করা হয়নি — Purchase Order রিসিভ করার সময় ব্যাচ নং/মেয়াদ দিন।'
        }
      />

      {/* ব্যাচ ডিটেইল + মুভমেন্ট/অ্যাডজাস্টমেন্ট হিস্ট্রি + অ্যাকশন ড্রয়ার */}
      <Modal
        isOpen={!!drawerBatch}
        onClose={closeDrawer}
        title={drawerBatch ? `${drawerBatch.product_name} — ব্যাচের বিস্তারিত` : ''}
        size="lg"
      >
        {drawerLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
          </div>
        ) : drawerData ? (
          <div className="space-y-5">
            {/* সারাংশ */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {statusBadge(drawerData.batch.status)}
                <span className="text-xs text-gray-400">SKU: <span className="font-mono">{drawerData.batch.sku}</span></span>
              </div>
              <button
                onClick={openRecall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                <FiUsers /> রিকল রিপোর্ট
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs">ব্যাচ নং</p>
                <p className="font-mono font-medium text-gray-700 dark:text-gray-200">{drawerData.batch.batch_number || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">বর্তমান পরিমাণ</p>
                <p className="font-semibold text-gray-700 dark:text-gray-200">{drawerData.batch.quantity} {drawerData.batch.unit}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">স্টক মূল্য</p>
                <p className="font-semibold text-gray-700 dark:text-gray-200">{fmtBDT(drawerData.batch.stock_value)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">সাপ্লায়ার</p>
                <p className="text-gray-700 dark:text-gray-200 flex items-center gap-1">
                  {drawerData.batch.supplier_name ? <><FiTruck className="text-gray-400" /> {drawerData.batch.supplier_name}</> : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">PO নং</p>
                <p className="font-mono text-gray-700 dark:text-gray-200">{drawerData.batch.po_number || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">গুদাম</p>
                <p className="text-gray-700 dark:text-gray-200 flex items-center gap-1">
                  {drawerData.batch.warehouse_name ? <><FiBox className="text-gray-400" /> {drawerData.batch.warehouse_name}</> : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">উৎপাদন তারিখ</p>
                <p className="text-gray-700 dark:text-gray-200">{fmtDate(drawerData.batch.manufacture_date)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">মেয়াদ উত্তীর্ণ</p>
                <p className="text-gray-700 dark:text-gray-200">{fmtDate(drawerData.batch.expiry_date)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">গৃহীত তারিখ</p>
                <p className="text-gray-700 dark:text-gray-200">{fmtDate(drawerData.batch.received_at)}</p>
              </div>
            </div>

            {/* ✅ Phase ২: অ্যাকশন বাটন — বর্তমান স্ট্যাটাস অনুযায়ী */}
            {ACTIONS_BY_STATUS[drawerData.batch.status]?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">অ্যাকশন</h4>
                <div className="flex flex-wrap gap-2">
                  {ACTIONS_BY_STATUS[drawerData.batch.status].map(a => (
                    <Button
                      key={a.action}
                      variant={a.danger ? 'danger' : 'outline'}
                      size="sm"
                      icon={a.icon}
                      onClick={() => { setPendingAction(a); setReasonText('') }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* মুভমেন্ট হিস্ট্রি */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">মুভমেন্ট হিস্ট্রি</h4>
              {drawerData.movements.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">এই ব্যাচের কোনো মুভমেন্ট রেকর্ড নেই।</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {drawerData.movements.map(m => (
                    <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/40">
                      <div className="mt-0.5">{MOVEMENT_LABELS[m.movement_type]?.icon || <FiArchive className="text-gray-400" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            {MOVEMENT_LABELS[m.movement_type]?.label || m.movement_type} — {m.quantity} {drawerData.batch.unit}
                          </p>
                          <span className="text-xs text-gray-400">{fmtDateTime(m.created_at)}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {REFERENCE_LABELS[m.reference_type] || m.reference_type || 'ম্যানুয়াল'}
                          {m.note ? ` — ${m.note}` : ''}
                          {m.created_by_name ? ` • ${m.created_by_name}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ Phase ২: অ্যাডজাস্টমেন্ট (স্ট্যাটাস পরিবর্তন) অডিট হিস্ট্রি */}
            {drawerData.adjustments?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">স্ট্যাটাস পরিবর্তনের ইতিহাস</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {drawerData.adjustments.map(a => (
                    <div key={a.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {STATUS_BADGE[ACTION_TO_STATUS_LOOKUP[a.action]]?.label || a.action}
                          {a.quantity_adjusted > 0 ? ` — ${a.quantity_adjusted} ${drawerData.batch.unit} বাদ` : ''}
                          {a.value_impact > 0 ? ` (${fmtBDT(a.value_impact)})` : ''}
                        </p>
                        <span className="text-xs text-gray-400">{fmtDateTime(a.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {a.reason}{a.created_by_name ? ` • ${a.created_by_name}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">তথ্য পাওয়া যায়নি।</p>
        )}
      </Modal>

      {/* ✅ Phase ২: অ্যাকশন কনফার্ম + কারণ মোডাল */}
      <Modal
        isOpen={!!pendingAction}
        onClose={() => { if (!submitting) { setPendingAction(null); setReasonText('') } }}
        title={pendingAction ? ACTION_CONFIRM_COPY[pendingAction.action]?.title : ''}
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setPendingAction(null); setReasonText('') }}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              বাতিল
            </button>
            <Button
              variant={pendingAction?.danger ? 'danger' : 'primary'}
              size="sm"
              loading={submitting}
              onClick={submitAction}
            >
              নিশ্চিত করুন
            </Button>
          </>
        }
      >
        {pendingAction && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">{ACTION_CONFIRM_COPY[pendingAction.action]?.body}</p>
            <Textarea
              label="কারণ (বাধ্যতামূলক)"
              placeholder="যেমন: মেয়াদোত্তীর্ণ হওয়ায় বিক্রয়যোগ্য নয়, বা প্যাকেজিং ড্যামেজ..."
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </Modal>

      {/* ✅ Phase ৩: রিকল রিপোর্ট মোডাল — এই ব্যাচ কোন কোন SR-এর কাছে গেছে */}
      <Modal
        isOpen={recallOpen}
        onClose={() => { setRecallOpen(false); setRecallData(null) }}
        title={recallData ? `রিকল রিপোর্ট — ${recallData.batch.product_name}` : 'রিকল রিপোর্ট'}
        size="lg"
      >
        {recallLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
          </div>
        ) : recallData ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
              <FiShield className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                এই রিপোর্ট দেখায় ব্যাচটা ওয়্যারহাউজ থেকে কোন কোন SR-এর কাছে ইস্যু হয়েছে (অর্ডার-লেভেল)। এই মুহূর্তে সিস্টেমে বিক্রয়ের সময় ব্যাচ ট্র্যাক হয় না,
              তাই কোন দোকান/কাস্টমারের কাছে গেছে তা এখান থেকে জানা যাবে না — সেই SR-এর সাথে যোগাযোগ করে নিশ্চিত করতে হবে।
              </p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">মোট বিতরণকৃত</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{recallData.total_distributed} {recallData.batch.unit}</span>
            </div>

            {recallData.distributed_to.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">এই ব্যাচ থেকে এখনো কোনো অর্ডারে স্টক ইস্যু হয়নি।</p>
            ) : (
              <div className="space-y-2">
                {recallData.distributed_to.map(w => (
                  <div key={w.worker_id} className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/40">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{w.worker_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{w.employee_code}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{w.total_qty} {recallData.batch.unit}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {w.orders.length} টা অর্ডারের মাধ্যমে • সর্বশেষ {fmtDate(w.orders[0]?.date)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">তথ্য পাওয়া যায়নি।</p>
        )}
      </Modal>

      {/* ✅ Phase ৩: লস ট্রেন্ড + ব্যাচ-ট্র্যাকিং কভারেজ অ্যানালিটিক্স মোডাল */}
      <Modal
        isOpen={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        title="লস ও কভারেজ ট্রেন্ড"
        size="xl"
      >
        <div className="space-y-5">
          <div className="flex items-center justify-end gap-2">
            {[6, 12].map(m => (
              <button
                key={m}
                onClick={() => changeAnalyticsMonths(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  analyticsMonths === m
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                শেষ {m} মাস
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
            </div>
          ) : analyticsData ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">এই সময়ে মোট রাইট-অফ লস</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{fmtBDT(analyticsData.summary.total_written_off_value)}</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">সামগ্রিক ব্যাচ-ট্র্যাকিং কভারেজ</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {analyticsData.summary.overall_coverage_pct !== null ? `${analyticsData.summary.overall_coverage_pct}%` : '—'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">মাসভিত্তিক রাইট-অফ লস (৳)</h4>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={analyticsData.trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmtBDT(v)} labelFormatter={(l) => `মাস: ${l}`} />
                      <Bar dataKey="written_off_value" name="রাইট-অফ লস (৳)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">মাসভিত্তিক ব্যাচ-ট্র্যাকিং কভারেজ (%)</h4>
                <p className="text-xs text-gray-400 mb-2">
                  স্টক-আউটের কত অংশ ব্যাচ-ট্র্যাকড ছিল — কম মানে PO রিসিভের সময় ব্যাচ নং/মেয়াদ কম দেওয়া হচ্ছে।
                </p>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={analyticsData.trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l) => `মাস: ${l}`} />
                      <Line type="monotone" dataKey="coverage_pct" name="কভারেজ %" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">তথ্য পাওয়া যায়নি।</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
