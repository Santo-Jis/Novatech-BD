// components/Badges.jsx — REDESIGNED (inline styles, no Tailwind)
// PayBadge এবং StatusBadge — ছোট reusable badge components

/**
 * Payment method badge
 */
export const PayBadge = ({ method }) => {
  const map = {
    cash:        { label: 'নগদ',           bg: '#ECFDF5', color: '#059669' },
    credit:      { label: 'বাকি',           bg: '#FEF2F2', color: '#DC2626' },
    mixed:       { label: 'মিশ্র',          bg: '#FFFBEB', color: '#D97706' },
    replacement: { label: 'রিপ্লেসমেন্ট',  bg: '#EFF6FF', color: '#2563EB' },
  }
  const m = map[method] || { label: method || '—', bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span style={{
      display: 'inline-block',
      background: m.bg,
      color: m.color,
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 9px',
      borderRadius: 20,
      letterSpacing: 0.2,
    }}>
      {m.label}
    </span>
  )
}

/**
 * Order status badge
 */
export const StatusBadge = ({ status }) => {
  const map = {
    pending:   { label: '⏳ অপেক্ষমাণ', bg: '#FFFBEB', color: '#92400E' },
    confirmed: { label: '✅ কনফার্ম',    bg: '#EFF6FF', color: '#1E40AF' },
    assigned:  { label: '🚶 SR আসছে',   bg: '#F5F3FF', color: '#5B21B6' },
    delivered: { label: '📦 সম্পন্ন',    bg: '#ECFDF5', color: '#065F46' },
    cancelled: { label: '❌ বাতিল',      bg: '#FEF2F2', color: '#991B1B' },
  }
  const s = map[status] || { label: status, bg: '#F3F4F6', color: '#4B5563' }
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.color,
      fontSize: 10,
      fontWeight: 700,
      padding: '3px 10px',
      borderRadius: 20,
      letterSpacing: 0.2,
    }}>
      {s.label}
    </span>
  )
}
