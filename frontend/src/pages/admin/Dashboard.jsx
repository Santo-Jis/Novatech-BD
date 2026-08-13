import BroadcastEmailModal from '../../components/BroadcastEmailModal'
import SeatUsage from '../../components/SeatUsage'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { KPICard, Card } from '../../components/ui/Badge'
import { SalesChart, AttendancePieChart } from '../../components/charts/Charts'
import Badge from '../../components/ui/Badge'
import CommissionSummaryCard from '../../components/CommissionSummaryCard'
import {
  FiUsers, FiShoppingBag, FiDollarSign,
  FiCheckSquare, FiTrendingUp, FiPackage,
  FiRefreshCw, FiRotateCcw,
  FiChevronRight, FiUserPlus, FiBarChart2, FiSettings, FiMail, FiTruck, FiTag
} from 'react-icons/fi'

// ============================================================
// AdminDashboard — redesigned
// ─────────────────────────────────────────────────────────────
// আগের ভার্সনের চেয়ে এখানে যা নতুন/বদলেছে:
//  1. তারিখ-রেঞ্জ টগল (আজ/সপ্তাহ/মাস) — /admin/stats, /reports/sales,
//     /reports/top-products, /reports/top-shops সবগুলোই from/to প্যারাম
//     আগে থেকেই সাপোর্ট করতো, শুধু frontend থেকে ব্যবহার করা হতো না।
//  2. "এখনই নজর দিন" rail — pending approval + স্টক-আউট + রিটার্ন +
//     সিট-লিমিট, একসাথে এক জায়গায় (আগে শুধু pending approval banner ছিল)।
//  3. KPICard-এ trend% এখন সত্যিই ব্যবহার হচ্ছে (component-এ prop হিসেবে
//     ছিল, কোথাও পাস করা হতো না) — sales ও net-এর জন্য from/to-ফিল্টার্ড
//     query থেকেই সরাসরি পাওয়া যায়।
//  3a. dues ও active-SR প্রথমে trend ছাড়াই রাখা হয়েছিল, কারণ ওই দুইটার
//     backend query তারিখ দিয়ে ফিল্টার হয় না (সবসময় "এখন"-এর snapshot) —
//     তুলনা করার মতো ঐতিহাসিক ডেটা কোথাও রাখা হতো না। এখন backend/src/jobs/
//     kpiSnapshot.job.js প্রতি রাত ১১:৫৫ (Dhaka)-য় প্রতিটা tenant-এর জন্য
//     daily_kpi_snapshots-এ একটা "photo" রাখে, আর getSystemStats() নতুন
//     history ফিল্ড হিসেবে সেটা ফেরত পাঠায় — তাই এখন ওই দুইটাতেও সত্যিকারের
//     trend% দেখানো যাচ্ছে (দেখুন curDues/curActiveSR নিচে)। এই job আজ থেকেই
//     শুরু, তাই deploy-এর প্রথম দিন trend দেখাবে না — ধীরে ধীরে জমবে।
//  4. নীট আয় (sales − expense) কার্ড নতুন — kpi.expenses আগে থেকেই
//     backend পাঠাতো, dashboard কখনো দেখাতো না।
//  5. শীর্ষ SR — kpi.top_workers আগে থেকেই backend পাঠাতো, ব্যবহার হতো না।
//  6. বিক্রয় ট্রেন্ড চার্ট বাগ ফিক্স — আগে s.total_amount পড়া হতো, কিন্তু
//     /reports/sales?group_by=day কখনো ওই নামে ফিল্ড পাঠায় না (পাঠায়
//     total_sales) — ফলে চার্ট সবসময় ০ দেখাতো। এখন total_sales ব্যবহার হচ্ছে।
//  7. ভাসমান "সবাইকে Email" বাটন সরিয়ে "দ্রুত কার্যক্রম" গ্রিডে নেওয়া হলো।
// ============================================================

// ---------- তারিখ হেল্পার ----------
const toISO = (d) => d.toISOString().split('T')[0]

function rangeDates(range) {
  const t = new Date()
  if (range === 'today') return { from: toISO(t), to: toISO(t) }
  if (range === 'week') {
    const from = new Date(t); from.setDate(from.getDate() - 6)
    return { from: toISO(from), to: toISO(t) }
  }
  const from = new Date(t.getFullYear(), t.getMonth(), 1) // মাসের ১ তারিখ
  return { from: toISO(from), to: toISO(t) }
}

// আগের সমতুল্য পিরিয়ড — trend % বের করার জন্য
function prevRangeDates(range) {
  const t = new Date()
  if (range === 'today') {
    const y = new Date(t); y.setDate(y.getDate() - 1)
    return { from: toISO(y), to: toISO(y) }
  }
  if (range === 'week') {
    const to   = new Date(t); to.setDate(to.getDate() - 7)
    const from = new Date(t); from.setDate(from.getDate() - 13)
    return { from: toISO(from), to: toISO(to) }
  }
  // মাস — গত মাসের একই কয়দিন (১ তারিখ থেকে আজকের সমান দিন-সংখ্যা পর্যন্ত)
  const dayNum           = t.getDate()
  const prevMonthFirst   = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  const prevMonthLastDay = new Date(t.getFullYear(), t.getMonth(), 0).getDate()
  const prevMonthTo      = new Date(t.getFullYear(), t.getMonth() - 1, Math.min(dayNum, prevMonthLastDay))
  return { from: toISO(prevMonthFirst), to: toISO(prevMonthTo) }
}

// বিক্রয় ট্রেন্ড চার্টের জন্য — এটা KPI রেঞ্জ থেকে আলাদা, সবসময় একটা
// মাল্টি-ডে ভিউ দরকার (আজ সিলেক্ট করলেও ১ পয়েন্টের চার্ট অর্থহীন)
function chartDates(range) {
  const t    = new Date()
  const days = range === 'today' ? 7 : range === 'week' ? 14 : 30
  const from = new Date(t); from.setDate(from.getDate() - (days - 1))
  return { from: toISO(from), to: toISO(t) }
}

const RANGE_OPTIONS = [
  { key: 'today', label: 'আজ',        trendLabel: 'গতকালের তুলনায়' },
  { key: 'week',  label: 'এই সপ্তাহ', trendLabel: 'আগের সপ্তাহের তুলনায়' },
  { key: 'month', label: 'এই মাস',    trendLabel: 'গত মাসের একই সময়ের তুলনায়' },
]

// prev===null মানে তুলনার মতো ঐতিহাসিক ডেটা এখনো নেই (prevKpi লোড হয়নি,
// অথবা daily_kpi_snapshots-এ ওই তারিখের রেকর্ড নেই) — null ফেরত দিলে
// KPICard trend arrow লুকিয়ে ফেলে, ভুল/আন্দাজি সংখ্যা দেখায় না।
function pctChange(cur, prev) {
  if (prev === null || prev === undefined) return null
  if (prev === 0) return cur > 0 ? 100 : null
  return Math.round(((cur - prev) / prev) * 100)
}

export default function AdminDashboard() {
  const navigate = useNavigate()

  const [range, setRange]                 = useState('today')
  const [broadcastOpen, setBroadcastOpen]  = useState(false)
  const [kpi, setKPI]                     = useState(null)
  const [prevKpi, setPrevKPI]             = useState(null)
  const [sales, setSales]                 = useState([])
  const [insights, setInsights]           = useState([])
  const [topProds, setTopProds]           = useState([])
  const [topShops, setTopShops]           = useState([])
  const [seats, setSeats]                 = useState([])
  const [notices, setNotices]             = useState([])
  const [promoSummary, setPromoSummary]   = useState(null) // ← Phase ৪
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)

  const fetchData = async () => {
    setRefreshing(true)
    try {
      const { from, to }             = rangeDates(range)
      const { from: pFrom, to: pTo } = prevRangeDates(range)
      const { from: cFrom, to: cTo } = chartDates(range)

      const [kpiRes, prevKpiRes, salesRes, insightRes, prodRes, shopRes] = await Promise.all([
        api.get('/admin/stats',          { params: { from, to } }),
        api.get('/admin/stats',          { params: { from: pFrom, to: pTo } }),
        api.get('/reports/sales',        { params: { group_by: 'day', from: cFrom, to: cTo } }),
        api.get('/ai/insights',          { params: { unread_only: false, limit: 5 } }),
        api.get('/reports/top-products', { params: { limit: 5, from, to } }),
        api.get('/reports/top-shops',    { params: { limit: 5, from, to } }),
      ])
      setKPI(kpiRes.data.data)
      setPrevKPI(prevKpiRes.data.data)
      setSales(salesRes.data.data?.records || [])
      setInsights(insightRes.data.data?.insights || [])
      setTopProds(prodRes.data.data || [])
      setTopShops(shopRes.data.data || [])

      // এই দুটো non-critical widget — ব্যর্থ হলেও বাকি ড্যাশবোর্ড যেন আটকে না যায়
      // (SeatUsage কম্পোনেন্টও নিজে থেকে একই এন্ডপয়েন্ট আলাদাভাবে fetch করে;
      //  এখানে শুধু "attention rail"-এর সিট-লিমিট চেক করার জন্য হালকা করে আনা হচ্ছে)
      api.get('/employees/seats')
        .then(r => setSeats(r.data?.data?.seats || []))
        .catch(() => setSeats([]))

      api.get('/notices/all')
        .then(r => {
          const active = (r.data?.data || []).filter(
            n => n.is_active && (!n.expires_at || new Date(n.expires_at) > new Date())
          )
          setNotices(active.slice(0, 3))
        })
        .catch(() => setNotices([]))

      // ← Phase ৪: non-critical, ব্যর্থ হলে ড্যাশবোর্ড আটকাবে না
      api.get('/promotions/dashboard-summary')
        .then(r => setPromoSummary(r.data?.data || null))
        .catch(() => setPromoSummary(null))

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [range])

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-9 w-64 bg-white rounded-lg animate-pulse" />
        <div className="flex gap-3 overflow-x-auto">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 w-64 flex-shrink-0 bg-white rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-white rounded-2xl animate-pulse border border-gray-100" />
          <div className="h-64 bg-white rounded-2xl animate-pulse border border-gray-100" />
        </div>
      </div>
    )
  }

  const meta = RANGE_OPTIONS.find(r => r.key === range)

  // ---------- পেন্ডিং / এলার্ট ডেটা ----------
  const pending = kpi?.pending || {}
  const totalPending =
    parseInt(pending.pending_orders      || 0) +
    parseInt(pending.pending_settlements || 0) +
    parseInt(pending.pending_employees   || 0) +
    parseInt(pending.pending_edits       || 0)
  const pendingReturns = parseInt(pending.pending_returns || 0)
  const outOfStock     = parseInt(kpi?.products?.out_of_stock || 0)

  const liveSeats    = seats.filter(s => s.live && !s.unlimited)
  const fullSeat      = liveSeats.find(s => s.remaining <= 0)
  const nearFullSeat = !fullSeat && liveSeats.find(s => s.limit > 0 && (s.used / s.limit) >= 0.85)
  const seatAlert     = fullSeat || nearFullSeat

  const attentionItems = [
    totalPending > 0 && {
      severity: 'warning', icon: FiCheckSquare, title: `${totalPending}টি অনুমোদন বাকি`,
      sub: [
        pending.pending_employees   > 0 && `কর্মচারী ${pending.pending_employees}`,
        pending.pending_orders      > 0 && `অর্ডার ${pending.pending_orders}`,
        pending.pending_settlements > 0 && `হিসাব ${pending.pending_settlements}`,
        pending.pending_edits       > 0 && `এডিট ${pending.pending_edits}`,
      ].filter(Boolean).join(' · '),
      cta: 'দেখুন', path: '/admin/pending',
    },
    outOfStock > 0 && {
      severity: 'critical', icon: FiPackage, title: `${outOfStock}টি পণ্য স্টকে নেই`,
      sub: 'পুনরায় অর্ডার প্রয়োজন', cta: 'পণ্য দেখুন', path: '/admin/products',
    },
    pendingReturns > 0 && {
      severity: 'warning', icon: FiRotateCcw, title: `${pendingReturns}টি রিটার্ন রিকোয়েস্ট`,
      sub: 'পর্যালোচনার অপেক্ষায়', cta: 'রিভিউ করুন', path: '/admin/portal-returns',
    },
    seatAlert && {
      severity: fullSeat ? 'critical' : 'warning',
      icon: FiUsers,
      title: fullSeat ? `${seatAlert.label} সিট শেষ` : `${seatAlert.label} সিট প্রায় শেষ`,
      sub: `${seatAlert.used}/${seatAlert.limit} ব্যবহৃত (${Math.round((seatAlert.used / seatAlert.limit) * 100)}%)`,
      cta: 'বিস্তারিত', path: '/admin/employees',
    },
    promoSummary?.pending_approval_count > 0 && { // ← Phase ৪
      severity: 'warning', icon: FiTag, title: `${promoSummary.pending_approval_count}টি প্রমোশন অনুমোদনের অপেক্ষায়`,
      sub: 'বড় ছাড়/বাজেট-ক্যাপহীন অফার — লাইভ হওয়ার আগে দেখুন',
      cta: 'দেখুন', path: '/admin/promotions',
    },
  ].filter(Boolean)

  // ---------- KPI + trend (শুধু তারিখ-ফিল্টার হওয়া ফিল্ডে) ----------
  const curSales    = parseFloat(kpi?.sales?.total_sales          || 0)
  const curExpense  = parseFloat(kpi?.expenses?.total_expense     || 0)
  const curNet      = curSales - curExpense
  const curDues     = parseFloat(kpi?.customers?.total_outstanding || 0)
  const curActiveSR = parseInt(kpi?.workers?.active                || 0)

  // prevKpi লোড না হওয়া পর্যন্ত, বা snapshot না থাকলে — null-ই রাখা হচ্ছে
  // (0 ধরে নিলে "০ থেকে বেড়েছে" এর মতো ভুল trend% বের হতো)
  const prevSales    = prevKpi?.sales?.total_sales           != null ? parseFloat(prevKpi.sales.total_sales)      : null
  const prevExpense  = prevKpi?.expenses?.total_expense       != null ? parseFloat(prevKpi.expenses.total_expense) : null
  const prevNet      = (prevSales !== null && prevExpense !== null) ? (prevSales - prevExpense) : null
  // ✅ dues/active-SR-এর ঐতিহাসিক তুলনা এখন daily_kpi_snapshots থেকে আসে
  // (kpiSnapshot.job.js প্রতি রাতে রাখে) — prevKpi.customers/.workers না,
  // কারণ ওগুলো সবসময় "এখন"-এর লাইভ ভ্যালু, তারিখ দিয়ে ফিল্টার হয় না।
  const prevDues     = prevKpi?.history?.total_outstanding   != null ? parseFloat(prevKpi.history.total_outstanding) : null
  const prevActiveSR = prevKpi?.history?.active_workers      != null ? parseInt(prevKpi.history.active_workers)      : null

  const salesTrend   = pctChange(curSales, prevSales)
  const netTrend      = pctChange(curNet, prevNet)
  const duesTrend      = pctChange(curDues, prevDues)
  const activeSRTrend  = pctChange(curActiveSR, prevActiveSR)

  const cashSales   = parseFloat(kpi?.sales?.cash_sales   || 0)
  const creditSales = parseFloat(kpi?.sales?.credit_sales || 0)

  // ---------- চার্ট ডেটা (ফিল্ড-নেম বাগ ফিক্স: total_amount → total_sales) ----------
  const chartData = [...sales].reverse().map(s => ({
    date:  new Date(s.date).toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' }),
    total: parseFloat(s.total_sales || 0),
  }))

  const attendanceLabel =
    range === 'today' ? 'আজকের হাজিরা' :
    range === 'week'  ? 'এই সপ্তাহের হাজিরা' : 'এই মাসের হাজিরা (সারসংক্ষেপ)'

  const topSR = kpi?.top_workers || []

  const quickActions = [
    { label: 'নতুন কর্মচারী',   icon: <FiUserPlus />,   path: '/admin/employees/new',  color: 'bg-primary/10 text-primary' },
    { label: 'পেন্ডিং অনুমোদন', icon: <FiCheckSquare />, path: '/admin/pending',        color: 'bg-amber-50 text-amber-600' },
    { label: 'ক্রয় অর্ডার',    icon: <FiTruck />,       path: '/admin/purchase-orders', color: 'bg-secondary/10 text-secondary' },
    { label: 'রিপোর্ট দেখুন',   icon: <FiBarChart2 />,   path: '/admin/reports',        color: 'bg-primary/10 text-primary' },
    { label: 'সবাইকে Email',    icon: <FiMail />,        action: () => setBroadcastOpen(true), color: 'bg-blue-50 text-blue-600' },
    { label: 'সেটিংস',          icon: <FiSettings />,    path: '/admin/settings',       color: 'bg-gray-100 text-gray-600' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">অ্যাডমিন ড্যাশবোর্ড</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
            {RANGE_OPTIONS.map(r => (
              <button
                key={r.key}
                onClick={() => !refreshing && setRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  range === r.key ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      {/* এখনই নজর দিন */}
      {attentionItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 px-0.5">এখনই নজর দিন</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {attentionItems.map((item, i) => (
              <AttentionCard key={i} item={item} onClick={() => navigate(item.path)} />
            ))}
          </div>
        </div>
      )}

      {/* সিট ব্যবহার — বিস্তারিত (রোল অনুযায়ী) */}
      <SeatUsage />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={`${meta.label} বিক্রয়`}
          value={`৳${curSales.toLocaleString()}`}
          subtitle={`নগদ ৳${cashSales.toLocaleString()} · বাকি ৳${creditSales.toLocaleString()}`}
          icon={<FiShoppingBag />}
          color="secondary"
          trend={salesTrend}
          trendLabel={meta.trendLabel}
        />
        <KPICard
          title="নীট আয় (বিক্রয় - খরচ)"
          value={`৳${curNet.toLocaleString()}`}
          subtitle={`খরচ ৳${curExpense.toLocaleString()} বাদে`}
          icon={<FiTrendingUp />}
          color="success"
          trend={netTrend}
          trendLabel={meta.trendLabel}
        />
        <KPICard
          title="মোট বকেয়া"
          value={`৳${curDues.toLocaleString()}`}
          subtitle={`${kpi?.customers?.customers_with_dues || 0}টি দোকান — চলমান ব্যালেন্স`}
          icon={<FiDollarSign />}
          color="accent"
          trend={duesTrend}
          trendLabel={meta.trendLabel}
          invertTrend
        />
        <KPICard
          title="সক্রিয় SR"
          value={curActiveSR}
          subtitle={`${kpi?.workers?.pending || 0} জন অনুমোদনের অপেক্ষায়${kpi?.workers?.suspended > 0 ? ` · ${kpi.workers.suspended} সাসপেন্ড` : ''}`}
          icon={<FiUsers />}
          color="primary"
          trend={activeSRTrend}
          trendLabel={meta.trendLabel}
        />
        {promoSummary && ( // ← Phase ৪: non-critical বলে fetch ব্যর্থ হলে কার্ডটাই দেখাবে না, বাকি ড্যাশবোর্ড অক্ষত থাকবে
          <KPICard
            title="এই মাসে প্রমোশন ছাড়"
            value={`৳${Number(promoSummary.discount_this_month || 0).toLocaleString()}`}
            subtitle={`${promoSummary.active_count || 0}টি সক্রিয় অফার · ${promoSummary.redemptions_this_month || 0}বার ব্যবহৃত`}
            icon={<FiTag />}
            color="secondary"
          />
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="বিক্রয় ট্রেন্ড" subtitle={`সাম্প্রতিক ${chartData.length} দিন`} className="lg:col-span-2">
          <SalesChart data={chartData} />
        </Card>

        <Card title={attendanceLabel}>
          <AttendancePieChart
            data={{
              present: parseInt(kpi?.attendance?.present || 0),
              late:    parseInt(kpi?.attendance?.late    || 0),
              absent:  parseInt(kpi?.attendance?.absent  || 0),
            }}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-emerald-700 font-bold">{kpi?.attendance?.present || 0}</p>
              <p className="text-xs text-gray-500">উপস্থিত</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2">
              <p className="text-amber-700 font-bold">{kpi?.attendance?.late || 0}</p>
              <p className="text-xs text-gray-500">দেরি</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <p className="text-red-700 font-bold">{kpi?.attendance?.absent || 0}</p>
              <p className="text-xs text-gray-500">অনুপস্থিত</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights + Notice Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card
            title="AI ইনসাইটস"
            className="h-full"
            action={insights.length > 0 && (
              <button onClick={() => navigate('/admin/ai-insights')} className="text-sm text-primary hover:underline">
                সব দেখুন →
              </button>
            )}
          >
            {insights.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">এই মুহূর্তে কোনো নতুন ইনসাইট নেই।</p>
            ) : (
              <div className="space-y-3">
                {insights.slice(0, 3).map(insight => (
                  <div
                    key={insight.id}
                    className={`p-4 rounded-xl border-l-4 ${
                      insight.severity === 'critical' ? 'bg-red-50 border-red-500' :
                      insight.severity === 'warning'  ? 'bg-amber-50 border-amber-500' :
                      'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{insight.title}</p>
                        <p className="text-xs text-gray-600 mt-1">{insight.description}</p>
                      </div>
                      <Badge variant={insight.severity} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card
          title="নোটিশ বোর্ড"
          className="h-full"
          action={<button onClick={() => navigate('/admin/notices')} className="text-xs text-primary hover:underline">সব →</button>}
        >
          {notices.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">কোনো সক্রিয় নোটিশ নেই।</p>
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <div key={n.id} className="pb-3 border-b last:border-0 border-gray-100 last:pb-0">
                  <p className="text-sm font-medium text-gray-700">{n.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(n.created_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* সেরা পারফরমার */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2 px-0.5">সেরা পারফরমার — {meta.label}</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="🏅 শীর্ষ SR" action={<button onClick={() => navigate('/admin/reports')} className="text-xs text-primary hover:underline">সব →</button>}>
            {topSR.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">এই সময়ে কোনো বিক্রয় নেই।</p>
            ) : (
              <div className="space-y-2">
                {topSR.map((s, i) => (
                  <RankRow key={i} rank={i + 1} name={s.worker_name} sub={`${s.employee_code} · ${s.invoice_count} Invoice`} value={`৳${parseInt(s.total_sales || 0).toLocaleString()}`} />
                ))}
              </div>
            )}
          </Card>

          <Card title="🏆 শীর্ষ পণ্য" action={<button onClick={() => navigate('/admin/reports')} className="text-xs text-primary hover:underline">সব →</button>}>
            {topProds.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">এই সময়ে কোনো বিক্রয় নেই।</p>
            ) : (
              <div className="space-y-2">
                {topProds.map((p, i) => (
                  <RankRow key={i} rank={i + 1} name={p.product_name} sub={`${parseInt(p.total_qty || 0)} পিস`} value={`৳${parseInt(p.total_revenue || 0).toLocaleString()}`} />
                ))}
              </div>
            )}
          </Card>

          <Card title="🏪 শীর্ষ দোকান" action={<button onClick={() => navigate('/admin/reports')} className="text-xs text-primary hover:underline">সব →</button>}>
            {topShops.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">এই সময়ে কোনো ক্রয় নেই।</p>
            ) : (
              <div className="space-y-2">
                {topShops.map((s, i) => (
                  <RankRow key={i} rank={i + 1} name={s.shop_name} sub={`${s.route_name || '—'} · ${s.order_count} অর্ডার`} value={`৳${parseInt(s.total_purchase || 0).toLocaleString()}`} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Commission Summary + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CommissionSummaryCard />
        </div>
        <div className="lg:col-span-2">
          <Card title="দ্রুত কার্যক্রম" className="h-full">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {quickActions.map(action => (
                <button
                  key={action.label}
                  onClick={() => action.action ? action.action() : navigate(action.path)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl ${action.color} hover:opacity-80 transition-opacity`}
                >
                  <span className="text-xl">{action.icon}</span>
                  <span className="text-xs font-semibold text-center">{action.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <BroadcastEmailModal isOpen={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </div>
  )
}

// ============================================================
// ছোট লোকাল কম্পোনেন্ট — শুধু এই পেজেই ব্যবহৃত (SeatUsage.jsx-এর
// ভেতরের SeatCard-এর মতোই প্যাটার্ন — আলাদা shared ফাইল বানানো হয়নি)
// ============================================================

function AttentionCard({ item, onClick }) {
  const Icon = item.icon
  const sev = item.severity === 'critical'
    ? { wrap: 'bg-red-50 border-red-200 hover:bg-red-100', text: 'text-red-700', iconBg: 'bg-red-600' }
    : { wrap: 'bg-amber-50 border-amber-200 hover:bg-amber-100', text: 'text-amber-700', iconBg: 'bg-amber-500' }
  return (
    <button
      onClick={onClick}
      className={`min-w-[250px] flex-shrink-0 rounded-2xl border p-4 flex items-start gap-3 text-left transition-colors ${sev.wrap}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${sev.iconBg}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${sev.text}`}>{item.title}</p>
        {item.sub && <p className="text-xs text-gray-500 mt-0.5">{item.sub}</p>}
        <p className={`text-xs font-semibold mt-1.5 flex items-center gap-0.5 ${sev.text}`}>
          {item.cta} <FiChevronRight size={12} />
        </p>
      </div>
    </button>
  )
}

function RankRow({ rank, name, sub, value }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
      <span className="text-sm font-bold text-secondary flex-shrink-0">{value}</span>
    </div>
  )
}
