# Phase 0 — Audit & Foundation Decision
### SR Route & Customer System রি-ডিজাইন — Novatech-BD

স্কোপ: `frontend/src/pages/worker/RouteSelect.jsx`, `frontend/src/pages/worker/CustomerList.jsx` এবং এদের backend contract (`GET /routes/worker-list`, `GET /customers`)। এই ডকুমেন্ট Phase 1+ যা কিছু বানাবে তার ভিত্তি — এখানে যা লক হলো, পরের ধাপে আর re-litigate করা হবে না।

---

## ১. Audit Findings

### ১.১ Design Tokens — বর্তমান অবস্থা

`tailwind.config.js`-এ আসলে **৩টা আলাদা token system** ইতিমধ্যে আছে:

| Namespace | কার জন্য | 
|---|---|
| `primary` / `secondary` / `accent` / `danger` | Admin/Manager/Worker (shared, base) |
| `cp-*` | Customer Portal — কোড কমেন্টে স্পষ্ট লেখা আছে admin/worker/manager-কে স্পর্শ করবে না |
| `pf-*` | Platform/Super-Admin panel |

**সমস্যা:** SR/Worker অ্যাপ (যেটা আমরা রিডিজাইন করছি) `primary` token টুকু ব্যবহার করে, বাকিটা raw Tailwind gray + ইনলাইন hex দিয়ে চালাচ্ছে। কোনো semantic (success/info) token-ই নেই।

grep করে যাচাই করা সংখ্যা (শুধু এই ২ ফাইলে):

- **১৪টা distinct raw hex color**, সবগুলোই `CustomerList.jsx`-এ (RouteSelect.jsx সম্পূর্ণ Tailwind-only, পরিষ্কার) — এদের ৮টা আসলে **Tailwind-এর ডিফল্ট gray/white**-এর সাথে হুবহু মেলে (যেমন `#374151` = `gray-700`, `#6b7280` = `gray-500`), অর্থাৎ নতুন টোকেন লাগবে না, শুধু ইনলাইন `style={{color:'#374151'}}` কে `className="text-gray-700"` করলেই চলবে।
- একটা hex (`#ef4444`) হুবহু ইতিমধ্যে সংজ্ঞায়িত `danger.light` টোকেনের সমান — অথচ ক্লাস দিয়ে না লিখে raw hex দিয়ে পুনরায় লেখা হয়েছে।
- **৫টা radius variant** ব্যবহার হচ্ছে (`rounded-lg/xl/2xl/full/t`) কোনো স্পষ্ট নিয়ম ছাড়া — `rounded-lg` (৭ বার, শুধু CustomerList-এ) আসলে `rounded-xl`-এর সাথে ওভারল্যাপ করছে, ইচ্ছাকৃত না বলেই মনে হচ্ছে।
- **Padding সম্পূর্ণ অনিয়মিত**: `py-0` থেকে `py-16`, `p-1` থেকে `p-6` — কম্পোনেন্ট-টাইপ অনুযায়ী কোনো fixed scale নেই।
- **Text size**: `text-xs/sm/lg/xl` ঠিকই আছে, কিন্তু তার পাশাপাশি `text-[11px]`, `text-[10px]`, `text-[9px]` (মোট ২০ বার) — এক পিক্সেল করে drift করা, কোনো ইচ্ছাকৃত hierarchy না, সম্ভবত কপি-পেস্ট থেকে।

### ১.২ API Contract — লক করা শেপ

**`GET /routes/worker-list`** → `{ success, data: Route[] }`, প্রতিটা route-এ:
`id, name, manager_id, manager_name, customer_count, total_due, last_visited_at, last_visited_by_name, primary_worker_id, primary_worker_name, visited_today_count` — sort: নিজের রুট আগে, বাকিগুলো `created_at DESC`।

**`GET /customers?route_id=&lat=&lng=&search=&page=&limit=`** → `{ success, data: Customer[] }`, প্রতিটায়:
`id, customer_code, shop_name, owner_name, shop_photo, business_type, whatsapp, sms_phone, email, credit_limit, current_credit, credit_balance, has_pending_edit, is_verified, route_name, visit_order, latitude, longitude, distance_meters (lat/lng দিলে), pending_return_count, pending_replacement_count, has_pending_request, primary_worker_id, primary_worker_name, last_visited_at, last_visited_by_name, credit_since, visited_today` — sort: `visit_order ASC NULLS LAST, distance_meters ASC NULLS LAST`।

### ১.৩ ⚠️ এই audit-এ নতুন যা ধরা পড়েছে

দুটো concrete জিনিস — এগুলো "নতুন ফিচার" না, বিদ্যমান কোডের গ্যাপ, তাই Phase 1-এই ধরে ফেলা উচিত রিডিজাইনের অংশ হিসেবে:

1. **Pagination truncation ঝুঁকি** — backend default `limit=50` দেয়, কিন্তু কোনো `total`/`has_more` ফেরত পাঠায় না। `CustomerList.jsx`-এর `loadCustomers()` কখনো `page`/`limit` পাঠায় না। মানে কোনো route-এ ৫০+ কাস্টমার হলে বাকিরা **নিঃশব্দে** লিস্টে দেখাবে না, SR কোনো ইঙ্গিতও পাবে না। এখন সমস্যা হয়নি (screenshot-এ route-টায় মাত্র ৩ জন কাস্টমার), কিন্তু বড় route-এ চুপচাপ ভাঙবে।
2. **Distance লজিক ডুপ্লিকেট** — backend আগে থেকেই PostGIS `ST_Distance` দিয়ে সঠিক (geography-aware) `distance_meters` হিসাব করে আর `visit_order → distance` দিয়ে sort করে পাঠায়। কিন্তু frontend আবার নিজে থেকে Haversine (`calcDistance`) আর `nextStop` useMemo বানিয়ে একই জিনিস কম নির্ভুলভাবে re-derive করছে। **Phase 4-এ এই frontend লজিক নতুন করে "উন্নত" করার দরকার নেই — শুধু বাদ দিয়ে backend-এর `distance_meters` + row-order বিশ্বাস করলেই চলবে।** এটা আমার আগের ধাপ-পরিকল্পনায় যতটা কাজ ভেবেছিলাম, তার চেয়ে ছোট কাজ।

---

## ২. প্রস্তাবিত Design Token সংযোজন

ব্র্যান্ড কালার (navy `primary`) বদলাচ্ছি না — এটা প্রতিষ্ঠিত এবং screenshot-এ consistent। যা লক করছি: missing semantic token + স্কেল কনসোলিডেশন।

```js
// tailwind.config.js — theme.extend.colors -এ যোগ হবে (Phase 1-এ, এখন শুধু প্রস্তাব)
success: { DEFAULT: '#22c55e', bg: '#dcfce7' },   // visited pin, confirmation states
info:    { DEFAULT: '#2563eb', light: '#3b82f6', bg: '#eff6ff' }, // next-stop, my-location, highlights
brand:   { whatsapp: '#25d366' },                  // fixed 3rd-party brand color, semantic set থেকে আলাদা

// theme.extend.fontSize -এ যোগ হবে — ৯/১০/১১px drift-এর বদলে একটাই "caption" সাইজ
'2xs': ['10px', { lineHeight: '14px' }],
```

`danger.light` (#ef4444) আগে থেকেই আছে — নতুন কিছু লাগবে না, শুধু ব্যবহার শুরু করতে হবে।

**Radius scale লক**: `rounded-xl` = standard container (card/button/input), `rounded-2xl` = prominent container (modal/bottom-sheet/page-card), `rounded-full` = pill/avatar/badge। `rounded-lg`-এর ৭টা ব্যবহার Phase 1-এ `rounded-xl`-এ একত্র হবে।

**Spacing লক (component-type ভিত্তিক)**: page container `p-4`, card `p-4`, modal/bottom-sheet `p-6`, badge/pill `px-2 py-0.5`, primary button `px-4 py-3`।

---

## ৩. Success Metrics

⚠️ সত্যি কথা: এখন **কোনো measurement tool wired নেই** — `ErrorBoundary.jsx`-এ Sentry-এর জন্য শুধু একটা comment placeholder আছে, বাস্তবে কিছু পাঠায় না। তাই নিচের সংখ্যাগুলো target, বর্তমান baseline না — Phase 1/6-এ instrumentation বসানোটাই প্রথম prerequisite।

আপনার নিজের screenshot-এই status bar-এ নেটওয়ার্ক স্পিড দেখা যাচ্ছে — **৫.২ থেকে ৪৩.৪৯ KB/s** — অর্থাৎ target ভালো wifi ধরে না বানিয়ে বাস্তব এই স্পিড ধরে বানানো উচিত।

| মেট্রিক | Target | কীভাবে মাপা হবে |
|---|---|---|
| Route list → interactive | < 2.5s @ ~50–150 KB/s | custom timer, throttled network টেস্ট |
| Map interactive (tiles + fitBounds) | < 3s (list load-এর পর) | `map.whenReady()` + tile `load` event |
| Route tap → Customer list দৃশ্যমান | < 1.5s (cache) / < 4s (network) | navigation timer, p50/p95, cache-hit vs network split |
| Crash-free session | ≥ 99.5% | Sentry বা সমতুল্য বসানোর পর — এখনো মাপা যাচ্ছে না |
| Offline fallback সঠিকতা | ১০০% (silent blank কখনো না) | cache-hit/miss/network-hit event count |

---

## ৪. Locked Decisions (Phase 1+ এখন থেকে এগুলো ধরে নেবে)

- SR অ্যাপের ব্র্যান্ড টোকেন = বিদ্যমান `primary/secondary/accent/danger` (নতুন নেমস্পেস না, `cp-`/`pf-`-এর মতো আলাদা করার দরকার নেই)
- নতুন semantic টোকেন: `success`, `info`, `brand.whatsapp`, `text-2xs` — উপরের কোড অনুযায়ী
- Radius: শুধু `xl` / `2xl` / `full`
- `/routes/worker-list` ও `/customers` response shape উপরের টেবিল অনুযায়ী — Phase 1-এর `useRoutes`/`useCustomers` hook এই কন্ট্রাক্ট মেনে টাইপ হবে
- Phase 1-এ ঢোকানো হবে: pagination fix (limit/total handling) এবং frontend distance-calc সরিয়ে backend `distance_meters` ব্যবহার (নতুন করে "বানানো" না, existing backend value কে trust করা)
- Metrics এখনো aspirational — instrumentation prerequisite হিসেবে ব্যাকলগে থাকল

---

## পরবর্তী ধাপ

`tailwind.config.js`-এর প্রস্তাবিত পরিবর্তনটা (§২) রিভিউ করে ঠিক থাকলে জানাবেন — তাহলে **Phase 1 (Architecture Refactor)** শুরু করব: `CustomerList.jsx` ভাঙা, এই টোকেনগুলো বসানো, আর উপরে ধরা পড়া দুটো গ্যাপ (pagination, duplicate distance logic) ফিক্স করা।
