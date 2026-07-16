// ============================================================
// CpCard — Customer Portal ডিজাইন সিস্টেম কার্ড
// (customer-design-system.html অনুযায়ী — 16px radius, সাদা bg, হালকা বর্ডার)
//
// ব্যবহার:
//   <CpCard>...</CpCard>
//   <CpCard padding="lg" pressable onClick={...}>...</CpCard>
//   <CpCard variant="sunken">...</CpCard>   // হালকা নীল bg, নেস্টেড ব্লকের জন্য
// ============================================================

import clsx from 'clsx'

const PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

const VARIANT_CLASSES = {
  surface: 'bg-cp-bg-surface border border-cp-border',
  sunken: 'bg-cp-bg-sunken border border-cp-border/60',
  alt: 'bg-cp-bg-alt border border-cp-border/60',
}

export default function CpCard({
  children,
  padding = 'md',
  variant = 'surface',
  pressable = false,
  className = '',
  onClick,
  ...rest
}) {
  const Comp = pressable ? 'button' : 'div'

  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'rounded-2xl',
        VARIANT_CLASSES[variant],
        PADDING_CLASSES[padding],
        pressable &&
          'w-full text-left transition-transform active:scale-[0.98] hover:border-cp-border-strong cursor-pointer',
        className
      )}
      {...rest}
    >
      {children}
    </Comp>
  )
}
