// components/Badges.jsx
// PayBadge এবং StatusBadge — ছোট reusable badge components

/**
 * Payment method badge
 */
export const PayBadge = ({ method }) => {
  const map = {
    cash:        { label: 'নগদ',          color: 'bg-green-100 text-green-700' },
    credit:      { label: 'বাকি',          color: 'bg-red-100 text-red-700' },
    replacement: { label: 'রিপ্লেসমেন্ট', color: 'bg-blue-100 text-blue-700' },
  }
  const m = map[method] || { label: method, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>
}

/**
 * Order status badge
 */
export const StatusBadge = ({ status }) => {
  const map = {
    pending:   { label: '⏳ অপেক্ষমাণ',  color: 'bg-yellow-100 text-yellow-700' },
    confirmed: { label: '✅ কনফার্ম',     color: 'bg-blue-100 text-blue-700' },
    assigned:  { label: '🚶 SR আসছে',    color: 'bg-purple-100 text-purple-700' },
    delivered: { label: '📦 সম্পন্ন',     color: 'bg-green-100 text-green-700' },
    cancelled: { label: '❌ বাতিল',       color: 'bg-red-100 text-red-700' },
  }
  const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
}
