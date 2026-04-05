import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

// ============================================================
// Custom Tooltip
// ============================================================

const CustomTooltip = ({ active, payload, label, prefix = '৳' }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {prefix}{Number(entry.value).toLocaleString('bn-BD')}
        </p>
      ))}
    </div>
  )
}

// ============================================================
// Sales Area Chart
// ============================================================

export function SalesChart({ data = [], height = 250 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"   stopColor="#1e3a8a" stopOpacity={0.2} />
            <stop offset="95%"  stopColor="#1e3a8a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
          tickFormatter={v => `৳${(v/1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="total"
          name="বিক্রয়"
          stroke="#1e3a8a" strokeWidth={2}
          fill="url(#salesGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ============================================================
// Worker Sales Bar Chart
// ============================================================

export function WorkerSalesChart({ data = [], height = 250 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="worker_name" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
          tickFormatter={v => `৳${(v/1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total_sales" name="বিক্রয়" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
        <Bar dataKey="commission"  name="কমিশন"  fill="#065f46" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ============================================================
// Attendance Pie Chart
// ============================================================

const ATT_COLORS = {
  present: '#065f46',
  late:    '#d97706',
  absent:  '#991b1b',
  leave:   '#1e3a8a'
}

const ATT_LABELS = {
  present: 'উপস্থিত',
  late:    'দেরি',
  absent:  'অনুপস্থিত',
  leave:   'ছুটি'
}

export function AttendancePieChart({ data = {}, height = 200 }) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name:  ATT_LABELS[key] || key,
      value,
      color: ATT_COLORS[key] || '#94a3b8'
    }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"  cy="50%"
          innerRadius={50} outerRadius={75}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v, n) => [v + ' দিন', n]} />
        <Legend
          formatter={(v) => <span className="text-xs text-gray-600">{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ============================================================
// Commission Line Chart
// ============================================================

export function CommissionLineChart({ data = [], height = 200 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
          tickFormatter={v => `৳${v}`} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone" dataKey="commission_amount"
          name="কমিশন"
          stroke="#d97706" strokeWidth={2}
          dot={{ fill: '#d97706', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ============================================================
// Progress Bar
// ============================================================

export function ProgressBar({ value, max, label, color = 'primary', showPercent = true }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0

  const colors = {
    primary:   'bg-primary',
    secondary: 'bg-secondary',
    accent:    'bg-accent',
    danger:    'bg-danger',
    success:   'bg-emerald-500'
  }

  return (
    <div className="w-full">
      {(label || showPercent) && (
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          {label && <span>{label}</span>}
          {showPercent && <span className="font-semibold">{pct}%</span>}
        </div>
      )}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors[color] || colors.primary}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
