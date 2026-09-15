# Phase 1 — অংশ ১: Foundation Layer

সব ফাইল সিনট্যাক্স-চেক করা হয়েছে (TypeScript compiler দিয়ে, যেহেতু network না থাকায় সরাসরি `npm run dev`/build চালিয়ে verify করা যায়নি — নিচে "আপনাকে যা করতে হবে" দেখুন)। পুরো `frontend/src` + `backend/src`-এর ৫৩২টা ফাইল ফাইনালি sweep করে কনফার্ম করা হয়েছে যে অনিচ্ছাকৃতভাবে অন্য কিছু ভাঙেনি।

## ✅ পরিবর্তিত ফাইল (৪টা)

| ফাইল | কী বদলেছে |
|---|---|
| `frontend/tailwind.config.js` | Phase 0-এ প্রস্তাবিত `success`/`info`/`brand.whatsapp` টোকেন ও `text-2xs` যোগ হলো |
| `frontend/package.json` | `@tanstack/react-query` dependency যোগ হলো |
| `frontend/src/main.jsx` | `QueryClientProvider` দিয়ে wrap করা হলো |
| `backend/src/controllers/customer.controller.js` | `/customers` রেসপন্সে `meta.total_count`/`has_more` যোগ (pagination truncation bug ফিক্স — additive, backward-compatible) |
| `frontend/src/pages/worker/RouteSelect.jsx` | ভেতরের manual fetch+cache লজিক সরিয়ে নতুন hooks ব্যবহার শুরু — **JSX/UI অক্ষত, শূন্য visual পরিবর্তন** |

## 🆕 নতুন ফাইল (৭টা)

- `frontend/src/hooks/useRoutes.js` — route তালিকা + "আমার আবেদন" (আগের ৩৫ লাইন manual fetch/cache/toast এখান থেকে)
- `frontend/src/hooks/useCustomers.js` — কাস্টমার তালিকা fetch, pending-credit-reduction merge, pagination visibility ফিক্স সহ
- `frontend/src/hooks/useNextStop.js` — লাইভ GPS (`watchPosition`) থেকে দূরত্ব/next-stop — ইচ্ছাকৃতভাবে `useCustomers`-এর থেকে আলাদা (নিচে "একটা সংশোধন" দেখুন)
- `frontend/src/components/ui/EmptyState.jsx`, `Skeleton.jsx`, `ProgressBar.jsx`, `BottomSheet.jsx`

**`Card` নতুন বানানো হয়নি** — Phase 0-এ প্রস্তাব করলেও কোড দেখে বোঝা গেল `components/ui/Badge.jsx`-এ আগে থেকেই `Card`/`KPICard` এক্সপোর্ট করা আছে। সেটাই পুনর্ব্যবহার হবে Phase 1 অংশ ২-এ।

## ⚠️ একটা সংশোধন (Phase 0-এর ফাইন্ডিং থেকে)

Phase 0-তে বলেছিলাম "frontend distance-calc সরিয়ে backend `distance_meters` ব্যবহার করা"। কোড আবার ভালো করে দেখে বুঝলাম এটা পুরোপুরি ঠিক না — backend-এর `distance_meters` একবারের স্ন্যাপশট (fetch-এর মুহূর্তের GPS দিয়ে), কিন্তু SR হাঁটতে হাঁটতে "Next Stop" পিন রিয়েল-টাইমে বদলানো দরকার, যা `watchPosition`-ভিত্তিক লাইভ client calc ছাড়া সম্ভব না (বারবার নেটওয়ার্ক কল না করে)। তাই:
- **লিস্টের initial order/sort** → backend `distance_meters` (ঠিক আছে, ডুপ্লিকেট বাদ)
- **"Next Stop" ও লাইভ distance sort** → client-side Haversine-ই থাকছে (`useNextStop.js`), এটা ডুপ্লিকেশন না, ইচ্ছাকৃত আলাদা use-case

## 🔧 আপনাকে যা করতে হবে

1. **`npm install`** — `frontend/` ডিরেক্টরিতে (network sandbox-এ না থাকায় আমি এটা চালাতে পারিনি, শুধু `package.json`-এ এন্ট্রি যোগ করেছি)
2. তারপর `npm run dev` চালিয়ে RouteSelect পেজ (route select স্ক্রিন) একবার চোখে দেখে নেওয়া ভালো — কোনো visual পরিবর্তন হওয়ার কথা না, শুধু ভেতরের ডেটা-লেয়ার বদলেছে

## ⏭️ Phase 1 — অংশ ২ (পরবর্তী)

- `CustomerList.jsx` (১১৮১ লাইন) আসল ভাঙা — `CustomerMap.jsx`, `CustomerCard.jsx`, `AddCustomerWizard/`
- উপরের hooks (`useCustomers`, `useNextStop`) + নতুন UI kit এই ভাঙা কম্পোনেন্টগুলোতে বসানো
- `react-hook-form` (আগে থেকে ইনস্টল করা, এতদিন অব্যবহৃত) দিয়ে Add Customer ফর্ম ভ্যালিডেশন
- CustomerList-এর ভেতরের ডুপ্লিকেট `/routes/worker-list` কল সরিয়ে `useRoutes()` বসানো
