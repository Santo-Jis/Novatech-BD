// components/ui/BottomSheet.jsx
//
// ⬇️ নতুন — Phase 1 UI কিট সংযোজন। RouteSelect.jsx-এর "নতুন রুট Request" মডাল
// আর CustomerList.jsx-এর "নতুন কাস্টমার" মডাল — দুটোই আসলে bottom-sheet প্যাটার্ন
// (`fixed inset-0 ... flex items-end` + `rounded-t-3xl`) হাতে করে আলাদাভাবে লেখা।
// এই কম্পোনেন্ট Modal.jsx-এর conventions (body-scroll-lock, backdrop, dark mode)
// মেনেই bottom-sheet সংস্করণ — Phase 2/3-এ ওই দুই জায়গাতেই এটা বসবে।
import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

export default function BottomSheet({ isOpen, onClose, title, children, footer, maxHeight = '85vh' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white dark:bg-slate-800 w-full rounded-t-3xl shadow-2xl flex flex-col border-t border-gray-100 dark:border-slate-700 animate-slide-up"
        style={{ maxHeight }}
      >
        {/* ড্র্যাগ হ্যান্ডেল — bottom sheet-কে modal থেকে ভিজুয়ালি আলাদা বোঝায় */}
        <div className="w-10 h-1 bg-gray-200 dark:bg-slate-600 rounded-full mx-auto mt-3 flex-shrink-0" />

        {title && (
          <div className="flex items-center justify-between px-6 pt-3 pb-2 flex-shrink-0">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">{title}</h3>
            <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
              <FiX />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
