# Phase 0 — Hygiene Changes (v2, merged onto latest codebase)

আগের `PHASE0_HYGIENE_CHANGES.md`-এর আপডেট ভার্সন — আগেরটা যে zip-এর উপর
বানানো হয়েছিল, তারপর repo-তে আরও কাজ হয়েছে (নিচে দেখুন)। এই ভার্সন সেই
নতুন কোডের উপর merge করে বানানো, কারো কাজ না হারিয়ে।

## 🔍 এই zip-এ যা নতুন পাওয়া গেছে (আমার Phase 0-এর বাইরে, স্পর্শ করা হয়নি)

আগের zip-এর সাথে file-by-file diff করে এগুলো পাওয়া গেছে — স্পষ্টতই অন্য
কোনো সেশন (মানুষ বা এজেন্ট) এই সময়ে কাজ করেছে:

1. **Chat redesign** — বড় একটা কাজ: `chat.controller.js`,
   `customerPortalChat.controller.js`, `chatAI.service.js`,
   `chatFirebase.service.js`, নতুন `chatRateLimit.js` middleware, frontend-এ
   নতুন `CannedResponsePicker.jsx` / `SearchPanel.jsx` /
   `ThreadOptionsMenu.jsx`, আর ৩টা নতুন migration
   (`migration_chat_block_report.sql`, `migration_chat_canned_responses.sql`,
   `migration_chat_messages.sql`) + বিদ্যমান কয়েকটা migration-এ পরিবর্তন।
   **আমি এসবের কোনোটাই ছুঁইনি।**

2. **RLS hygiene script** — `backend/scripts/check-rls.js` (নতুন)। এটা
   Supabase-এর "rls_disabled_in_public" লিন্ট ক্লাস চেক করে — কমেন্টে লেখা
   আছে ১৮টা টেবিলে RLS বন্ধ পাওয়া গিয়েছিল, ফিক্স হয়েছে। `package.json`-এ
   `check:rls` script-ও যোগ হয়েছে — **এটা রেখে দিয়েছি, আমার additions
   পাশাপাশি যোগ করেছি।**

   ⚠️ **গুরুত্বপূর্ণ nuance, যেটা এই স্ক্রিপ্টের নিজের কমেন্টেই লেখা আছে:**
   এই কোডবেসে backend ~৯০টা টেবিলে RLS "enabled" থাকলেও policy জিরো —
   কারণ backend একটা role দিয়ে কানেক্ট করে যেটা RLS বাইপাস করে। মানে এই
   RLS hygiene fix (১৮টা টেবিল) valuable, কিন্তু এটা আমার আগের Phase 1
   সাজেশনের (tenant_id-এর উপর actual enforced policy, missing WHERE-clause
   থেকে সুরক্ষা) সমতুল্য না — সেটা এখনো করা হয়নি, কারণ backend role RLS
   বাইপাস করে বলে policy লিখলেও এখনই কিছু আটকাবে না। এটা একটা আলাদা, এখনো
   বাকি থাকা কাজ — বিস্তারিত আলোচনা করতে চাইলে বলো।

   এটাও নোট করার মতো: কমেন্টে `CHAT_REDESIGN_ROADMAP.md`-এর reference আছে
   ("দেখুন CHAT_REDESIGN_ROADMAP.md") কিন্তু repo-তে এই ফাইলটা খুঁজে
   পাইনি — সম্ভবত অন্য সেশনের চ্যাটেই ছিল, ফাইল হিসেবে commit হয়নি। ওই
   প্ল্যানিং context ভবিষ্যতে হারিয়ে যাওয়ার আগে, থাকলে সেটা repo-তে
   ফাইল হিসেবে বসিয়ে রাখাই ভালো — ঠিক DECISIONS.md-এর যে philosophy,
   সেটাই।

3. **App version bump** — `app.routes.js`-এ SR APK version 1.0.8 → 1.0.9।
   অপ্রাসঙ্গিক, ছোঁয়া হয়নি।

## ✅ Phase 0 (আমার কাজ) — এই নতুন কোডের উপর re-apply করা হলো

আগের সবকটা আইটেমই আবার বসানো হয়েছে, প্রতিটা ফাইল আগে diff করে যাচাই করে
নিশ্চিত হয়েছি কোনো conflict নেই:

- `README.md`, `backend.env.example` (SENTRY_DSN), `backend/src/config/sentry.js`,
  `backend/src/config/logger.js` (Sentry hook), `backend/src/server.js`
  (Sentry init + swagger mount + error handler), `backend/scripts/generate-openapi.js`,
  `backend/openapi.json` (নতুন routes অনুযায়ী রিজেনারেট — সংখ্যা অপরিবর্তিত
  থেকেছে: ৪৬১ path, তার মানে chat-এর পরিবর্তনগুলো নতুন route যোগ করেনি,
  বিদ্যমান handler-ই বদলেছে)
- `package.json` — **merge** করা হয়েছে, শুধু overwrite না: `check:rls`
  অক্ষত রেখে তার পাশে আমার `docs:generate` + dependencies যোগ করা হয়েছে
- `tall git -y` আবার মুছে ফেলা হলো (এই zip-এও ছিল)

**যাচাই:** merge-এর পর server.js/logger.js আমার আগের patched ভার্সনের
সাথে byte-for-byte মিলিয়ে দেখেছি (`diff` দিয়ে) — নিশ্চিত করা হয়েছে ঠিক
আমার অংশটুকুই যোগ হয়েছে, chat-এর কোনো পরিবর্তন হারায়নি। সব ফাইল
`node --check` দিয়ে syntax-valid।

## 🔲 এবার যা আলাদা — devTestToken নিয়ে সিদ্ধান্ত বদলেছে

আগের রাউন্ডে `devTestToken.routes.js`/`controller.js` মুছে দিয়েছিলাম
(unmounted, স্টেল মনে হয়েছিল)। এই নতুন zip-এ ফাইলদুটো ফিরে এসেছে, আর
কন্টেন্ট আগের চেয়ে বেশি develop করা (staff + portal দুই ধরনের টোকেন,
`x-dev-secret` header দিয়ে গার্ড করা) — মানে কেউ সম্প্রতি এটা নিয়ে
সক্রিয়ভাবে কাজ করেছে। এখনো `server.js`-এ mount করা হয়নি (তাই live
risk নেই), কিন্তু **এবার আমি এটা মুছিনি** — অন্য কারো চলমান কাজ ভুলে
নষ্ট করার চেয়ে জিজ্ঞেস করা ভালো। টেস্টিং শেষ হয়ে থাকলে জানিও, তখন মুছে
দেব (আর `DEV_TEST_SECRET` যদি Render-এ বসানো থাকে, সেটাও তখন সরাতে হবে)।

## কীভাবে বসাবে

আগের মতোই — `chore/phase0-hygiene` ব্রাঞ্চ থেকে PR। নিচের ফাইলগুলো এবার
শেয়ার করা হলো (path নিচে লেখা আছে, present_files ফ্ল্যাট করে দেয়):

- `README.md` → repo root
- `backend/backend.env.example`, `backend/package.json`,
  `backend/src/config/sentry.js`, `backend/src/config/logger.js`,
  `backend/src/server.js`, `backend/scripts/generate-openapi.js`,
  `backend/openapi.json`

```bash
cd backend && npm install && npm run dev   # স্মোক টেস্ট
npm test                                    # চ্যাট-এর টেস্ট-সহ সব পাস করে কিনা
npm run check:rls                           # এটাও এখনো পাস করছে কিনা নিশ্চিত করো
```
