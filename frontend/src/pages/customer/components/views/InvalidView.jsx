// components/views/InvalidView.jsx
export default function InvalidView({ error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">
          {(error || '').includes('অন্য') || (error || '').includes('lock') ? '🔒' : '⚠️'}
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {error.includes('অন্য') || error.includes('lock') ? 'অ্যাক্সেস নেই' : 'লিংক অকার্যকর'}
        </h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400 mt-4">নতুন লিংকের জন্য আপনার SR-এর সাথে যোগাযোগ করুন।</p>
      </div>
    </div>
  )
}
