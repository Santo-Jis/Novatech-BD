// components/StatusBadge.jsx
// Frontend Spec §৩ — status রঙ কনভেনশন:
//   active/open      = green
//   suspended/escalated = amber
//   cancelled/closed = gray
//   pending          = blue

const VARIANTS = {
  active:      'bg-pf-success-bg text-pf-success',
  open:        'bg-pf-success-bg text-pf-success',
  paid:        'bg-pf-success-bg text-pf-success',
  suspended:   'bg-pf-warning-bg text-pf-warning',
  escalated:   'bg-pf-warning-bg text-pf-warning',
  in_progress: 'bg-pf-warning-bg text-pf-warning',
  pending:     'bg-pf-info-bg text-pf-info',
  trial:       'bg-pf-info-bg text-pf-info',
  cancelled:   'bg-pf-bg-sunken text-pf-text-muted',
  closed:      'bg-pf-bg-sunken text-pf-text-muted',
}

const LABELS = {
  active: 'সক্রিয়',
  suspended: 'স্থগিত',
  cancelled: 'বাতিল',
  trial: 'ট্রায়াল',
  pending: 'অপেক্ষমাণ',
  open: 'খোলা',
  in_progress: 'চলমান',
  escalated: 'এসকেলেটেড',
  closed: 'বন্ধ',
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
