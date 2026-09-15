# Phase 1 — অংশ ২: CustomerList.jsx ভাঙা

## ✅ ফলাফল

| ফাইল | লাইন | 
|---|---|
| `pages/worker/CustomerList.jsx` (আগে) | ১১৮১ |
| `pages/worker/CustomerList.jsx` (এখন) | ৬৭৩ |
| + `components/worker/CustomerMap.jsx` (নতুন) | ২৭২ |
| + `components/worker/CustomerCard.jsx` (নতুন) | ২২৯ |

মূল ফাইল ৪৩% ছোট হলো, আর বাকিটা দুটো focused, single-responsibility ফাইলে গেল। JSX/CSS/visual আউটপুট অপরিবর্তিত রাখা হয়েছে — এটা structural রিফ্যাক্টর, redesign না (redesign আসবে Phase 2-এ)।

## 🔎 ক্রস-ফাইল ভেরিফিকেশন — একটা বাগ ধরা পড়ল ও ঠিক হলো

CustomerList.jsx ভাঙার আগে পুরো কোডবেসে গ্রেপ করে দেখেছি এই ফাইলের সাথে আর কে কী শেয়ার করে। তাতে **`VisitPage.jsx`**-এ একটা সরাসরি cache-write পাওয়া গেল (`handleCollectionSuccess` — কালেকশনের পর `customers_route_${routeId}` cache key-তে সরাসরি বাকি কমিয়ে লিখে রাখে, যাতে অফলাইনেও CustomerList সঠিক বাকি দেখায়)।

এটা মিলিয়ে দেখতে গিয়ে বুঝলাম, আমি `useCustomers.js`-এ প্রথমে একটা ভুল করেছিলাম: offline/cache-fallback পথেও `pending_credit_reductions` merge চালিয়ে দিয়েছিলাম, যেখানে **মূল কোড এটা শুধু live fetch-এ করত** (কারণ cache তো VisitPage আগেই সঠিক করে রেখেছে — সেখানে আবার merge করলে pending entry অকালে মুছে যেত, আর পরে সত্যিকারের অনলাইন fetch-এর সময় backend সত্যিই sync না থাকলে protection হারিয়ে যেত)। এটা ধরে ঠিক করা হয়েছে — এখন `useCustomers.js` মূল কোডের সাথে হুবহু মেলে।

এই একই যাচাইয়ে আরও দুটো cross-reference (`WorkerLayout.jsx`, `Attendance.jsx`) চেক করে দেখা গেছে সেগুলো checkin status-এর জন্য শেয়ার্ড Zustand store ব্যবহার করে — এটা আমার রিফ্যাক্টরের বাইরে, অপরিবর্তিত, নিরাপদ।

## 🆕 নতুন ফাইল

- `components/worker/CustomerMap.jsx` — icon factory, FitBounds, badge/legend, MapContainer/Marker/Popup — JSX হুবহু, শুধু props নেয়
- `components/worker/CustomerCard.jsx` — একটা কাস্টমার কার্ড — JSX হুবহু, ক্রেডিট-বার হিসাব IIFE থেকে top-level const-এ (এখন real component, hack লাগে না)

## 🗑️ বাদ পড়েছে (dead code, disclosed)

গ্রেপ করে দেখা গেছে এই দুটো ফাইলে কোথাও আসলে ব্যবহৃত হতো না:
- `customerListView`/`viewMode`/`setViewMode` (destructure করা হতো, কিন্তু কোনো conditional render-এ পড়া হতো না)
- `FiList` ইম্পোর্ট

## ⚠️ ইচ্ছাকৃতভাবে অপরিবর্তিত (Phase 1 — অংশ ৩-এ যাবে)

Add Customer Wizard (ছবি/GPS/ফর্ম/OTP/WhatsApp ধাপ) এই দফাতেও হাত দেওয়া হয়নি — photo upload + GPS + email OTP + credit-limit + WhatsApp handoff একসাথে জড়ানো, `react-hook-form`-এ migrate করতে হলে পুরো মনোযোগ দিয়ে আলাদা করা দরকার।

## 🔧 আপনার করণীয়

কোনো নতুন dependency যোগ হয়নি এই দফায় (আগের `npm install`-ই যথেষ্ট)। শুধু CustomerList পেজ একবার চোখে দেখে নেওয়া ভালো — map, card, next-stop banner, sort toggle সব আগের মতোই দেখানোর কথা।
