// components/views/InvalidView.jsx
import { useState } from 'react'
import { getCustomerCode, setCustomerCode } from '../../utils/helpers'

export default function InvalidView({ error, onGoToLogin }) {
  const isLocked   = (error || '').includes('অন্য') || (error || '').includes('lock')
  const isNotFound = (error || '').includes('পাওয়া যায়নি')
  const hasCode    = !!getCustomerCode()

  const [inputCode, setInputCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const handleCodeSubmit = () => {
    const trimmed = inputCode.trim()
    if (!trimmed) {
      setCodeError('Customer Code দিন।')
      return
    }
    setCustomerCode(trimmed)
    if (onGoToLogin) onGoToLogin()
  }

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

        {/* ── Option 1: Customer Code আছে → সরাসরি Google Login ── */}
        {hasCode && onGoToLogin && (
          <button
            onClick={onGoToLogin}
            className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-semibold active:bg-green-700 transition-colors"
          >
            🔑 Google দিয়ে লগইন করুন
          </button>
        )}

        {/* ── Option 2: Customer Code নেই → Manual Input ── */}
        {!hasCode && (
          <div className="bg-yellow-50 rounded-2xl p-4 text-left space-y-3">
            <p className="text-xs font-semibold text-yellow-700">🔑 Customer Code দিয়ে লগইন করুন:</p>
            <p className="text-xs text-yellow-600">
              SR-এর পাঠানো WhatsApp লিংক না থাকলে আপনার <strong>Customer Code</strong> টাইপ করুন।
            </p>
            <input
              type="text"
              value={inputCode}
              onChange={e => { setInputCode(e.target.value); setCodeError('') }}
              placeholder="যেমন: C-1023"
              className="w-full px-4 py-2 border border-yellow-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            {codeError && (
              <p className="text-xs text-red-500">{codeError}</p>
            )}
            <button
              onClick={handleCodeSubmit}
              className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:bg-green-700 transition-colors"
            >
              ➡️ লগইন পেইজে যান
            </button>
          </div>
        )}

        {/* ── সবসময়: WhatsApp লিংকের পরামর্শ ── */}
        <div className="bg-blue-50 rounded-2xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-blue-700">✅ সহজ সমাধান:</p>
          <p className="text-xs text-blue-600">
            SR-এর পাঠানো <strong>WhatsApp লিংকে</strong> ক্লিক করুন।
            লিংকটি <strong>স্থায়ী</strong> — নতুন লিংক লাগবে না।
          </p>
        </div>

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
