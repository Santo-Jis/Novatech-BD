# Merge Report — আপনার Latest Upload + আমার Phase 0-4 কাজ

## সংক্ষেপে

আপনার নতুন আপলোড (`Novatech-BD-main__14_.zip`) আর আমার Phase 0-4-এর কাজ — দুটোই **একই original zip** থেকে আলাদাভাবে এগিয়েছিল। এটা একটা প্রকৃত ৩-way merge (original vs আপনার upstream vs আমার কাজ) হিসেবে করা হয়েছে, কোনোটাই ব্লাইন্ডলি ওভাররাইট করা হয়নি।

## Upstream-এ (অন্য এজেন্ট/টিম) কী কী যোগ হয়েছিল

অনেক কিছু — এটা একটা সক্রিয়ভাবে বিকশিত প্রজেক্ট বোঝা যাচ্ছে: সম্পূর্ণ চ্যাট সিস্টেম (canned responses, SLA, broadcast), সোশ্যাল ফিড (company posts, moderation, engagement), কাস্টমার পোর্টালে e-commerce (cart, checkout, delivery tracking), সুপারঅ্যাডমিন analytics, dark-mode CSS variable সিস্টেম, আর ১৫+ নতুন migration ফাইল। এই সবকিছু **অক্ষত অবস্থায় merged tree-তে আছে** — আমি এগুলোর কিছুই ছুঁইনি।

## Conflict — একই ফাইল দুই পক্ষই বদলেছিল (৩টা)

সাবধানে খুঁজে বের করে, প্রতিটার জন্য উভয় পক্ষের পরিবর্তনই রাখা হয়েছে:

| ফাইল | Upstream যা করেছে | আমি যা করেছি | Resolution |
|---|---|---|---|
| `frontend/tailwind.config.js` | `cp-*` রঙগুলোকে hex থেকে CSS variable-এ (dark mode support) | `success`/`info`/`brand` টোকেন + `text-2xs` যোগ | দুটোই আলাদা, non-overlapping জায়গায় — দুটোই রাখা হয়েছে |
| `frontend/src/App.jsx` | ৩টা নতুন route (superadmin analytics, delivery assign, moderation) | `AddCustomer` route যোগ | দুটোই আলাদা জায়গায় — দুটোই রাখা হয়েছে |
| `backend/.../customer.controller.js` | `collectCredit`-এ real-time commission update ফিচার যোগ (নতুন imports, `getBDToday()`, `setImmediate` ব্লক) | `getCustomers`-এ pagination fix + `collectCredit`-এর scope-বাগ ফিক্স | দুটোই আলাদা জায়গায় — **⚠️ একটা সূক্ষ্ম ব্যাপার নিচে দেখুন** |

### ⚠️ `customer.controller.js`-এ একটা সূক্ষ্ম জিনিস লক্ষ্য করেছি

আমার scope-বাগ ফিক্স (`amount` → `req.body.amount`) ঠিক যেখানে বসানো দরকার ছিল, তার **কাছাকাছি একটা দ্বিতীয়, ভিন্ন জায়গায়** (`existing.rows.length > 0` চেক, upfront idempotency যাচাই) হুবহু একই মেসেজ-প্যাটার্ন আছে — কিন্তু ওটা আসলে বাগ-মুক্ত (ওটা `try` ব্লকের ভেতরেই, `amount` ঠিকভাবে scope-এ আছে)। merge করার সময় নিশ্চিত হয়েছি শুধু আসল বাগী জায়গাটাতেই (catch ব্লক) ফিক্স বসেছে, ভুল জায়গায় না।

## যা নতুন করে merged tree-তে যোগ হলো (আমার Phase 0-4 কাজ)

- ৩টা hook: `useRoutes.js`, `useCustomers.js`, `useNextStop.js`, `usePriorityScore.js`
- ৪টা UI কম্পোনেন্ট: `BottomSheet.jsx`, `EmptyState.jsx`, `ProgressBar.jsx`, `Skeleton.jsx`
- ২টা worker কম্পোনেন্ট: `CustomerMap.jsx`, `CustomerCard.jsx`
- ১টা নতুন পেজ: `AddCustomer.jsx`
- পরিবর্তিত: `RouteSelect.jsx`, `CustomerList.jsx`, `LiveTracking.jsx`, `location.controller.js`, `main.jsx`, `frontend/package.json`
- ১০টা changelog ডকুমেন্টেশন ফাইল

## ✅ যাচাই

- সম্পূর্ণ merged tree-তে (৫৭০ ফাইল, upstream-এর সব নতুন ফিচারসহ) syntax checker চালিয়েছি — **সব পাশ**
- আমার ছোঁয়া/merge করা প্রতিটা ফাইলে semantic (undefined-reference) checker চালিয়েছি — **সব পাশ**
- merged tree-কে upstream-এর সাথে ফাইল-বাই-ফাইল তুলনা করে নিশ্চিত করেছি **শুধু আমার ইচ্ছাকৃত পরিবর্তনগুলোই** পার্থক্য — এবং প্রথমবার এই তুলনাতেই ধরা পড়ল `.github` ফোল্ডার (hidden ফোল্ডার) shell-এর `cp *` কমান্ডে ভুলবশত বাদ পড়েছিল — সেটাও ঠিক করে যোগ করা হয়েছে।

## 🔧 আপনার করণীয়

1. `frontend/` আর `backend/`-এ `npm install` চালান (আমার যোগ করা `@tanstack/react-query` + upstream-এর নতুন dependency-গুলো একসাথে বসবে)
2. Deploy করার পর **সবার আগে** Manager Live Tracking পেজ চেক করুন (আগের সেশনে পাওয়া crash-বাগ ফিক্স ঠিকমতো merge হয়েছে কিনা)
3. এরপর থেকে normal flow-এ ফিরে যেতে পারেন — এই merged ভার্সনটাই এখন "সত্যিকারের latest" (upstream + আমার কাজ, দুটোই)

---

## 📌 Addendum — দ্বিতীয় আপডেট (`Novatech-BD-main__11_.zip`)

আপনি এরপর আরেকটা নতুন আপলোড দিয়েছিলেন। যাচাই করে দেখা গেল এই নতুন আপলোডেও আমার আগের কাজ merge করা ছিল না (একই কারণ — সম্ভবত merged output আপনার আসল রিপোতে এখনো ফেরত যায়নি), তাই আবার merge করা হলো।

এবার upstream-এ খুব সামান্যই বদলেছিল আগের upload-এর (`__14_`) তুলনায় — মাত্র ৩টা ফাইল (APK ভার্সন নম্বর বৃদ্ধি + Sentry error-tracking init + API docs mount, `app.routes.js`/`server.js`/`useAppUpdate.js`)। এই ৩টার কোনোটাই আমার কাজের সাথে সম্পর্কিত না, তাই কোনো নতুন conflict হয়নি — সরাসরি বসিয়ে দেওয়া হয়েছে। আগের ৩টা conflict-resolution (tailwind.config.js, App.jsx, customer.controller.js) অপরিবর্তিত/বৈধ থেকে গেছে।

merged tree আবার সম্পূর্ণ upload-এর সাথে ফাইল-বাই-ফাইল তুলনা করে নিশ্চিত করা হয়েছে — শুধু আমার ইচ্ছাকৃত পরিবর্তনগুলোই পার্থক্য, কিছু হারায়নি। ৫৭০ ফাইল সিনট্যাক্স-চেক পাশ করেছে।
