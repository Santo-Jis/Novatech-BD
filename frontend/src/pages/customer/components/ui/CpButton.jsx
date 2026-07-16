// ============================================================
// CpButton — Customer Portal ডিজাইন সিস্টেম বাটন
// (customer-design-system.html অনুযায়ী — pill-shaped, ৫টা variant)
//
// এটা components/ui/Button.jsx থেকে সম্পূর্ণ আলাদা — সেটা
// admin/worker/manager পোর্টালে ব্যবহৃত হয়, এটা শুধু কাস্টমার পোর্টালে।
//
// ব্যবহার:
//   <CpButton variant="primary">অর্ডার করুন</CpButton>
//   <CpButton variant="action" icon={FiPlus}>নতুন অনুরোধ</CpButton>
//   <CpButton variant="secondary" size="sm">বাতিল</CpButton>
//   <CpButton variant="confirm" loading>জমা হচ্ছে...</CpButton>
//
// নিয়ম (ডিজাইন সিস্টেম অনুযায়ী): একটা স্ক্রিনে সর্বোচ্চ ১টা 'action'
// (কমলা) বাটন রাখা উচিত — এটা মূল CTA-র জন্য সংরক্ষিত।
// ============================================================

import clsx from 'clsx'
import { FiLoader } from 'react-icons/fi'

const VARIANT_CLASSES = {
  primary:
    'bg-cp-trust-500 text-white hover:bg-cp-trust-700 active:bg-cp-trust-900 disabled:bg-cp-trust-300',
  secondary:
    'bg-white text-cp-trust-500 border-2 border-cp-trust-500 hover:bg-cp-trust-100 disabled:text-cp-trust-300 disabled:border-cp-trust-300',
  action:
    'bg-cp-warmth-600 text-white hover:brightness-95 active:brightness-90 disabled:bg-cp-warmth-300 shadow-sm shadow-cp-warmth-600/30',
  confirm:
    'bg-cp-confidence-600 text-white hover:brightness-95 active:brightness-90 disabled:bg-cp-confidence-300',
  danger:
    'bg-cp-error text-white hover:brightness-95 active:brightness-90 disabled:opacity-50',
  ghost:
    'bg-transparent text-cp-text-secondary hover:bg-cp-bg-alt disabled:text-cp-text-muted',
}

const SIZE_CLASSES = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-12 px-6 text-[15px] gap-2',
  lg: 'h-14 px-8 text-base gap-2.5',
}

export default function CpButton({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-full font-cp-head font-medium',
        'transition-colors duration-150 select-none',
        'disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cp-trust-500 focus-visible:ring-offset-2',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <FiLoader className="animate-spin" size={size === 'sm' ? 15 : 18} />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 15 : 18} />
      )}
      <span>{children}</span>
      {!loading && Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 15 : 18} />}
    </button>
  )
}
