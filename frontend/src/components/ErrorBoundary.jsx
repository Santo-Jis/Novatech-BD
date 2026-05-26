// frontend/src/components/ErrorBoundary.jsx
// ─────────────────────────────────────────────────────────────
// React Error Boundary — একটা child component crash করলে
// পুরো page blank হওয়ার বদলে এই fallback UI দেখাবে।
//
// Usage:
//   <ErrorBoundary>
//     <SomeComponent />
//   </ErrorBoundary>
//
// Custom fallback:
//   <ErrorBoundary fallback={<p>কিছু একটা ভুল হয়েছে</p>}>
//     <SomeComponent />
//   </ErrorBoundary>
// ─────────────────────────────────────────────────────────────

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Production-এ এখানে Sentry / LogRocket পাঠানো যাবে:
    //   Sentry.captureException(error, { extra: info })
    //
    // এখন console-এ log করা হচ্ছে — server logger নয়,
    // কারণ এটা browser-side error।
    console.error('[ErrorBoundary] Component crashed:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Custom fallback prop থাকলে সেটা দেখাও
    if (this.props.fallback) return this.props.fallback

    // Default fallback UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="font-bold text-gray-800 text-base mb-1">
          কিছু একটা ভুল হয়েছে
        </h2>
        <p className="text-gray-400 text-xs mb-5 max-w-xs leading-relaxed">
          এই পেজটি লোড করতে সমস্যা হয়েছে।
          পেজ রিফ্রেশ করুন অথবা হোমে ফিরে যান।
        </p>

        {/* error message — dev-এ দেখাও, prod-এ লুকাও */}
        {import.meta.env.DEV && this.state.error && (
          <pre className="text-left text-[10px] bg-gray-100 text-red-600 rounded-xl p-3 mb-4 max-w-full overflow-auto max-h-32">
            {this.state.error.message}
          </pre>
        )}

        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600"
          >
            আবার চেষ্টা করুন
          </button>
          <button
            onClick={() => window.location.href = '/worker/dashboard'}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold"
          >
            হোমে যান
          </button>
        </div>
      </div>
    )
  }
}
