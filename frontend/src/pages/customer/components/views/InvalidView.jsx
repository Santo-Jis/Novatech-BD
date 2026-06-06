// components/views/InvalidView.jsx
import { getCustomerCode } from '../../utils/helpers'

export default function InvalidView({ error, onGoToLogin }) {
  const isLocked   = (error || '').includes('অন্য') || (error || '').includes('lock')
  const isNotFound = (error || '').includes('পাওয়া যায়নি')
  const hasCode    = !!getCustomerCode()

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">

        <div className="text-6xl">
          {isLocked ? '🔒' : isNotFound ? '🔗' : '⚠️'}
        </div>

        <h2 className="text-xl font-bold text-gray-800">
          {isLocked
            ? 'অ্যাক্সেস নেই'
            : isNotFound
            ? 'সেশন শেষ হয়েছে'
            : 'লিংক অকার্যকর'}
        </h2>

        <p className="text-gray-500 text-sm leading-relaxed">
          {isNotFound
            ? 'আপনার সেশনের মেয়াদ শেষ হয়ে গেছে বা নতুন ডিভাইসে লগইন করছেন।'
            : error}
        </p>

        <div className="bg-blue-50 rounded-2xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-blue-700">✅ সমাধান:</p>
          <p className="text-xs text-blue-600">
            আপনার <strong>SR</strong> কে বলুন নতুন পোর্টাল লিংক পাঠাতে।
            লিংকে ক্লিক করলেই অটো লগইন হয়ে যাবে।
          </p>
        </div>

        {/* customer_code থাকলে সরাসরি লগইন পেইজে যাওয়ার সুযোগ */}
        {hasCode && onGoToLogin && (
          <button
            onClick={onGoToLogin}
            className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-semibold active:bg-green-700 transition-colors"
          >
            🔑 লগইন পেইজে যান
          </button>
        )}

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 transition-colors"
        >
          🔄 আবার চেষ্টা করুন
        </button>

        <p className="text-xs text-gray-400">
          সমস্যা থাকলে আপনার SR-এর সাথে যোগাযোগ করুন
        </p>
      </div>
    </div>
  )
}
