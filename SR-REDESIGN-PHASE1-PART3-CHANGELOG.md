# Phase 1 — অংশ ৩: Add Customer Wizard → react-hook-form

## ✅ যা হলো

Add Customer ফর্মের টেক্সট/সিলেক্ট ফিল্ডগুলো (`shop_name`, `owner_name`, `whatsapp`, `sms_phone`, `email`, `credit_limit`, `route_id`, `business_type`) এখন **react-hook-form** দিয়ে — এটা আগে থেকেই `package.json`-এ ইনস্টল করা ছিল (v7.52.0) কিন্তু পুরো worker অ্যাপে কোথাও ব্যবহার হতো না।

**GPS (`lat`/`lng`) আর ছবি (`photo`) ইচ্ছাকৃতভাবে RHF-এর বাইরে** — আলাদা `useState`-এ থেকে গেছে। এগুলো আসল "ফর্ম ফিল্ড" না: কোনো visible input নেই, GPS বাটন চাপলে বা ছবি বেছে নিলে side-effect হিসেবে সেট হয়। RHF-এ জোর করে ঢোকাতে গেলে (virtual field registration, no real DOM ref) এমন একটা প্যাটার্নে যেতে হতো যেটা লাইভ অ্যাপে না চালিয়ে নিশ্চিতভাবে সঠিক bলে গ্যারান্টি দেওয়া কঠিন — তাই ঝুঁকি না নিয়ে যেটা সবসময় নির্ভরযোগ্যভাবে কাজ করে সেটাই রাখা হয়েছে।

## ⚠️ Validation আচরণ — অক্ষত রাখা হয়েছে, redesign করা হয়নি

মূল কোডে validation ছিল sequential (shop_name → whatsapp → GPS, প্রথম যেটা fail করে শুধু সেটার toast)। এটা হুবহু রাখা হয়েছে:
- RHF-এর `onInvalid` callback প্রায়োরিটি অনুযায়ী চেক করে প্রথম error-টাই toast করে (shop_name আগে, তারপর whatsapp)
- GPS-এর চেক RHF validation পাশ করার পর, `onValid`-এর ভেতরে আলাদাভাবে (যেহেতু GPS RHF-এ registered না)
- **`owner_name` লেবেলে লাল `*` দেখানো হয়, কিন্তু কোনো validation rule নেই** — এটা মূল কোডেও এমনই ছিল (আসলে required না, শুধু visual)। এই অসংগতিটা "ঠিক" করিনি, কারণ সেটা একটা আচরণ পরিবর্তন হতো যা কেউ চায়নি — শুধু লক্ষ্য করার মতো একটা পুরনো ছোট UX অসংগতি হিসেবে জানিয়ে রাখলাম।

## 🔧 একটা টেকনিক্যাল কারণ যা মাথায় রাখা ভালো

ফর্মটা এখন আসল `<form onSubmit={handleSubmit(...)}>`-এর ভেতরে (আগে ছিল না, শুধু একটা বাটনের `onClick` ছিল)। এর ফলে **GPS বাটনে explicit `type="button"` যোগ করতে হয়েছে** — নাহলে ব্রাউজারের ডিফল্ট আচরণ অনুযায়ী `<form>`-এর ভেতরের যেকোনো বাটন ক্লিকেই ফর্ম সাবমিট হয়ে যেত।

আরেকটা ছোট জিনিস: fragment (`<>`) থেকে real `<form>`-এ যাওয়ায় parent-এর `space-y-5` ক্লাস (যেটা automatic gap দিত) আর কাজ করেনি — প্রতিটা ফিল্ডে ম্যানুয়ালি `mt-5` বসিয়ে সেই একই spacing ফেরত আনা হয়েছে।

## 🔧 আপনার করণীয়

কিছু না — `react-hook-form` আগে থেকেই ইনস্টল করা ছিল, নতুন কোনো `npm install` লাগবে না। শুধু "নতুন কাস্টমার" ফর্মটা একবার টেস্ট করে দেখুন — বিশেষ করে: শূন্য অবস্থায় সাবমিট করে ঠিক ক্রমে (shop_name → whatsapp → GPS) error toast আসছে কিনা, GPS বাটনে চাপলে ফর্ম ভুল করে সাবমিট হয়ে যাচ্ছে না তো।

---

**Phase 1 (Architecture Refactor) সম্পূর্ণ।** ১১৮১ লাইনের এক ফাইল থেকে এখন: `CustomerList.jsx` (৬৯৫ লাইন, কিন্তু ডেটা-লেয়ার + wizard এখন RHF-চালিত), `CustomerMap.jsx`, `CustomerCard.jsx`, আর ৩টা shared hook (`useRoutes`, `useCustomers`, `useNextStop`)। পরের ধাপ (Phase 2 — Route Select পেজ রিডিজাইন) কখন শুরু করতে চান জানাবেন।
