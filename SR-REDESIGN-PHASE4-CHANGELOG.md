# Phase 4 — Route Intelligence (আংশিক)

মূল Phase 4-এ ৪টা কাজ ছিল। এই দফায় **২টা** করলাম — বাকি ২টার একটার জন্য আপনার একটা তথ্য দরকার (নিচে প্রশ্ন), আরেকটা সুযোগ্য কারণে আলাদা রাখলাম।

## ✅ যা হলো

**১) Priority Score** (`hooks/usePriorityScore.js`) — শুধু দূরত্ব না, দূরত্ব + বাকি টাকা + কতদিন ভিজিট হয়নি — তিনটা মিলিয়ে একটা score। Customer List পেজে "🎯 প্রায়োরিটি" নামে নতুন তৃতীয় sort option হিসেবে যোগ হলো (আগে ছিল শুধু "ভিজিট অর্ডার"/"দূরত্ব")।

⚠️ **এটা manager-এর ঠিক করা `visit_order`-কে প্রতিস্থাপন করেনি, ডিফল্ট রাখা হয়নি।** কারণ: manager হয়তো efficient walking-path মাথায় রেখে সাজিয়েছেন, যেটা আমার score জানে না (আমার score-এ শুধু directণ-লাইন distance আছে, রাস্তার topology না)। তাই এটা একটা **বিকল্প lens** — দরকার হলে বেছে নেওয়া যায়, জোর করে চাপানো হয়নি।

Weight-গুলো (distance 40%, বাকি 35%, staleness 25%) সম্পূর্ণ tunable — ফাইলের উপরেই একটা constant হিসেবে, বাস্তব ব্যবহারের অভিজ্ঞতা অনুযায়ী পরে বদলানো যায়।

**২) Route Polyline** — Map-এ এখন visit_order অনুযায়ী বিন্দুগুলো জোড়া লাগানো একটা dashed লাইন দেখা যায় (legend-এ "ক্রম (আনুমানিক)" নামে চিহ্নিত)। **⚠️ এটা সরলরেখা, real road path না** — কোনো external API ছাড়াই বানানো হয়েছে, তাই বাস্তব রাস্তার path না, শুধু stops-এর overall shape/ক্রম বোঝার জন্য।

## ❓ একটা প্রশ্ন — Real Road-Based Routing-এর জন্য

কোডে খুঁজে পেলাম আপনার backend-এ **আগে থেকেই `GOOGLE_MAPS_KEY` এনভায়রনমেন্ট ভ্যারিয়েবল আর একটা secure endpoint (`/api/location/maps-key`) আছে** — যেটা সম্ভবত অন্য কোনো ফিচারের জন্য (হয়তো manager-side live tracking) ব্যবহৃত হয়। আমি `backend.env.example`-এ শুধু placeholder value দেখেছি, আপনার আসল deploy-করা `.env`-এ কী আছে সেটা আমার sandbox থেকে দেখার উপায় নেই।

Real road-based route optimization করতে হলে **Google Directions API** লাগবে (অথবা OSRM, কিন্তু সেটার জন্য নিজস্ব সার্ভার হোস্ট করতে হয় — এই sandbox থেকে সেটআপ করা সম্ভব না)। Directions API ব্যবহার করতে হলে:

1. আপনার existing `GOOGLE_MAPS_KEY`-এ Directions API **enable করা আছে** কিনা (Google Cloud Console-এ আলাদা করে চালু করতে হয়, এমনিতে Maps JavaScript API চালু থাকলেই Directions কাজ করবে এমন না), আর
2. এর সাথে খরচ জড়িত (প্রতি request-এ চার্জ, ফ্রি টায়ারের পরে) — এটা আপনি জেনে-বুঝেই এগোতে চান কিনা, সেটা আমি একতরফাভাবে ঠিক করতে পারি না।

**আপনি কনফার্ম করলে** (key কাজ করছে + Directions API চালু + খরচ ঠিক আছে) — আমি backend-এ একটা নতুন এন্ডপয়েন্ট বানাব যেটা route-এর কাস্টমারদের জন্য Directions API কল করে real road-distance/path নিয়ে আসবে। নাহলে বর্তমান straight-line polyline-ই থেকে যাবে, যেটা যথেষ্ট কার্যকর যদিও road-accurate না।

## ⚠️ যা এখনো বাকি — Firebase Live Tracking Manager Alert

এটা এখনো করিনি। কারণ manager-side পেজ/কম্পোনেন্ট এই পুরো কথোপকথনে আমি এখনো একবারও দেখিনি — এটা একটা ভিন্ন, না-দেখা অংশ, আর real-time Firebase infrastructure-এর সাথে জড়িত। এটা properly করতে হলে আগে সেই কোড ভালোভাবে পড়া দরকার, একসাথে সবকিছুর সাথে গুলিয়ে ফেললে ভুল হওয়ার ঝুঁকি বাড়ে। এটাকে নিজের আলাদা, ফোকাসড দফা হিসেবে রাখতে চাই।

## 🔧 আপনার করণীয়

কিছু না নতুন — dependency অপরিবর্তিত (Polyline আগে থেকেই ইনস্টল করা `react-leaflet`-এরই অংশ)। টেস্ট করার সময়: (১) "🎯 প্রায়োরিটি" ট্যাব চাপলে বাকি-বেশি/অনেকদিন-ভিজিট-হয়নি কাস্টমাররা উপরে আসছে কিনা, (২) map-এ dashed লাইন ঠিকঠাক দেখাচ্ছে কিনা।

সব ফাইল (৫৩৬টা) syntax + semantic (undefined-reference) দুই checker-ই পাশ করেছে।
