// components/views/LoadingView.jsx
export default function LoadingView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">লিংক যাচাই করা হচ্ছে...</p>
      </div>
    </div>
  )
}
