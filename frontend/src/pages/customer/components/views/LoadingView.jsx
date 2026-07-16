// components/views/LoadingView.jsx
// কাস্টমার পোর্টাল ডিজাইন সিস্টেম (customer-design-system.html) অনুযায়ী রিডিজাইন করা হলো।
// আগে এটা design.html (business) স্টাইলের নীল-ইন্ডিগো gradient ব্যবহার করছিল — এখন cp- টোকেন দিয়ে।

export default function LoadingView() {
  return (
    <div className="min-h-screen bg-cp-bg-base flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cp-trust-100 border-t-cp-trust-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-cp-text-muted text-sm font-cp-body">লোড হচ্ছে...</p>
      </div>
    </div>
  )
}
