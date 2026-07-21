import { FiInbox, FiAlertTriangle, FiLoader } from 'react-icons/fi'

// Frontend Spec §৪ — প্রতিটা স্ক্রিনে Loading/Empty/Error state থাকা আবশ্যক

export function LoadingState({ label = 'লোড হচ্ছে...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-pf-text-muted">
      <FiLoader className="text-2xl animate-spin" />
      <p className="text-sm font-pf-body">{label}</p>
      <p className="text-xs text-pf-text-muted/70">সার্ভার কোল্ড-স্টার্ট হলে ৫০+ সেকেন্ড লাগতে পারে</p>
    </div>
  )
}

export function EmptyState({ title = 'কিছু পাওয়া যায়নি', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-pf-bg-alt flex items-center justify-center text-pf-text-muted mb-1">
        <FiInbox className="text-xl" />
      </div>
      <h3 className="font-pf-head font-semibold text-pf-primary-700">{title}</h3>
      {description && <p className="text-sm text-pf-text-secondary max-w-sm">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ title = 'একটা সমস্যা হয়েছে', description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-pf-error-bg flex items-center justify-center text-pf-error mb-1">
        <FiAlertTriangle className="text-xl" />
      </div>
      <h3 className="font-pf-head font-semibold text-pf-primary-700">{title}</h3>
      {description && <p className="text-sm text-pf-text-secondary max-w-sm">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold bg-pf-primary-700 text-white hover:brightness-110"
        >
          আবার চেষ্টা করুন
        </button>
      )}
    </div>
  )
}

export function ScopeDeniedNote({ requiredScope = 'Full' }) {
  return (
    <p className="text-xs text-pf-warning bg-pf-warning-bg inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg">
      <FiAlertTriangle className="flex-shrink-0" />
      এই অ্যাকশন {requiredScope} scope-এর জন্য সংরক্ষিত
    </p>
  )
}
