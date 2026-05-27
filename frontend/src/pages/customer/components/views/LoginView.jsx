// components/views/LoginView.jsx
// Google login screen

export default function LoginView({ tokenInfo, error, loggingIn, onLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">N</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">NovaTech BD</h1>
          <p className="text-xs text-gray-400 mt-1">কাস্টমার পোর্টাল</p>
        </div>

        {tokenInfo && (
          <div className="bg-indigo-50 rounded-2xl p-4 mb-6 text-center">
            <p className="text-xs text-indigo-400 mb-1">আপনার দোকান</p>
            <p className="font-bold text-indigo-800 text-lg">{tokenInfo.shop_name}</p>
            <p className="text-indigo-600 text-sm">{tokenInfo.owner_name}</p>
            <p className="text-xs text-indigo-400 mt-1">কোড: {tokenInfo.customer_code}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <button
          onClick={onLogin}
          disabled={loggingIn}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200
            hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl py-4 px-6
            font-semibold text-gray-700 transition-all shadow-sm disabled:opacity-60"
        >
          {loggingIn ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loggingIn ? 'লগইন হচ্ছে...' : 'Google দিয়ে লগইন করুন'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          আপনার Gmail দিয়ে লগইন করলে আমরা আপনার ক্রয়তথ্য দেখাতে পারব।
        </p>
      </div>
    </div>
  )
}
