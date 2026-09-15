// components/ui/EmptyState.jsx
//
// ⬇️ নতুন — Phase 1 UI কিট সংযোজন। RouteSelect.jsx-এর EmptyRouteState-এ এই
// ঠিক প্যাটার্নটাই (icon বৃত্ত + title + description + ঐচ্ছিক action) তিনবার
// প্রায় হুবহু কপি-পেস্ট করা ছিল। এখন একটাই শেয়ার্ড কম্পোনেন্ট — পরের কোনো
// empty-state লাগলে (কাস্টমার লিস্ট খালি, সার্চে কিছু নেই, ইত্যাদি) এটাই ব্যবহার হবে।
import clsx from 'clsx';

export default function EmptyState({
  icon,
  title,
  description,
  action,
  iconBg = 'bg-primary/10 dark:bg-primary/20',
  iconColor = 'text-primary/60 dark:text-primary-light',
  className = '',
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && (
        <div className={clsx('w-16 h-16 rounded-2xl flex items-center justify-center mb-4', iconBg)}>
          <span className={clsx('text-3xl', iconColor)}>{icon}</span>
        </div>
      )}
      {title && (
        <p className="font-semibold text-gray-700 dark:text-gray-200 text-sm">{title}</p>
      )}
      {description && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
