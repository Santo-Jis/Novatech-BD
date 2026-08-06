# কাস্টমার পোর্টাল মাল্টি-কোম্পানি ফিক্স — Part 1-3 + জরুরি অর্ডার-বাগ ফিক্স

এই zip-টা তোমার রিপোর রুট (~/Novatech-BD) থেকে সরাসরি extract করার জন্য
বানানো — ভেতরের প্রতিটা ফাইল ঠিক তার আসল পাথেই আছে (backend/..., frontend/...)।

## এই zip-এ কী কী আছে (২১টা ফাইল)

**ব্যাকএন্ড (৪):**
- controllers/customerPortalConnection.controller.js — all-summary,
  all-monthly-trend, all-order-requests
- controllers/customerOrderRequest.controller.js — মাল্টি-কোম্পানি অর্ডার
  স্প্লিট (জরুরি ফিক্স), seller ফিল্টার, cancelMyOrderRequest ফিক্স
- routes/customerPortalConnection.routes.js
- routes/customerPortal.routes.js — product-sellers রুট

**ফ্রন্টএন্ড — নতুন (২):**
- components/CompanyTag.jsx
- utils/companyColor.js

**ফ্রন্টএন্ড — পরিবর্তিত (১৫):**
DashboardView, SummaryTab, InvoiceCard, InvoicesTab, CreditTab,
PaymentsTab, ComplaintsTab, ReturnsTab, OrderRequestTab, ShopView,
ProductCard, ProductDetailSheet, CheckoutSheet, OrderHistoryView,
MonthlyTrendChart

## ⚠️ একটা ফাইল ম্যানুয়ালি মুছতে হবে (zip দিয়ে ডিলিট হয় না)
frontend/src/pages/customer/components/dashboard/DashboardHeader.jsx
(dead file — কোথাও render হয় না, AccountMenu.jsx এর কাজ আগেই নিয়ে নিয়েছে)

## যাচাই করা হয়েছে
- এই ২১টা ফাইলের একটাও তোমার সাপ্লায়ার-মডিউল মার্জ বা অন্য কোনো আপডেটে
  টাচ হয়নি (zip #10 vs zip #6 বাইট-বাই-বাইট মিলিয়ে কনফার্ম করা হয়েছে) —
  তাই এই ফাইলগুলো বসালে অন্য কোনো এজেন্টের কাজ হারানোর ঝুঁকি নেই।
- Supabase দিয়ে স্কিমা আর কিছু কুয়েরি সরাসরি তোমার লাইভ ডাটাবেজে টেস্ট
  করা হয়েছে (আগের মেসেজগুলোতে বিস্তারিত)।
- মাল্টি-কোম্পানি অর্ডার-স্প্লিটের পুরো ফ্লো (নতুন customer অটো-তৈরি +
  একসাথে একাধিক order request) end-to-end টেস্ট ডেটার অভাবে চালিয়ে
  দেখা যায়নি — merge করে অন্তত একবার হাতে-কলমে চেক করে নিও (২টা ভিন্ন
  কোম্পানির প্রোডাক্ট এক কার্টে নিয়ে অর্ডার করে)।
