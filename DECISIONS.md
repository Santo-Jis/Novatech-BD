# DECISIONS.md — কোডে যা লেখা নেই, কিন্তু জানা দরকার

এই ফাইলটা কোনো progress-log না, feature-list না। এখানে শুধু সেই
সিদ্ধান্তগুলো, যেগুলোর "কেন"-টা কোড পড়ে বোঝা যায় না — আর না জানলে
ভবিষ্যতের কোনো session (মানুষ বা এজেন্ট) এগুলোকে ভুল করে "bug" ভেবে
ভুলভাবে "ঠিক" করে ফেলতে পারে।

---

## customer_order_requests আর deliveries — ইচ্ছাকৃতভাবে link করা নেই

এই দুটো টেবিলের মধ্যে DB-লেভেলে কোনো সংযোগ নেই। এটা bug না — মালিকের
সাথে সরাসরি confirm করা: customer portal-এ কেউ order request করলে,
SR সেটা দেখে গিয়ে fulfill করে **আলাদাভাবে** normal sale/order এন্ট্রি
করে (accounting/stock সেখানেই হয়)। `customer_order_requests` শুধু
request-tracking/communication layer, financial system-of-record না।

**যা করবে না**: এই দুটোকে auto-link করার/একটা approve হলে অন্যটা তৈরি
করার কোনো "fix" বসিও না জিজ্ঞেস না করে — এটা double-accounting তৈরি
করবে (SR-এর ম্যানুয়াল এন্ট্রি + auto-created এন্ট্রি, দুটোই একসাথে)।

## deliveries টেবিল দীর্ঘদিন খালি ছিল (০ row) — এখন না

Backend-এ পুরো pipeline (assign→start→arrive→complete, GPS, OTP)
সম্পূর্ণ তৈরি ছিল, কিন্তু manager-side "assign" করার কোনো UI-ই ছিল না
(২০২৬-০৯-১১ পর্যন্ত)। তাই কখনো একটা row-ও তৈরি হয়নি। এখন
`DeliveryAssign.jsx` (admin + manager, একই component reuse) বসার
পর থেকে এটা বাস্তবে ব্যবহার হচ্ছে। এই তারিখের আগের আর পরের row-সংখ্যায়
হঠাৎ লাফ দেখলে, এটাই কারণ — ডেটা করাপশন না।

## Redis — দুটো আলাদা ব্যবহার, দুই রকম fault-tolerance

- **`redis.js` / `getRedisClient()`** — blocklist + generic cache
  (`cache.js`)। Redis না থাকলে in-memory fallback-এ চলে যায়, single-
  instance-এ নিরাপদ। Log prefix: `❌ Redis Error:`
- **`queue.js` / ioredis connection** — BullMQ job queue। এর কোনো
  graceful fallback নেই (queue মানেই persistent storage, memory-তে
  নকল করা যায় না)। Redis না থাকলে `isQueueAvailable()` false দেয়,
  caller-কে direct-send fallback-এ যেতে হয় (দেখো
  `creditReminder.controller.js`-এর প্যাটার্ন)। Log prefix:
  `❌ Queue Redis connection error:`

**নতুন কোনো ফিচার queue ব্যবহার করতে চাইলে**, এই fallback প্যাটার্নটাই
অনুসরণ করো — Redis সবসময় up থাকবে এটা ধরে নিও না।

## Product listing cache — শুধু default (unfiltered) view-এ, ৩০ সেকেন্ড

`available_stock` লাইভ-কম্পিউটেড (pending/approved order থেকে)।
Filtered/searched query-তে cache করা হয়নি ইচ্ছাকৃতভাবে — cache-key
space সীমিত রাখতে, আর staleness window ছোট রাখতে। এই TTL/scope বাড়ানোর
আগে ভাবো: বেশি stale data মানে বেশি overselling-এর ঝুঁকি।

## জানা, এখনো unfixed ইস্যু

- **`redis.js` blocklist client**-এ periodic "Socket closed unexpectedly"
  error (burst আকারে, ৬ ঘণ্টা ব্যবধানে দেখা গেছে) — সম্ভবত free-tier
  Redis provider idle connection recycle করছে। Non-fatal যাচাই করা
  (কোনো correlated 5xx spike পাওয়া যায়নি), কিন্তু fix হয়নি।
- **`vite.config.js`-এর `sourcemap: true`** — একটা নির্দিষ্ট crash
  investigation-এর জন্য ইচ্ছাকৃতভাবে অন করা (কমেন্টে তারিখ আছে)।
  Investigation শেষ হলে `false`-এ ফেরানো উচিত — যাচাই না করে নিজে থেকে
  বন্ধ কোরো না, হতে পারে এখনো লাগছে।

## Legacy dead code সরানো হয়েছে

`backend/controllers/` আর `backend/routes/` (পুরনো top-level, `backend/
src/controllers|routes/`-এর ডুপ্লিকেট) মুছে ফেলা হয়েছে ইচ্ছাকৃতভাবে —
কোথাও পুরনো ডকুমেন্টেশন/কমেন্টে এই path-এর রেফারেন্স পেলে, ওটা পুরনো,
ফাইলগুলো আর নেই।

## Dev workflow বদলেছে

zip-patch থেকে branch+PR flow-এ (`CONTRIBUTING.md`, PR template)।
GitHub-এ branch protection manually চালু করা এখনো বাকি থাকতে পারে —
কেউ remotely verify করেনি এখনো।
