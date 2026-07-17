// components/dashboard/CreditRing.jsx
// ক্রেডিট ব্যবহারের রিং (SVG) — DashboardView.jsx থেকে আলাদা করা হলো + cp- ডিজাইন টোকেন প্রয়োগ

export default function CreditRing({ current, limit, fmtCur }) {
  const pct = Math.min(limit > 0 ? (current / limit) * 100 : 0, 100)
  const r = 44
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  // ৮৫%+ = বিপদসীমা (danger), ৬০%+ = সতর্কতা (warmth), তার নিচে = স্বাভাবিক (confidence)
  const color = pct > 85 ? '#D64545' : pct > 60 ? '#F07B22' : '#0E9B6C'
  const glow  = pct > 85 ? 'rgba(214,69,69,0.45)' : pct > 60 ? 'rgba(240,123,34,0.45)' : 'rgba(14,155,108,0.45)'

  return (
    <div className="relative w-[100px] h-[100px] flex-shrink-0">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${glow})`, transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[8px] text-white/45 font-semibold tracking-wide uppercase">বাকি</span>
        <span className="text-sm text-white font-bold leading-tight mt-0.5">৳{fmtCur(current)}</span>
        <span className="text-[8px] font-bold mt-0.5" style={{ color }}>{Math.round(pct)}%</span>
      </div>
    </div>
  )
}
