# Backend Fix — `collectCredit` scope bug

## বাগ

`backend/src/controllers/customer.controller.js`-এর `collectCredit` ফাংশনে (বাকি আদায়):
`const { amount, ... } = req.body` টাই ছিল `try` ব্লকের ভেতরে, কিন্তু `catch`-এর ভেতরে (idempotency-key duplicate-request handling, লাইন ~৮১৭) সেটা আবার রেফারেন্স করা হচ্ছিল — `try`/`catch` আলাদা block scope বলে `amount` সেখানে undefined ছিল।

**কখন ঘটত:** দুটো concurrent request একই `idempotency_key` নিয়ে প্রায় একসাথে আসলে (নেটওয়ার্ক retry বা ডাবল-ট্যাপ থেকে) — দ্বিতীয়টা database unique-constraint এ ধরা পড়ে, আর তখনই এই কোড পাথ চলত। SR বন্ধুত্বপূর্ণ "সফল হয়েছিল" মেসেজের বদলে সার্ভার এরর পেত।

## ফিক্স

`catch` ব্লকে সরাসরি `req.body.amount` পড়া হচ্ছে এখন (destructure করা লোকাল ভ্যারিয়েবলের বদলে) — `req` পুরো ফাংশন জুড়েই available, তাই scope-সমস্যা এড়িয়ে একই মান পাওয়া যায়। বাকি ফাংশনের কোনো লজিক বদলায়নি — এক লাইনের, সর্বনিম্ন-ঝুঁকির ফিক্স।

সিনট্যাক্স + সেমান্টিক (undefined-reference) — দুটো checker-ই এখন এই ফাইলে ক্লিন। পুরো প্রজেক্ট (৫৩৫ ফাইল) syntax sweep পাশ করেছে।

## আপনার করণীয়

এটা payment-সম্পর্কিত কোড — deploy করার আগে অন্তত একবার manually verify করে নিন: একই `idempotency_key` দিয়ে ইচ্ছাকৃতভাবে দুটো collection request পাঠিয়ে দেখুন দ্বিতীয়টা ঠিক "পূর্বে সম্পন্ন হয়েছিল" মেসেজ দেয় কিনা।
