# Phase 4 — বাকি অংশ: Firebase Live-Tracking Manager Alert

## 🚨 প্রথমে সবচেয়ে গুরুত্বপূর্ণ কথা — একটা page-crashing বাগ পেলাম ও ঠিক করলাম

`pages/manager/LiveTracking.jsx`-এ কাজ শুরু করার সময় আমার সেমান্টিক checker একটা **real bug** ধরল: `fetchLocations` ফাংশনটা তার নিজের `const` declaration-এর **আগেই** একটা `useEffect`-এর dependency array-তে ব্যবহার হচ্ছিল (`[mapsLoaded, fetchLocations]`)। JavaScript-এ এটা "temporal dead zone" ভায়োলেশন — **প্রতিবার এই পেজ render হওয়ার সাথে সাথেই** `ReferenceError: Cannot access 'fetchLocations' before initialization` ছুঁড়ে পুরো Manager Live Tracking পেজ ক্র্যাশ করানোর কথা।

এটা আমি এই দফায় introduce করিনি — সম্পূর্ণ পুরনো, pre-existing কোড। যেহেতু আমি এই একই ফাইলে (অসম্পর্কিত কোনো ফাইলে না) কাজ করছিলাম, তাই backend bug-এর মতো শুধু জানিয়ে না রেখে **সরাসরি ঠিক করে দিয়েছি** — `fetchLocations`-এর declaration-টা শুধু ওপরে সরানো হয়েছে (কোনো লজিক বদলায়নি)।

⚠️ **এটা মানে এই পেজ সম্ভবত এতদিন আসলে ব্যবহারযোগ্যই ছিল না** (অন্তত এই নির্দিষ্ট build-এ) — deploy করার পর একবার নিশ্চিত হয়ে নিন এটা এখন ঠিকমতো খুলছে।

## ✅ Off-Route Alert — যা হলো

**Backend** (`location.controller.js`, `getTeamLocations`): প্রতিটা SR-এর লাইভ অবস্থান থেকে তার নামে assigned কাস্টমারদের মধ্যে সবচেয়ে কাছেরটার দূরত্ব (PostGIS `ST_Distance`) হিসাব হয়, সমান্তরালে (`Promise.all`, sequential না — এই ঘন ঘন-পোল হওয়া endpoint ধীর না করতে)। ২ কিমি-র বেশি হলে `isOffRoute: true` ফ্ল্যাগ।

**Frontend** (`LiveTracking.jsx`): 
- Off-route SR-এর marker-এ সাদার বদলে amber বর্ডার (⚠️ ইচ্ছাকৃতভাবে শুধু রঙ বদলেছি, SVG-এর আকার/geometry না — নাহলে marker-এর anchor point সূক্ষ্মভাবে সরে যেতে পারত, যেটা লাইভ না দেখে ঝুঁকিপূর্ণ)
- Sidebar-এ badge + দূরত্ব ("⚠️ রুট থেকে ~২.৩ কিমি দূরে")
- Marker-এর info window-এও দূরত্ব দেখা যায়

**সিদ্ধান্ত: বারবার toast/notification না, persistent indicator।** যেহেতু এই ডেটা প্রতি ৩০ সেকেন্ডে (Firebase change trigger করে) রিফ্রেশ হয়, বারবার toast দেখালে বিরক্তিকর হতো। Manager পেজ দেখলেই বুঝবে, প্রতি সাইকেলে নতুন করে জানান দিতে হবে না।

## 🤔 "route থেকে দূরত্ব" আসলে কী বোঝায়

Backend জানে না কোন "route" এখন active — `selectedRoute` শুধু frontend/localStorage-এ। তাই "off-route" মানে এখানে "তার নামে assigned যেকোনো কাস্টমার (`customer_assignments`, active) থেকে দূরত্ব" — ব্যবহারিকভাবে প্রায় একই জিনিস বলে দেয় (SR সাধারণত নিজের এলাকার কাস্টমারদের কাছাকাছিই থাকে), কিন্তু ঠিক same জিনিস না।

Threshold (২ কিমি) `location.controller.js`-এর উপরে একটা named constant — বাস্তব ব্যবহারের অভিজ্ঞতা অনুযায়ী সহজে বদলানো যায়।

## 🗺️ Google Maps নিয়ে

আপনি নিশ্চিত করেছেন — SR/worker-দের জন্য free maps (Leaflet+OSM) ইচ্ছাকৃত সিদ্ধান্ত, স্কেলের কারণে। এই manager-side ফিচারটা সেই সিদ্ধান্তকে শ্রদ্ধা করেই বানানো হয়েছে — কোনো নতুন Google Directions API কল যোগ করিনি, শুধু আপনার আগে থেকে-থাকা `GOOGLE_MAPS_KEY`/manager-side Google Maps ইনফ্রাস্ট্রাকচারের (যেটা কম মানুষ, কম ব্যবহার করে) সাথে মিলিয়ে একটা নতুন ডেটা লেয়ার (off-route flag) যোগ করেছি মাত্র — নতুন কোনো Google API কল না, শুধু PostGIS (আপনার নিজের ডেটাবেসেই)।

## 🔧 আপনার করণীয়

1. Deploy করে **সবচেয়ে আগে** Manager Live Tracking পেজ একবার খুলে দেখুন — আগের bug-টার কারণে এটা কাজ করছিল কিনা সেটাই অনিশ্চিত ছিল
2. তারপর একজন SR-কে (টেস্টের জন্য) তার route এলাকা থেকে দূরে সরিয়ে (বা GPS mock করে) দেখুন off-route badge ঠিকমতো দেখা যাচ্ছে কিনা
3. `OFF_ROUTE_THRESHOLD_METERS` (২০০০) বাস্তব ব্যবহারে বেশি/কম মনে হলে `backend/src/controllers/location.controller.js`-এর উপরের দিকে বদলে দিতে পারেন

সব ফাইল (৫৩৬টা) syntax + semantic checker পাশ করেছে।

---

**Phase 4 এখন সম্পূর্ণ।** পরের ধাপ Phase 5 (Performance & Scale) কবে শুরু করতে চান জানাবেন।
