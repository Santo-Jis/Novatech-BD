// components/StatusBadge.jsx — Platform panel-এর StatusBadge.jsx-এর সাথে
// রঙ কনভেনশন অভিন্ন (pf- tokens শেয়ার করা), শুধু tenant-status labels যোগ

const VARIANTS = {
  active:    'bg-pf-success-bg text-pf-success',
  trial:     'bg-pf-info-bg text-pf-info',
  suspended: 'bg-pf-warning-bg text-pf-warning',
  cancelled: 'bg-pf-bg-sunken text-pf-text-muted',
}

const LABELS = {
  active:    'সক্রিয়',
  trial:     'ট্রায়াল',
  suspended: 'স্থগিত',
  cancelled: 'বাতিল',
}

export default function StatusBadge({ status, label }) {
  const key = (status || '').toLowerCase()
  const cls = VARIANTS[key] || 'bg-pf-bg-sunken text-pf-text-muted'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label || LABELS[key] || status || '—'}
    </span>
  )
}
