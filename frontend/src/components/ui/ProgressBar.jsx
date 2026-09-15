// components/ui/ProgressBar.jsx
//
// ⬇️ নতুন — Phase 1 UI কিট সংযোজন। Phase 2-এ Route Select পেজের "আজকের প্ল্যান"
// summary strip আর route card-এর visited % দেখানোর জন্য এটা ব্যবহার হবে
// (এখন RouteSelect.jsx-এ এই তথ্য শুধু প্লেইন টেক্সট হিসেবে আছে, ভিজুয়াল বার নেই)।
import clsx from 'clsx';

const HEIGHTS = { sm: 'h-1.5', md: 'h-2', lg: 'h-2.5' };

export default function ProgressBar({
  value = 0,
  max = 100,
  color = 'bg-primary',
  trackColor = 'bg-gray-100 dark:bg-slate-700',
  size = 'md',
  label,
  className = '',
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{Math.round(pct)}%</span>
        </div>
      )}
      <div className={clsx('w-full rounded-full overflow-hidden', trackColor, HEIGHTS[size])}>
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
