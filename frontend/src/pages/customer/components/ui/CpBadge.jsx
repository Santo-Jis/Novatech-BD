// ============================================================
// CpBadge — Customer Portal ডিজাইন সিস্টেম ব্যাজ
// (customer-design-system.html অনুযায়ী — রাউন্ডেড পিল, সবসময় টেক্সট লেবেল সহ)
//
// নিয়ম (ডিজাইন সিস্টেম): green/success শুধু "পরিশোধিত/ভেরিফায়েড" অবস্থার
// জন্য — সাজসজ্জার জন্য না। রঙের পাশে সবসময় টেক্সট লেবেল থাকবে (শুধু রঙ না)।
//
// ব্যবহার:
//   <CpBadge variant="success">পরিশোধিত</CpBadge>
//   <CpBadge variant="warning">বকেয়া</CpBadge>
//   <CpBadge variant="verified" icon={FiCheckCircle}>ভেরিফায়েড</CpBadge>
// ============================================================

import clsx from 'clsx'

const VARIANT_CLASSES = {
  success: 'bg-cp-confidence-100 text-cp-confidence-600',
  warning: 'bg-cp-warmth-100 text-cp-warmth-600',
  error:   'bg-cp-error-bg text-cp-error',
  info:    'bg-cp-trust-100 text-cp-trust-700',
  verified:'bg-cp-confidence-100 text-cp-confidence-600',
  neutral: 'bg-cp-bg-alt text-cp-text-secondary',
  pending: 'bg-cp-warmth-100 text-cp-warmth-600',
}

export default function CpBadge({ children, variant = 'neutral', icon: Icon, className = '' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium font-cp-body whitespace-nowrap',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {Icon && <Icon size={12} />}
      {children}
    </span>
  )
}
