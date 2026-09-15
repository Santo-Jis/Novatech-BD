// components/ui/Skeleton.jsx
//
// ⬇️ নতুন — Phase 1 UI কিট সংযোজন। আগে RouteSelect.jsx-এ লোডিং state-এর জন্য
// একটা সিঙ্গেল হার্ডকোডেড div ছিল (`h-64 bg-white rounded-2xl animate-pulse`)।
// এখন পুনর্ব্যবহারযোগ্য — একটা single block বা list-shaped skeleton দুটোই।
import clsx from 'clsx';

export default function Skeleton({ className = '', rounded = 'rounded-xl' }) {
  return (
    <div className={clsx('bg-gray-100 dark:bg-slate-700 animate-pulse', rounded, className)} />
  );
}

export function SkeletonList({ count = 3, itemClassName = 'h-24' }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={clsx('w-full', itemClassName)} rounded="rounded-2xl" />
      ))}
    </div>
  );
}
