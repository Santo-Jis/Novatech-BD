# SR (Worker) App — merge log (আপডেট)

এই আপলোড (`Novatech-BD-main__37_.zip`)-এ আপনার আগের আপলোডের (`__33_`) পর থেকে
**অন্য একটা এজেন্ট/ডেভেলপার একটা রিয়েল-টাইম Chat ফিচার এবং আরও কিছু যোগ করেছিল।**
সেই কাজ **হারায়নি** — আমি ৩-way merge করে দুটো পরিবর্তনই এক জায়গায় এনেছি।

## যা confirm করেছি নিরাপদে merge হয়েছে (অন্য এজেন্টের কাজ)

`__33_` → `__37_`-এ যা যোগ হয়েছিল, সবকিছু এই ফাইনাল ভার্সনেও অক্ষত আছে:

- **Chat System**: `ChatBell.jsx`, `ChatInbox.jsx`, `chat.controller.js`,
  `chat.routes.js`, `chatFirebase.service.js`, `customerPortalChat.*`,
  `MessagesTab.jsx`, `ChatSupportAgents.jsx`, `useChat.js`,
  `migration_chat_threads.sql`
- **Customer Email Verification**: `CustomerEmailVerify.jsx`,
  `migration_customer_email_verification.sql`
- **অন্যান্য**: `geoip.service.js`, `migration_customer_portal_login_events.sql`,
  `database.rules.json`, এবং Admin/Manager/Worker Layout-এ ChatBell ইন্টিগ্রেশন
- Customer APK version bump হয়ে `340 → 343` হয়েছিল (CI bot-এর স্বাভাবিক
  auto-increment) — সেটাও বজায় রাখা হয়েছে।

## যেখানে সরাসরি conflict হয়েছিল (আমার SR পরিবর্তনের সাথে) — resolve করা হয়েছে

ঠিক ৩টা জায়গায় আমার SR-tree-shaking লজিক আর ওই এজেন্টের নতুন কোড **একই লাইনের
কাছাকাছি** পরিবর্তন করেছিল, তাই manual merge লেগেছে:

1. **`App.jsx` — Customer page imports**: আমার `IS_WORKER_APP ? null : lazy()`
   গেটিং + তাদের নতুন `CustomerEmailVerify` import — দুটোই রাখা হয়েছে
   (`CustomerEmailVerify`-ও এখন SR APK-এ বাদ যাবে, ঠিক অন্য কাস্টমার পেজের মতোই)।
2. **`App.jsx` — Shared/Admin page imports**: আমার admin পেজগুলোর
   `IS_LIMITED_APP` গেটিং + তাদের নতুন `ChatInbox` ও `ChatSupportAgents`।
   এখানে একটা গুরুত্বপূর্ণ সিদ্ধান্ত নিতে হয়েছে — **`ChatInbox` Worker
   route-এও ব্যবহার হয় (`worker/chat`)**, তাই এটাকে `IS_LIMITED_APP` দিয়ে না
   গেট করে `NoticesView`-এর মতো শুধু `IS_CUSTOMER_APP` দিয়ে গেট করেছি, যাতে SR
   APK-তে চ্যাট ফিচার কাজ করে। `ChatSupportAgents` শুধু Admin-এর, তাই সেটা
   `IS_LIMITED_APP`-এ গেছে (Customer ও SR — দুই APK থেকেই বাদ)।
3. **`App.jsx` — Public routes**: `/customer-email-verify` রুটটা আমার
   `{!IS_WORKER_APP && ...}` ব্লকের ভেতরে (Customer-only public routes-এর
   সাথে) ঢোকানো হয়েছে।
4. **`useAppUpdate.js`**: তাদের `CURRENT_CUSTOMER_VERSION_CODE = 343` bump +
   আমার `CURRENT_SR_VERSION_CODE` addition — দুটোই আছে।

`app.routes.js`-এ কোনো সরাসরি conflict হয়নি (git auto-merge করে ফেলেছে) —
`CUSTOMER_VERSION_CODE = 343` এবং আমার পুরো `SR_VERSION_CODE` ব্লক পাশাপাশি আছে।

## SR APK-এ Chat ফিচার

যেহেতু Worker Layout-এও এখন `<ChatBell basePath="/worker" />` এবং
`worker/chat` রুট আছে, **SR APK-তেও চ্যাট ফিচার পুরোপুরি কাজ করবে** — এটা বাদ
পড়েনি। `build-sr-apk.yml`-এর trigger paths-এ `frontend/src/components/ChatBell.jsx`
যোগ করে দিয়েছি (আগে এটা কোনো trigger path-এ কভার হতো না)।

## Verify করা হয়েছে

- App.jsx-এ bracket/brace balance ✓, TypeScript parser দিয়ে syntax check ✓
- `app.routes.js`, `useAppUpdate.js` — `node --check` দিয়ে valid ✓
- `build-sr-apk.yml` — YAML parse ✓ (২৭টা step অক্ষত)
- ৩-way diff করে নিশ্চিত হয়েছি নতুন আপলোডের তুলনায় **শুধু** এই ৩টা ফাইল বদলেছে
  (`App.jsx`, `app.routes.js`, `useAppUpdate.js`) এবং ১টা নতুন ফাইল যোগ হয়েছে
  (`build-sr-apk.yml`) — বাকি সব ফাইল (chat feature সহ) অবিকৃত আছে।

## এখনো যা বাকি (আগের মতোই)

- appId/অ্যাপের নাম নিয়ে চূড়ান্ত সিদ্ধান্ত (এখনো `com.zovorix.worker` / "ZovoriX SR" ধরে নেওয়া হয়েছে)
- (ঐচ্ছিক) `frontend/assets/sr-icon.png`
- (ঐচ্ছিক) `SR_KEYSTORE_BASE64` ইত্যাদি GitHub Secrets
