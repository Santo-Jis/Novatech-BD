// components/MonthlyTrendChart.jsx
// SVG-based monthly trend chart (no external chart deps)

import { useState, useEffect } from 'react'
import { portalFetch } from '../utils/api'

export default function MonthlyTrendChart({ portalJWT }) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [metric,  setMetric]  = useState('total_purchase') // or 'total_invoices'

  useEffect(() => {
    portalFetch('/portal/monthly-summary?months=6', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
    .then(res => {
      // oldest first for chart
      setData([...(res.data || [])].reverse())
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [portalJWT])

  if (loading) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!data.length) return (
    <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '16px 0' }}>এখনও তথ্য নেই।</p>
  )

  const values   = data.map(d => parseFloat(d[metric] || 0))
  const maxVal   = Math.max(...values, 1)
  const W = 300, H = 120, PAD = { t: 12, r: 12, b: 32, l: 48 }
  const chartW   = W - PAD.l - PAD.r
  const chartH   = H - PAD.t - PAD.b
  const stepX    = values.length > 1 ? chartW / (values.length - 1) : chartW

  const pts = values.map((v, i) => ({
    x: PAD.l + i * stepX,
    y: PAD.t + chartH - (v / maxVal) * chartH,
    v,
  }))

  // smooth bezier path
  const pathD = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`
    const prev = pts[i - 1]
    const cx   = (prev.x + pt.x) / 2
    return acc + ` C${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`
  }, '')

  const areaD = pathD + ` L${pts[pts.length-1].x},${PAD.t+chartH} L${pts[0].x},${PAD.t+chartH} Z`

  const fmtBn = (n) => {
    if (metric === 'total_invoices') return String(Math.round(n))
    if (n >= 100000)  return `${(n/100000).toFixed(1)}L`
    if (n >= 1000)    return `${(n/1000).toFixed(0)}K`
    return String(Math.round(n))
  }

  const monthLabel = (ml) => {
    if (!ml) return ''
    const parts = ml.split('-')
    const m = parts[1]
    const names = ['', 'জান', 'ফেব', 'মার', 'এপ্র', 'মে', 'জুন', 'জুল', 'আগ', 'সেপ', 'অক্ট', 'নভ', 'ডিস']
    return names[parseInt(m)] || m
  }

  return (
    <div>
      {/* Metric Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'total_purchase', label: '৳ কেনাকাটা' },
          { key: 'total_invoices', label: '# ইনভয়েস' },
          { key: 'total_cash',     label: '৳ নগদ' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setMetric(key)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              background: metric === key ? '#4f46e5' : '#f3f4f6',
              color: metric === key ? 'white' : '#6b7280',
              transition: 'all 0.2s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      <div style={{ background: 'linear-gradient(135deg,#f0f4ff,#faf5ff)', borderRadius: 16, padding: '12px 8px 4px', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02"/>
            </linearGradient>
          </defs>

          {/* Y-axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = PAD.t + chartH - pct * chartH
            return (
              <g key={pct}>
                <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                  stroke="#e0e7ff" strokeWidth="0.7" strokeDasharray="3,3"/>
                <text x={PAD.l - 4} y={y + 3.5} textAnchor="end"
                  fontSize="8" fill="#a5b4fc">
                  {fmtBn(maxVal * pct)}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#chartGrad)"/>

          {/* Line */}
          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

          {/* Data points + labels */}
          {pts.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2"/>
              <text x={pt.x} y={pt.y - 7} textAnchor="middle" fontSize="8" fill="#4f46e5" fontWeight="600">
                {fmtBn(pt.v)}
              </text>
              {/* X-axis label */}
              <text x={pt.x} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#7c3aed">
                {monthLabel(data[i]?.month_label)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 9, color: '#7c3aed', fontWeight: 700 }}>
              {monthLabel(d.month_label)}
            </p>
            <p style={{ margin: 0, fontSize: 9, color: '#6b7280' }}>
              {d.total_invoices || 0}টি
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
