// components/PriorityBadge.jsx
export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'জরুরি', cls: 'bg-pf-error-bg text-pf-error' },
  { value: 'high', label: 'উচ্চ', cls: 'bg-pf-warning-bg text-pf-warning' },
  { value: 'normal', label: 'সাধারণ', cls: 'bg-pf-bg-sunken text-pf-text-muted' },
  { value: 'low', label: 'কম', cls: 'bg-pf-info-bg text-pf-info' },
]

export default function PriorityBadge({ priority }) {
  const p = PRIORITY_OPTIONS.find((x) => x.value === priority) || PRIORITY_OPTIONS[2]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${p.cls}`}>
      {p.label}
    </span>
  )
}
