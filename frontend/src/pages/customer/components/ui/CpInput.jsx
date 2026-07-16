// ============================================================
// CpInput — Customer Portal ডিজাইন সিস্টেম ইনপুট
// (customer-design-system.html অনুযায়ী — রাউন্ডেড, ফোকাসে trust-500 রিং)
//
// react-hook-form-এর register() এর সাথে কাজ করার জন্য forwardRef ব্যবহার করা হয়েছে।
//
// ব্যবহার:
//   <CpInput label="মোবাইল নম্বর" placeholder="01XXXXXXXXX" {...register('phone')} />
//   <CpInput label="ইমেইল" icon={FiMail} error={errors.email?.message} />
// ============================================================

import { forwardRef } from 'react'
import clsx from 'clsx'

const CpInput = forwardRef(function CpInput(
  { label, error, icon: Icon, className = '', containerClassName = '', ...rest },
  ref
) {
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label className="text-sm font-medium text-cp-text-secondary font-cp-body">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cp-text-muted pointer-events-none"
          />
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full h-12 rounded-xl border bg-white font-cp-body text-cp-text-primary',
            'placeholder:text-cp-text-muted transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500',
            Icon ? 'pl-11 pr-4' : 'px-4',
            error ? 'border-cp-error' : 'border-cp-border',
            className
          )}
          {...rest}
        />
      </div>
      {error && <span className="text-xs text-cp-error font-cp-body">{error}</span>}
    </div>
  )
})

export default CpInput
