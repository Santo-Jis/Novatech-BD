import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { saveCache, getCache } from '../../api/offlineQueue'
import {
  FiTrendingUp, FiMapPin, FiTarget, FiCalendar,
  FiChevronLeft, FiChevronRight, FiShoppingBag,
  FiDollarSign, FiCheckCircle, FiEye, FiX,
  FiBarChart2, FiRefreshCw, FiStar, FiAlertCircle
} from 'react-icons/fi'

// ─── Constants ──────────────────────────────────────────────
const MONTHS_BN = ['', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

const WEEKDAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি']

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')
const pct  = (n) => `${Math.min(100, Math.round(n || 0))}%`

// ─── Progress Bar ────────────────────────────────────────────
function ProgressBar({ value, max, color = '#1e3a8a', height = 8 }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 99, height, overflow: 'hidden' }}>
      <div style={{
        width: `${ratio * 100}%`, height: '100%',
        background: color, borderRadius: 99,
        transition: 'width 0.5s ease'
      }} />
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = '#1e3a8a', bg = '#eff6ff' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px',
      border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color, fontSize: 18, flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{value}</p>
        {sub && <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Sale Detail Modal ────────────────────────────────────────
function SaleDetailModal({ sale, onClose }) {
  if (!sale) return null
  const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])
  const repItems = typeof sale.replacement_items === 'string'
    ? JSON.parse(sale.replacement_items) : (sale.replacement_items || [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 100, display: 'flex', alignItems: 'flex-end',
      backdropFilter: 'blur(2px)'
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '85vh', overflow: 'auto', padding: '20px 16px 32px'
      }} onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 99, margin: '0 auto 16px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{sale.shop_name}</p>
            <p style={{ fontSize: 11, color: '#64748b' }}>Invoice: {sale.invoice_number}</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>
              {new Date(sale.created_at).toLocaleString('bn-BD')}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 99, border: 'none',
            background: '#f1f5f9', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#64748b'
          }}>
            <FiX size={16} />
          </button>
        </div>

        {/* Status badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
          borderRadius: 99, marginBottom: 16,
          background: sale.otp_verified ? '#f0fdf4' : '#fffbeb',
          color: sale.otp_verified ? '#15803d' : '#d97706',
          fontSize: 12, fontWeight: 600
        }}>
          {sale.otp_verified ? <FiCheckCircle size={13} /> : <FiAlertCircle size={13} />}
          {sale.otp_verified ? 'OTP যাচাই হয়েছে' : 'OTP যাচাই বাকি'}
        </div>

        {/* Items Table */}
        <div style={{ background: '#f8fafc', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 60px',
            padding: '8px 12px', background: '#e2e8f0',
            fontSize: 11, fontWeight: 600, color: '#64748b'
          }}>
            <span>পণ্য</span><span style={{ textAlign: 'center' }}>পরিমাণ</span><span style={{ textAlign: 'right' }}>মোট</span>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 60px',
              padding: '9px 12px', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none',
              background: i % 2 === 0 ? '#fff' : '#f8fafc', fontSize: 12
            }}>
              <span style={{ color: '#334155', fontWeight: 500 }}>{item.product_name}</span>
              <span style={{ textAlign: 'center', color: '#64748b' }}>{item.qty}</span>
              <span style={{ textAlign: 'right', fontWeight: 600, color: '#1e3a8a' }}>
                {taka(item.subtotal || item.final_price * item.qty)}
              </span>
            </div>
          ))}
        </div>

        {/* Replacement Items */}
        {repItems.length > 0 && (
          <div style={{ background: '#fff7ed', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#c2410c', marginBottom: 6 }}>🔄 রিপ্লেসমেন্ট পণ্য</p>
            {repItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: '#9a3412' }}>{item.product_name} × {item.qty}</span>
                <span style={{ fontWeight: 600, color: '#c2410c' }}>{taka(item.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {[
          ['পেমেন্ট পদ্ধতি', sale.payment_method === 'cash' ? '💵 নগদ' : sale.payment_method === 'credit' ? '📋 বাকি' : '🔄 রিপ্লেসমেন্ট'],
          ['মোট বিক্রয়', taka(sale.total_amount)],
          sale.discount_amount > 0 && ['ক্রেডিট ব্যালেন্স ব্যবহার', `- ${taka(sale.discount_amount)}`],
          sale.replacement_value > 0 && ['রিপ্লেসমেন্ট মূল্য', `- ${taka(sale.replacement_value)}`],
          ['নিট পরিমাণ', taka(sale.net_amount)],
        ].filter(Boolean).map(([label, val], i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: '1px solid #f1f5f9',
            fontSize: 13
          }}>
            <span style={{ color: '#64748b' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Weekly Summary Card ──────────────────────────────────────
function WeekSummary({ week }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 14,
      border: '1px solid #e2e8f0', marginBottom: 10
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{week.label}</p>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px',
          borderRadius: 99, background: '#eff6ff', color: '#1e3a8a'
        }}>
          {week.working_days} কার্যদিন
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { l: 'বিক্রয়', v: taka(week.total_amount), c: '#1e3a8a' },
          { l: 'ভিজিট', v: `${week.total_visits}টি`, c: '#065f46' },
          { l: 'অর্জন', v: pct((week.total_visits / Math.max(1, week.target_visits)) * 100), c: '#d97706' },
        ].map(({ l, v, c }, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>{l}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</p>
          </div>
        ))}
      </div>
      <ProgressBar
        value={week.total_visits}
        max={week.target_visits || week.total_customers}
        color="#065f46"
        height={6}
      />
      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>
        ভিজিট রেট: {pct((week.total_visits / Math.max(1, week.total_customers)) * 100)}
      </p>
    </div>
  )
}

// ─── Daily Row ───────────────────────────────────────────────
function DayRow({ day, onShowSales }) {
  const date = new Date(day.date)
  const dayName = WEEKDAYS_BN[date.getDay()]
  const visitPct = day.total_customers > 0
    ? Math.round((day.total_visits / day.total_customers) * 100) : 0

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '12px 14px',
      border: '1px solid #e2e8f0', marginBottom: 8
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 99, background: '#eff6ff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#1e3a8a', flexShrink: 0
            }}>
              {date.getDate()}
            </span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{dayName}</p>
              <p style={{ fontSize: 10, color: '#94a3b8' }}>
                {MONTHS_BN[date.getMonth() + 1]}
              </p>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a' }}>{taka(day.total_amount)}</p>
          <p style={{ fontSize: 11, color: '#64748b' }}>{day.sale_count}টি বিক্রয়</p>
        </div>
      </div>

      {/* Visit progress */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            ভিজিট: {day.total_visits}/{day.total_customers}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: visitPct >= 80 ? '#15803d' : visitPct >= 50 ? '#d97706' : '#dc2626' }}>
            {visitPct}%
          </span>
        </div>
        <ProgressBar
          value={day.total_visits}
          max={day.total_customers || 1}
          color={visitPct >= 80 ? '#15803d' : visitPct >= 50 ? '#d97706' : '#dc2626'}
          height={6}
        />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            💵 {taka(day.cash_received)}
          </span>
          {day.credit_given > 0 && (
            <span style={{ fontSize: 10, color: '#d97706' }}>
              📋 {taka(day.credit_given)} বাকি
            </span>
          )}
        </div>
        {day.sale_count > 0 && (
          <button
            onClick={() => onShowSales(day.date)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#eff6ff', color: '#1e3a8a', border: 'none',
              borderRadius: 8, padding: '4px 10px', fontSize: 11,
              fontWeight: 600, cursor: 'pointer'
            }}
          >
            <FiEye size={11} /> বিস্তারিত
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function SalesHistory() {
  const now     = new Date()
  const [view,    setView]    = useState('monthly')  // 'monthly' | 'weekly'
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [year,    setYear]    = useState(now.getFullYear())
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [salesModal,   setSalesModal]   = useState(null)
  const [detailSale,   setDetailSale]   = useState(null)
  const [loadingSales, setLoadingSales] = useState(false)
  const [isFallback,   setIsFallback]   = useState(false)
  const [isStaleCache, setIsStaleCache] = useState(false)

  // ─── Data Fetch ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setIsFallback(false)
    setIsStaleCache(false)

    const cacheKey = `sales_history_${year}_${month}`

    try {
      // ১. Primary API — দুটো endpoint একসাথে
      const [salesRes, visitRes] = await Promise.all([
        api.get(`/sales/my-monthly?month=${month}&year=${year}`),
        api.get(`/sales/my-visit-stats?month=${month}&year=${year}`)
      ])
      const freshData = {
        monthly: salesRes.data.data,
        visits:  visitRes.data.data
      }
      setData(freshData)
      // সফল হলে cache এ সেভ করো
      await saveCache(cacheKey, freshData)

    } catch {
      // ২. Primary fail — cache চেক করো
      try {
        const cached = await getCache(cacheKey)
        if (cached) {
          setData(cached.data)
          setIsFallback(true)
          setIsStaleCache(!cached.isToday)
          return
        }
      } catch { /* cache read fail — নিচে fallback চলবে */ }

      // ৩. Cache নেই — /sales/my দিয়ে fallback বানাও
      setIsFallback(true)
      try {
        const from    = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).getDate()
        const to      = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
        const res     = await api.get(`/sales/my?from=${from}&to=${to}`)
        setData({ fallback: res.data.data || [] })
      } catch {
        setData({ fallback: [] })
      }
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Load sales for a specific date ──────────────────────
  const showDaySales = async (date) => {
    setLoadingSales(true)
    setSalesModal({ date, sales: [] })
    try {
      const res = await api.get(`/sales/my?date=${date}`)
      setSalesModal({ date, sales: res.data.data || [] })
    } catch {
      setSalesModal({ date, sales: [] })
    } finally {
      setLoadingSales(false)
    }
  }

  // ─── Process fallback data into daily ────────────────────
  // SalesHistory থেকে visit tracking calculate করা হচ্ছে
  // প্রতিটি unique customer_id = একটি visit
  const buildDailyFromFallback = (sales) => {
    const map = {}
    sales.forEach(s => {
      const d = s.date || s.created_at?.split('T')[0]
      if (!d) return
      if (!map[d]) map[d] = {
        date: d, sale_count: 0, total_amount: 0,
        cash_received: 0, credit_given: 0,
        total_visits: 0, total_customers: 0,
        _customer_ids: new Set()          // unique customers track করতে
      }
      map[d].sale_count++
      map[d].total_amount  += parseFloat(s.total_amount  || 0)
      map[d].cash_received += parseFloat(s.cash_received || 0)
      map[d].credit_given  += parseFloat(s.credit_used   || 0)

      // প্রতিটি sale = কমপক্ষে ১টি visit।
      // unique customer_id দিয়ে দোকান count করা হচ্ছে।
      if (s.customer_id) {
        map[d]._customer_ids.add(String(s.customer_id))
      } else {
        // customer_id না থাকলে invoice নম্বর দিয়ে approximate
        map[d]._customer_ids.add(s.invoice_number || `sale_${map[d].sale_count}`)
      }
    })

    // Set থেকে real count বের করো, তারপর Set মুছে ফেলো
    return Object.values(map)
      .map(({ _customer_ids, ...day }) => ({
        ...day,
        total_visits:    _customer_ids.size,  // প্রতিটি unique দোকান = ১ visit
        total_customers: _customer_ids.size,  // fallback এ visited = total
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  // ─── Month navigation ────────────────────────────────────
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

  // ─── Derived values ──────────────────────────────────────
  const monthly   = data?.monthly  || {}
  const visits    = data?.visits   || {}
  const fallback  = data?.fallback
  const daily     = fallback
    ? buildDailyFromFallback(fallback)
    : (monthly.daily || [])

  const totalSales   = fallback
    ? fallback.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0)
    : parseFloat(monthly.total_amount || 0)
  const totalCash    = fallback
    ? fallback.reduce((s, r) => s + parseFloat(r.cash_received || 0), 0)
    : parseFloat(monthly.cash_received || 0)
  const totalCredit  = fallback
    ? fallback.reduce((s, r) => s + parseFloat(r.credit_used || 0), 0)
    : parseFloat(monthly.credit_given || 0)

  // Fallback mode এ daily থেকে visit aggregate করা হচ্ছে
  const totalVisits = fallback
    ? daily.reduce((s, d) => s + parseInt(d.total_visits || 0), 0)
    : parseInt(visits.total_visits || monthly.total_visits || 0)
  const totalCustomers = fallback
    ? daily.reduce((s, d) => s + parseInt(d.total_customers || 0), 0)
    : parseInt(visits.total_customers || monthly.total_customers || 0)
  const visitRate    = totalCustomers > 0 ? Math.round((totalVisits / totalCustomers) * 100) : 0
  const saleCount    = fallback ? fallback.length : parseInt(monthly.sale_count || 0)

  // Target (যদি API-তে না থাকে, ধরে নিচ্ছি ৮০%)
  const targetVisitRate = parseInt(monthly.target_visit_rate || visits.target_visit_rate || 80)
  const monthlyTarget   = parseFloat(monthly.monthly_target || 0)

  // Weekly data build
  const weeks = []
  if (daily.length > 0) {
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
    let weekNum = 0, weekStart = null, bucket = []
    sorted.forEach((d, i) => {
      const dt = new Date(d.date)
      if (weekStart === null || dt.getDay() === 0) {
        if (bucket.length) {
          weeks.push(buildWeek(bucket, weekNum))
          weekNum++
        }
        bucket = []
        weekStart = dt
      }
      bucket.push(d)
      if (i === sorted.length - 1 && bucket.length) {
        weeks.push(buildWeek(bucket, weekNum))
      }
    })
  }

  function buildWeek(days, n) {
    return {
      label: `${n + 1}ম সপ্তাহ`,
      working_days: days.length,
      total_amount: days.reduce((s, d) => s + parseFloat(d.total_amount || 0), 0),
      total_visits: days.reduce((s, d) => s + parseInt(d.total_visits || 0), 0),
      total_customers: days.reduce((s, d) => s + parseInt(d.total_customers || 0), 0),
      target_visits: days.reduce((s, d) => s + parseInt(d.total_customers || 0), 0),
    }
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', paddingBottom: 88, background: '#f8fafc', minHeight: '100vh' }}>

      {/* ─── Title ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>
          বিক্রয় ইতিহাস
        </h2>
        <button onClick={fetchData} style={{
          width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#64748b'
        }}>
          <FiRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Fallback / Stale Cache Warning ─── */}
      {isFallback && !loading && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: isStaleCache ? '#fffbeb' : '#fff7ed',
          border: `1px solid ${isStaleCache ? '#fcd34d' : '#fed7aa'}`,
          borderRadius: 12, padding: '10px 14px', marginBottom: 14
        }}>
          <FiAlertCircle size={15} style={{ color: '#d97706', marginTop: 1, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              {isStaleCache
                ? '⚠️ পুরনো ক্যাশ দেখানো হচ্ছে'
                : '⚠️ সার্ভার সংযোগ নেই'}
            </p>
            <p style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
              {isStaleCache
                ? 'সার্ভার থেকে তথ্য আনা যায়নি। গতকালের ক্যাশ দেখানো হচ্ছে। ভিজিট সংখ্যা আনুমানিক।'
                : 'সার্ভার থেকে তথ্য আনা যায়নি। বিক্রয় ডেটা থেকে ভিজিট আনুমানিক হিসাব করা হয়েছে।'}
            </p>
          </div>
        </div>
      )}

      {/* ─── Month Navigator ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: 14, padding: '10px 14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 14
      }}>
        <button onClick={prevMonth} style={{
          width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#f8fafc', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#1e3a8a'
        }}>
          <FiChevronLeft />
        </button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
            {MONTHS_BN[month]} {year}
          </p>
          {isCurrent && (
            <span style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 600 }}>● চলতি মাস</span>
          )}
        </div>
        <button onClick={nextMonth} disabled={isCurrent} style={{
          width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0',
          background: isCurrent ? '#f1f5f9' : '#f8fafc', cursor: isCurrent ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isCurrent ? '#cbd5e1' : '#1e3a8a'
        }}>
          <FiChevronRight />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: 70, background: '#e2e8f0', borderRadius: 16,
              animation: 'pulse 1.5s infinite'
            }} />
          ))}
        </div>
      ) : (
        <>
          {/* ─── Summary Cards ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <StatCard
              icon={<FiDollarSign />}
              label="মোট বিক্রয়"
              value={taka(totalSales)}
              sub={`${saleCount}টি ইনভয়েস`}
              color="#1e3a8a" bg="#eff6ff"
            />
            <StatCard
              icon={<FiMapPin />}
              label="ভিজিট রেট"
              value={`${visitRate}%`}
              sub={`${totalVisits}/${totalCustomers} দোকান`}
              color={visitRate >= 80 ? '#15803d' : visitRate >= 50 ? '#d97706' : '#dc2626'}
              bg={visitRate >= 80 ? '#f0fdf4' : visitRate >= 50 ? '#fffbeb' : '#fef2f2'}
            />
            <StatCard
              icon={<FiTrendingUp />}
              label="নগদ সংগ্রহ"
              value={taka(totalCash)}
              sub={totalCredit > 0 ? `বাকি: ${taka(totalCredit)}` : 'সব নগদ'}
              color="#065f46" bg="#f0fdf4"
            />
            <StatCard
              icon={<FiTarget />}
              label="টার্গেট অর্জন"
              value={monthlyTarget > 0 ? pct((totalSales / monthlyTarget) * 100) : `${visitRate}%`}
              sub={monthlyTarget > 0 ? `লক্ষ্য: ${taka(monthlyTarget)}` : `লক্ষ্য: ${targetVisitRate}% ভিজিট`}
              color="#d97706" bg="#fffbeb"
            />
          </div>

          {/* ─── Visit Rate Progress ─── */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 14,
            border: '1px solid #e2e8f0', marginBottom: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                📊 মাসিক ভিজিট লক্ষ্যমাত্রা
              </p>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: visitRate >= targetVisitRate ? '#15803d' : '#d97706'
              }}>
                {visitRate}% / {targetVisitRate}%
              </span>
            </div>
            <ProgressBar
              value={visitRate}
              max={targetVisitRate}
              color={visitRate >= targetVisitRate ? '#15803d' : '#d97706'}
              height={10}
            />
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              {[
                { l: 'বিক্রয়সহ', v: parseInt(visits.sold_visits || 0), c: '#15803d' },
                { l: 'বিক্রয়বিহীন', v: parseInt(visits.no_sell_visits || 0), c: '#dc2626' },
                { l: 'বাকি', v: Math.max(0, totalCustomers - totalVisits), c: '#94a3b8' },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: c, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{l}: </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── View Toggle ─── */}
          <div style={{
            display: 'flex', background: '#e2e8f0', borderRadius: 12,
            padding: 3, marginBottom: 14
          }}>
            {[['monthly', '📅 দৈনিক'], ['weekly', '📆 সাপ্তাহিক']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? '#1e3a8a' : '#64748b',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}>
                {l}
              </button>
            ))}
          </div>

          {/* ─── Content ─── */}
          {view === 'weekly' ? (
            weeks.length > 0
              ? weeks.map((w, i) => <WeekSummary key={i} week={w} />)
              : <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>এই মাসে কোনো তথ্য নেই</p>
          ) : (
            daily.length > 0
              ? daily.map((d, i) => (
                  <DayRow key={i} day={d} onShowSales={showDaySales} />
                ))
              : <div style={{
                  textAlign: 'center', padding: 40,
                  background: '#fff', borderRadius: 16, border: '1px dashed #e2e8f0'
                }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>📭</p>
                  <p style={{ color: '#94a3b8', fontSize: 14 }}>
                    {MONTHS_BN[month]} মাসে কোনো বিক্রয় নেই
                  </p>
                </div>
          )}
        </>
      )}

      {/* ─── Day Sales Modal ─── */}
      {salesModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 90, display: 'flex', alignItems: 'flex-end',
          backdropFilter: 'blur(2px)'
        }} onClick={() => setSalesModal(null)}>
          <div style={{
            width: '100%', maxWidth: 480, margin: '0 auto',
            background: '#fff', borderRadius: '20px 20px 0 0',
            maxHeight: '80vh', overflow: 'auto', padding: '20px 16px 32px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 99, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                {new Date(salesModal.date).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })} — বিক্রয় তালিকা
              </p>
              <button onClick={() => setSalesModal(null)} style={{
                width: 30, height: 30, borderRadius: 99, border: 'none',
                background: '#f1f5f9', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#64748b'
              }}>
                <FiX size={15} />
              </button>
            </div>

            {loadingSales ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>লোড হচ্ছে...</div>
            ) : salesModal.sales.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>কোনো বিক্রয় নেই</p>
            ) : (
              salesModal.sales.map((sale, i) => (
                <div key={i} style={{
                  background: '#f8fafc', borderRadius: 12, padding: '12px 14px',
                  marginBottom: 8, cursor: 'pointer', border: '1px solid #e2e8f0'
                }} onClick={() => setDetailSale(sale)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sale.shop_name}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8' }}>{sale.invoice_number}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>{taka(sale.net_amount)}</p>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 99, display: 'inline-block',
                        background: sale.payment_method === 'cash' ? '#f0fdf4' : '#fffbeb',
                        color: sale.payment_method === 'cash' ? '#15803d' : '#d97706'
                      }}>
                        {sale.payment_method === 'cash' ? 'নগদ' : 'বাকি'}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 10, color: '#1e3a8a', marginTop: 6, fontWeight: 500 }}>
                    বিস্তারিত দেখুন →
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── Sale Detail Modal ─── */}
      {detailSale && (
        <SaleDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />
      )}
    </div>
  )
}
